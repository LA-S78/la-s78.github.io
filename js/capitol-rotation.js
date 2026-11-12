/**
 * js/capitol-rotation.js
 * The Capitol Rotation chart on the Rules page: the four weeks of the current cycle, with
 * the alliance that captures the Capitol each Friday, from the live calendar (/api/calendar
 * status.rotation; api/_calendar_helper.js describeRotation). Text in the page's language
 * (capitol_rotation.* and common.* in _data/<lang>/tools.yml, js/i18n.js).
 * Without the calendar (offline, error) the page keeps the plain rank-by-week chart it
 * was built with, and a notice says the live data couldn't be loaded.
 */
import { offlineCopySavedAt, showLiveDataNotice } from './live-data-notice.js';

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
      <div class="rotation-seat">${esc(t('seat', { rank: w.seat }))}</div>
      ${tag}
      ${w.override ? `<div class="rotation-override">${esc(t('override', { rank: w.rank, seat: w.seat }))}</div>` : ''}
      <div class="rotation-date">${esc(t(w.captured ? 'captured' : 'captures', { date }))}</div>
    </div>`;
}

function render(board, rotation) {
  const current = rotation.find((w) => w.state === 'current');
  board.innerHTML = `
    <div class="rotation-grid">${rotation.map(renderWeek).join('')}</div>
    ${current ? `<p class="rotation-note">${esc(t(current.isKW ? 'kw_note' : 'off_week_note'))}</p>` : ''}
    <p class="rotation-source">${esc(t('schedule_note'))}</p>`;
}

// Boards already started (a WeakSet, not a data- attribute: Turbo's back-button copy of the
// page keeps attributes, and would then never load the live chart; see docs/DECISIONS.md).
const started = new WeakSet();

async function init() {
  const board = document.getElementById('rotation-board');
  if (!board || started.has(board)) return;
  started.add(board);
  try {
    const res = await fetch('/api/calendar');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rotation = data?.status?.rotation;
    if (!Array.isArray(rotation) || !rotation.length) throw new Error('no rotation');
    render(board, rotation);
    showLiveDataNotice(board, { savedAt: offlineCopySavedAt(res) });
  } catch (err) {
    console.warn('Capitol rotation: live calendar not loaded:', err.message);
    showLiveDataNotice(board, { failed: true });
  }
}

document.addEventListener('turbo:load', init);
if (document.readyState !== 'loading') init();
else document.addEventListener('DOMContentLoaded', init);
