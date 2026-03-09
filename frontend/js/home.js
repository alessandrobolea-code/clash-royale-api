// Logica pagina Home / Torneo

let giocatoriSelezionati = [];
let tipoPartita = '1v1';
let torneoAttivo = null;
let timerInterval = null;

// ── Inizializzazione ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await caricaGiocatori();
  await controllaStatoTorneo();
  await caricaPartiteRecenti();
  ascoltaPartiteRecenti();
});

// ── Caricamento giocatori da Supabase ────────────────────────────────────────

async function caricaGiocatori() {
  const { data: players, error } = await db.from('players').select('id, username');
  if (error) { console.error('Errore caricamento giocatori:', error); return; }

  const container = document.getElementById('chip-container');
  container.innerHTML = '';

  players.forEach(p => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.dataset.id = p.id;
    chip.textContent = p.username;
    chip.addEventListener('click', () => toggleGiocatore(chip, p.id));
    container.appendChild(chip);
  });
}

function toggleGiocatore(chip, id) {
  if (chip.classList.contains('selected')) {
    chip.classList.remove('selected');
    giocatoriSelezionati = giocatoriSelezionati.filter(x => x !== id);
  } else {
    chip.classList.add('selected');
    giocatoriSelezionati.push(id);
  }
  aggiornaBottoneAvvia();
}

// ── Toggle tipo partita ──────────────────────────────────────────────────────

document.getElementById('btn-1v1')?.addEventListener('click', () => setTipo('1v1'));
document.getElementById('btn-tripla')?.addEventListener('click', () => setTipo('tripla'));

function setTipo(tipo) {
  tipoPartita = tipo;
  document.getElementById('btn-1v1').classList.toggle('active', tipo === '1v1');
  document.getElementById('btn-tripla').classList.toggle('active', tipo === 'tripla');
}

// ── Bottone Avvia ────────────────────────────────────────────────────────────

function aggiornaBottoneAvvia() {
  const n = giocatoriSelezionati.length;
  const btn = document.getElementById('btn-avvia');
  const hint = document.getElementById('hint-avvia');
  const ok = n >= 3 && n <= 4;
  btn.disabled = !ok;
  hint.textContent = ok
    ? `${n} giocatori · formato ${n} player`
    : 'Seleziona 3 o 4 giocatori';
}

document.getElementById('btn-avvia')?.addEventListener('click', avviaTorneoHandler);

async function avviaTorneoHandler() {
  const { data: { session } } = await db.auth.getSession();
  // Per ora usiamo il primo giocatore disponibile come "creatore"
  // (auth non implementata in questa fase)

  const { data: torneo, error } = await db.from('tournaments').insert({
    players: giocatoriSelezionati,
    match_type: tipoPartita,
    status: 'active',
    started_at: new Date().toISOString(),
  }).select().single();

  if (error) { alert('Errore creazione torneo'); console.error(error); return; }

  torneoAttivo = torneo;
  await avviaTorneo(torneo.id);
  mostraVistaAttiva();
}

// ── Annulla torneo ───────────────────────────────────────────────────────────

document.getElementById('btn-annulla')?.addEventListener('click', async () => {
  if (!torneoAttivo) return;
  await fermaTorneo(torneoAttivo.id);
  await db.from('tournaments').update({ status: 'cancelled' }).eq('id', torneoAttivo.id);
  torneoAttivo = null;
  mostraVistaSetup();
});

// ── Stato torneo attivo (ricaricamento pagina) ───────────────────────────────

async function controllaStatoTorneo() {
  const { data, error } = await db
    .from('tournaments')
    .select('*')
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return;
  torneoAttivo = data;
  mostraVistaAttiva();
  ascoltaPartite(data.id);
}

// ── Viste ────────────────────────────────────────────────────────────────────

function mostraVistaSetup() {
  document.getElementById('vista-setup').classList.remove('hidden');
  document.getElementById('vista-attiva').classList.add('hidden');
  clearInterval(timerInterval);
}

function mostraVistaAttiva() {
  document.getElementById('vista-setup').classList.add('hidden');
  document.getElementById('vista-attiva').classList.remove('hidden');
  avviaTimer(new Date(torneoAttivo.started_at));
  ascoltaPartite(torneoAttivo.id);
}

// ── Timer ────────────────────────────────────────────────────────────────────

function avviaTimer(startDate) {
  const el = document.getElementById('timer');
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const diff = Math.floor((Date.now() - startDate) / 1000);
    const m = String(Math.floor(diff / 60)).padStart(2, '0');
    const s = String(diff % 60).padStart(2, '0');
    el.textContent = `${m}:${s}`;
  }, 1000);
}

// ── Realtime partite ─────────────────────────────────────────────────────────

function ascoltaPartite(tournamentId) {
  db.channel('partite-' + tournamentId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'tournament_matches',
      filter: `tournament_id=eq.${tournamentId}`,
    }, (payload) => {
      aggiungiPartita(payload.new);
    })
    .subscribe();

  // Carica partite già esistenti
  db.from('tournament_matches')
    .select('*, player1:player1_id(username), player2:player2_id(username), winner:winner_id(username)')
    .eq('tournament_id', tournamentId)
    .order('played_at')
    .then(({ data }) => {
      const lista = document.getElementById('lista-partite');
      lista.innerHTML = '';
      (data || []).forEach((m, i) => aggiungiPartita(m, i + 1));
    });
}

function aggiungiPartita(match, indice) {
  const lista = document.getElementById('lista-partite');
  const p1 = match.player1?.username || '?';
  const p2 = match.player2?.username || '?';
  const w = match.winner?.username || '?';
  const corone = `${match.crowns_p1}-${match.crowns_p2}`;
  const num = indice || lista.children.length + 1;

  const li = document.createElement('li');
  li.className = 'partita-riga';
  li.innerHTML = `
    <span class="num">${num}</span>
    <span class="match">${p1} vs ${p2}</span>
    <span class="risultato">${corone}</span>
    <span class="crown">👑 ${w}</span>
  `;
  lista.appendChild(li);
}

// ── Partite recenti tra amici (global polling) ────────────────────────────────

async function caricaPartiteRecenti() {
  const { data } = await db
    .from('battles')
    .select('*, player1:player1_id(username), player2:player2_id(username), winner:winner_id(username), opponent_name, opponent_tag')
    .order('played_at', { ascending: false })
    .limit(20);

  const lista = document.getElementById('lista-recenti');
  lista.innerHTML = '';

  if (!data?.length) {
    lista.innerHTML = '<li class="nessuna-partita">Nessuna partita ancora rilevata…</li>';
    return;
  }

  data.forEach(m => aggiungiPartitaRecente(m));
}

function ascoltaPartiteRecenti() {
  db.channel('battles-global')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'battles',
    }, async (payload) => {
      // Carica con join per avere i nomi
      const { data } = await db
        .from('battles')
        .select('*, player1:player1_id(username), player2:player2_id(username), winner:winner_id(username), opponent_name, opponent_tag')
        .eq('id', payload.new.id)
        .single();
      if (data) {
        const lista = document.getElementById('lista-recenti');
        // Rimuovi placeholder se presente
        lista.querySelector('.nessuna-partita')?.remove();
        aggiungiPartitaRecente(data, true);
      }
    })
    .subscribe();
}

function aggiungiPartitaRecente(match, inCima = false) {
  const lista = document.getElementById('lista-recenti');
  const p1 = match.player1?.username || '?';
  const p2 = match.player2?.username || match.opponent_name || '?';
  const w = match.winner?.username || (match.winner_id === null ? match.opponent_name : '?') || '?';
  const corone = `${match.crowns_p1}-${match.crowns_p2}`;
  const tipo = match.battle_type === 'tripla' ? '⚔️' : '🗡️';
  const data = new Date(match.played_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const li = document.createElement('li');
  li.className = 'partita-riga';
  li.innerHTML = `
    <span class="num">${tipo}</span>
    <span class="match">${p1} vs ${p2}</span>
    <span class="risultato">${corone}</span>
    <span class="crown">👑 ${w}</span>
  `;
  li.title = data;

  if (inCima) lista.prepend(li);
  else lista.appendChild(li);
}
