// Chiamate al backend Node.js (polling Clash Royale)

async function avviaTorneo(tournamentId) {
  const res = await fetch(`${BACKEND_URL}/clash/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tournament_id: tournamentId }),
  });
  if (!res.ok) throw new Error('Errore avvio polling');
  return res.json();
}

async function fermaTorneo(tournamentId) {
  const res = await fetch(`${BACKEND_URL}/clash/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tournament_id: tournamentId }),
  });
  if (!res.ok) throw new Error('Errore stop polling');
  return res.json();
}
