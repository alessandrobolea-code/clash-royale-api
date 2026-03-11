const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const app = express();
const PORT = process.env.PORT || 3000;
const CR_API_KEY = process.env.CR_API_KEY;

app.use(cors());
app.use(express.json());

app.get('/cr/*', async (req, res) => {
  const path = req.params[0];
  const query = new URLSearchParams(req.query).toString();
  const url = `https://api.clashroyale.com/v1/${path}${query ? '?' + query : ''}`;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${CR_API_KEY}` }
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Errore proxy', detail: err.message });
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));
app.listen(PORT, () => console.log(`Proxy attivo su porta ${PORT}`));
