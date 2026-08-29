// Minimal service worker: exists only to satisfy Chrome/Android's PWA
// installability requirement (a registered SW with a fetch handler) and to
// give the app shell an offline fallback. Deliberately intervenes on
// nothing but top-level navigations — every JS/CSS/image/font/API request
// passes straight through untouched. An earlier version also intercepted
// those asset requests with a cache-then-network-fallback strategy; on a
// flaky connection, a failed JS/CSS fetch fell back to the cached
// index.html, which the browser then tried to parse as that script —
// silently breaking React entirely while the already-painted page kept
// its CSS :hover/:active styling, so taps looked like they registered but
// did nothing. Never repeat that: only ever touch navigation requests.
const CACHE = 'genesis-shell-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add('/')).then(() => self.skipWaiting()));
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
  if (event.request.mode !== 'navigate') return; // let every other request hit the network untouched

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put('/', copy));
        return res;
      })
      .catch(() => caches.match('/'))
  );
});
