// api/reset.js — served at /reset (vercel.json). A link Stewards can post in Discord for a
// player stuck on an old version of the site or installed app: it drops this site's
// service worker and saved files, then opens the home page fresh. /reset was never in any
// service worker's saved list, so even a stuck app fetches it from the network.
// The login pass, theme and planner drafts (localStorage) are kept.

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Updating the Survival Compendium…</title>
<script>
  // The reader's theme (saved by the site), so the art and colours match their header lantern.
  try {
    var theme = localStorage.getItem('site-theme');
    if (theme === 'sanctuary' || theme === 'miasma') document.documentElement.className = theme;
  } catch (e) {}
</script>
<style>
  :root { color-scheme: dark; --f: contrast(1.15) saturate(1.2) hue-rotate(90deg);
    --accent: #4cb85a; --bg: #141a15; --line: #2f4a33; --page: #0b0f0c; }
  .sanctuary { --f: contrast(1.1) saturate(1.15); --accent: #e0a54a; --bg: #17140f; --line: #4a3b28; --page: #0b0a09; }
  .miasma { --f: contrast(1.15) brightness(1.05) saturate(1.2) hue-rotate(245deg);
    --accent: #b26ee0; --bg: #17121b; --line: #43304f; --page: #0c0a0e; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: var(--page); color: #e8e2d0; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .card { width: 100%; max-width: 360px; margin: 16px; padding: 0 0 24px; overflow: hidden; text-align: center;
    border-radius: 12px; background: var(--bg); border: 1px solid var(--line); box-shadow: 0 8px 30px rgba(0,0,0,.6); }
  .art { height: 150px; margin-bottom: 18px; background: url(/images/compendium-desk.webp) center 45% / cover;
    filter: var(--f); }
  h1 { margin: 0; font: bold 1.05rem Georgia, serif; letter-spacing: .14em; text-transform: uppercase; }
  .sub { margin: 2px 0 14px; font: 1rem Georgia, serif; letter-spacing: .08em; color: var(--accent); }
  p { margin: 0; padding: 0 20px; color: #b3aa98; font-size: .9rem; }
  a { color: var(--accent); }
</style>
</head>
<body>
<div class="card">
  <div class="art" role="img" aria-label="The Survival Compendium on a survivor's desk"></div>
  <h1>Last Asylum</h1>
  <div class="sub">Survival Compendium</div>
  <p id="msg">Updating the website to the latest version…<br>Your login is kept.</p>
</div>
<script>
(function () {
  var done = false;
  function go() {
    if (done) return;
    done = true;
    try { sessionStorage.setItem('app-updated', '1'); } catch (e) {}
    window.location.replace('/?updated=1');
  }
  // Shown for at least 1.5 s, so it reads as a step rather than a flicker; never more than
  // 4 s, even if clearing the saved copy hangs.
  var started = Date.now();
  var MIN_MS = 1500;
  setTimeout(go, 4000);
  setTimeout(function () {
    var m = document.getElementById('msg');
    if (m && !done) m.innerHTML = 'Taking a while? <a href="/?updated=1">Open the website</a>.';
  }, 2500);
  function finished() {
    setTimeout(go, Math.max(0, MIN_MS - (Date.now() - started)));
  }
  var jobs = [];
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
        return Promise.all(rs.map(function (r) { return r.unregister(); }));
      }));
    }
    if (window.caches) {
      jobs.push(caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }));
    }
  } catch (e) {}
  Promise.all(jobs).then(finished, finished);
})();
</script>
</body>
</html>`;

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  // Chromium and Firefox also empty the browser's own cache for this site (not localStorage).
  res.setHeader('Clear-Site-Data', '"cache"');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex');
  return res.status(200).send(PAGE);
}
