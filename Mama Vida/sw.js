// Sassy Sudoku — service worker
//   - Cache-first for the app shell (HTML/CSS/JS)
//   - Network-first for dailies.json / notes.json (freshness matters, Actions updates them)
//   - Stale-while-revalidate for Google Fonts
// Bump VERSION to force a fresh cache after deploys that change shell files.

const VERSION = 'sassy-sudoku-v1.1.0';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './engine.js',
  './app.js',
  './manifest.json',
  './icon.svg',
];

// Paths that should always try network first (fall back to cached copy when offline).
const NETWORK_FIRST_PATHS = ['/dailies.json', '/notes.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // --- network-first: dynamic JSON that Actions update --------------------
  if (NETWORK_FIRST_PATHS.some((p) => url.pathname.endsWith(p))) {
    event.respondWith(
      fetch(req).then((resp) => {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
        }
        return resp;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // --- Google Fonts: stale-while-revalidate -------------------------------
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(VERSION).then((cache) =>
        cache.match(req).then((cached) => {
          const network = fetch(req).then((resp) => {
            if (resp && resp.status === 200) cache.put(req, resp.clone());
            return resp;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // --- same-origin: cache-first with network fallback ---------------------
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached || fetch(req).then((resp) => {
          if (resp && resp.status === 200 && req.url.startsWith(location.origin)) {
            const copy = resp.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy));
          }
          return resp;
        }).catch(() => cached)
      )
    );
  }
});
