// ============================================================
// STATISTICHE GIOCATORI
// ============================================================

async function init() {
  const grid = document.getElementById('stats-grid');
  grid.innerHTML = '<p class="loading">Caricamento giocatori...</p>';

  let players;
  try {
    players = await getPlayers();
  } catch (err) {
    grid.innerHTML = `<p class="error-msg">Errore DB: ${err.message}</p>`;
    return;
  }

  if (players.length === 0) {
    grid.innerHTML = '<p class="empty-msg">Nessun giocatore registrato.</p>';
    return;
  }

  // Carica standings per aggiungere i punti torneo
  let standingsMap = {};
  try {
    const standings = await getStandings();
    standings.forEach(s => { standingsMap[s.player_id] = s.points; });
  } catch (_) {}

  // Renderizza i placeholder subito
  grid.innerHTML = players.map(p => `
    <div class="stat-card" id="card-${p.id}">
      <div class="card-top">
        <div class="card-name">${p.username}</div>
        <div class="card-tag">${p.cr_tag}</div>
      </div>
      <div class="card-body loading-inline">
        <span class="spinner"></span> Caricamento...
      </div>
    </div>
  `).join('');

  // Fetch parallela per tutti i giocatori
  await Promise.all(players.map(p => loadPlayerStats(p, standingsMap[p.id] ?? 0)));
}

async function loadPlayerStats(player, tournamentPoints) {
  const cardBody = document.querySelector(`#card-${player.id} .card-body`);
  try {
    const data = await fetchCRPlayer(player.cr_tag);
    cardBody.innerHTML = renderStats(data, tournamentPoints);
    cardBody.classList.remove('loading-inline');
  } catch (err) {
    cardBody.innerHTML = `<p class="error-inline">Errore API: ${err.message}</p>`;
    cardBody.classList.remove('loading-inline');
  }
}

async function fetchCRPlayer(crTag) {
  const tag = crTag.replace('#', '');
  const res = await fetch(`${CR_PROXY_URL}/players/%23${tag}`, {
    headers: { Authorization: `Bearer ${CR_API_KEY}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function renderStats(d, tournamentPoints) {
  const winRate = d.battleCount > 0
    ? Math.round((d.wins / d.battleCount) * 100)
    : 0;

  const clanHtml = d.clan
    ? `<div class="stat-row"><span class="stat-lbl">Clan</span><span class="stat-val clan-name">${d.clan.name}</span></div>`
    : '';

  const arenaHtml = d.arena
    ? `<div class="stat-row"><span class="stat-lbl">Arena</span><span class="stat-val">${d.arena.name}</span></div>`
    : '';

  return `
    <div class="level-trophy-row">
      <div class="level-badge">Lv ${d.expLevel}</div>
      <div class="trophy-block">
        <span class="trophy-icon">🏆</span>
        <span class="trophy-val">${d.trophies.toLocaleString('it-IT')}</span>
        <span class="trophy-best">max ${d.bestTrophies.toLocaleString('it-IT')}</span>
      </div>
    </div>

    <div class="stats-grid-inner">
      <div class="stat-box">
        <div class="stat-box-val">${d.wins.toLocaleString('it-IT')}</div>
        <div class="stat-box-lbl">Vittorie</div>
      </div>
      <div class="stat-box">
        <div class="stat-box-val">${winRate}%</div>
        <div class="stat-box-lbl">Win Rate</div>
      </div>
      <div class="stat-box">
        <div class="stat-box-val">${d.threeCrownWins.toLocaleString('it-IT')}</div>
        <div class="stat-box-lbl">3 Corone</div>
      </div>
      <div class="stat-box highlight">
        <div class="stat-box-val">${tournamentPoints} pt</div>
        <div class="stat-box-lbl">Torneo</div>
      </div>
    </div>

    ${arenaHtml}
    ${clanHtml}

    <div class="stat-row muted">
      <span class="stat-lbl">Partite totali</span>
      <span class="stat-val">${d.battleCount.toLocaleString('it-IT')}</span>
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', init);
