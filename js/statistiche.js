// ============================================================
// STATISTICHE GIOCATORI + TORNEO
// ============================================================

let activeTab = 'giocatori';
let cachedPlayers = null;
let cachedTournaments = null;
let activeChart = null;
let chartFilter = 'sempre';

async function init() {
  switchTab(activeTab);
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  if (tab === 'giocatori') loadGiocatori();
  else loadTournamentStats();
}

// ============================================================
// TAB GIOCATORI
// ============================================================

async function loadGiocatori() {
  const content = document.getElementById('tab-content');
  content.innerHTML = '<div id="stats-grid"><p class="loading">Caricamento giocatori...</p></div>';

  try {
    if (!cachedPlayers) cachedPlayers = await getPlayers();
  } catch (err) {
    content.innerHTML = `<p class="error-msg">Errore DB: ${err.message}</p>`;
    return;
  }

  if (cachedPlayers.length === 0) {
    content.innerHTML = '<p class="empty-msg">Nessun giocatore registrato.</p>';
    return;
  }

  const grid = document.getElementById('stats-grid');
  grid.innerHTML = cachedPlayers.map(p => `
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

  await Promise.all(cachedPlayers.map(p => loadPlayerStats(p)));
}

async function loadPlayerStats(player) {
  const cardBody = document.querySelector(`#card-${player.id} .card-body`);
  try {
    const data = await fetchCRPlayer(player.cr_tag);
    cardBody.innerHTML = renderStats(data);
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

function renderStats(d) {
  const winRate = d.battleCount > 0
    ? Math.round((d.wins / d.battleCount) * 100)
    : 0;

  const clanHtml = d.clan
    ? `<div class="stat-row"><span class="stat-lbl">Clan</span><span class="stat-val clan-name">${d.clan.name}</span></div>`
    : '';

  const arenaHtml = d.arena
    ? `<div class="stat-row">
         <span class="stat-lbl">Arena</span>
         <span class="stat-val arena-val">
           <img src="${arenaImg(d.arena.name)}" alt="" class="arena-img" onerror="this.style.display='none'">
           ${d.arena.name}
         </span>
       </div>`
    : '';

  return `
    <div class="level-trophy-row">
      <div class="level-badge">
        <img src="images/ui/level-big.png" alt="" class="level-img" onerror="this.style.display='none'">
        <span class="level-num">${d.expLevel}</span>
      </div>
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
        <div class="stat-box-val">${d.battleCount.toLocaleString('it-IT')}</div>
        <div class="stat-box-lbl">Partite</div>
      </div>
    </div>

    ${arenaHtml}
    ${clanHtml}
  `;
}

function arenaImg(arenaName) {
  const slug = arenaName.toLowerCase()
    .replace(/['']/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  return `images/arenas/${slug}.png`;
}

// ============================================================
// TAB TORNEO
// ============================================================

async function loadTournamentStats() {
  const content = document.getElementById('tab-content');
  content.innerHTML = '<p class="loading">Caricamento...</p>';

  let standingsMap = {};
  try {
    const [, , standings] = await Promise.all([
      cachedPlayers ? null : getPlayers().then(d => { cachedPlayers = d; }),
      cachedTournaments ? null : getTournamentsHistory().then(d => { cachedTournaments = d; }),
      getStandings(),
    ]);
    standings.forEach(s => { standingsMap[s.player_id] = s.points; });
  } catch (err) {
    content.innerHTML = `<p class="error-msg">Errore: ${err.message}</p>`;
    return;
  }

  const finished = cachedTournaments.filter(t => t.status === 'finished');

  if (finished.length === 0) {
    content.innerHTML = '<p class="empty-msg">Nessun torneo concluso.</p>';
    return;
  }

  renderTournamentStats(finished, standingsMap);
}

function computePlayerTournamentStats(players, tournaments, standingsMap = {}) {
  const stats = {};
  players.forEach(p => {
    stats[p.username] = {
      username: p.username,
      firstPlaces: 0,
      secondPlaces: 0,
      thirdPlaces: 0,
      wins: 0,
      losses: 0,
      tournamentsPlayed: 0,
      points: standingsMap[p.id] ?? 0,
    };
  });

  tournaments.forEach(t => {
    const participantUsernames = t.tournament_players.map(tp => tp.players.username);
    const winCounts = {};
    participantUsernames.forEach(u => { winCounts[u] = 0; });

    t.tournament_matches.forEach(m => {
      if (!m.winner) return;
      const w = m.winner.username;
      const p1 = m.player1.username;
      const p2 = m.player2.username;

      if (winCounts[w] !== undefined) winCounts[w]++;

      if (stats[p1]) { if (w === p1) stats[p1].wins++; else stats[p1].losses++; }
      if (stats[p2]) { if (w === p2) stats[p2].wins++; else stats[p2].losses++; }
    });

    const ranked = participantUsernames
      .filter(u => stats[u])
      .sort((a, b) => winCounts[b] - winCounts[a]);

    ranked.forEach((u, idx) => {
      stats[u].tournamentsPlayed++;
      if (idx === 0) stats[u].firstPlaces++;
      else if (idx === 1) stats[u].secondPlaces++;
      else if (idx === 2) stats[u].thirdPlaces++;
    });
  });

  return Object.values(stats).filter(s => s.tournamentsPlayed > 0);
}

function renderTournamentStats(finished, standingsMap = {}) {
  const content = document.getElementById('tab-content');
  const playerStats = computePlayerTournamentStats(cachedPlayers, finished, standingsMap);
  playerStats.sort((a, b) => b.firstPlaces - a.firstPlaces || b.wins - a.wins);

  const cards = playerStats.map(s => {
    const n = s.tournamentsPlayed;
    const pct = v => n > 0 ? Math.round((v / n) * 100) : 0;
    return `
      <div class="ts-card">
        <div class="ts-name">${s.username}</div>
        <div class="ts-body">
          <div class="ts-podium">
            <div class="ts-place">
              <span class="ts-place-icon">🥇</span>
              <span class="ts-place-val">${s.firstPlaces}</span>
              <span class="ts-place-pct">${pct(s.firstPlaces)}%</span>
            </div>
            <div class="ts-place">
              <span class="ts-place-icon">🥈</span>
              <span class="ts-place-val">${s.secondPlaces}</span>
              <span class="ts-place-pct">${pct(s.secondPlaces)}%</span>
            </div>
            <div class="ts-place">
              <span class="ts-place-icon">🥉</span>
              <span class="ts-place-val">${s.thirdPlaces}</span>
              <span class="ts-place-pct">${pct(s.thirdPlaces)}%</span>
            </div>
          </div>
          <div class="ts-matches">
            <div class="ts-match-row">
              <span class="ts-match-lbl">Partite vinte</span>
              <span class="ts-match-val win">${s.wins}</span>
            </div>
            <div class="ts-match-row">
              <span class="ts-match-lbl">Partite perse</span>
              <span class="ts-match-val loss">${s.losses}</span>
            </div>
            <div class="ts-match-row highlight">
              <span class="ts-match-lbl">Punti torneo</span>
              <span class="ts-match-val gold">${s.points} pt</span>
            </div>
            <div class="ts-match-row muted">
              <span class="ts-match-lbl">Tornei disputati</span>
              <span class="ts-match-val">${n}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  content.innerHTML = `
    <div class="ts-list">${cards}</div>
    <div class="ts-chart-section">
      <div class="ts-chart-header">
        <span class="ts-chart-title">Andamento vittorie</span>
        <div class="ts-filter-btns">
          <button class="ts-filter-btn" data-filter="1m" onclick="setChartFilter('1m')">1M</button>
          <button class="ts-filter-btn" data-filter="3m" onclick="setChartFilter('3m')">3M</button>
          <button class="ts-filter-btn active" data-filter="sempre" onclick="setChartFilter('sempre')">Sempre</button>
        </div>
      </div>
      <div class="ts-chart-wrap">
        <canvas id="ts-chart"></canvas>
      </div>
    </div>
  `;

  chartFilter = 'sempre';
  drawChart(finished);
}

function setChartFilter(filter) {
  chartFilter = filter;
  document.querySelectorAll('.ts-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  drawChart(cachedTournaments.filter(t => t.status === 'finished'));
}

function drawChart(tournaments) {
  if (activeChart) {
    activeChart.destroy();
    activeChart = null;
  }

  const canvas = document.getElementById('ts-chart');
  if (!canvas) return;

  const now = new Date();
  let cutoff = null;
  if (chartFilter === '1m') cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  if (chartFilter === '3m') cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());

  const filtered = cutoff
    ? tournaments.filter(t => new Date(t.started_at) >= cutoff)
    : tournaments;

  const sorted = [...filtered].sort((a, b) => new Date(a.started_at) - new Date(b.started_at));

  const labels = sorted.map(t =>
    new Date(t.started_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
  );

  const cumWins = {};
  cachedPlayers.forEach(p => { cumWins[p.username] = 0; });

  const seriesData = {};
  cachedPlayers.forEach(p => { seriesData[p.username] = []; });

  sorted.forEach(t => {
    const participantUsernames = t.tournament_players.map(tp => tp.players.username);
    const winsInT = {};
    t.tournament_matches.forEach(m => {
      if (m.winner) winsInT[m.winner.username] = (winsInT[m.winner.username] || 0) + 1;
    });

    cachedPlayers.forEach(p => {
      if (participantUsernames.includes(p.username)) {
        cumWins[p.username] += (winsInT[p.username] || 0);
      }
      seriesData[p.username].push(cumWins[p.username]);
    });
  });

  const colors = ['#f5c842', '#7eb8f7', '#f77e7e', '#7ef7a0', '#f7a07e', '#c07ef7'];
  const datasets = cachedPlayers.map((p, i) => ({
    label: p.username,
    data: seriesData[p.username],
    borderColor: colors[i % colors.length],
    backgroundColor: colors[i % colors.length] + '33',
    borderWidth: 2,
    pointRadius: 4,
    tension: 0.3,
    fill: false,
  }));

  activeChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#e8d9c0',
            font: { family: 'Cinzel, serif', size: 11 },
            boxWidth: 12,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#8a7f6e', font: { size: 10 }, maxRotation: 45 },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
        y: {
          ticks: { color: '#8a7f6e', font: { size: 10 }, stepSize: 1 },
          grid: { color: 'rgba(255,255,255,0.05)' },
          beginAtZero: true,
        },
      },
    },
  });
}

document.addEventListener('DOMContentLoaded', init);
