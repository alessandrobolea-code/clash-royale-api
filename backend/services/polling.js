const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Client lazy — si crea solo quando viene usato, evita crash al boot
let _db = null;
function getDb() {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _db;
}

const CR_API_KEY = process.env.CR_API_KEY;
const CR_BASE = 'https://api.clashroyale.com/v1';

// Mappa dei job attivi: tournament_id → setInterval handle
const pollingAttivi = new Map();

// Mappa dell'ultimo ciclo senza partite: tournament_id → timestamp
const ultimaPartita = new Map();
const INATTIVITA_MS = 10 * 60 * 1000; // 10 minuti

// ── Avvia polling ─────────────────────────────────────────────────────────────

function avviaPolling(tournamentId) {
  if (pollingAttivi.has(tournamentId)) {
    console.log(`[polling] Torneo ${tournamentId} già in polling`);
    return;
  }

  console.log(`[polling] Avvio per torneo ${tournamentId}`);
  ultimaPartita.set(tournamentId, Date.now());

  const handle = setInterval(() => eseguiCiclo(tournamentId), 30_000);
  pollingAttivi.set(tournamentId, handle);

  // Esegui subito il primo ciclo
  eseguiCiclo(tournamentId);
}

// ── Ferma polling ─────────────────────────────────────────────────────────────

function fermaPolling(tournamentId) {
  const handle = pollingAttivi.get(tournamentId);
  if (handle) {
    clearInterval(handle);
    pollingAttivi.delete(tournamentId);
    ultimaPartita.delete(tournamentId);
    console.log(`[polling] Fermato per torneo ${tournamentId}`);
  }
}

// ── Ciclo di polling ──────────────────────────────────────────────────────────

async function eseguiCiclo(tournamentId) {
  try {
    // 1. Leggi dati torneo
    const { data: torneo, error: errTorneo } = await getDb()
      .from('tournaments')
      .select('*, players')
      .eq('id', tournamentId)
      .single();

    if (errTorneo || !torneo) {
      console.error('[polling] Torneo non trovato:', errTorneo);
      fermaPolling(tournamentId);
      return;
    }

    if (torneo.status !== 'active') {
      console.log(`[polling] Torneo ${tournamentId} non più attivo (${torneo.status}), fermo`);
      fermaPolling(tournamentId);
      return;
    }

    // 2. Leggi giocatori del torneo
    const { data: players } = await getDb()
      .from('players')
      .select('id, cr_tag')
      .in('id', torneo.players);

    // 3. Leggi cr_battle_id già registrate per evitare duplicati
    const { data: partiteEsistenti } = await getDb()
      .from('tournament_matches')
      .select('cr_battle_id')
      .eq('tournament_id', tournamentId);

    const idRegistrati = new Set((partiteEsistenti || []).map(p => p.cr_battle_id));
    const tagSet = new Set(players.map(p => p.cr_tag));
    const tagToId = Object.fromEntries(players.map(p => [p.cr_tag, p.id]));

    let nuovePartite = 0;

    // 4. Fetch battlelog per ogni giocatore
    for (const player of players) {
      const tag = encodeURIComponent(player.cr_tag);
      const partite = await fetchBattlelog(tag);

      for (const battle of partite) {
        // Filtra per tipo partita
        if (!corrispondeTipo(battle, torneo.match_type)) continue;

        // Filtra per data (dopo started_at)
        if (new Date(battle.battleTime) <= new Date(torneo.started_at)) continue;

        // Identifica avversario
        const oppTag = battle.opponent?.[0]?.tag;
        if (!oppTag || !tagSet.has(oppTag)) continue;

        // Evita duplicati
        const battleId = generaBattleId(battle);
        if (idRegistrati.has(battleId)) continue;

        // Determina vincitore
        const myCrowns = battle.team?.[0]?.crowns ?? 0;
        const oppCrowns = battle.opponent?.[0]?.crowns ?? 0;
        const p1Id = tagToId[player.cr_tag];
        const p2Id = tagToId[oppTag];
        const winnerId = myCrowns > oppCrowns ? p1Id : p2Id;

        // Salva partita
        const { error: errInsert } = await getDb().from('tournament_matches').insert({
          tournament_id: tournamentId,
          player1_id: p1Id,
          player2_id: p2Id,
          winner_id: winnerId,
          crowns_p1: myCrowns,
          crowns_p2: oppCrowns,
          played_at: new Date(battle.battleTime).toISOString(),
          cr_battle_id: battleId,
        });

        if (!errInsert) {
          idRegistrati.add(battleId);
          nuovePartite++;
          console.log(`[polling] Partita registrata: ${player.cr_tag} vs ${oppTag}`);
        }
      }
    }

    // 5. Aggiorna timer inattività
    if (nuovePartite > 0) {
      ultimaPartita.set(tournamentId, Date.now());
      await verificaFine(tournamentId, torneo);
    } else {
      const elapsed = Date.now() - (ultimaPartita.get(tournamentId) || Date.now());
      if (elapsed >= INATTIVITA_MS) {
        console.log(`[polling] Inattività 10min per torneo ${tournamentId} → paused`);
        await getDb().from('tournaments').update({ status: 'paused' }).eq('id', tournamentId);
        fermaPolling(tournamentId);
      }
    }

  } catch (err) {
    console.error('[polling] Errore ciclo:', err.message);
  }
}

// ── Fetch battlelog CR ────────────────────────────────────────────────────────

async function fetchBattlelog(encodedTag) {
  if (!CR_API_KEY || CR_API_KEY.startsWith('eyJ0eXAiOiJKV1Qi...')) {
    // API key non configurata → mock vuoto
    return [];
  }

  try {
    const res = await axios.get(`${CR_BASE}/players/${encodedTag}/battlelog`, {
      headers: { Authorization: `Bearer ${CR_API_KEY}` },
      timeout: 10_000,
    });
    return res.data?.items || [];
  } catch (err) {
    if (err.response?.status === 404) return [];
    console.error('[polling] Errore CR API:', err.message);
    return [];
  }
}

// ── Verifica fine torneo ──────────────────────────────────────────────────────

async function verificaFine(tournamentId, torneo) {
  const { data: partite } = await getDb()
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId);

  const n = torneo.players.length;
  const required = n === 4 ? 4 : 3;

  if ((partite?.length || 0) < required) return;

  const valido = n === 4
    ? validaFormato4(partite, torneo.players)
    : validaFormato3(partite, torneo.players);

  const nuovoStatus = valido ? 'finished' : 'invalid';
  await getDb().from('tournaments').update({
    status: nuovoStatus,
    finished_at: new Date().toISOString(),
  }).eq('id', tournamentId);

  console.log(`[polling] Torneo ${tournamentId} → ${nuovoStatus}`);
  fermaPolling(tournamentId);

  if (valido) await calcolaPodio(tournamentId, partite, torneo.players, n);
}

// ── Validazione formato 4 giocatori ──────────────────────────────────────────
// P1: A vs B,  P2: C vs D,  P3: vin(P1) vs vin(P2),  P4: per(P1) vs per(P2)

function validaFormato4(partite, playerIds) {
  const [a, b, c, d] = playerIds;

  // Cerca P1 e P2: due partite con coppie disgiunte
  const coppie = [[a, b], [c, d], [a, c], [b, d], [a, d], [b, c]];
  const partiteDisgiunte = trovaCoppieDisgiunte(partite, coppie);
  if (!partiteDisgiunte) return false;

  const [p1, p2] = partiteDisgiunte;
  const vinP1 = p1.winner_id;
  const vinP2 = p2.winner_id;
  const perP1 = altroGiocatore(p1, vinP1);
  const perP2 = altroGiocatore(p2, vinP2);

  // Cerca P3 (finale): tra i due vincitori
  const p3 = partite.find(p =>
    sonoStessiGiocatori(p, vinP1, vinP2) &&
    p !== p1 && p !== p2
  );
  if (!p3) return false;

  // Cerca P4 (finale 3°-4°): tra i due perdenti
  const p4 = partite.find(p =>
    sonoStessiGiocatori(p, perP1, perP2) &&
    p !== p1 && p !== p2 && p !== p3
  );
  return !!p4;
}

// ── Validazione formato 3 giocatori ──────────────────────────────────────────
// P1: A vs B,  P2: per(P1) vs C,  P3: vin(P2) vs vin(P1)

function validaFormato3(partite, playerIds) {
  const [a, b, c] = playerIds;
  const coppie = [[a, b], [a, c], [b, c]];

  for (const [x, y] of coppie) {
    const p1 = partite.find(p => sonoStessiGiocatori(p, x, y));
    if (!p1) continue;

    const terzo = playerIds.find(id => id !== x && id !== y);
    const perP1 = altroGiocatore(p1, p1.winner_id);
    const p2 = partite.find(p =>
      sonoStessiGiocatori(p, perP1, terzo) && p !== p1
    );
    if (!p2) continue;

    const p3 = partite.find(p =>
      sonoStessiGiocatori(p, p2.winner_id, p1.winner_id) &&
      p !== p1 && p !== p2
    );
    if (p3) return true;
  }
  return false;
}

// ── Calcolo podio e punti ─────────────────────────────────────────────────────

async function calcolaPodio(tournamentId, partite, playerIds, n) {
  // Aggiorna battles (storico globale partite)
  for (const m of partite) {
    await getDb().from('battles').upsert({
      player1_id: m.player1_id,
      player2_id: m.player2_id,
      winner_id: m.winner_id,
      crowns_p1: m.crowns_p1,
      crowns_p2: m.crowns_p2,
      battle_type: n === 4 ? '1v1' : '1v1', // sarà letto da torneo.match_type
      played_at: m.played_at,
      cr_battle_id: m.cr_battle_id,
    }, { onConflict: 'cr_battle_id' });
  }
  // Punti classifica: da implementare nella prossima fase
}

// ── Helper ────────────────────────────────────────────────────────────────────

function sonoStessiGiocatori(partita, id1, id2) {
  return (
    (partita.player1_id === id1 && partita.player2_id === id2) ||
    (partita.player1_id === id2 && partita.player2_id === id1)
  );
}

function altroGiocatore(partita, winnerId) {
  return partita.player1_id === winnerId ? partita.player2_id : partita.player1_id;
}

function trovaCoppieDisgiunte(partite, coppie) {
  for (let i = 0; i < coppie.length; i++) {
    for (let j = i + 1; j < coppie.length; j++) {
      const [a1, b1] = coppie[i];
      const [a2, b2] = coppie[j];
      // Disgiunte = nessun ID in comune
      if (a1 !== a2 && a1 !== b2 && b1 !== a2 && b1 !== b2) {
        const p1 = partite.find(p => sonoStessiGiocatori(p, a1, b1));
        const p2 = partite.find(p => sonoStessiGiocatori(p, a2, b2));
        if (p1 && p2) return [p1, p2];
      }
    }
  }
  return null;
}

function generaBattleId(battle) {
  // CR non espone un ID univoco diretto: usiamo battleTime + tag giocatori
  const t = battle.battleTime || '';
  const me = battle.team?.[0]?.tag || '';
  const opp = battle.opponent?.[0]?.tag || '';
  return `${t}_${[me, opp].sort().join('_')}`;
}

module.exports = { avviaPolling, fermaPolling, pollingAttivi };
