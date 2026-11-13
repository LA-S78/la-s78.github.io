/**
 * js/capitol-rotation.js
 * The Capitol Rotation chart on the Rules page: the four weeks of the current cycle, with
 * the alliance that captures the Capitol each Friday, from the live calendar (/api/calendar
 * status.rotation; api/_calendar_helper.js describeRotation). Text in the page's language
 * (capitol_rotation.* and common.* in _data/<lang>/tools.yml, js/i18n.js).
 * The page is built with four blank cards: the week order is in the calendar's settings
 * (the Gist), which the build can't see. They're filled at once with the order remembered
 * from the last visit (week names and crowns only), then with the live chart, so the cards
 * don't jump around. Without the calendar (offline, error) the plain chart stays in that
 * order (or the default one) and a notice says the live data couldn't be loaded.
 */
import {
  markUpdating,
  offlineCopySavedAt,
  rememberLiveData,
  showLiveDataNotice,
  showSavedWhileLoading,
} from './live-data-notice.js';

const esc = (value) => window.escapeHtml(value);
const t = (key, vars) => window.t(`capitol_rotation.${key}`, vars);

// The crown for each seat, as in the original chart: gold, silver, bronze, and a shield for
// the off-week holder.
const CROWNS = { 1: '👑', 2: '🥈', 3: '🥉' };

/** "Fri 20 Nov" in the page's language, for a capture (Game Time = UTC-2). */
function captureDate(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleDateString(window.i18nLang?.() || undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Etc/GMT+2', // Game Time (UTC-2)
  });
}

function weekName(w) {
  return w.isKW ? window.t('common.kw_week', { n: w.clockWeek }) : window.t('common.off_week');
}

// The order of the weeks last seen (this browser only): { isKW, clockWeek, seat } per card.
const ORDER_KEY = 'la_rotation_order';
const DEFAULT_ORDER = [
  { isKW: true, clockWeek: 1, seat: 3 },
  { isKW: true, clockWeek: 2, seat: 2 },
  { isKW: true, clockWeek: 3, seat: 1 },
  { isKW: false, clockWeek: 0, seat: 4 },
];
function rememberedOrder() {
  try {
    const order = JSON.parse(localStorage.getItem(ORDER_KEY) || 'null');
    return Array.isArray(order) && order.length === 4 ? order : null;
  } catch (e) {
    return null;
  }
}
function rememberOrder(rotation) {
  try {
    const order = rotation.map(({ isKW, clockWeek, seat }) => ({ isKW, clockWeek, seat }));
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  } catch (e) {
    // private window or storage off: the next visit starts with blank cards again
  }
}

/** A card with only the week's name and crown (before the live data, or without it). */
function renderPlainWeek(w) {
  return `
    <div class="rotation-week is-plain${w.isKW ? '' : ' is-off-week'}">
      <div class="rotation-week-head"><span>${esc(weekName(w))}</span></div>
      <div class="rotation-crown rank-${esc(w.seat)}" aria-hidden="true">${CROWNS[w.seat] || '🛡️'}</div>
    </div>`;
}
// Only the cards and the one-line note change; the note under them is part of the page, so
// the board keeps its size as it fills in.
function renderPlain(board, order) {
  board.querySelector('.rotation-grid').innerHTML = order.map(renderPlainWeek).join('');
}

function renderWeek(w) {
  const current = w.state === 'current';
  const date = captureDate(w.captureAt);
  const tag = w.tag
    ? `<span class="rotation-tag"${w.color ? ` style="color: ${esc(w.color)}"` : ''}>[${esc(w.tag)}]</span>`
    : `<span class="rotation-tag is-empty">${esc(t('no_alliance'))}</span>`;
  return `
    <div class="rotation-week${current ? ' is-current' : ''}${w.state === 'done' ? ' is-done' : ''}${w.isKW ? '' : ' is-off-week'}">
      <div class="rotation-week-head">
        <span>${esc(weekName(w))}</span>
        ${current ? `<span class="badge">${esc(t('this_week'))}</span>` : ''}
      </div>
      <div class="rotation-crown rank-${esc(w.seat)}" aria-hidden="true">${CROWNS[w.seat] || '🛡️'}</div>
      ${w.rank ? `<div class="rotation-seat">${esc(t('rank', { rank: w.rank }))}</div>` : ''}
      ${tag}
      ${w.override ? `<div class="rotation-override">${esc(t('override', { replaced: w.replaced }))}</div>` : ''}
      <div class="rotation-date">${esc(t(w.captured ? 'captured' : 'captures', { date }))}</div>
    </div>`;
}

function render(board, rotation) {
  const current = rotation.find((w) => w.state === 'current');
  board.querySelector('.rotation-grid').innerHTML = rotation.map(renderWeek).join('');
  board.querySelector('.rotation-note').textContent = current
    ? t(current.isKW ? 'kw_note' : 'off_week_note', { tag: current.tag || '?' })
    : '\u00a0'; // keeps the line's height
}

// Boards already started (a WeakSet, not a data- attribute: Turbo's back-button copy of the
// page keeps attributes, and would then never load the live chart; see docs/DECISIONS.md).
const started = new WeakSet();

async function init() {
  const board = document.getElementById('rotation-board');
  if (!board || started.has(board)) return;
  started.add(board);
  const remembered = rememberedOrder();
  if (remembered) renderPlain(board, remembered);
  let savedAt = null;
  try {
    const fresh = fetch('/api/calendar');
    // Meanwhile, this device's last copy of the full board, dimmed with "Updating…"
    savedAt = await showSavedWhileLoading('/api/calendar', fresh, board, async (r) => {
      const rotation = (await r.json())?.status?.rotation;
      if (!Array.isArray(rotation) || !rotation.length) throw new Error('no rotation');
      render(board, rotation);
    });
    const res = await fresh;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Kept for next time (shown while the page loads), unless this is already an offline copy
    if (!offlineCopySavedAt(res)) rememberLiveData('/api/calendar', data);
    const rotation = data?.status?.rotation;
    if (!Array.isArray(rotation) || !rotation.length) throw new Error('no rotation');
    render(board, rotation);
    rememberOrder(rotation);
    markUpdating(board, false);
    board.removeAttribute('aria-busy');
    showLiveDataNotice(board, { savedAt: offlineCopySavedAt(res) });
  } catch (err) {
    console.warn('Capitol rotation: live calendar not loaded:', err.message);
    markUpdating(board, false);
    board.removeAttribute('aria-busy');
    if (savedAt) {
      // The saved board stays: say how old it is instead of "failed"
      showLiveDataNotice(board, { savedAt });
      return;
    }
    renderPlain(board, remembered || DEFAULT_ORDER);
    showLiveDataNotice(board, { failed: true });
  }
}

// A footer link swaps only the page's main frame: Turbo then fires turbo:frame-render, and
// on some routes not turbo:load (the tool stayed blank). Start on both, as js/main.js does;
// the once-per-page guard makes the second call a no-op.
document.addEventListener('turbo:load', init);
document.addEventListener('turbo:frame-render', init);
if (document.readyState !== 'loading') init();
else document.addEventListener('DOMContentLoaded', init);
