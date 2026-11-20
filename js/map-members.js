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

  /** Map units per screen pixel at the map's current size. */
  function unitsPerPx() {
    const svg = root();
    const vb = svg?.viewBox?.baseVal;
    const w = svg?.getBoundingClientRect().width || 0;
    return vb && w ? vb.width / w : 3;
  }

  // Marker sizes on screen, in pixels (owner, 2026-11-19: small squares; members whose
  // markers would overlap share one square with their number)
  const SIZE = { one: 6, group: 14, picked: 11, ring: 1 };

  /**
   * Members grouped by where they fall on screen, so no two markers overlap: a member joins
   * the nearest group within a group marker's size, then groups that still touch merge. The
   * chosen member always has a marker of their own, on top.
   */
  function groupsOnScreen(perPx) {
    const reach = SIZE.group * perPx;
    let list = [];
    for (const m of state.members) {
      if (m.uid === state.selected) continue;
      const { cx, cy } = toMap(m.x, m.y);
      const near = list.find((g) => Math.hypot(g.cx - cx, g.cy - cy) < reach);
      if (near) {
        near.members.push(m);
        near.sx += cx;
        near.sy += cy;
        near.cx = near.sx / near.members.length;
        near.cy = near.sy / near.members.length;
      } else list.push({ members: [m], sx: cx, sy: cy, cx, cy });
    }
    // Groups that moved into each other while growing are merged
    for (let merged = true; merged; ) {
      merged = false;
      outer: for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          if (Math.hypot(a.cx - b.cx, a.cy - b.cy) >= reach) continue;
          a.members.push(...b.members);
          a.sx += b.sx;
          a.sy += b.sy;
          a.cx = a.sx / a.members.length;
          a.cy = a.sy / a.members.length;
          list.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
    return list;
  }

  let groups = [];

  function square(cx, cy, px, perPx, cls, attrs, fill) {
    const h = (px / 2) * perPx;
    return `<rect class="${cls}" ${attrs} x="${(cx - h).toFixed(1)}" y="${(cy - h).toFixed(1)}" width="${(2 * h).toFixed(1)}" height="${(2 * h).toFixed(1)}" rx="${(perPx * 1.5).toFixed(1)}" fill="${esc(fill)}" stroke-width="${(SIZE.ring * perPx).toFixed(2)}"`;
  }

  function draw() {
    const svg = root();
    if (!svg) return;
    if (!layer) {
      layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      layer.setAttribute('class', 'map-member-dots');
      layer.addEventListener('click', (e) => {
        const one = e.target.closest('[data-uid]');
        const many = e.target.closest('[data-group]');
        if (!one && !many) return;
        e.stopPropagation();
        if (one) select(one.dataset.uid);
        else showGroup(groups[Number(many.dataset.group)]);
      });
      // Clicks and hovers on a marker are the marker's, not the territory's under it
      ['pointerdown', 'mousemove', 'mouseover'].forEach((type) =>
        layer.addEventListener(type, (e) => e.stopPropagation()),
      );
    }
    if (layer.parentNode !== svg || svg.lastElementChild !== layer) svg.appendChild(layer);
    if (!observer) {
      // The map redraws its own layers (labels, highlights): the markers go back on top
      observer = new MutationObserver(() => {
        if (state.on && layer && svg.lastElementChild !== layer) svg.appendChild(layer);
      });
      observer.observe(svg, { childList: true });
    }
    if (!resize && 'ResizeObserver' in window) {
      // A bigger map (fullscreen, a wider window) splits groups apart
      resize = new ResizeObserver(() => state.on && draw());
      resize.observe(svg);
      // Zooming in (js/map-zoom.js) splits groups apart: redrawn once per frame
      let queued = false;
      if (!svg.dataset.membersZoom) svg.dataset.membersZoom = '1';
      else queued = true; // already listening (turned off and on again): no second listener
      if (!queued)
        svg.addEventListener('mapzoom', () => {
          if (!state.on || queued) return;
          queued = true;
          requestAnimationFrame(() => {
            queued = false;
            if (state.on) draw();
          });
        });
    }
    const color = getAllianceColor(state.tag);
    const perPx = unitsPerPx();
    groups = groupsOnScreen(perPx);
    let html = groups
      .map((g, i) => {
        if (g.members.length === 1) {
          const m = g.members[0];
          return `${square(g.cx, g.cy, SIZE.one, perPx, 'map-member-dot', `data-uid="${esc(m.uid)}"`, color)}><title>${esc(m.name)}</title></rect>`;
        }
        const names = g.members.map((m) => m.name).join(', ');
        return `<g class="map-member-group" data-group="${i}">${square(g.cx, g.cy, SIZE.group, perPx, 'map-member-dot', '', color)}><title>${esc(names)}</title></rect><text x="${g.cx.toFixed(1)}" y="${g.cy.toFixed(1)}" font-size="${(8 * perPx).toFixed(1)}" dy="0.35em">${g.members.length}</text></g>`;
      })
      .join('');
    const picked = state.members.find((m) => m.uid === state.selected);
    if (picked) {
      const { cx, cy } = toMap(picked.x, picked.y);
      // A pulsing halo, a dark outline and a thick white edge: it stands out on any colour
      const halo = (SIZE.picked / 2 + 5) * perPx;
      html += `<rect class="map-member-halo" x="${(cx - halo).toFixed(1)}" y="${(cy - halo).toFixed(1)}" width="${(2 * halo).toFixed(1)}" height="${(2 * halo).toFixed(1)}" rx="${(3 * perPx).toFixed(1)}" stroke-width="${(2 * perPx).toFixed(1)}"></rect>`;
      const edge = (SIZE.picked / 2 + 1.5) * perPx;
      html += `<rect class="map-member-outline" x="${(cx - edge).toFixed(1)}" y="${(cy - edge).toFixed(1)}" width="${(2 * edge).toFixed(1)}" height="${(2 * edge).toFixed(1)}" rx="${(2 * perPx).toFixed(1)}"></rect>`;
      html += `${square(cx, cy, SIZE.picked, perPx, 'map-member-dot is-selected', `data-uid="${esc(picked.uid)}"`, color).replace(/stroke-width="[^"]*"/, `stroke-width="${(2 * perPx).toFixed(2)}"`)}><title>${esc(picked.name)}</title></rect>`;
    }
    layer.innerHTML = html;
  }

  /** A shared marker tapped: its members as buttons to pick from. */
  function showGroup(group) {
    if (!group) return;
    // Zoom into a group until it splits apart; once fully zoomed in, list its members
    const zoom = window.MapZoom;
    if (zoom && zoom.zoom() < zoom.maxZoom - 0.01) {
      zoom.focus(group.cx, group.cy, Math.min(zoom.maxZoom, zoom.zoom() * 2.5));
      return;
    }
    results.hidden = false;
    results.innerHTML =
      `<span class="map-members-none">${esc(tm('members_here', { n: group.members.length }))}</span>` +
      group.members
        .slice()
        .sort((a, b) => b.power - a.power)
        .map(
          (m) =>
            `<button type="button" class="map-members-hit" data-uid="${esc(m.uid)}">${esc(m.name)} <small>${esc(might(m.power))}</small></button>`,
        )
        .join('');
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
    const m = state.members.find((x) => x.uid === uid);
    search.value = m?.name || search.value;
    select(uid);
    // Found by search: the map zooms to them (js/map-zoom.js)
    if (m && window.MapZoom) {
      const { cx, cy } = toMap(m.x, m.y);
      window.MapZoom.focus(cx, cy, Math.max(window.MapZoom.zoom(), 4));
    }
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
