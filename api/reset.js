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
<title>Updating Last Asylum…</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0d110e; color: #e8e2d0; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .card { max-width: 340px; margin: 16px; padding: 28px 24px; text-align: center; border-radius: 12px;
    background: #161c17; border: 1px solid #3a4a3c; box-shadow: 0 8px 30px rgba(0,0,0,.5); }
  h1 { margin: 0 0 8px; font-size: 1.15rem; color: #d4b06a; letter-spacing: .03em; }
  p { margin: 0; color: #a9b3a5; font-size: .9rem; }
  a { color: #d4b06a; }
  .spin { width: 28px; height: 28px; margin: 0 auto 14px; border-radius: 50%;
    border: 3px solid #3a4a3c; border-top-color: #d4b06a; animation: s .9s linear infinite; }
  @keyframes s { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="card">
  <div class="spin" aria-hidden="true"></div>
  <h1>Updating Last Asylum…</h1>
  <p id="msg">Fetching the latest version. Your login is kept.</p>
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
  // Never stay here: carry on after 1.5 s whatever happens.
  setTimeout(go, 1500);
  setTimeout(function () {
    var m = document.getElementById('msg');
    if (m) m.innerHTML = 'Taking a while? <a href="/?updated=1">Open the site</a>.';
  }, 4000);
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
  Promise.all(jobs).then(go, go);
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
