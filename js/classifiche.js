// ============================================================
// CLASSIFICHE — logica
// ============================================================

let activeTab = 'classifica'; // 'classifica' | 'storico' | 'partite'

async function init() {
  switchTab(activeTab);
}

// ============================================================
// TAB
// ============================================================

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  if (tab === 'classifica') loadClassifica();
  else if (tab === 'storico') loadStorico();
  else loadPartite();
}

// ============================================================
// CLASSIFICA
// ============================================================

async function loadClassifica() {
  const content = document.getElementById('tab-content');
  content.innerHTML = '<p class="loading">Caricamento...</p>';

  try {
    const standings = await getStandings();

    if (standings.length === 0) {
      content.innerHTML = '<p class="empty-msg">Ancora nessuna partita giocata.</p>';
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    const rows = standings.map((s, i) => `
      <div class="leaderboard-row rank-${Math.min(i + 1, 4)}">
        <span class="lb-rank">${medals[i] || (i + 1)}</span>
        <span class="lb-name">${s.players.username}</span>
        <span class="lb-pts">${s.points} pt</span>
      </div>
    `).join('');

    content.innerHTML = `<div class="leaderboard">${rows}</div>`;
  } catch (err) {
    content.innerHTML = `<p class="error-msg">Errore: ${err.message}</p>`;
  }
}

// ============================================================
// STORICO TORNEI
// ============================================================

async function loadStorico() {
  const content = document.getElementById('tab-content');
  content.innerHTML = '<p class="loading">Caricamento...</p>';

  try {
    const tournaments = await getTournamentsHistory();

    if (tournaments.length === 0) {
      content.innerHTML = '<p class="empty-msg">Nessun torneo concluso.</p>';
      return;
    }

    const cards = tournaments.map(t => renderTournamentCard(t)).join('');
    content.innerHTML = `<div class="storico-list">${cards}</div>`;
  } catch (err) {
    content.innerHTML = `<p class="error-msg">Errore: ${err.message}</p>`;
  }
}

function renderTournamentCard(t) {
  const date   = new Date(t.started_at);
  const label  = date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  const time   = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const type   = t.match_type.toUpperCase();
  const status = t.status === 'invalid' ? ' — <span class="badge-invalid">annullato</span>' : '';
  const players = t.tournament_players.map(tp => tp.players.username).join(', ');

  const matchRows = t.tournament_matches.length > 0
    ? t.tournament_matches.map(m => `
        <div class="hist-match">
          ${m.player1.username} vs ${m.player2.username}
          &mdash; <strong>${m.winner.username}</strong> vince
        </div>
      `).join('')
    : '<div class="hist-match empty-msg">Nessuna partita registrata</div>';

  return `
    <div class="tournament-card ${t.status === 'invalid' ? 'invalid' : ''}">
      <div class="card-header">
        <span class="card-date">${label} ${time}</span>
        <span class="card-badge">${type}${status}</span>
      </div>
      <div class="card-players">${players}</div>
      <div class="card-matches">${matchRows}</div>
    </div>
  `;
}

// ============================================================
// PARTITE — tutte le partite dei giocatori registrati (CR API)
// ============================================================

async function loadPartite() {
  const content = document.getElementById('tab-content');
  content.innerHTML = '<p class="loading">Recupero partite...</p>';

  let players;
  try {
    players = await getPlayers();
  } catch (err) {
    content.innerHTML = `<p class="error-msg">Errore DB: ${err.message}</p>`;
    return;
  }

  if (players.length === 0) {
    content.innerHTML = '<p class="empty-msg">Nessun giocatore registrato.</p>';
    return;
  }

  // Mappa tag → username per i giocatori registrati
  const registeredMap = {};
  players.forEach(p => {
    registeredMap[p.cr_tag.replace('#', '').toUpperCase()] = p.username;
  });

  // Fetch parallela dei battlelog
  const results = await Promise.allSettled(
    players.map(p => getBattlelog(p.cr_tag))
  );

  // Raggruppa tutte le partite e deduplicale per cr_battle_id
  const seen = new Set();
  const allBattles = [];

  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    r.value.forEach(battle => {
      const teamTags  = battle.team.map(p => p.tag);
      const oppTags   = battle.opponent.map(p => p.tag);
      const id = makeBattleId(battle.battleTime, teamTags, oppTags);
      if (seen.has(id)) return;
      seen.add(id);

      // Normalizza: team[0] è sempre un nostro giocatore
      const teamTag = players[i].cr_tag.replace('#', '').toUpperCase();
      allBattles.push({ battle, queryPlayerTag: teamTag, crId: id });
    });
  });

  if (allBattles.length === 0) {
    content.innerHTML = '<p class="empty-msg">Nessuna partita trovata.</p>';
    return;
  }

  // Ordina dalla più recente
  allBattles.sort((a, b) =>
    parseCRDate(b.battle.battleTime) - parseCRDate(a.battle.battleTime)
  );

  const rows = allBattles.map(({ battle, queryPlayerTag }) =>
    renderBattleRow(battle, queryPlayerTag, registeredMap)
  ).join('');

  content.innerHTML = `<div class="battles-list">${rows}</div>`;
}

function renderBattleRow(battle, queryPlayerTag, registeredMap) {
  const date = parseCRDate(battle.battleTime);
  const timeLabel = date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
    + ' ' + date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  // Determina lato team e opponent rispetto al giocatore registrato che ha originato la query
  const teamTags = battle.team.map(p => p.tag.replace('#', '').toUpperCase());
  const isTeam   = teamTags.includes(queryPlayerTag);

  const ourSide  = isTeam ? battle.team    : battle.opponent;
  const oppSide  = isTeam ? battle.opponent : battle.team;

  // Nome lato nostro (tutti i giocatori del lato, con username se registrati)
  const ourNames = ourSide.map(p => {
    const tag = p.tag.replace('#', '').toUpperCase();
    return registeredMap[tag] || p.name;
  }).join(' & ');

  // Nome lato avversario
  const oppNames = oppSide.map(p => {
    const tag = p.tag.replace('#', '').toUpperCase();
    const isRegistered = !!registeredMap[tag];
    const name = registeredMap[tag] || p.name;
    return isRegistered ? `<span class="opp-registered">${name}</span>` : name;
  }).join(' & ');

  // Corone
  const ourCrowns = ourSide.reduce((s, p) => s + (p.crowns ?? 0), 0);
  const oppCrowns = oppSide.reduce((s, p) => s + (p.crowns ?? 0), 0);
  const won = ourCrowns > oppCrowns;

  const resultClass = won ? 'battle-win' : 'battle-loss';
  const resultLabel = won ? 'V' : 'S';

  return `
    <div class="battle-row ${resultClass}">
      <div class="battle-result-badge">${resultLabel}</div>
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

// Riusa parseCRDate da api.js
function parseCRDate(battleTime) {
  const m = battleTime.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!m) return new Date(battleTime);
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`);
}

// ============================================================
// START
// ============================================================

document.addEventListener('DOMContentLoaded', init);
