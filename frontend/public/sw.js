// Minimal service worker: exists to make the app installable and to let
// the shell (HTML/JS/CSS) load instantly on repeat visits. Deliberately
// does NOT cache /api/* or /ws/* — booking, matching, and messaging data
// must always come from the network, never a stale cache.
const CACHE = 'genesis-shell-v1';
const SHELL_PATHS = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL_PATHS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/') || url.pathname.startsWith('/admin')) return;

  // Network-first for the shell so a fresh deploy is picked up quickly;
  // cache is just the offline/slow-connection fallback.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
  );
});
