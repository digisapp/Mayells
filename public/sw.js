// Service worker for the seller upload flow only (registered by
// /upload/[token] with scope '/upload/').
//
// It does one thing: keeps a copy of the upload page so a seller who
// reloads it with no signal still gets the page rather than Safari's error.
// Everything else (API calls, the direct-to-storage uploads, scripts,
// images, other pages) goes straight to the network untouched.
//
// Earlier versions were registered for the whole site ('/') and proxied
// every request on mayells.com. The browser re-fetches this same file to
// update those old registrations, so when it finds itself running with the
// site-root scope it steps aside: it intercepts nothing and unregisters.

const CACHE_NAME = 'mayells-upload-v3';
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const IS_LEGACY_ROOT = SCOPE_PATH === '/';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Caches are shared across the origin, so only older versions of ours go.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('mayells-upload-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      if (IS_LEGACY_ROOT) {
        if (self.registration.navigationPreload) {
          await self.registration.navigationPreload.disable().catch(() => {});
        }
        await self.registration.unregister();
        return;
      }
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => {});
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Not ours: let the browser handle it exactly as if there were no worker.
  if (
    IS_LEGACY_ROOT ||
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith('/upload/') ||
    request.mode !== 'navigate'
  ) {
    return;
  }

  // Upload page navigations: network first (using the preloaded response
  // when there is one), keeping the latest copy for offline reloads.
  event.respondWith(
    (async () => {
      try {
        const response = (await event.preloadResponse) || (await fetch(request));
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw err;
      }
    })()
  );
});
