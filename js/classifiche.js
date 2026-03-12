// ============================================================
// CLASSIFICHE — logica
// ============================================================

let activeTab = 'classifica'; // 'classifica' | 'storico'

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
  else loadStorico();
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
// START
// ============================================================

document.addEventListener('DOMContentLoaded', init);
