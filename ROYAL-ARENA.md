# ROYAL ARENA — Specifica di Progetto
> Claude Code Context Document — leggi questo file prima di iniziare qualsiasi attività di sviluppo.

---

## 1. Panoramica

Royal Arena è una PWA per la gestione di tornei di Clash Royale tra un gruppo privato di amici su iPhone. Zero backend — tutto gira nel browser. Il frontend chiama direttamente Supabase (database) e il proxy RoyaleAPI (API CR).

- **Tipo:** PWA — HTML/CSS/JS vanilla, zero backend
- **Hosting:** GitHub Pages (gratuito)
- **Database:** Supabase (PostgreSQL, gratuito)
- **API CR:** proxy.royaleapi.dev (IP fisso incluso)
- **Utenti:** gruppo privato, solo iPhone

---

## 2. Stack Tecnico

| Parte | Tecnologia | Note |
|-------|-----------|------|
| Frontend | HTML/CSS/JS vanilla | PWA installabile da Safari |
| Database | Supabase | Chiamate dirette dal browser |
| API CR | proxy.royaleapi.dev | Sostituisce api.clashroyale.com |
| Hosting | GitHub Pages | Push su main → deploy automatico |

### Architettura
```
iPhone (Safari/PWA)
    ├──→ Supabase          → tutti i dati (tornei, partite, giocatori, classifiche)
    └──→ proxy.royaleapi.dev → battlelog giocatori CR
```

### Come funziona il proxy CR
- Dichiarare l'IP `45.79.218.79` nella API key su developer.clashroyale.com
- Sostituire `https://api.clashroyale.com` con `https://proxy.royaleapi.dev`
- Il proxy gestisce il CORS — le chiamate funzionano direttamente dal browser
- Esempio: `GET https://proxy.royaleapi.dev/v1/players/%23TAG/battlelog`

---

## 3. Struttura Cartelle

```
royal-arena/                        ← repository GitHub
├── index.html                      → Home + Torneo
├── classifiche.html                → Classifiche + storico
├── manifest.json                   → PWA manifest
├── sw.js                           → Service Worker
├── icon.png                        → icona app 192x192px
└── js/
    ├── config.js                   → chiavi pubbliche Supabase + CR_API_KEY
    ├── supabase.js                 → client Supabase
    ├── api.js                      → chiamate a Supabase e proxy CR
    ├── home.js                     → logica home/torneo
    └── classifiche.js              → logica classifiche
```

---

## 4. Configurazione

### js/config.js (pubblico — ok nel frontend)
```js
const SUPABASE_URL     = 'https://xxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGci...';
const CR_API_KEY        = 'eyJ0eXAi...'; // key con IP 45.79.218.79
const CR_PROXY_URL      = 'https://proxy.royaleapi.dev/v1';
```

### Setup API key CR
1. Vai su developer.clashroyale.com
2. Crea nuova key — IP da dichiarare: `45.79.218.79`
3. Incolla la key in `js/config.js`

### Setup Supabase
1. Crea account su supabase.com
2. Nuovo progetto
3. Vai su Settings → API → copia URL e anon key
4. Incolla in `js/config.js`
5. Vai su SQL Editor → esegui lo schema sotto

---

## 5. Schema Database (Supabase)

```sql
-- Giocatori
CREATE TABLE players (
  id         SERIAL PRIMARY KEY,
  username   TEXT NOT NULL,
  cr_tag     TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tornei
CREATE TABLE tournaments (
  id          SERIAL PRIMARY KEY,
  match_type  TEXT NOT NULL CHECK (match_type IN ('1v1','tripla')),
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active','paused','finished','invalid')),
  created_by  INT REFERENCES players(id),
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- Partecipanti torneo
CREATE TABLE tournament_players (
  tournament_id INT REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id     INT REFERENCES players(id),
  PRIMARY KEY (tournament_id, player_id)
);

-- Partite rilevate nel torneo
CREATE TABLE tournament_matches (
  id            SERIAL PRIMARY KEY,
  tournament_id INT REFERENCES tournaments(id) ON DELETE CASCADE,
  player1_id    INT REFERENCES players(id),
  player2_id    INT REFERENCES players(id),
  winner_id     INT REFERENCES players(id),
  crowns_p1     SMALLINT,
  crowns_p2     SMALLINT,
  played_at     TIMESTAMPTZ,
  cr_battle_id  TEXT UNIQUE
);

-- Tutte le partite (statistiche generali)
CREATE TABLE battles (
  id           SERIAL PRIMARY KEY,
  player1_id   INT REFERENCES players(id),
  player2_id   INT REFERENCES players(id),
  winner_id    INT REFERENCES players(id),
  crowns_p1    SMALLINT,
  crowns_p2    SMALLINT,
  battle_type  TEXT CHECK (battle_type IN ('1v1','tripla')),
  played_at    TIMESTAMPTZ,
  cr_battle_id TEXT UNIQUE
);

-- Classifica punti
CREATE TABLE standings (
  player_id INT PRIMARY KEY REFERENCES players(id),
  points    INT DEFAULT 0
);
```

---

## 6. Schermate UI

Stile: dark blu notte `#0A0F2E`, oro `#F5C842`.
Font: `Cinzel Decorative` + `Crimson Text` (Google Fonts).

### index.html — Home + Torneo (pagina unica)

**Stato A — nessun torneo attivo:**
```
┌─────────────────────────────┐
│  ⚔️ Royal Arena  [Classif.]│
├─────────────────────────────┤
│  [ Chip giocatori ]         │  ← selezionabili, grid 4 col
│  [ Tipo: 1v1 / Tripla ]     │  ← toggle
│         ( AVVIA )           │  ← bottone oro circolare
└─────────────────────────────┘
```

**Stato B — torneo attivo:**
```
┌─────────────────────────────┐
│  ● Rilevamento    9:47      │  ← dot verde + timer
│  1  Mario vs Paolo  2-1 👑  │  ← partite in tempo reale
│  2  Luca vs Luigi   2-0 👑  │
│  [ Annulla ]                │
└─────────────────────────────┘
```

**Stato C — completato:**
```
│  🥇 Mario   +3 pt           │
│  🥈 Luca    +2 pt           │
│  🥉 Paolo   +1 pt           │
│  [ Vedi classifiche → ]     │
```

### classifiche.html
- Tab **Classifica** → leaderboard punti
- Tab **Storico** → tornei con data/ora e vincitore

---

## 7. Formati Torneo

> UN SOLO torneo attivo alla volta. Nessun nome — identificato da data/ora.

### 4 Giocatori — 4 partite
```
P1: A vs B
P2: C vs D
P3: Vincitore(P1) vs Vincitore(P2)  → 1° e 2°
P4: Perdente(P1)  vs Perdente(P2)   → 3° e 4°
```

### 3 Giocatori — 3 partite (scaletta)
```
P1: A vs B
P2: Perdente(P1) vs C
P3: Vincitore(P2) vs Vincitore(P1)  → 1°
```

---

## 8. Flusso Torneo

1. Utente seleziona 3-4 giocatori + tipo → clicca Avvia
2. Frontend salva torneo su Supabase (`status: active`)
3. Polling ogni 30s: chiama `proxy.royaleapi.dev/v1/players/{tag}/battlelog`
4. Filtra partite: dopo `started_at`, tra partecipanti, tipo corretto, non duplicate
5. Nuove partite salvate su Supabase + mostrate in tempo reale
6. 10 minuti senza partite → `status: paused`
7. Raggiunto N partite → valida struttura → podio o errore

---

## 9. Polling — logica JS

```js
async function poll(tournament) {
  for (const player of tournament.players) {
    const tag = player.cr_tag.replace('#', '');
    const res = await fetch(`${CR_PROXY_URL}/players/%23${tag}/battlelog`, {
      headers: { Authorization: `Bearer ${CR_API_KEY}` }
    });
    const battles = await res.json();

    for (const battle of battles) {
      // filtra e salva su Supabase se valida
    }
  }
}
```

---

## 10. PWA

### manifest.json
```json
{
  "name": "Royal Arena",
  "short_name": "Royal Arena",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0f2e",
  "theme_color": "#0a0f2e",
  "icons": [{ "src": "/icon.png", "sizes": "192x192", "type": "image/png" }]
}
```

### Installazione iPhone
1. Safari → URL GitHub Pages
2. Condividi (□↑) → "Aggiungi a schermata Home"

---

## 11. Classifiche

| Posizione | Punti |
|-----------|-------|
| 1° | 3 pt |
| 2° | 2 pt |
| 3° | 1 pt |
| 4° | 0 pt |

---

## 12. Dipendenze Frontend

```html
<!-- Supabase -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<!-- Font -->
<link href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
```

---

## 13. Deploy GitHub Pages

1. Crea repo GitHub `royal-arena`
2. Push dei file
3. Settings → Pages → Branch: main → Save
4. URL: `nomeutente.github.io/royal-arena`

---

## 14. Istruzioni per Claude Code

### Prima di ogni sessione
1. Leggi questo file
2. Solo HTML/CSS/JS vanilla — nessun framework, nessun build step
3. Supabase via CDN — nessun npm
4. Le chiavi CR e Supabase stanno in `js/config.js`

### Stato attuale
- ✅ Stack definitivo: HTML/CSS/JS + Supabase + proxy.royaleapi.dev
- ✅ Design completato: prototipo `home-v3.html` disponibile come riferimento visivo
- ✅ Zero backend — tutto nel browser
- ❌ Sviluppo: NON ancora iniziato
- ⏭️ Prossimo step: creare repo GitHub + index.html + connessione Supabase

### Profilo developer
- Buona esperienza JavaScript vanilla
- Nuovo a Supabase
- Preferisce approccio step-by-step con spiegazioni

### Regole
- Stack fisso — nessuna variazione
- Una funzionalità alla volta
- Spiegare sempre i concetti nuovi
