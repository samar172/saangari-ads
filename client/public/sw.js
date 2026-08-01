// Minimal service worker: enough to make the app installable as a PWA, without
// getting in the way of the live API. Never caches /api or /uploads; navigations
// are network-first (so the app always loads the latest HTML, falling back to a
// cached shell when offline); hashed static assets are cache-first.
const CACHE = 'saangari-shell-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/index.html'])).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // never touch mutations
  const url = new URL(req.url);
  // Live data must always hit the network.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads')) return;

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }
  // Cache-first for static assets (Vite hashes filenames, so this is safe).
  e.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => hit)
    )
  );
});
