/**
 * js/live-data-notice.js
 * A one-line notice above a live-data section (map, alliance standings, rewards card) when
 * it isn't showing fresh data:
 * - offline: the service worker (sw.js) answered with the last copy saved on this device,
 *   marked by its X-Offline-Copy header (when it was saved);
 * - failed: nothing could be loaded at all.
 * The pages have no built-in snapshot to fall back on, so this is how a reader knows.
 */

/** When an answer is an offline copy, the time it was saved (ISO text); otherwise null. */
export function offlineCopySavedAt(response) {
  return response?.headers?.get?.('X-Offline-Copy') || null;
}

/**
 * Shows (or clears) the notice just before `anchor`.
 * @param {Element|null} anchor the element the notice goes above
 * @param {{ savedAt?: string|null, failed?: boolean }} status nothing set = fresh: no notice
 */
export function showLiveDataNotice(anchor, { savedAt = null, failed = false } = {}) {
  if (!anchor?.parentNode) return;
  let el = anchor.previousElementSibling;
  if (!el?.classList?.contains('live-data-notice')) el = null;
  if (!savedAt && !failed) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.className = 'live-data-notice';
    el.setAttribute('role', 'status');
    anchor.parentNode.insertBefore(el, anchor);
  }
  if (failed) {
    el.textContent = window.t('live_data.failed');
  } else {
    const when = new Date(savedAt).toLocaleString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    el.textContent = window.t('live_data.offline', { when });
  }
}

// ---------- Last known data while loading (Look & Feel step 4, owner idea) ----------
// While the fresh answer loads, a tool shows this device's last copy straight away, dimmed
// with "⏳ Updating…" in its corner, instead of a blank or "Loading…" that jumps when the
// data arrives. The label floats over the tool, so nothing moves when it goes.
// Each tool keeps its own copy in localStorage (rememberLiveData, after every fresh answer):
// that works the same on every device. The copy sw.js keeps for offline use is the fallback
// (on a phone it wasn't always found: owner report, 2026-11-13).

const STORE_PREFIX = 'la_live_';

/** The address without the changing ?t=… the tools add to dodge stale copies. */
function liveKey(url) {
  const key = new URL(url, location.origin);
  key.searchParams.delete('t');
  return key.pathname + key.search;
}

/** Keeps a fresh answer on this device, to show next time while the page loads. */
export function rememberLiveData(url, data) {
  try {
    localStorage.setItem(
      STORE_PREFIX + liveKey(url),
      JSON.stringify({ at: new Date().toISOString(), data }),
    );
  } catch {
    // Storage full or blocked (private browsing): the next visit just shows "Loading…"
  }
}

/** This device's last copy of a live-data answer (as a Response), or null. */
export async function savedLiveCopy(url) {
  try {
    const kept = JSON.parse(localStorage.getItem(STORE_PREFIX + liveKey(url)) || 'null');
    if (kept && kept.data) {
      return new Response(JSON.stringify(kept.data), {
        headers: { 'content-type': 'application/json', 'X-Offline-Copy': kept.at },
      });
    }
  } catch {
    // Unreadable: try the service worker's copy
  }
  try {
    if (typeof caches === 'undefined') return null;
    const cache = await caches.open('asylum-live-data');
    return (await cache.match(new URL(liveKey(url), location.origin).href)) || null;
  } catch {
    return null;
  }
}

/** Dims `el` with "⏳ Updating…" in its corner (on), or takes that away (off). */
export function markUpdating(el, on) {
  if (!el) return;
  el.classList.toggle('is-updating', on);
  if (on) {
    el.dataset.updating = window.t ? window.t('live_data.updating') : 'Updating…';
    el.setAttribute('aria-busy', 'true');
  } else {
    el.removeAttribute('aria-busy');
  }
}

/**
 * Shows the saved copy of `url` while `fresh` (the request already under way) loads: if the
 * saved copy is found before the fresh answer, `show(savedResponse)` draws it and `el` is
 * marked as updating. Returns when the saved copy was saved (ISO text), or null if it wasn't
 * shown; call markUpdating(el, false) once the fresh answer is drawn.
 */
export async function showSavedWhileLoading(url, fresh, el, show) {
  let answered = false;
  fresh.then(
    () => (answered = true),
    () => (answered = true),
  );
  const saved = await savedLiveCopy(url);
  if (!saved || answered) return null;
  try {
    await show(saved);
  } catch (err) {
    console.warn('Saved copy not shown:', err);
    return null;
  }
  markUpdating(el, true);
  return offlineCopySavedAt(saved) || new Date(0).toISOString();
}
