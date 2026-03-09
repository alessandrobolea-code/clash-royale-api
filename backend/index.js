require('dotenv').config();
const express = require('express');
const cors = require('cors');
const clashRoutes = require('./routes/clash');
const { avviaGlobalPolling } = require('./services/globalPolling');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// Routes
app.use('/clash', clashRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Mostra l'IP pubblico del server (utile per configurare la CR API key)
app.get('/ip', async (req, res) => {
  const https = require('https');
  https.get('https://api.ipify.org?format=json', (r) => {
    let data = '';
    r.on('data', chunk => data += chunk);
    r.on('end', () => res.json(JSON.parse(data)));
  }).on('error', () => res.status(500).json({ error: 'impossibile ottenere IP' }));
});

app.listen(PORT, () => {
  console.log(`Royal Arena backend in ascolto su porta ${PORT}`);
  avviaGlobalPolling();
});
