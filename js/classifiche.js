// ============================================================
// STORICO TORNEI
// ============================================================

let hideInvalid = true;
let cachedTournaments = null;

async function init() {
  await loadStorico();
}

async function loadStorico() {
  const content = document.getElementById('tab-content');
  content.innerHTML = '<p class="loading">Caricamento...</p>';

  try {
    if (!cachedTournaments) cachedTournaments = await getTournamentsHistory();
    renderStorico();
  } catch (err) {
    content.innerHTML = `<p class="error-msg">Errore: ${err.message}</p>`;
  }
}

function renderStorico() {
  const content = document.getElementById('tab-content');
  const list = hideInvalid
    ? cachedTournaments.filter(t => t.status !== 'invalid')
    : cachedTournaments;

  const toggleBtn = `
    <div class="storico-toolbar">
      <button class="toggle-invalid ${hideInvalid ? 'active' : ''}" onclick="toggleHideInvalid()">
        ${hideInvalid ? 'Mostra annullati' : 'Nascondi annullati'}
      </button>
    </div>`;

  if (list.length === 0) {
    content.innerHTML = toggleBtn + '<p class="empty-msg">Nessun torneo concluso.</p>';
    return;
  }

  const cards = list.map(t => renderTournamentCard(t)).join('');
  content.innerHTML = toggleBtn + `<div class="storico-list">${cards}</div>`;
}

function toggleHideInvalid() {
  hideInvalid = !hideInvalid;
  renderStorico();
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

document.addEventListener('DOMContentLoaded', init);
