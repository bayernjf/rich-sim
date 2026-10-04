/*
 * rich-sim service worker (B1 · PWA, M2 revisit aid).
 * Strategy:
 *   - navigations: network-first, fall back to the last cached page, then /offline.html
 *   - built/static assets (/_astro/, icons, manifest): stale-while-revalidate
 *   - /api/* (fx proxy): never cached — the app has its own static-snapshot fallback
 * Bump SW_VERSION on caching-strategy changes; old caches are pruned on activate.
 */
const SW_VERSION = 'v1';
const STATIC_CACHE = `rich-sim-static-${SW_VERSION}`;
const PAGE_CACHE = `rich-sim-pages-${SW_VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![STATIC_CACHE, PAGE_CACHE].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache the fx proxy or any API response.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match(OFFLINE_URL);
        }),
    );
    return;
  }

  // Hashed build assets and public static files: stale-while-revalidate.
  const isStatic =
    url.pathname.startsWith('/_astro/') ||
    /\.(?:png|svg|webp|ico|css|js|woff2?|webmanifest)$/.test(url.pathname);
  if (!isStatic) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
