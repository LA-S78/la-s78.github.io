---
permalink: /sw.js
---
/*
   NOTE: This file is a Jekyll-processed template (the front matter above and the Liquid
   tag below). The build puts `const precacheList = [...]` at the top
   (_scripts/precache_list.rb): every file of the app shell with a short fingerprint
   (revision) of its contents.

   The site's own service worker: no outside library. (Until November 2026 it used
   Google's Workbox, downloaded from storage.googleapis.com every time the worker started,
   which a browser cannot check; owner decision to replace it.) It does five jobs:
     1. keeps the app shell (pages, styles, scripts, small images) for offline use, and on
        an update downloads only the files whose fingerprint changed;
     2. keeps up to 100 other images for 30 days;
     3. live data (/api/state, /api/calendar): always fresh when online, last good copy offline;
     4. offline, a page that was never saved opens the Home page in the reader's language;
     5/6. the update toast, and the rescue for pages too old to show it (unchanged).
*/
// --- CACHE BUSTER ---
// This Liquid tag changes on every build, forcing the file bytes to change.
// This guarantees iOS detects the update and triggers your PWA Toast.
const SW_VERSION = '{{ site.time | date: "%s" }}';

const SHELL_CACHE = `asylum-shell-${SW_VERSION}`;
const IMAGE_CACHE = 'asylum-image-cache';
const LIVE_CACHE = 'asylum-live-data';
const IMAGE_MAX_ENTRIES = 100;
const IMAGE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const LANGS = /^\/(en|de|es|fr|it|ru|tr|uk)\//;

const shellList = typeof precacheList !== 'undefined' ? precacheList : [];
// Saved under its plain address (no ?__WB_REVISION__=… as Workbox did, which could end up in
// the address bar); the fingerprint rides along in a header.
const SHELL_URLS = new Set(shellList.map((e) => e.url));

// ---------- 1. The app shell ----------

/** A copy of `url` with this fingerprint, already on the device (this worker's earlier
 *  versions, or what Workbox saved before November 2026), or null. */
async function savedShellCopy(url, revision) {
  for (const name of await caches.keys()) {
    if (name === SHELL_CACHE) continue;
    const cache = await caches.open(name);
    if (name.startsWith('asylum-shell-')) {
      const hit = await cache.match(url);
      if (hit && hit.headers.get('X-Revision') === revision) return hit;
    } else if (name.startsWith('workbox-precache')) {
      const hit = await cache.match(`${url}?__WB_REVISION__=${revision}`);
      if (hit) return hit;
    }
  }
  return null;
}

/** Stores `response` under the plain address, with its fingerprint. */
async function putShell(cache, url, revision, response) {
  const headers = new Headers(response.headers);
  headers.set('X-Revision', revision);
  await cache.put(url, new Response(await response.blob(), { status: 200, headers }));
}

/** Fills the new shell copy: unchanged files are copied from the device, changed ones are
 *  downloaded (bypassing the browser's own cache). Six at a time. Any failure fails the
 *  install, so a half-saved version never takes over (the browser retries later). */
async function fillShell() {
  const cache = await caches.open(SHELL_CACHE);
  const queue = [...shellList];
  const worker = async () => {
    for (let entry = queue.shift(); entry; entry = queue.shift()) {
      const { url, revision } = entry;
      if (await cache.match(url)) continue; // already done (an install that was retried)
      const saved = await savedShellCopy(url, revision);
      if (saved) {
        await putShell(cache, url, revision, saved);
        continue;
      }
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      await putShell(cache, url, revision, response);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

self.addEventListener('install', (event) => {
  event.waitUntil(fillShell());
});

// Once this version is in charge: remove older shell copies and Workbox's old caches.
// (The image and live-data stores are kept: they don't depend on the version.)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        const old =
          (name.startsWith('asylum-shell-') && name !== SHELL_CACHE) || name.startsWith('workbox-');
        if (old) await caches.delete(name);
      }
    })(),
  );
});

/** The shell file a request asks for, or null: the exact address, or with index.html / .html
 *  added (as /en/ or /en/rules), ignoring utm_ tracking parameters. Other query strings are
 *  not in the shell (a page that reads them is fetched from the network). */
function shellUrlFor(url) {
  const params = [...url.searchParams.keys()].filter((k) => !k.startsWith('utm_'));
  if (params.length) return null;
  const path = url.pathname;
  for (const candidate of [path, path.endsWith('/') ? `${path}index.html` : `${path}.html`]) {
    if (SHELL_URLS.has(candidate)) return candidate;
  }
  return null;
}

// ---------- 2. Other images ----------

async function imageFromCacheOrNetwork(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const saved = await cache.match(request);
  const savedAt = Number(saved?.headers.get('X-Saved-At') || 0);
  if (saved && Date.now() - savedAt < IMAGE_MAX_AGE_MS) return saved;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const headers = new Headers(response.headers);
      headers.set('X-Saved-At', String(Date.now()));
      await cache.put(request, new Response(await response.clone().blob(), { status: 200, headers }));
      // Keep the newest IMAGE_MAX_ENTRIES (the store lists entries oldest first)
      const keys = await cache.keys();
      for (const key of keys.slice(0, Math.max(0, keys.length - IMAGE_MAX_ENTRIES))) await cache.delete(key);
    }
    return response;
  } catch (err) {
    if (saved) return saved; // offline: an expired copy beats none
    throw err;
  }
}

// ---------- 3. Live data ----------
// Always fetched fresh when online; the last good answer is kept, so offline the pages show
// the most recent live data seen (marked with an X-Offline-Copy header holding when it was
// saved). Requests add a changing ?t=... to avoid stale copies, so answers are stored
// without it.

async function liveData(request) {
  const key = new URL(request.url);
  key.searchParams.delete('t');
  const cache = await caches.open(LIVE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      const headers = new Headers(response.headers);
      headers.set('X-Offline-Copy', new Date().toISOString());
      const saved = new Response(await response.clone().blob(), { status: response.status, headers });
      await cache.put(key.href, saved);
    }
    return response;
  } catch (err) {
    const saved = await cache.match(key.href);
    if (saved) return saved;
    throw err;
  }
}

// ---------- 4. Pages that weren't saved ----------
// Straight from the network; offline, the Home page in the reader's language (always saved).

async function pageOrHomeFallback(request) {
  try {
    return await fetch(request);
  } catch (err) {
    const path = new URL(request.url).pathname;
    const lang = (path.match(LANGS) || [])[1] || 'en';
    const shell = await caches.open(SHELL_CACHE);
    for (const url of [`/${lang}/index.html`, '/en/index.html', '/index.html']) {
      const saved = await shell.match(url);
      if (saved) return saved;
    }
    throw err;
  }
}

// ---------- Routing ----------

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // other sites: the browser handles them

  if (url.pathname === '/api/state' || url.pathname === '/api/calendar') {
    event.respondWith(liveData(request));
    return;
  }

  const shellUrl = shellUrlFor(url);
  if (shellUrl) {
    event.respondWith(
      (async () => {
        const saved = await caches.match(shellUrl, { cacheName: SHELL_CACHE });
        return saved || fetch(request); // not saved yet (first visit, still installing)
      })(),
    );
    return;
  }

  if (/\.(?:png|gif|jpg|jpeg|svg|webp)$/i.test(url.pathname)) {
    event.respondWith(imageFromCacheOrNetwork(request));
    return;
  }

  const isPage =
    request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
  if (isPage) event.respondWith(pageOrHomeFallback(request));
  // Everything else: the browser fetches it as if there were no worker.
});

// 5. Listen for the update command from the UI
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 6. Rescue for pages too old to show the update toast (before November 2026): without it
//    nothing ever tells a new version to take over, so it would wait forever. A new version
//    asks the open pages first; current pages answer (js/main.js) and show the toast as
//    usual. If none answers within 2 s, the new version takes over by itself and reloads
//    those pages, so they get the new files. (The first install, with nothing to replace,
//    is untouched.)
let tookOverAlone = false;
self.addEventListener('install', (event) => {
  if (!self.registration.active) return;
  event.waitUntil(
    (async () => {
      const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (pages.length === 0) return; // nothing open: it takes over on the next visit anyway
      const answered = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 2000);
        self.addEventListener('message', function onAnswer(e) {
          if (e.data && e.data.type === 'SW_TOAST_SHOWN') {
            clearTimeout(timer);
            self.removeEventListener('message', onAnswer);
            resolve(true);
          }
        });
        pages.forEach((page) => page.postMessage({ type: 'SW_UPDATE_AVAILABLE' }));
      });
      if (!answered) {
        tookOverAlone = true;
        await self.skipWaiting();
      }
    })(),
  );
});
self.addEventListener('activate', (event) => {
  if (!tookOverAlone) return;
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const pages = await self.clients.matchAll({ type: 'window' });
      await Promise.all(pages.map((page) => page.navigate(page.url).catch(() => {})));
    })(),
  );
});