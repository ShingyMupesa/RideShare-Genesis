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

// Push notifications are sent with an empty payload (see worker/src/lib/webpush.js
// for why) — there's no per-event title/body to read here, so every push shows
// the same generic "something's new" prompt and the app fetches real detail
// once it's opened.
self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('RideShare Genesis', {
      body: 'You have an update — open the app to see what changed.',
      icon: '/icon-192.png',
      badge: '/favicon-64.png',
      tag: 'genesis-update',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
