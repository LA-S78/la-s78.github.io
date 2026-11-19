// The territory map's "My members" (owner request, 2026-11-19): for an alliance's R4/R5s and
// Stewards, a dot where each of their own alliance's members has their Sanctuary, a search
// box to find one, and a card with who it is. Positions come from the Last Asylum Tracker
// through /api/dashboard?positions=1, which checks the sign-in and sends the leader's own
// alliance only (the roster's lookup: no extra tracker requests).
//
// Game X/Y (0–1000; X left to right, Y bottom to top) become map units with a straight-line
// fit to five cities the owner read in the game (2026-11-19): Royal Castle 500/500, Old Oak
// 39/935, Stonebrook Town 955/919, Haystack 67/39, Howling Vale 954/64. Each lands within
// about 25 map units of its territory's middle (territories are about 200 units across).

import { getAllianceColor, getCityById, getSvgRoot } from './map.js';

const esc = (v) => window.escapeHtml(v);
const tm = (key, vars) => window.t(`map_planner.${key}`, vars);
const ic = (name, tone) => (window.uiIcon ? window.uiIcon(name, tone) : '');

const FIT = { sx: 2.0786, bx: 32.25, sy: -1.7475, by: 1720.5 };
export const toMap = (x, y) => ({ cx: FIT.sx * x + FIT.bx, cy: FIT.sy * y + FIT.by });

/** Signed in as an R4/R5 or a Steward (the server checks again). */
function isLeader() {
  try {
    if (!localStorage.getItem('auth-session')) return false;
    return (
      ['R4', 'R5'].includes(localStorage.getItem('auth-role')) ||
      localStorage.getItem('auth-steward') === 'true'
    );
  } catch {
    return false;
  }
}

function loginPass() {
  try {
    return localStorage.getItem('auth-session') || '';
  } catch {
    return '';
  }
}

/** 202888222 → "202.9M" */
function might(n) {
  if (!Number.isFinite(n)) return '—';
  return n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : `${(n / 1e6).toFixed(1)}M`;
}

const started = new WeakSet();

function start() {
  const container = document.getElementById('map-container');
  if (!container || started.has(container) || !isLeader()) return;
  started.add(container);

  const state = { on: false, members: [], tag: '', takenAt: null, selected: null };
  const bar = document.createElement('div');
  bar.className = 'map-members';
  bar.innerHTML = `
    <div class="map-members-bar">
      <button type="button" class="draft-btn" id="btn-map-members" aria-pressed="false">${ic('users')}<span>${esc(tm('members_toggle'))}</span></button>
      <input type="search" id="map-members-search" placeholder="${esc(tm('members_search'))}" aria-label="${esc(tm('members_search'))}" autocomplete="off" hidden>
      <span class="map-members-status" id="map-members-status"></span>
    </div>
    <div class="map-members-results" id="map-members-results" hidden></div>`;
  const anchor = container.querySelector('.map-controls');
  anchor.after(bar);
  // The chosen member's card goes under the map, so the map stays in view above it
  const cardBox = document.createElement('div');
  cardBox.className = 'map-member-card';
  cardBox.id = 'map-member-card';
  cardBox.hidden = true;
  (container.querySelector('.game-map') || bar).after(cardBox);

  const btn = bar.querySelector('#btn-map-members');
  const search = bar.querySelector('#map-members-search');
  const status = bar.querySelector('#map-members-status');
  const results = bar.querySelector('#map-members-results');
  const card = cardBox;

  // ---- The dots, in a group kept last in the map so they sit on top ----
  let layer = null;
  let observer = null;
  let resize = null;
  const root = () => getSvgRoot();

  function radius() {
    const svg = root();
    const vb = svg?.viewBox?.baseVal;
    const w = svg?.getBoundingClientRect().width || 0;
    const perPx = vb && w ? vb.width / w : 3;
    return { r: 5 * perPx, ring: 1.5 * perPx };
  }

  function draw() {
    const svg = root();
    if (!svg) return;
    if (!layer) {
      layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      layer.setAttribute('class', 'map-member-dots');
      layer.addEventListener('click', (e) => {
        const dot = e.target.closest('[data-uid]');
        if (!dot) return;
        e.stopPropagation();
        select(dot.dataset.uid);
      });
      // Clicks and hovers on a dot are the dot's, not the territory's under it
      ['pointerdown', 'mousemove', 'mouseover'].forEach((type) =>
        layer.addEventListener(type, (e) => e.stopPropagation()),
      );
    }
    if (layer.parentNode !== svg || svg.lastElementChild !== layer) svg.appendChild(layer);
    if (!observer) {
      // The map redraws its own layers (labels, highlights): the dots go back on top
      observer = new MutationObserver(() => {
        if (state.on && layer && svg.lastElementChild !== layer) svg.appendChild(layer);
      });
      observer.observe(svg, { childList: true });
    }
    if (!resize && 'ResizeObserver' in window) {
      resize = new ResizeObserver(() => state.on && sizeDots());
      resize.observe(svg);
    }
    const color = getAllianceColor(state.tag);
    layer.innerHTML = state.members
      .map((m) => {
        const { cx, cy } = toMap(m.x, m.y);
        return `<circle class="map-member-dot${state.selected === m.uid ? ' is-selected' : ''}" data-uid="${esc(m.uid)}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" fill="${esc(color)}"><title>${esc(m.name)}</title></circle>`;
      })
      .join('');
    sizeDots();
  }

  function sizeDots() {
    if (!layer) return;
    const { r, ring } = radius();
    layer.querySelectorAll('circle').forEach((c) => {
      const big = c.classList.contains('is-selected');
      c.setAttribute('r', (big ? r * 1.8 : r).toFixed(1));
      c.setAttribute('stroke-width', (big ? ring * 2 : ring).toFixed(1));
    });
  }

  function clear() {
    layer?.remove();
    observer?.disconnect();
    observer = null;
    resize?.disconnect();
    resize = null;
  }

  // ---- Which territory a member is in: the map's own shapes ----
  function territoryAt(m) {
    const svg = root();
    if (!svg || typeof DOMPoint === 'undefined') return null;
    const { cx, cy } = toMap(m.x, m.y);
    const point = new DOMPoint(cx, cy);
    for (const path of svg.querySelectorAll('path[id]')) {
      const city = getCityById(path.id);
      if (!city) continue;
      try {
        if (path.isPointInFill(point)) return city.name;
      } catch {
        return null;
      }
    }
    return null;
  }

  function select(uid) {
    state.selected = uid;
    const m = state.members.find((x) => x.uid === uid);
    draw();
    if (!m) {
      card.hidden = true;
      return;
    }
    const where = territoryAt(m);
    card.innerHTML = `
      ${m.avatar ? `<img class="map-member-pic" src="${esc(m.avatar)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : `<span class="map-member-pic map-member-initial">${esc((m.name || '?').charAt(0).toUpperCase())}</span>`}
      <span class="map-member-who">
        <strong>${esc(m.name)}</strong>
        <span>${m.rank ? `${esc(m.rank)} · ` : ''}${esc(might(m.power))}</span>
        <span>${esc(tm('member_coords', { x: m.x, y: m.y }))}${where ? ` · ${esc(tm('member_in', { place: where }))}` : ''}</span>
      </span>
      <button type="button" class="map-member-close" aria-label="${esc(tm('member_close'))}">${ic('cross', 'solo')}</button>`;
    card.hidden = false;
    card.querySelector('.map-member-close').addEventListener('click', () => {
      state.selected = null;
      card.hidden = true;
      draw();
    });
  }

  // ---- Search: names or player IDs ----
  function findMatches(text) {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    return state.members
      .filter((m) => m.name.toLowerCase().includes(q) || String(m.uid).includes(q))
      .slice(0, 6);
  }

  search.addEventListener('input', () => {
    const found = findMatches(search.value);
    results.hidden = !search.value.trim();
    results.innerHTML = found.length
      ? found
          .map(
            (m) =>
              `<button type="button" class="map-members-hit" data-uid="${esc(m.uid)}">${esc(m.name)} <small>${esc(might(m.power))}</small></button>`,
          )
          .join('')
      : `<span class="map-members-none">${esc(tm('members_none'))}</span>`;
  });
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const first = findMatches(search.value)[0];
    if (first) pick(first.uid);
  });
  results.addEventListener('click', (e) => {
    const hit = e.target.closest('[data-uid]');
    if (hit) pick(hit.dataset.uid);
  });
  function pick(uid) {
    results.hidden = true;
    search.value = state.members.find((m) => m.uid === uid)?.name || search.value;
    select(uid);
  }

  // ---- The switch ----
  async function turnOn() {
    btn.disabled = true;
    status.textContent = tm('members_loading');
    try {
      const res = await fetch('/api/dashboard?positions=1', {
        headers: { Authorization: `Bearer ${loginPass()}` },
        cache: 'no-store',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      state.members = body.members || [];
      state.tag = body.tag || '';
      state.takenAt = body.takenAt;
      state.on = true;
      btn.setAttribute('aria-pressed', 'true');
      search.hidden = false;
      const when = state.takenAt
        ? new Date(state.takenAt).toLocaleString(undefined, {
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';
      status.innerHTML = `${esc(tm('members_count', { n: state.members.length, tag: state.tag }))}${when ? ` · ${esc(tm('members_as_of', { time: when }))}` : ''} · <a href="https://lastasylumtracker.com/" target="_blank" rel="noopener">Last Asylum Tracker</a>`;
      draw();
    } catch (err) {
      status.textContent = tm('members_failed', { error: err.message });
    } finally {
      btn.disabled = false;
    }
  }

  function turnOff() {
    state.on = false;
    state.selected = null;
    btn.setAttribute('aria-pressed', 'false');
    search.hidden = true;
    search.value = '';
    results.hidden = true;
    card.hidden = true;
    status.textContent = '';
    clear();
  }

  btn.addEventListener('click', () => (state.on ? turnOff() : turnOn()));
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start);
  else start();
  document.addEventListener('turbo:load', start);
  document.addEventListener('turbo:frame-render', start);
}
