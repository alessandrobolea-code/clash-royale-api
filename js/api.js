// ============================================================
// PLAYERS
// ============================================================

async function getPlayers() {
  const { data, error } = await db.from('players').select('*').order('username');
  if (error) throw error;
  return data;
}

// ============================================================
// TOURNAMENTS
// ============================================================

async function getActiveTournament() {
  const { data, error } = await db
    .from('tournaments')
    .select(`
      *,
      tournament_players ( player_id, players (*) )
    `)
    .in('status', ['active', 'paused'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data; // null se nessun torneo attivo
}

async function createTournament(playerIds, matchType) {
  const { data: tournament, error: tErr } = await db
    .from('tournaments')
    .insert({ match_type: matchType, status: 'active' })
    .select()
    .single();
  if (tErr) throw tErr;

  const rows = playerIds.map(pid => ({ tournament_id: tournament.id, player_id: pid }));
  const { error: tpErr } = await db.from('tournament_players').insert(rows);
  if (tpErr) throw tpErr;

  return tournament;
}

async function updateTournamentStatus(tournamentId, status) {
  const update = { status };
  if (status === 'finished' || status === 'invalid') update.finished_at = new Date().toISOString();
  const { error } = await db.from('tournaments').update(update).eq('id', tournamentId);
  if (error) throw error;
}

// ============================================================
// TOURNAMENT MATCHES
// ============================================================

async function getTournamentMatches(tournamentId) {
  const { data, error } = await db
    .from('tournament_matches')
    .select(`
      *,
      player1:player1_id ( id, username, cr_tag ),
      player2:player2_id ( id, username, cr_tag ),
      winner:winner_id   ( id, username )
    `)
    .eq('tournament_id', tournamentId)
    .order('played_at');
  if (error) throw error;
  return data;
}

// Ritorna true se la partita è stata salvata, false se era un duplicato
async function saveTournamentMatch({ tournament_id, player1_id, player2_id, winner_id,
  crowns_p1, crowns_p2, played_at, cr_battle_id, match_type }) {
  const { error } = await db.from('tournament_matches').insert({
    tournament_id, player1_id, player2_id, winner_id,
    crowns_p1, crowns_p2, played_at, cr_battle_id,
  });
  if (error) {
    if (error.code === '23505') return false; // cr_battle_id duplicato — già salvato
    throw error;
  }

  // Salva anche nella tabella globale battles (best effort)
  db.from('battles').insert({
    player1_id, player2_id, winner_id,
    crowns_p1, crowns_p2,
    battle_type: match_type,
    played_at, cr_battle_id,
  }).then(() => {}).catch(() => {});

  return true;
}

// ============================================================
// STANDINGS
// ============================================================

async function getStandings() {
  const { data, error } = await db
    .from('standings')
    .select('*, players (*)')
    .order('points', { ascending: false });
  if (error) throw error;
  return data;
}

// entries: [{ player_id, points }]
async function addPoints(entries) {
  for (const { player_id, points } of entries) {
    const { data } = await db
      .from('standings').select('points').eq('player_id', player_id).maybeSingle();
    const current = data?.points ?? 0;
    await db.from('standings').upsert({ player_id, points: current + points });
  }
}

// ============================================================
// TOURNAMENT HISTORY
// ============================================================

async function getTournamentsHistory() {
  const { data, error } = await db
    .from('tournaments')
    .select(`
      *,
      tournament_players ( players (*) ),
      tournament_matches (
        *, winner:winner_id ( username ),
        player1:player1_id ( username ),
        player2:player2_id ( username )
      )
    `)
    .in('status', ['finished', 'invalid'])
    .order('started_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ============================================================
// CR API — Battlelog
// ============================================================

// Parsa il formato data di CR: "20241215T143022.000Z" → Date
function parseCRDate(battleTime) {
  const m = battleTime.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!m) return new Date(battleTime);
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`);
}

// ID univoco per una partita (deterministico, basato sui tag)
function makeBattleId(battleTime, teamTags, opponentTags) {
  const allTags = [...teamTags, ...opponentTags].map(t => t.replace('#', '')).sort();
  return `${battleTime}_${allTags.join('_')}`;
}

async function getPlayerProfile(crTag) {
  const tag = crTag.replace('#', '');
  const res = await fetch(`${CR_PROXY_URL}/players/%23${tag}`, {
    headers: { Authorization: `Bearer ${CR_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Profile HTTP ${res.status} per ${crTag}`);
  return res.json();
}

async function getBattlelog(crTag) {
  const tag = crTag.replace('#', '');
  const res = await fetch(`${CR_PROXY_URL}/players/%23${tag}/battlelog`, {
    headers: { Authorization: `Bearer ${CR_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Battlelog HTTP ${res.status} per ${crTag}`);
  const json = await res.json();
  return Array.isArray(json) ? json : (json.items ?? []);
}
