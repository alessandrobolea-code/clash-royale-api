# ⚔️ Clash Tracker — Guida Setup Completa

## Struttura del progetto

```
clash-tracker/
├── frontend/
│   └── index.html       → il sito (va su Netlify)
└── proxy/
    ├── server.js         → il proxy (va su Render)
    └── package.json
```

---

## Step 1 — Crea il repo su GitHub

1. Vai su [github.com](https://github.com) → **New repository**
2. Nome: `clash-tracker` → **Create repository**
3. Clona il repo in locale con GitHub Desktop o VS Code
4. Copia i file nella struttura sopra
5. Fai il primo commit e push

---

## Step 2 — Proxy su Render

> Il proxy gira su Render con IP fisso — serve per usare l'API ufficiale di Clash Royale

1. Vai su [render.com](https://render.com) → crea account gratuito
2. **New → Web Service** → connetti il tuo repo GitHub
3. Impostazioni:
   - **Root directory:** `proxy`
   - **Build command:** `npm install`
   - **Start command:** `node server.js`
4. Nella sezione **Environment Variables** aggiungi:
   - `CR_API_KEY` = la tua chiave da [developer.clashroyale.com](https://developer.clashroyale.com)
5. Clicca **Deploy**
6. Render ti dà un URL tipo `https://clash-proxy-xxxx.onrender.com` → **copialo**

### Ottenere la CR API Key

1. Vai su [developer.clashroyale.com](https://developer.clashroyale.com)
2. Crea un account → **My Account → Create New Key**
3. Come IP inserisci l'IP statico di Render (lo trovi nella dashboard del tuo Web Service)
4. Copia la chiave generata

---

## Step 3 — Firebase (database)

1. Vai su [console.firebase.google.com](https://console.firebase.google.com)
2. **Create a project** → dai un nome → continua
3. Vai su **Firestore Database** → **Create database** → scegli **Start in test mode**
4. Vai su **Project Settings** (icona ⚙️) → scorri fino a **Your apps** → clicca **</>** (Web)
5. Registra l'app → copia l'oggetto `firebaseConfig`

---

## Step 4 — Configura index.html

Apri `frontend/index.html` e sostituisci la sezione `⚙️ CONFIGURA QUI`:

```js
const FIREBASE_CONFIG = {
  apiKey: "...",           // da Firebase Project Settings
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};

const PROXY_URL = "https://clash-proxy-xxxx.onrender.com"; // URL da Render
```

Salva e fai commit + push su GitHub.

---

## Step 5 — Frontend su Netlify

1. Vai su [netlify.com](https://netlify.com) → crea account
2. **Add new site → Import an existing project → GitHub**
3. Seleziona il repo `clash-tracker`
4. Impostazioni:
   - **Base directory:** `frontend`
   - **Build command:** *(lascia vuoto)*
   - **Publish directory:** `frontend`
5. Clicca **Deploy site**
6. Netlify ti dà un link tipo `https://clash-tracker-xxxx.netlify.app` → **condividilo con gli amici!**

---

## Deploy automatico (la parte bella)

Da questo momento il flusso è semplicissimo:

```
modifica index.html in VS Code
→ commit + push su GitHub
→ Netlify si aggiorna automaticamente in ~30 secondi ✅
```

Stesso per il proxy: ogni push aggiorna anche Render.

---

## Funzionalità dell'app

| Feature | Descrizione |
|---|---|
| 👥 Giocatori | Aggiungi giocatori tramite tag CR, dati caricati automaticamente |
| ↻ Aggiorna | Aggiorna trofei/arena di un giocatore live dall'API |
| ⚔️ Tornei | Crea tornei con i giocatori che vuoi |
| 🎮 Risultati | Registra il vincitore di ogni partita |
| 🏆 Classifica | Aggiornata automaticamente (3 punti per vittoria) |
| 📜 Storico | Tutte le partite giocate nel torneo |

---

## Costi

| Servizio | Piano | Costo |
|---|---|---|
| GitHub | Free | €0 |
| Render | Free (Web Service) | €0 |
| Firebase | Spark (free tier) | €0 |
| Netlify | Free | €0 |

> ⚠️ **Nota Render:** il piano gratuito "spegne" il server dopo 15 minuti di inattività. La prima richiesta dopo lo spegnimento ci mette ~30 secondi. Per uso tra amici va benissimo.

---

## Prossimi sviluppi (idee)

- [ ] Bracket ad eliminazione diretta
- [ ] Notifiche quando viene registrato un risultato
- [ ] Storico tornei passati con statistiche
- [ ] Login con Google per proteggere i dati
