importScripts("https://storage.googleapis.com/workbox-cdn/releases/4.3.1/workbox-sw.js");

if (workbox) {
  // 1. Core Compendium Precaching (Injected by Jekyll during build)
  workbox.precaching.precacheAndRoute(self.__precacheManifest || []);

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

  // 3. Fallback routing (Optional but recommended for PWAs)
  // If an offline user tries to access a non-cached route, redirect them home.
  workbox.routing.setCatchHandler(({event}) => {
      if (event.request.destination === 'document') {
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