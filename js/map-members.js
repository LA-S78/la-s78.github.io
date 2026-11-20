// The territory map's "My members" (owner request, 2026-11-19): for an alliance's R4/R5s and
// Stewards, a dot where each of their own alliance's members has their Sanctuary, a search
// box to find one, and a card with who it is. Positions come from the Last Asylum Tracker
// through /api/dashboard?positions=1, which checks the sign-in and sends the leader's own
// alliance only (the roster's lookup: no extra tracker requests).
//
// Stewards also get "All NAP players" (owner request, 2026-11-20): every NAP alliance's
// members at once, coloured by alliance, from /api/dashboard?steward=positions. Those
// positions come from the daily Stats snapshot (free); the Refresh button asks the game again
// (one tracker request per NAP alliance, a few times a day between all Stewards).
//
// Game X/Y become map positions through js/map-coords.js: a smooth warp through reference
// points read in the game (five cities, 2026-11-19, and the Capitol area's corners,
// 2026-11-20), so members near the Capitol land on the right side of its edge.

import { getAllianceColor, getCityById, getSvgRoot } from './map.js';
import { toMap } from './map-coords.js';

const esc = (v) => window.escapeHtml(v);
const tm = (key, vars) => window.t(`map_planner.${key}`, vars);
const ic = (name, tone) => (window.uiIcon ? window.uiIcon(name, tone) : '');

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

function isSteward() {
  try {
    return (
      Boolean(localStorage.getItem('auth-session')) &&
      localStorage.getItem('auth-steward') === 'true'
    );
  } catch {
    return false;
  }
}

/** A shared marker with members of several alliances: a neutral colour. */
const MIXED = '#d8d2c4';

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

  // mode: 'mine' (My members) or 'nap' (All NAP players, Stewards)
  const state = { on: false, mode: 'mine', members: [], tag: '', takenAt: null, selected: null };
  const steward = isSteward();
  const bar = document.createElement('div');
  bar.className = 'map-members';
  bar.innerHTML = `
    <div class="map-members-bar">
      <button type="button" class="draft-btn" id="btn-map-members" aria-pressed="false">${ic('users')}<span>${esc(tm('members_toggle'))}</span></button>
      ${steward ? `<button type="button" class="draft-btn" id="btn-map-nap" aria-pressed="false">${ic('map')}<span>${esc(tm('nap_toggle'))}</span></button>` : ''}
      <input type="search" id="map-members-search" placeholder="${esc(tm('members_search'))}" aria-label="${esc(tm('members_search'))}" autocomplete="off" hidden>
      <span class="map-members-status" id="map-members-status"></span>
    </div>
`;
  const anchor = container.querySelector('.map-controls');
  anchor.after(bar);
  // The chosen member's card goes under the map, so the map stays in view above it
  const cardBox = document.createElement('div');
  cardBox.className = 'map-member-card';
  cardBox.id = 'map-member-card';
  cardBox.hidden = true;
  // Search results and a group's members go under the map too: the map doesn't move when
  // they appear (owner, 2026-11-20)
  const resultsBox = document.createElement('div');
  resultsBox.className = 'map-members-results';
  resultsBox.id = 'map-members-results';
  resultsBox.hidden = true;
  (container.querySelector('.game-map') || bar).after(resultsBox, cardBox);

  const btn = bar.querySelector('#btn-map-members');
  const btnNap = bar.querySelector('#btn-map-nap');
  const search = bar.querySelector('#map-members-search');
  const status = bar.querySelector('#map-members-status');
  const results = resultsBox;
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
  /** "Name" (My members) or "[TAG] Name" (All NAP players). */
  const label = (m) => (state.mode === 'nap' && m.tag ? `[${m.tag}] ${m.name}` : m.name);
  const hit = (m) =>
    `<button type="button" class="map-members-hit" data-uid="${esc(m.uid)}">${esc(label(m))} <small>${esc(might(m.power))}</small></button>`;

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
    const colorOf = (m) => getAllianceColor(m.tag || state.tag);
    const perPx = unitsPerPx();
    groups = groupsOnScreen(perPx);
    let html = groups
      .map((g, i) => {
        if (g.members.length === 1) {
          const m = g.members[0];
          return `${square(g.cx, g.cy, SIZE.one, perPx, 'map-member-dot', `data-uid="${esc(m.uid)}"`, colorOf(m))}><title>${esc(label(m))}</title></rect>`;
        }
        const names = g.members.map(label).join(', ');
        const tags = new Set(g.members.map((m) => m.tag || state.tag));
        const fill = tags.size === 1 ? colorOf(g.members[0]) : MIXED;
        return `<g class="map-member-group" data-group="${i}">${square(g.cx, g.cy, SIZE.group, perPx, 'map-member-dot', '', fill)}><title>${esc(names)}</title></rect><text x="${g.cx.toFixed(1)}" y="${g.cy.toFixed(1)}" font-size="${(8 * perPx).toFixed(1)}" dy="0.35em">${g.members.length}</text></g>`;
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
      html += `${square(cx, cy, SIZE.picked, perPx, 'map-member-dot is-selected', `data-uid="${esc(picked.uid)}"`, colorOf(picked)).replace(/stroke-width="[^"]*"/, `stroke-width="${(2 * perPx).toFixed(2)}"`)}><title>${esc(picked.name)}</title></rect>`;
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
    // …and a group's list replaces the member's card
    if (state.selected || !card.hidden) {
      state.selected = null;
      card.hidden = true;
      draw();
    }
    results.hidden = false;
    results.innerHTML =
      `<span class="map-members-none">${esc(tm(state.mode === 'nap' ? 'nap_here' : 'members_here', { n: group.members.length }))}</span>` +
      group.members
        .slice()
        .sort((a, b) => b.power - a.power)
        .map(hit)
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
    // One thing under the map at a time: a member's card replaces a group's list (owner,
    // 2026-11-20: they overlapped)
    results.hidden = true;
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
        <span>${state.mode === 'nap' && m.tag ? `[${esc(m.tag)}] · ` : ''}${m.rank ? `${esc(m.rank)} · ` : ''}${esc(might(m.power))}</span>
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
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          String(m.uid).includes(q) ||
          (state.mode === 'nap' && m.tag && `[${m.tag}]`.toLowerCase().includes(q)),
      )
      .slice(0, state.mode === 'nap' ? 10 : 6);
  }

  search.addEventListener('input', () => {
    const found = findMatches(search.value);
    results.hidden = !search.value.trim();
    results.innerHTML = found.length
      ? found.map(hit).join('')
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

  // ---- The switches ----
  const when = (iso) =>
    iso
      ? new Date(iso).toLocaleString(undefined, {
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
  const tracker =
    '<a href="https://lastasylumtracker.com/" target="_blank" rel="noopener">Last Asylum Tracker</a>';

  /** The line under the buttons for All NAP players, with its Refresh button. */
  function napStatus(body) {
    const r = body.refresh || {};
    const oldest = (body.alliances || []).map((a) => a.at).sort()[0];
    const parts = [];
    parts.push(
      body.alliances?.length
        ? esc(tm('nap_count', { n: state.members.length, a: body.alliances.length }))
        : esc(tm('nap_empty')),
    );
    if (oldest) parts.push(esc(tm('members_as_of', { time: when(oldest) })));
    if (body.missing?.length)
      parts.push(esc(tm('nap_missing', { tags: body.missing.map((t) => `[${t}]`).join(', ') })));
    const wait = r.waitMinutes ? tm('nap_refresh_wait', { minutes: r.waitMinutes }) : '';
    const left = tm('nap_refresh_left', { left: r.left ?? 0, max: r.max ?? 0 });
    status.innerHTML = `${parts.join(' · ')} · ${tracker}
      <span class="map-nap-refresh"><button type="button" class="draft-btn" id="btn-map-nap-refresh" ${!r.left || r.waitMinutes ? 'disabled' : ''}>${ic('refresh')}<span>${esc(tm('nap_refresh'))}</span></button><small>${esc(wait || left)}</small></span>`;
    status
      .querySelector('#btn-map-nap-refresh')
      ?.addEventListener('click', () => turnOn('nap', true));
  }

  async function turnOn(mode, refresh = false) {
    if (state.on && state.mode !== mode) turnOff();
    const button = mode === 'nap' ? btnNap : btn;
    button.disabled = true;
    status.textContent = tm(
      refresh ? 'nap_refreshing' : mode === 'nap' ? 'nap_loading' : 'members_loading',
    );
    try {
      const url =
        mode === 'nap'
          ? `/api/dashboard?steward=positions${refresh ? '&refresh=1' : ''}`
          : '/api/dashboard?positions=1';
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${loginPass()}` },
        cache: 'no-store',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A refresh that wasn't allowed keeps the positions already shown
        if (refresh && state.on) {
          napStatus({ ...lastNap, refresh: body.refresh || lastNap.refresh });
          status.insertAdjacentHTML(
            'afterbegin',
            `<span class="map-members-none">${esc(body.error || `HTTP ${res.status}`)}</span> `,
          );
          return;
        }
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      state.mode = mode;
      state.members = body.members || [];
      state.tag = body.tag || '';
      state.takenAt = body.takenAt || null;
      state.on = true;
      if (state.selected && !state.members.some((m) => m.uid === state.selected)) {
        state.selected = null;
        card.hidden = true;
      }
      // Territories don't respond while the markers are shown (owner: fewer stray taps)
      root()?.classList.add('members-on');
      button.setAttribute('aria-pressed', 'true');
      search.placeholder = tm(mode === 'nap' ? 'nap_search' : 'members_search');
      search.setAttribute('aria-label', search.placeholder);
      search.hidden = false;
      if (mode === 'nap') {
        lastNap = body;
        napStatus(body);
      } else {
        const t = when(state.takenAt);
        status.innerHTML = `${esc(tm('members_count', { n: state.members.length, tag: state.tag }))}${t ? ` · ${esc(tm('members_as_of', { time: t }))}` : ''} · ${tracker}`;
      }
      draw();
      if (state.selected) select(state.selected);
    } catch (err) {
      status.textContent = tm('members_failed', { error: err.message });
    } finally {
      button.disabled = false;
    }
  }
  let lastNap = {};

  function turnOff() {
    state.on = false;
    root()?.classList.remove('members-on');
    state.selected = null;
    btn.setAttribute('aria-pressed', 'false');
    btnNap?.setAttribute('aria-pressed', 'false');
    search.hidden = true;
    search.value = '';
    results.hidden = true;
    card.hidden = true;
    status.textContent = '';
    clear();
  }

  btn.addEventListener('click', () =>
    state.on && state.mode === 'mine' ? turnOff() : turnOn('mine'),
  );
  btnNap?.addEventListener('click', () =>
    state.on && state.mode === 'nap' ? turnOff() : turnOn('nap'),
  );
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start);
  else start();
  document.addEventListener('turbo:load', start);
  document.addEventListener('turbo:frame-render', start);
}
