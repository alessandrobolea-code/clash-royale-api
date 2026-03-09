// Polling globale — gira sempre in background dal boot del server.
// Rileva TUTTE le partite dei giocatori registrati e le salva in `battles`.

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

let _db = null;
function getDb() {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _db;
}

const CR_API_KEY = process.env.CR_API_KEY;
const CR_BASE = 'https://api.clashroyale.com/v1';
const INTERVALLO_MS = 30_000;

// ── Avvio ─────────────────────────────────────────────────────────────────────

function avviaGlobalPolling() {
  console.log('[global] Polling globale avviato (ogni 30s)');
  eseguiCicloGlobale();
  setInterval(eseguiCicloGlobale, INTERVALLO_MS);
}

// ── Ciclo ─────────────────────────────────────────────────────────────────────

async function eseguiCicloGlobale() {
  try {
    const { data: players, error } = await getDb()
      .from('players')
      .select('id, cr_tag, username');

    if (error || !players?.length) return;

    const tagToId = Object.fromEntries(players.map(p => [p.cr_tag, p.id]));

    // Leggi battle_id già salvati per evitare duplicati
    const { data: esistenti } = await getDb()
      .from('battles')
      .select('cr_battle_id');
    const idSalvati = new Set((esistenti || []).map(b => b.cr_battle_id));

    for (const player of players) {
      const tag = encodeURIComponent(player.cr_tag);
      const battaglie = await fetchBattlelog(tag);

      for (const battle of battaglie) {
        const tipo = rilevaTipo(battle);
        if (!tipo) continue;

        const battleId = generaBattleId(battle, player.cr_tag);
        if (idSalvati.has(battleId)) continue;

        const oppTag = battle.opponent?.[0]?.tag;
        const oppName = battle.opponent?.[0]?.name || '?';
        const myCrowns = battle.team?.[0]?.crowns ?? 0;
        const oppCrowns = battle.opponent?.[0]?.crowns ?? 0;
        const p1Id = tagToId[player.cr_tag];
        const p2Id = oppTag ? tagToId[oppTag] || null : null;
        const winnerId = myCrowns > oppCrowns ? p1Id : p2Id;

        const { error: errInsert } = await getDb().from('battles').insert({
          player1_id: p1Id,
          player2_id: p2Id,
          winner_id: winnerId,
          crowns_p1: myCrowns,
          crowns_p2: oppCrowns,
          battle_type: tipo,
          played_at: new Date(battle.battleTime).toISOString(),
          cr_battle_id: battleId,
          opponent_tag: p2Id ? null : oppTag,
          opponent_name: p2Id ? null : oppName,
        });

        if (!errInsert) {
          idSalvati.add(battleId);
          console.log(`[global] ${player.cr_tag} vs ${oppTag || '?'} (${tipo})`);
        }
      }
    }
  } catch (err) {
    console.error('[global] Errore ciclo:', err.message);
  }
}

// ── Helper CR API ─────────────────────────────────────────────────────────────

async function fetchBattlelog(encodedTag) {
  if (!CR_API_KEY || CR_API_KEY === 'placeholder') return [];
  try {
    const res = await axios.get(`${CR_BASE}/players/${encodedTag}/battlelog`, {
      headers: { Authorization: `Bearer ${CR_API_KEY}` },
      timeout: 10_000,
    });
    return res.data?.items || [];
  } catch (err) {
    if (err.response?.status === 404) return [];
    console.error('[global] Errore CR API:', err.message);
    return [];
  }
}

function rilevaTipo(battle) {
  const mode = battle.gameMode?.name || '';
  if (mode.includes('Triple') || mode.includes('TripleDraft')) return 'tripla';
  if (battle.team?.length === 1 && battle.opponent?.length === 1) return '1v1';
  return null;
}

function generaBattleId(battle, playerTag) {
  const t = battle.battleTime || '';
  const opp = battle.opponent?.[0]?.tag || '';
  // Ordina i tag così la stessa partita non viene salvata due volte
  // (una volta dal punto di vista di ciascun giocatore registrato)
  return `${t}_${[playerTag, opp].sort().join('_')}`;
}

module.exports = { avviaGlobalPolling };
