const CACHE_NAME = 'mayell-upload-v1';
const PRECACHE_URLS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches + enable navigation preload so intercepted
// page navigations start their network request in parallel with SW boot
// (this SW is registered from /upload/[token] but scoped to '/', so every
// later page view on the site passes through it).
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      ),
      self.registration.navigationPreload
        ? self.registration.navigationPreload.enable()
        : Promise.resolve(),
    ])
  );
  self.clients.claim();
});

// Fetch: cache-first for static assets, network-first for everything else
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Cache-first for static assets
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached || fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
      )
    );
    return;
  }

  // Network-first for API calls and pages. For navigations, use the
  // preloaded response when available instead of starting a second fetch.
  event.respondWith(
    (async () => {
      try {
        if (event.preloadResponse) {
          const preloaded = await event.preloadResponse;
          if (preloaded) return preloaded;
        }
        return await fetch(event.request);
      } catch {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        throw new Error('offline');
      }
    })()
  );
});
