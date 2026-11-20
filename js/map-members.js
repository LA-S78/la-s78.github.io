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
// Tapping a shared marker zooms in on it until its members split apart (owner, 2026-11-20:
// no list of names). While markers are shown the map can zoom much further than usual
// (js/map-zoom.js setMaxZoom), until a Sanctuary is about as big on screen as in the game.
// Zoomed in, markers cover their Sanctuary's 3×3 tiles and names show under them.
//
// Game X/Y become map positions through js/map-coords.js: a smooth warp through reference
// points read in the game (five cities, 2026-11-19, and the Capitol area's corners,
// 2026-11-20), so members near the Capitol land on the right side of its edge.

import { getAllianceColor, getCityById, getSvgRoot } from './map.js';
import { toMap } from './map-coords.js';
import { building, ground, popupHtml } from './map-game.js';

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
  // Search results and a group's members go under the map too: the map doesn't move when
  // they appear (owner, 2026-11-20)
  const resultsBox = document.createElement('div');
  resultsBox.className = 'map-members-results';
  resultsBox.id = 'map-members-results';
  resultsBox.hidden = true;
  (container.querySelector('.game-map') || bar).after(resultsBox);

  const btn = bar.querySelector('#btn-map-members');
  const btnNap = bar.querySelector('#btn-map-nap');
  const search = bar.querySelector('#map-members-search');
  const status = bar.querySelector('#map-members-status');
  const results = resultsBox;
  // The chosen member's card sits over the map, by their marker (placePopup); the card that
  // was under the map is gone (owner, 2026-11-20). `card` stays as a stand-in for it.
  const card = {
    set hidden(v) {
      if (v && pop) pop.hidden = true;
    },
    get hidden() {
      return !pop || pop.hidden;
    },
  };

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

  // ---- Sanctuaries drawn as in the game (owner, 2026-11-20) ----
  // A Sanctuary covers 3×3 tiles (its X/Y is the middle one), so neighbours are 3 tiles
  // apart. Zoomed in, each marker grows to cover most of its 3×3, like the buildings in the
  // game, and once they're big enough every one gets its name centred underneath, all at the
  // same zoom (long names shortened with "…"; the chosen member's in full).
  const BUILDING = 0.6; // share of its 3×3 tiles a marker covers (room for the name below)
  const NAMES_FROM_PX = 56; // a Sanctuary this wide on screen: names under every one
  // Further in, the game view (owner request, 2026-11-20; js/map-game.js): Sanctuaries'
  // pictures on grass and the tile grid, with the level badge and name plate, and a card
  // over the one tapped
  // (owner, 2026-11-20: from where the names used to appear, so squares go straight to it)
  const GAME_FROM_PX = NAMES_FROM_PX;
  const DEEPEST_PX = 120; // a Sanctuary at the deepest zoom, on screen (about the game's look)

  /** A Sanctuary's 3×3 tiles in map units, [width, height] (the map isn't to scale). */
  const footprints = new Map();
  function footprint(m) {
    let f = footprints.get(m.uid);
    if (!f) {
      const l = toMap(m.x - 1.5, m.y);
      const r = toMap(m.x + 1.5, m.y);
      const t = toMap(m.x, m.y + 1.5);
      const b = toMap(m.x, m.y - 1.5);
      f = [Math.abs(r.cx - l.cx), Math.abs(b.cy - t.cy)];
      footprints.set(m.uid, f);
    }
    return f;
  }

  /** A Sanctuary's width in map units (the smaller side of its 3×3). */
  const sideOf = (m) => Math.min(...footprint(m));

  // ---- How deep the map may zoom: until the smallest Sanctuary is DEEPEST_PX wide ----
  let smallest = null;
  function updateMaxZoom() {
    const zoom = window.MapZoom;
    if (!zoom?.setMaxZoom || !state.members.length) return;
    if (smallest === null) {
      smallest = Math.min(...state.members.map((m) => Math.min(...footprint(m))));
    }
    const perPx1 = unitsPerPx() * zoom.zoom(); // map units per pixel, not zoomed in
    zoom.setMaxZoom((DEEPEST_PX * perPx1) / smallest);
  }

  // ---- Names under the buildings ----
  let measureCtx = null;
  /** A text's width in pixels at `px`. */
  function textWidth(text, px) {
    if (!measureCtx) {
      measureCtx = document.createElement('canvas').getContext('2d');
      const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
      measureCtx.font = `600 100px ${family}`;
    }
    return (measureCtx.measureText(text).width * px) / 100;
  }
  /** The name, shortened with "…" to fit `maxPx`. */
  function fit(name, px, maxPx) {
    if (textWidth(name, px) <= maxPx) return name;
    const chars = [...name];
    for (let n = chars.length - 1; n > 1; n--) {
      const short = `${chars.slice(0, n).join('').trimEnd()}…`;
      if (textWidth(short, px) <= maxPx) return short;
    }
    return `${chars[0]}…`;
  }
  /** A name under a marker: `cx, cy` its middle, `half` half its height (map units). */
  function nameText(m, cx, cy, half, fpPx, perPx, picked) {
    const px = Math.min(13, Math.max(10, fpPx * 0.16));
    const text = picked ? m.name : fit(m.name, px, fpPx - 4);
    const y = cy + half + px * 0.95 * perPx;
    return `<text class="map-member-name${picked ? ' is-selected' : ''}" x="${cx.toFixed(2)}" y="${y.toFixed(2)}" font-size="${(px * perPx).toFixed(2)}" text-anchor="middle" stroke-width="${(3 * perPx).toFixed(2)}">${esc(text)}</text>`;
  }

  /** "Name" (My members) or "[TAG] Name" (All NAP players). */
  const label = (m) => (state.mode === 'nap' && m.tag ? `[${m.tag}] ${m.name}` : m.name);
  const hit = (m) =>
    `<button type="button" class="map-members-hit" data-uid="${esc(m.uid)}">${esc(label(m))} <small>${esc(might(m.power))}</small></button>`;

  /** A square marker `px` pixels wide, or `size` map units ([w, h]) when given. */
  function square(cx, cy, px, perPx, cls, attrs, fill, size = null) {
    const w = (size ? size[0] : px * perPx) / 2;
    const h = (size ? size[1] : px * perPx) / 2;
    const r = Math.min(w, h) * 0.25;
    return `<rect class="${cls}" ${attrs} x="${(cx - w).toFixed(2)}" y="${(cy - h).toFixed(2)}" width="${(2 * w).toFixed(2)}" height="${(2 * h).toFixed(2)}" rx="${r.toFixed(2)}" fill="${esc(fill)}" stroke-width="${(SIZE.ring * perPx).toFixed(2)}"`;
  }

  /** A single marker's size in map units: SIZE px at the least, else most of its 3×3. */
  function markerSize(m, px, perPx) {
    // Square, as in the game (the map is drawn wider than tall in places)
    const side = Math.max(px * perPx, Math.min(...footprint(m)) * BUILDING);
    return [side, side];
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
      // (Not presses: a drag that starts on a marker must still move the map, js/map-zoom.js;
      // territories ignore presses anyway while markers are shown)
      ['mousemove', 'mouseover'].forEach((type) =>
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
            if (!state.on) return;
            // Dragging moves the view, not the markers (they're drawn in map units): no
            // redraw while the zoom is the same and the view stays inside what was drawn
            // (owner, 2026-11-20: rebuilding every frame flickered); only the card follows
            if (!needsRedraw()) return placePopup(currentPicked());
            draw();
          });
        });
    }
    updateMaxZoom();
    const colorOf = (m) => getAllianceColor(m.tag || state.tag);
    const perPx = unitsPerPx();
    groups = groupsOnScreen(perPx);
    const vb = svg.viewBox?.baseVal;
    // What's drawn: the view and as much again on every side, so dragging needs no redraw
    // until the view leaves it
    drawn = vb
      ? {
          zoom: window.MapZoom?.zoom() || 1,
          x: vb.x - vb.width,
          y: vb.y - vb.height,
          width: vb.width * 3,
          height: vb.height * 3,
        }
      : null;
    const inView = (x, y, pad) =>
      !drawn ||
      (x > drawn.x - pad &&
        x < drawn.x + drawn.width + pad &&
        y > drawn.y - pad &&
        y < drawn.y + drawn.height + pad);
    let names = '';
    const buildings = [];
    const asBuilding = (m, cx, cy, picked) => {
      const side = sideOf(m);
      const fpPx = side / perPx;
      const px = Math.min(13, Math.max(9, fpPx * 0.13));
      const name = picked ? m.name : fit(m.name, px, fpPx * 1.05 - 10);
      buildings.push({
        cy,
        svg: building(m, cx, cy, side, perPx, { name, picked, textWidth }),
      });
    };
    let html = groups
      .map((g, i) => {
        if (g.members.length === 1) {
          const m = g.members[0];
          const size = markerSize(m, SIZE.one, perPx);
          const fpPx = Math.min(...footprint(m)) / perPx;
          if (fpPx >= GAME_FROM_PX) {
            if (inView(g.cx, g.cy, sideOf(m) * 2)) asBuilding(m, g.cx, g.cy, false);
            return '';
          }
          if (fpPx >= NAMES_FROM_PX && inView(g.cx, g.cy, size[0] * 2))
            names += nameText(m, g.cx, g.cy, size[1] / 2, fpPx, perPx, false);
          return `${square(g.cx, g.cy, SIZE.one, perPx, 'map-member-dot', `data-uid="${esc(m.uid)}"`, colorOf(m), size)}><title>${esc(label(m))}</title></rect>`;
        }
        const list = g.members.map(label).join(', ');
        const tags = new Set(g.members.map((m) => m.tag || state.tag));
        const fill = tags.size === 1 ? colorOf(g.members[0]) : MIXED;
        return `<g class="map-member-group" data-group="${i}">${square(g.cx, g.cy, SIZE.group, perPx, 'map-member-dot', '', fill)}><title>${esc(list)}</title></rect><text x="${g.cx.toFixed(1)}" y="${g.cy.toFixed(1)}" font-size="${(8 * perPx).toFixed(1)}" dy="0.35em">${g.members.length}</text></g>`;
      })
      .join('');
    html += names;
    const picked = state.members.find((m) => m.uid === state.selected);
    const pickedGame = picked && sideOf(picked) / perPx >= GAME_FROM_PX;
    if (pickedGame) {
      const { cx, cy } = toMap(picked.x, picked.y);
      asBuilding(picked, cx, cy, true);
    } else if (picked) {
      const { cx, cy } = toMap(picked.x, picked.y);
      const size = markerSize(picked, SIZE.picked, perPx);
      const half = Math.max(size[0], size[1]) / 2;
      // A pulsing halo, a dark outline and a thick white edge: it stands out on any colour
      const halo = half + 5 * perPx;
      html += `<rect class="map-member-halo" x="${(cx - halo).toFixed(2)}" y="${(cy - halo).toFixed(2)}" width="${(2 * halo).toFixed(2)}" height="${(2 * halo).toFixed(2)}" rx="${(halo * 0.3).toFixed(2)}" stroke-width="${(2 * perPx).toFixed(2)}"></rect>`;
      const edge = half + 1.5 * perPx;
      html += `<rect class="map-member-outline" x="${(cx - edge).toFixed(2)}" y="${(cy - edge).toFixed(2)}" width="${(2 * edge).toFixed(2)}" height="${(2 * edge).toFixed(2)}" rx="${(edge * 0.3).toFixed(2)}"></rect>`;
      html += `${square(cx, cy, SIZE.picked, perPx, 'map-member-dot is-selected', `data-uid="${esc(picked.uid)}"`, colorOf(picked), [2 * half, 2 * half]).replace(/stroke-width="[^"]*"/, `stroke-width="${(2 * perPx).toFixed(2)}"`)}><title>${esc(picked.name)}</title></rect>`;
      // Their name in full once names show, else from a little way in
      const fpPx = Math.min(...footprint(picked)) / perPx;
      if (fpPx >= 20)
        html += nameText(
          picked,
          cx,
          cy,
          half + 2 * perPx,
          Math.max(fpPx, NAMES_FROM_PX),
          perPx,
          true,
        );
    }
    if (buildings.length) {
      // Grass and the grid under everything; buildings further down the screen in front
      buildings.sort((a, b) => a.cy - b.cy);
      html = ground(drawn || vb, perPx) + html + buildings.map((b) => b.svg).join('');
    }
    svg.classList.toggle('is-game-view', buildings.length > 0);
    layer.innerHTML = html;
    placePopup(picked || null);
  }

  // ---- Redrawing only when needed ----
  let drawn = null;
  function needsRedraw() {
    const vb = root()?.viewBox?.baseVal;
    const zoom = window.MapZoom?.zoom() || 1;
    if (!drawn || !vb || Math.abs(zoom - drawn.zoom) > 1e-6) return true;
    return (
      vb.x < drawn.x ||
      vb.y < drawn.y ||
      vb.x + vb.width > drawn.x + drawn.width ||
      vb.y + vb.height > drawn.y + drawn.height
    );
  }
  const currentPicked = () => state.members.find((x) => x.uid === state.selected) || null;

  // ---- The card over the chosen member (any zoom) ----
  let pop = null;
  function placePopup(m) {
    const box = container.querySelector('.game-map');
    if (!m || !box) {
      if (pop) pop.hidden = true;
      return;
    }
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'map-game-pop';
      pop.addEventListener('click', (e) => {
        if (!e.target.closest('.map-game-close')) return;
        state.selected = null;
        card.hidden = true;
        draw();
      });
      // Taps on the card are the card's, not the map's
      ['pointerdown', 'mousedown', 'touchstart', 'wheel'].forEach((type) =>
        pop.addEventListener(type, (e) => e.stopPropagation(), { passive: true }),
      );
      box.appendChild(pop);
    }
    if (pop.dataset.uid !== m.uid) {
      pop.dataset.uid = m.uid;
      const tag = m.tag || state.tag;
      const where = territoryAt(m);
      const compact = (n) =>
        Number.isFinite(n)
          ? n.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 })
          : null;
      pop.innerHTML = popupHtml(m, {
        title: `${tag ? `[${tag}] ` : ''}${m.name}`,
        lines: [
          [m.rank, `${tm('game_might')} ${might(m.power)}`].filter(Boolean).join(' · '),
          [
            compact(m.kills) !== null ? `${tm('game_kills')} ${compact(m.kills)}` : '',
            m.level ? `${tm('game_sanctuary')} ${m.level}` : '',
          ]
            .filter(Boolean)
            .join(' · '),
          `${tm('member_coords', { x: m.x, y: m.y })}${where ? ` · ${tm('member_in', { place: where })}` : ''}`,
        ],
        close: { label: tm('member_close'), icon: ic('cross', 'solo') },
      });
      // (a picture or frame that doesn't load: js/player-portrait.js)
    }
    pop.hidden = false;
    // Above the marker (in the game view, the building's top), centred on it; below it when
    // there's no room above
    const svg = root();
    const ctm = svg.getScreenCTM();
    const { cx, cy } = toMap(m.x, m.y);
    const perPx = unitsPerPx();
    const game = sideOf(m) / perPx >= GAME_FROM_PX;
    const half = game ? 0 : markerSize(m, SIZE.picked, perPx)[0] / 2 + 6 * perPx;
    const side = game ? sideOf(m) : 0;
    const pt = svg.createSVGPoint();
    const at = (x, y) => {
      pt.x = x;
      pt.y = y;
      return pt.matrixTransform(ctm);
    };
    const top = game ? at(cx, cy + side * 0.28 - side * 0.8) : at(cx, cy - half);
    const bottom = game ? at(cx, cy + side * 0.6) : at(cx, cy + half);
    const r = box.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const left = Math.min(r.width - w - 4, Math.max(4, top.x - r.left - w / 2));
    let y = top.y - r.top - h - 8;
    pop.classList.toggle('is-below', y < 4);
    if (y < 4) y = bottom.y - r.top + 8;
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.min(r.height - h - 4, y)}px`;
  }

  /** A shared marker tapped: the map zooms in on it until its members split apart. */
  function showGroup(group) {
    const zoom = window.MapZoom;
    if (!group || !zoom) return;
    results.hidden = true;
    zoom.focus(group.cx, group.cy, Math.min(zoom.maxZoom, Math.max(zoom.zoom() * 2.5, 2)));
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
    // Its card is drawn by draw() (placePopup), over the map
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
      // close enough for the names under the buildings
      window.MapZoom.focus(cx, cy, Math.max(window.MapZoom.zoom(), window.MapZoom.maxZoom * 0.6));
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
      // Each player once (the server sends them so; kept safe here too)
      const seen = new Set();
      state.members = (body.members || []).filter((m) => !seen.has(m.uid) && seen.add(m.uid));
      smallest = null;
      footprints.clear();
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
    if (pop) pop.hidden = true;
    root()?.classList.remove('is-game-view');
    window.MapZoom?.setMaxZoom?.(0); // back to the usual limit
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
