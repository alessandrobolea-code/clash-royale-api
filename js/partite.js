// ============================================================
// PARTITE GLOBALI — polling ogni 60 secondi
// ============================================================

const POLL_INTERVAL = 60 * 1000; // 60 secondi

let pollTimer      = null;
let countdownTimer = null;
let nextPollAt     = 0;

let registeredMap = {};  // tag (senza #) → { id, username }
let allBattles    = [];  // array ordinato delle battle da mostrare
const seenIds     = new Set(); // cr_battle_id già visti (deduplicazione)

// ============================================================
// INIT
// ============================================================

async function init() {
  updateStatus('Caricamento giocatori...');

  let players;
  try {
    players = await getPlayers();
  } catch (err) {
    updateStatus(`Errore DB: ${err.message}`);
    return;
  }

  if (players.length === 0) {
    updateStatus('Nessun giocatore registrato.');
    document.getElementById('battles-content').innerHTML =
      '<p class="empty-msg">Nessun giocatore registrato.</p>';
    return;
  }

  players.forEach(p => {
    const tag = p.cr_tag.replace('#', '').toUpperCase();
    registeredMap[tag] = { id: p.id, username: p.username };
  });

  await poll(players);
  schedulePoll(players);
}

// ============================================================
// POLLING
// ============================================================

async function poll(players) {
  updateStatus('Aggiornamento...');

  try {
    const results = await Promise.allSettled(
      players.map(p => getBattlelog(p.cr_tag))
    );

    const newBattles = [];

    results.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      const ourTag = players[i].cr_tag.replace('#', '').toUpperCase();

      r.value.forEach(battle => {
        const teamTags = battle.team.map(p => p.tag);
        const oppTags  = battle.opponent.map(p => p.tag);
        const id = makeBattleId(battle.battleTime, teamTags, oppTags);
        if (seenIds.has(id)) return;
        seenIds.add(id);
        newBattles.push({ crId: id, battle, ourPlayerTag: ourTag });

        // Salva su Supabase (best effort, ignora errori duplicato)
        trySaveBattle(battle, ourTag);
      });
    });

    if (newBattles.length > 0) {
      allBattles = [...newBattles, ...allBattles];
      allBattles.sort((a, b) =>
        parseCRDate(b.battle.battleTime) - parseCRDate(a.battle.battleTime)
      );
      renderBattles();
      showToast(`+${newBattles.length} nuova/e partita/e`);
    } else if (allBattles.length === 0) {
      document.getElementById('battles-content').innerHTML =
        '<p class="empty-msg">Nessuna partita trovata.</p>';
    }

    const lastTime = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    updateStatus(`Aggiornato alle ${lastTime}`);
    startCountdown();

  } catch (err) {
    updateStatus(`Errore: ${err.message}`);
  }
}

function schedulePoll(players) {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => poll(players), POLL_INTERVAL);
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  nextPollAt = Date.now() + POLL_INTERVAL;

  countdownTimer = setInterval(() => {
    const secs = Math.max(0, Math.round((nextPollAt - Date.now()) / 1000));
    const el = document.getElementById('next-poll');
    if (el) el.textContent = `prossimo: ${secs}s`;
    if (secs === 0) clearInterval(countdownTimer);
  }, 1000);
}

// ============================================================
// SALVATAGGIO SU SUPABASE (best effort)
// ============================================================

async function trySaveBattle(battle, ourPlayerTag) {
  try {
    const teamTags = battle.team.map(p => p.tag.replace('#', '').toUpperCase());
    const isTeam   = teamTags.includes(ourPlayerTag);
    const ourSide  = isTeam ? battle.team    : battle.opponent;
    const oppSide  = isTeam ? battle.opponent : battle.team;

    // Registrati sul nostro lato
    const regOur = ourSide
      .map(p => registeredMap[p.tag.replace('#', '').toUpperCase()])
      .filter(Boolean);
    if (regOur.length === 0) return;

    // Registrati sul lato avversario (possono essere null)
    const regOpp = oppSide
      .map(p => registeredMap[p.tag.replace('#', '').toUpperCase()])
      .filter(Boolean);

    const ourCrowns = ourSide.reduce((s, p) => s + (p.crowns ?? 0), 0);
    const oppCrowns = oppSide.reduce((s, p) => s + (p.crowns ?? 0), 0);
    const ourWon    = ourCrowns > oppCrowns;

    const player1_id = regOur[0].id;
    const player2_id = regOpp.length > 0 ? regOpp[0].id : null;
    const winner_id  = ourWon ? player1_id : (player2_id ?? null);

    const allTags = [...battle.team, ...battle.opponent]
      .map(p => p.tag.replace('#', '')).sort();
    const cr_battle_id = `${battle.battleTime}_${allTags.join('_')}`;

    await db.from('battles').insert({
      player1_id,
      player2_id,
      winner_id,
      crowns_p1: ourWon ? ourCrowns : oppCrowns,
      crowns_p2: ourWon ? oppCrowns : ourCrowns,
      battle_type: 'amichevole',
      played_at: parseCRDate(battle.battleTime).toISOString(),
      cr_battle_id,
    });
  } catch (_) {
    // Ignora: duplicato o schema issue
  }
}

// ============================================================
// RENDER
// ============================================================

function renderBattles() {
  const content = document.getElementById('battles-content');
  content.innerHTML = `<div class="battles-list">${
    allBattles.map(({ battle, ourPlayerTag }) =>
      renderBattleRow(battle, ourPlayerTag)
    ).join('')
  }</div>`;
}

function renderBattleRow(battle, ourPlayerTag) {
  const date = parseCRDate(battle.battleTime);
  const timeLabel = date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
    + ' ' + date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  const teamTags = battle.team.map(p => p.tag.replace('#', '').toUpperCase());
  const isTeam   = teamTags.includes(ourPlayerTag);
  const ourSide  = isTeam ? battle.team    : battle.opponent;
  const oppSide  = isTeam ? battle.opponent : battle.team;

  const ourNames = ourSide.map(p => {
    const tag = p.tag.replace('#', '').toUpperCase();
    const reg = registeredMap[tag];
    return reg ? `<span class="reg-name">${reg.username}</span>` : p.name;
  }).join(' & ');

  const oppNames = oppSide.map(p => {
    const tag = p.tag.replace('#', '').toUpperCase();
    const reg = registeredMap[tag];
    return reg ? `<span class="reg-name">${reg.username}</span>` : p.name;
  }).join(' & ');

  const ourCrowns = ourSide.reduce((s, p) => s + (p.crowns ?? 0), 0);
  const oppCrowns = oppSide.reduce((s, p) => s + (p.crowns ?? 0), 0);
  const won = ourCrowns > oppCrowns;

  return `
    <div class="battle-row ${won ? 'battle-win' : 'battle-loss'}">
      <div class="battle-result-badge">${won ? 'V' : 'S'}</div>
      <div class="battle-info">
        <div class="battle-players">
          <span class="our-side">${ourNames}</span>
          <span class="battle-vs">vs</span>
          <span class="opp-side">${oppNames}</span>
        </div>
        <div class="battle-meta">
          <span class="battle-crowns">${ourCrowns} — ${oppCrowns} 👑</span>
          <span class="battle-time">${timeLabel}</span>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// UI HELPERS
// ============================================================

function updateStatus(msg) {
  const el = document.getElementById('poll-status');
  if (el) el.textContent = msg;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function parseCRDate(battleTime) {
  const m = battleTime.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!m) return new Date(battleTime);
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`);
}

// ============================================================
// START
// ============================================================

document.addEventListener('DOMContentLoaded', init);
