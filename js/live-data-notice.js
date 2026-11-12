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
