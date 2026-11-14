// Keeps the browser from ever running a stale copy of the game: every file of the site is fetched fresh, whatever
// server it comes from (a plain `python -m http.server` sends no cache headers, and a browser then mixes old and
// new modules: "the requested module does not provide an export named ..."). Registered by index.html.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method === 'GET' && new URL(r.url).origin === self.location.origin) e.respondWith(fetch(r.url, { cache: 'no-store' }));
});
