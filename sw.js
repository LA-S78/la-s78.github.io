---
permalink: /sw.js
---
/* 
   NOTE: This file is a Jekyll-processed template. 
   VSCodium settings are configured to ignore validation errors 
   caused by the Jekyll front-matter and Liquid tags below.
*/
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
  // Delete what older versions of this worker saved, so phones don't keep stale copies
  workbox.precaching.cleanupOutdatedCaches();

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

  // 3. Live data (map, alliances, rewards, calendar): always fetched fresh when online; the
  //    last good answer is kept, so offline the pages show the most recent live data seen
  //    (marked with an X-Offline-Copy header holding when it was saved). Requests add a
  //    changing ?t=... to avoid stale copies, so answers are stored without it.
  workbox.routing.registerRoute(
    ({ url }) =>
      url.origin === self.location.origin &&
      (url.pathname === '/api/state' || url.pathname === '/api/calendar'),
    async ({ url, event }) => {
      const key = new URL(url.href);
      key.searchParams.delete('t');
      const cache = await caches.open('asylum-live-data');
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const headers = new Headers(response.headers);
          headers.set('X-Offline-Copy', new Date().toISOString());
          const saved = new Response(await response.clone().blob(), {
            status: response.status,
            headers,
          });
          await cache.put(key.href, saved);
        }
        return response;
      } catch (err) {
        const saved = await cache.match(key.href);
        if (saved) return saved;
        throw err;
      }
    }
  );

  // Pages that weren't saved: straight from the network, as without a worker. Having a
  // route means a failed load (offline) reaches the fallback below.
  workbox.routing.registerRoute(
    ({ url, event }) =>
      url.origin === self.location.origin &&
      (event.request.mode === 'navigate' ||
        (event.request.headers.get('accept') || '').includes('text/html')),
    new workbox.strategies.NetworkOnly()
  );

  // 4. Fallback routing (Upgraded for Turbo Drive compatibility)
  //    Offline, a page that was never saved opens the home page in the reader's language
  //    (always saved). Saved pages are stored under a versioned address, so they are looked
  //    up through Workbox (a plain caches.match('/index.html') never found them).
  workbox.routing.setCatchHandler(async ({ event }) => {
    const acceptHeader = event.request.headers.get('accept') || '';
    const isNavigate = event.request.destination === 'document';
    const isTurboFetch = event.request.destination === '' && acceptHeader.includes('text/html');
    if (!isNavigate && !isTurboFetch) return Response.error();

    const path = new URL(event.request.url).pathname;
    const lang = (path.match(/^\/(en|de|es|fr|it|ru|tr|uk)\//) || [])[1] || 'en';
    for (const url of [`/${lang}/index.html`, '/en/index.html', '/index.html']) {
      const saved = await caches.match(workbox.precaching.getCacheKeyForURL(url) || url);
      if (saved) return saved;
    }
    return Response.error();
  });
}

// 5. Listen for the update command from the UI
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});