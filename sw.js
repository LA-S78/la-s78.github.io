---
---
// --- CACHE BUSTER ---
// This liquid tag changes on every build, forcing the file bytes to change.
// This guarantees iOS detects the update and triggers your PWA Toast.
const SW_VERSION = '{{ site.time | date: "%s" }}';

importScripts("https://storage.googleapis.com/workbox-cdn/releases/4.3.1/workbox-sw.js");

if (workbox) {
  // 1. Core Compendium Precaching (Using the specific jekyll-pwa-plugin variable)
  // We use a typeof check so the script doesn't crash in dev mode when the list is missing.
  const pwaCache = typeof precacheList !== 'undefined' ? precacheList : [];
  workbox.precaching.precacheAndRoute(pwaCache);

  // 2. Runtime Caching for external or lazy-loaded images
  workbox.routing.registerRoute(
    /\.(?:png|gif|jpg|jpeg|svg|webp)$/,
    new workbox.strategies.CacheFirst({
      cacheName: 'asylum-image-cache',
      plugins: [
        new workbox.expiration.Plugin({
          maxEntries: 100, // Safe limit for map/guide images
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
        }),
      ],
    })
  );

  // 3. Fallback routing (Upgraded for Turbo Drive compatibility)
  workbox.routing.setCatchHandler(({event}) => {
      const acceptHeader = event.request.headers.get('accept') || '';
      const isNavigate = event.request.destination === 'document';
      const isTurboFetch = event.request.destination === '' && acceptHeader.includes('text/html');

      if (isNavigate || isTurboFetch) {
          return caches.match('/index.html');
      }
      return Response.error();
  });
}

// 4. Listen for the update command from the UI
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});