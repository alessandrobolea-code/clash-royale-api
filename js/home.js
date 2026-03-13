// ============================================================
// STATO GLOBALE
// ============================================================

let allPlayers = [];             // tutti i giocatori registrati
let selectedPlayerIds = new Set(); // chip selezionati

let activeTournament = null;     // oggetto torneo corrente
let tournamentMatches = [];      // partite già rilevate
let knownBattleIds = new Set();  // cr_battle_id già processati

let pollingTimer = null;         // setInterval polling
let autopauseTimer = null;       // setTimeout auto-pausa
let timerInterval = null;        // setInterval timer display

const POLL_INTERVAL   = 30_000;       // 30s
const AUTOPAUSE_DELAY = 10 * 60_000;  // 10min senza nuove partite

const POINTS_BY_PLACE = { 1: 3, 2: 2, 3: 1, 4: 0 };

// ============================================================
// INIT
// ============================================================

let standingsMap = {}; // player_id → points
let trophiesMap  = {}; // player_id → CR trophies

async function init() {
  try {
    [allPlayers] = await Promise.all([getPlayers()]);
    const [active, standings] = await Promise.all([
      getActiveTournament(),
      getStandings().catch(() => []),
    ]);
    standings.forEach(s => { standingsMap[s.player_id] = s.points; });

    // Fetch coppe CR in parallelo (best effort, ignora errori)
    const profileResults = await Promise.allSettled(
      allPlayers.map(p => getPlayerProfile(p.cr_tag))
    );
    profileResults.forEach((r, i) => {
      if (r.status === 'fulfilled') trophiesMap[allPlayers[i].id] = r.value.trophies ?? 0;
    });

    if (active) {
      activeTournament = active;
      tournamentMatches = await getTournamentMatches(active.id);
      knownBattleIds = new Set(tournamentMatches.map(m => m.cr_battle_id));

      if (active.status === 'active') {
        renderActive();
        startPolling();
      } else {
        renderPaused();
      }
    } else {
      renderIdle();
    }
  } catch (err) {
    showError('Errore di connessione: ' + err.message);
  }
}

// ============================================================
// RENDER — STATO IDLE (nessun torneo)
// ============================================================

function renderIdle() {
  const app = document.getElementById('app');
  const playerList = allPlayers.map(p => {
    const trophies = trophiesMap[p.id] ?? '—';
    return `
      <button class="player-card ${selectedPlayerIds.has(p.id) ? 'selected' : ''}"
              onclick="togglePlayer(${p.id})"
              data-id="${p.id}">
        <div class="player-info">
          <div class="player-name">${p.username}</div>
          <div class="player-subtag">${p.cr_tag}</div>
        </div>
        <div class="player-pts">🏆 ${trophies}</div>
      </button>
    `;
  }).join('');

  app.innerHTML = `
    <div class="idle-view">
      <div class="section-label">GIOCATORI</div>
      <div class="player-list-card">
        <div class="player-list">
          ${playerList || '<p class="empty-msg">Nessun giocatore registrato</p>'}
        </div>
      </div>
      <div class="start-wrap">
        <button class="btn-start" onclick="startTournament()">AVVIA</button>
      </div>
    </div>
  `;
}

// ============================================================
// RENDER — STATO ACTIVE (torneo in corso)
// ============================================================

function renderActive() {
  const app = document.getElementById('app');
  const participants = activeTournament.tournament_players.map(tp => tp.players);

  app.innerHTML = `
    <div class="active-view">
      <div class="status-bar">
        <span class="dot-live"></span>
        <span class="status-text">Rilevamento</span>
        <span class="timer" id="timer">0:00</span>
      </div>

      <div class="participants-bar">
        ${participants.map(p => `<span class="pchip">${p.username}</span>`).join('')}
      </div>

      <div class="matches-list" id="matches-list">
        ${renderMatchRows()}
      </div>

      <div class="active-footer">
        <button class="btn-cancel" onclick="cancelTournament()">Annulla torneo</button>
      </div>
    </div>
  `;

  startTimer();
}

function renderMatchRows() {
  if (tournamentMatches.length === 0) {
    return '<p class="empty-msg">In attesa della prima partita...</p>';
  }
  return tournamentMatches.map((m, i) => `
    <div class="match-row">
      <span class="match-num">${i + 1}</span>
      <span class="match-players">
        <span class="${m.winner_id === m.player1.id ? 'winner' : 'loser'}">${m.player1.username}</span>
        <span class="vs">vs</span>
        <span class="${m.winner_id === m.player2.id ? 'winner' : 'loser'}">${m.player2.username}</span>
        <span class="crowns">${m.crowns_p1}-${m.crowns_p2} 👑</span>
      </span>
    </div>
  `).join('');
}

// ============================================================
// RENDER — STATO PAUSED
// ============================================================

function renderPaused() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="active-view">
      <div class="status-bar paused">
        <span class="dot-paused"></span>
        <span class="status-text">In pausa</span>
      </div>

      <div class="matches-list">
        ${renderMatchRows()}
      </div>

      <p class="pause-msg">Nessuna partita rilevata da 10 minuti.<br>Il torneo è in pausa.</p>

      <div class="active-footer">
        <button class="btn-gold" onclick="resumeTournament()">Riprendi polling</button>
        <button class="btn-cancel" onclick="cancelTournament()">Annulla torneo</button>
      </div>
    </div>
  `;
}

// ============================================================
// RENDER — STATO COMPLETE (podio)
// ============================================================

function renderComplete(positions) {
  const app = document.getElementById('app');
  const medals = ['🥇', '🥈', '🥉', '4°'];

  const rows = positions.map((pos, i) => `
    <div class="podio-row rank-${i + 1}">
      <span class="medal">${medals[i] || (i + 1) + '°'}</span>
      <span class="podio-name">${pos.username}</span>
      <span class="podio-pts">+${POINTS_BY_PLACE[i + 1] ?? 0} pt</span>
    </div>
  `).join('');

  app.innerHTML = `
    <div class="complete-view">
      <div class="complete-title">TORNEO CONCLUSO</div>
      <div class="podio">
        ${rows}
      </div>
      <div class="complete-footer">
        <a href="storico.html" class="btn-link">Vedi storico →</a>
      </div>
    </div>
  `;
}

// ============================================================
// SELEZIONE GIOCATORI
// ============================================================

function togglePlayer(id) {
  if (selectedPlayerIds.has(id)) {
    selectedPlayerIds.delete(id);
  } else {
    if (selectedPlayerIds.size >= 4) {
      showToast('Massimo 4 giocatori per torneo');
      return;
    }
    selectedPlayerIds.add(id);
  }
  document.querySelectorAll('.player-card').forEach(btn => {
    const btnId = parseInt(btn.dataset.id);
    btn.classList.toggle('selected', selectedPlayerIds.has(btnId));
  });
}


// ============================================================
// AVVIA TORNEO
// ============================================================

async function startTournament() {
  const ids = [...selectedPlayerIds];
  if (ids.length < 3 || ids.length > 4) {
    showToast('Seleziona 3 o 4 giocatori');
    return;
  }

  const btn = document.querySelector('.btn-start');
  btn.disabled = true;
  btn.textContent = '...';

  try {
    activeTournament = await createTournament(ids, 'amichevole');
    // Ricarica con i dati dei giocatori inclusi
    activeTournament = await getActiveTournament();
    tournamentMatches = [];
    knownBattleIds = new Set();
    renderActive();
    startPolling();
  } catch (err) {
    showError('Errore avvio torneo: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'AVVIA';
  }
}

// ============================================================
// ANNULLA TORNEO
// ============================================================

async function cancelTournament() {
  if (!confirm('Annullare il torneo in corso?')) return;
  stopPolling();
  try {
    await updateTournamentStatus(activeTournament.id, 'invalid');
    activeTournament = null;
    tournamentMatches = [];
    knownBattleIds = new Set();
    selectedPlayerIds = new Set();
    renderIdle();
  } catch (err) {
    showError('Errore annullamento: ' + err.message);
  }
}

// ============================================================
// RIPRENDI POLLING (da pausa)
// ============================================================

async function resumeTournament() {
  await updateTournamentStatus(activeTournament.id, 'active');
  activeTournament.status = 'active';
  renderActive();
  startPolling();
}

// ============================================================
// POLLING
// ============================================================

function startPolling() {
  poll(); // primo poll immediato
  pollingTimer = setInterval(poll, POLL_INTERVAL);
  resetAutopause();
}

function stopPolling() {
  clearInterval(pollingTimer);
  clearTimeout(autopauseTimer);
  clearInterval(timerInterval);
  pollingTimer = null;
}

function resetAutopause() {
  clearTimeout(autopauseTimer);
  autopauseTimer = setTimeout(autoPause, AUTOPAUSE_DELAY);
}

async function autoPause() {
  stopPolling();
  try {
    await updateTournamentStatus(activeTournament.id, 'paused');
    activeTournament.status = 'paused';
    renderPaused();
  } catch (err) {
    console.error('Errore auto-pausa:', err);
  }
}

async function poll() {
  if (!activeTournament) return;

  const participants = activeTournament.tournament_players.map(tp => tp.players);
  const participantTagMap = {}; // tag → player object
  participants.forEach(p => {
    participantTagMap[p.cr_tag.replace('#', '').toUpperCase()] = p;
  });

  let newBattlesFound = false;

  for (const player of participants) {
    try {
      const battles = await getBattlelog(player.cr_tag);

      for (const battle of battles) {
        if (!isBattleValid(battle, activeTournament, participantTagMap)) continue;

        const teamTags = battle.team.map(p => p.tag);
        const oppTags  = battle.opponent.map(p => p.tag);
        const crId = makeBattleId(battle.battleTime, teamTags, oppTags);

        if (knownBattleIds.has(crId)) continue;

        // Identifica i due giocatori nel nostro DB
        const p1tag = teamTags[0].replace('#', '').toUpperCase();
        const p2tag = oppTags[0].replace('#', '').toUpperCase();
        const p1 = participantTagMap[p1tag];
        const p2 = participantTagMap[p2tag];
        if (!p1 || !p2) continue;

        const crownsP1 = battle.team[0].crowns ?? 0;
        const crownsP2 = battle.opponent[0].crowns ?? 0;
        const winnerId = crownsP1 >= crownsP2 ? p1.id : p2.id;

        const saved = await saveTournamentMatch({
          tournament_id: activeTournament.id,
          player1_id: p1.id,
          player2_id: p2.id,
          winner_id: winnerId,
          crowns_p1: crownsP1,
          crowns_p2: crownsP2,
          played_at: parseCRDate(battle.battleTime).toISOString(),
          cr_battle_id: crId,
          match_type: activeTournament.match_type,
        });

        if (saved) {
          knownBattleIds.add(crId);
          newBattlesFound = true;
        }
      }
    } catch (err) {
      console.warn(`Poll fallito per ${player.username}:`, err.message);
    }
  }

  if (newBattlesFound) {
    resetAutopause();
    // Ricarica le partite e aggiorna la UI
    tournamentMatches = await getTournamentMatches(activeTournament.id);
    document.getElementById('matches-list').innerHTML = renderMatchRows();
    await checkCompletion();
  }
}

// ============================================================
// VALIDAZIONE PARTITA
// ============================================================

function isBattleValid(battle, tournament, participantTagMap) {
  const battleDate = parseCRDate(battle.battleTime);
  const cutoff = new Date(new Date(tournament.started_at) - 2 * 60_000);
  if (battleDate < cutoff) return false;

  const allTags = [
    ...battle.team.map(p => p.tag.replace('#', '').toUpperCase()),
    ...battle.opponent.map(p => p.tag.replace('#', '').toUpperCase()),
  ];
  return allTags.every(tag => participantTagMap[tag]);
}

// ============================================================
// PARSA DATA CR
// ============================================================

function parseCRDate(battleTime) {
  // Formato CR: "20241215T143022.000Z"
  const m = battleTime.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!m) return new Date(battleTime);
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`);
}

// ============================================================
// CONTROLLO COMPLETAMENTO TORNEO
// ============================================================

async function checkCompletion() {
  const n = activeTournament.tournament_players.length;
  const needed = n === 4 ? 4 : 3; // 4 giocatori → 4 partite; 3 giocatori → 3 partite

  if (tournamentMatches.length < needed) return;

  const result = n === 4
    ? analyzeBracket4(tournamentMatches)
    : analyzeBracket3(tournamentMatches);

  if (!result) return; // struttura non ancora determinabile

  // Torneo completato!
  stopPolling();
  await updateTournamentStatus(activeTournament.id, 'finished');

  // Assegna punti
  const pointsEntries = result.positions.map((pos, i) => ({
    player_id: pos.player_id,
    points: POINTS_BY_PLACE[i + 1] ?? 0,
  }));
  await addPoints(pointsEntries);

  renderComplete(result.positions);
}

// ============================================================
// ANALISI BRACKET — 4 GIOCATORI
// ============================================================

function analyzeBracket4(matches) {
  const sorted = [...matches].sort((a, b) => new Date(a.played_at) - new Date(b.played_at));
  if (sorted.length < 4) return null;

  // Le prime due partite sono le semifinali (coinvolgono 4 giocatori diversi)
  const semi1 = sorted[0];
  const semi1Ids = new Set([semi1.player1_id, semi1.player2_id]);
  const semi2 = sorted.find(m => m.id !== semi1.id &&
    !semi1Ids.has(m.player1_id) && !semi1Ids.has(m.player2_id));
  if (!semi2) return null;

  const loser = (match) => match.player1_id === match.winner_id ? match.player2_id : match.player1_id;

  const s1Winner = semi1.winner_id;
  const s1Loser  = loser(semi1);
  const s2Winner = semi2.winner_id;
  const s2Loser  = loser(semi2);

  const remaining = sorted.filter(m => m.id !== semi1.id && m.id !== semi2.id);

  const finalMatch = remaining.find(m => {
    const ids = new Set([m.player1_id, m.player2_id]);
    return ids.has(s1Winner) && ids.has(s2Winner);
  });
  const thirdMatch = remaining.find(m => {
    const ids = new Set([m.player1_id, m.player2_id]);
    return ids.has(s1Loser) && ids.has(s2Loser);
  });

  if (!finalMatch || !thirdMatch) return null;

  const allPlayers = activeTournament.tournament_players.map(tp => tp.players);
  const byId = {};
  allPlayers.forEach(p => { byId[p.id] = p; });

  return {
    positions: [
      { player_id: finalMatch.winner_id,  username: byId[finalMatch.winner_id]?.username },
      { player_id: loser(finalMatch),     username: byId[loser(finalMatch)]?.username },
      { player_id: thirdMatch.winner_id,  username: byId[thirdMatch.winner_id]?.username },
      { player_id: loser(thirdMatch),     username: byId[loser(thirdMatch)]?.username },
    ],
  };
}

// ============================================================
// ANALISI BRACKET — 3 GIOCATORI (scaletta)
// ============================================================

function analyzeBracket3(matches) {
  const sorted = [...matches].sort((a, b) => new Date(a.played_at) - new Date(b.played_at));
  if (sorted.length < 3) return null;

  const loser = (m) => m.player1_id === m.winner_id ? m.player2_id : m.player1_id;

  // P1: prima partita (qualsiasi due giocatori)
  const p1 = sorted[0];
  const p1Winner = p1.winner_id;
  const p1Loser  = loser(p1);

  // P2: il perdente di P1 affronta il terzo giocatore
  const p2 = sorted.find(m => m.id !== p1.id &&
    (m.player1_id === p1Loser || m.player2_id === p1Loser));
  if (!p2) return null;

  const p2Winner = p2.winner_id;
  const p2Loser  = loser(p2);

  // P3: vincitore P2 vs vincitore P1
  const p3 = sorted.find(m => m.id !== p1.id && m.id !== p2.id);
  if (!p3) return null;

  const p3Winner = p3.winner_id;
  const p3Loser  = loser(p3);

  const allPlayers = activeTournament.tournament_players.map(tp => tp.players);
  const byId = {};
  allPlayers.forEach(p => { byId[p.id] = p; });

  return {
    positions: [
      { player_id: p3Winner, username: byId[p3Winner]?.username },
      { player_id: p3Loser,  username: byId[p3Loser]?.username },
      { player_id: p2Loser,  username: byId[p2Loser]?.username },
    ],
  };
}

// ============================================================
// TIMER
// ============================================================

function startTimer() {
  clearInterval(timerInterval);
  const startedAt = new Date(activeTournament.started_at);
  timerInterval = setInterval(() => {
    const el = document.getElementById('timer');
    if (!el) { clearInterval(timerInterval); return; }
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }, 1000);
}

// ============================================================
// TOAST / ERRORI
// ============================================================

function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function showError(msg) {
  console.error(msg);
  showToast(msg);
}

// ============================================================
// START
// ============================================================

document.addEventListener('DOMContentLoaded', init);
