// Zooming the territory map (owner request, 2026-11-20): pinch on phones, the mouse wheel on
// desktops, and + / − / reset buttons; drag (one finger, or the mouse) to move around once
// zoomed in. It works by narrowing the map's viewBox, so territories, labels, highlights and
// the "My members" markers (js/map-members.js) all stay in place.
//
// Not zoomed in, the page behaves as before: one finger scrolls the page, and wheeling down
// over the map scrolls it too. A drag is never taken for a tap (Planner Mode's territory
// taps). Map pictures (captureMapImage) keep the whole map: data-full-view-box.
// Others can use window.MapZoom: focus(x, y, zoom), zoom(), maxZoom.

import { getSvgRoot } from './map.js';

const MAX_ZOOM = 6;
const STEP = 1.6; // a button press
const DRAG_PX = 6; // movement before a press counts as a drag, not a tap

const esc = (v) => window.escapeHtml(v);
const tm = (key, vars) => window.t(`map_planner.${key}`, vars);
const ic = (name, tone) => (window.uiIcon ? window.uiIcon(name, tone) : '');

function start() {
  const container = document.getElementById('map-container');
  const svg = getSvgRoot();
  const box = container?.querySelector('.game-map');
  if (!container || !svg || !box || svg.dataset.zoomReady) return;
  const vb = svg.viewBox?.baseVal;
  if (!vb || !vb.width) return;
  svg.dataset.zoomReady = '1';
  const base = { x: vb.x, y: vb.y, w: vb.width, h: vb.height };
  svg.dataset.fullViewBox = `${base.x} ${base.y} ${base.w} ${base.h}`;
  let view = { ...base };

  // ---- The buttons ----
  const controls = document.createElement('div');
  controls.className = 'map-zoom';
  controls.innerHTML = `
    <button type="button" data-zoom="in" aria-label="${esc(tm('zoom_in'))}" title="${esc(tm('zoom_in'))}">${ic('plus', 'solo')}</button>
    <button type="button" data-zoom="out" aria-label="${esc(tm('zoom_out'))}" title="${esc(tm('zoom_out'))}">${ic('minus', 'solo')}</button>
    <button type="button" data-zoom="reset" aria-label="${esc(tm('zoom_reset'))}" title="${esc(tm('zoom_reset'))}">${ic('maximize', 'solo')}</button>`;
  box.classList.add('has-zoom');
  box.appendChild(controls);

  const zoomLevel = () => base.w / view.w;

  /**
   * Territory labels grow only a little as the map zooms in (they're drawn in map units, so
   * they'd otherwise grow as much as the map and cover it): their size ÷ zoom^0.6, so on
   * screen they grow zoom^0.4 (2× at 6×). The map redraws its labels at times: done again.
   */
  function sizeLabels() {
    const k = Math.pow(zoomLevel(), 0.6);
    svg.querySelectorAll('.territory-label').forEach((el) => {
      if (!el.dataset.baseSize) el.dataset.baseSize = String(parseFloat(el.style.fontSize) || 0);
      const size = Number(el.dataset.baseSize);
      if (size) el.style.fontSize = `${(size / k).toFixed(1)}px`;
    });
  }
  let labelsQueued = false;
  new MutationObserver(() => {
    if (labelsQueued || zoomLevel() <= 1.01) return;
    labelsQueued = true;
    requestAnimationFrame(() => {
      labelsQueued = false;
      sizeLabels();
    });
  }).observe(svg, { childList: true, subtree: true });

  function apply() {
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    sizeLabels();
    const z = zoomLevel();
    svg.classList.toggle('is-zoomed', z > 1.01);
    controls.querySelector('[data-zoom="in"]').disabled = z >= MAX_ZOOM - 0.01;
    controls.querySelector('[data-zoom="out"]').disabled = z <= 1.01;
    controls.querySelector('[data-zoom="reset"]').disabled = z <= 1.01;
    svg.dispatchEvent(new CustomEvent('mapzoom', { detail: { zoom: z } }));
  }

  /** Keeps the view inside the map and between 1× and MAX_ZOOM. */
  function clamp() {
    view.w = Math.min(base.w, Math.max(base.w / MAX_ZOOM, view.w));
    view.h = (view.w * base.h) / base.w;
    view.x = Math.min(base.x + base.w - view.w, Math.max(base.x, view.x));
    view.y = Math.min(base.y + base.h - view.h, Math.max(base.y, view.y));
  }

  /** The map point under a screen point (the map keeps its shape inside its box). */
  function toMap(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    const scale = Math.min(r.width / view.w, r.height / view.h);
    const offX = (r.width - view.w * scale) / 2;
    const offY = (r.height - view.h * scale) / 2;
    return {
      x: view.x + (clientX - r.left - offX) / scale,
      y: view.y + (clientY - r.top - offY) / scale,
    };
  }

  /** Zooms by `factor`, keeping the map point (cx, cy) where it is on screen. */
  function zoomAt(factor, cx, cy) {
    const w = Math.min(base.w, Math.max(base.w / MAX_ZOOM, view.w / factor));
    const k = w / view.w;
    view = { x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k, w, h: (w * base.h) / base.w };
    clamp();
    apply();
  }

  /** Centres the map point (x, y) at `zoom` (others: the members search). */
  function focus(x, y, zoom = 3) {
    const w = base.w / Math.min(MAX_ZOOM, Math.max(1, zoom));
    view = { x: x - w / 2, y: y - (w * base.h) / base.w / 2, w, h: (w * base.h) / base.w };
    clamp();
    apply();
  }

  const middle = () => ({ x: view.x + view.w / 2, y: view.y + view.h / 2 });
  controls.addEventListener('click', (e) => {
    const b = e.target.closest('[data-zoom]');
    if (!b) return;
    const m = middle();
    if (b.dataset.zoom === 'in') zoomAt(STEP, m.x, m.y);
    else if (b.dataset.zoom === 'out') zoomAt(1 / STEP, m.x, m.y);
    else {
      view = { ...base };
      apply();
    }
  });

  // ---- The mouse wheel (desktops) ----
  svg.addEventListener(
    'wheel',
    (e) => {
      // Not zoomed in, wheeling down scrolls the page as before
      if (zoomLevel() <= 1.01 && e.deltaY > 0) return;
      e.preventDefault();
      const p = toMap(e.clientX, e.clientY);
      zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    },
    { passive: false },
  );

  // ---- Dragging and pinching ----
  const pointers = new Map();
  let pinch = null;
  let moved = false;
  let startAt = null;

  svg.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      moved = false;
      startAt = { x: e.clientX, y: e.clientY };
    }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
      moved = true;
    }
  });

  svg.addEventListener('pointermove', (e) => {
    const was = pointers.get(e.pointerId);
    if (!was) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, now);
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 0 && pinch.dist > 0) {
        const mid = toMap((a.x + b.x) / 2, (a.y + b.y) / 2);
        zoomAt(dist / pinch.dist, mid.x, mid.y);
      }
      pinch.dist = dist;
      return;
    }
    // One finger or the mouse: moves the map, once zoomed in (a mouse only while pressed)
    if (zoomLevel() <= 1.01 || (e.pointerType === 'mouse' && !(e.buttons & 1))) return;
    if (!moved && startAt && Math.hypot(now.x - startAt.x, now.y - startAt.y) < DRAG_PX) return;
    if (!moved) {
      moved = true;
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        // An old browser: the drag still works while the pointer stays on the map
      }
    }
    const r = svg.getBoundingClientRect();
    const scale = Math.min(r.width / view.w, r.height / view.h);
    view.x -= (now.x - was.x) / scale;
    view.y -= (now.y - was.y) / scale;
    clamp();
    apply();
  });

  const lift = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
  };
  svg.addEventListener('pointerup', lift);
  svg.addEventListener('pointercancel', lift);
  svg.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') lift(e);
  });

  // A drag or pinch is never a tap (Planner Mode would assign the territory under it)
  svg.addEventListener(
    'click',
    (e) => {
      if (!moved) return;
      e.preventDefault();
      e.stopPropagation();
      moved = false;
    },
    true,
  );

  window.MapZoom = { focus, zoom: zoomLevel, maxZoom: MAX_ZOOM };
  apply();
}

/** The map is drawn by js/map.js: wait for its picture to be there (on a page with a map). */
function whenReady(tries = 0) {
  if (!document.getElementById('map-container')) return;
  if (getSvgRoot()?.viewBox?.baseVal?.width) start();
  else if (tries < 40) setTimeout(() => whenReady(tries + 1), 300);
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading')
    window.addEventListener('DOMContentLoaded', () => whenReady());
  else whenReady();
  document.addEventListener('turbo:load', () => whenReady());
  document.addEventListener('turbo:frame-render', () => whenReady());
}
