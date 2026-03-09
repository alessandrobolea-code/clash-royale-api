const express = require('express');
const router = express.Router();
const { avviaPolling, fermaPolling } = require('../services/polling');

// POST /clash/start — avvia polling per un torneo
router.post('/start', async (req, res) => {
  const { tournament_id } = req.body;
  if (!tournament_id) return res.status(400).json({ error: 'tournament_id mancante' });

  avviaPolling(tournament_id);
  res.json({ ok: true, message: `Polling avviato per torneo ${tournament_id}` });
});

// POST /clash/stop — ferma polling
router.post('/stop', async (req, res) => {
  const { tournament_id } = req.body;
  if (!tournament_id) return res.status(400).json({ error: 'tournament_id mancante' });

  fermaPolling(tournament_id);
  res.json({ ok: true, message: `Polling fermato per torneo ${tournament_id}` });
});

// GET /clash/status/:id — stato polling
router.get('/status/:id', (req, res) => {
  const { pollingAttivi } = require('../services/polling');
  const attivo = pollingAttivi.has(req.params.id);
  res.json({ tournament_id: req.params.id, polling_attivo: attivo });
});

module.exports = router;
