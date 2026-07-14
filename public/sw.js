/* Prometheus-AI service worker — installability + offline support.
 * Strategy: static assets cache-first, page navigations network-first with an
 * offline fallback. API routes and SSE (/api/*) are never intercepted. */
const CACHE = 'prometheus-v1';
const PRECACHE = [
  '/offline.html',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only same-origin GETs are eligible. Never touch APIs, SSE streams, or auth.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Static assets -> cache-first, refreshed in the background.
  const isAsset =
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:css|js|mjs|woff2?|ttf|png|jpe?g|webp|gif|svg|ico|webmanifest)$/.test(url.pathname);
  if (isAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Page navigations -> network-first, falling back to cache, then offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() =>
          caches.match(request).then((c) => c || caches.match('/offline.html'))
        )
    );
  }
});
