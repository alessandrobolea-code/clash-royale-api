// Service Worker — Royal Arena
// Cache-first per i file statici, network-first per le API

const CACHE_NAME = 'royal-arena-v15';

const STATIC_ASSETS = [
  './',
  './index.html',
  './classifiche.html',
  './statistiche.html',
  './manifest.json',
  './js/config.js',
  './js/supabase.js',
  './js/api.js',
  './js/home.js',
  './js/classifiche.js',
  './js/statistiche.js',
  './css/style.css',
  './images/background.jpg',
  './images/Clash-Royale-Font/You Blockhead.ttf',
];

// Installa e metti in cache i file statici
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Rimuovi le vecchie cache al primo activate
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first per statici, network-first per supabase/proxy
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Le chiamate a Supabase e al proxy CR: non intercettare, lascia al browser
  if (url.hostname.includes('supabase') || url.hostname.includes('royaleapi')) {
    return;
  }

  // Per tutto il resto: cache-first con fallback rete
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
