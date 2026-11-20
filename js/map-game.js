// The territory map's game view (owner request, 2026-11-20): zoomed in far enough, member
// markers become Sanctuaries as the game draws them, on grass with the tile grid, each with
// its level badge above and its name plate below; tapping one opens a game-style card over
// it (js/map-members.js draws and handles them; this file has the pieces).
//
// Pictures: everyone without a known skin gets the game's usual blue tower
// (images/map/sanctuary.webp, cut from the owner's game screenshot, 2026-11-20: the tracker
// has no picture of it; its own default, castle_N.png, is an older red-roofed building).
// Colours are from the owner's screenshots: grass #597b56, grid lines a darker green.

import { toMap } from './map-coords.js';

export const DEFAULT_PICTURE = '/images/map/sanctuary.webp';
const esc = (v) => window.escapeHtml(v);

/** Map coordinates → game X/Y (the warp turned round: a few Newton steps). */
export function fromMap(cx, cy) {
  let x = (cx / 2115) * 1000;
  let y = 1000 - (cy / 1728) * 1000;
  for (let i = 0; i < 8; i++) {
    const p = toMap(x, y);
    const ex = toMap(x + 0.5, y);
    const ey = toMap(x, y + 0.5);
    const a = (ex.cx - p.cx) / 0.5;
    const b = (ey.cx - p.cx) / 0.5;
    const c = (ex.cy - p.cy) / 0.5;
    const d = (ey.cy - p.cy) / 0.5;
    const det = a * d - b * c;
    if (!det) break;
    const rx = cx - p.cx;
    const ry = cy - p.cy;
    x += (d * rx - b * ry) / det;
    y += (-c * rx + a * ry) / det;
    if (Math.abs(rx) + Math.abs(ry) < 0.01) break;
  }
  return { x, y };
}

/**
 * Grass over the view (the territory colours show through a little) and the tile grid: a
 * line between every two tiles (tiles are centred on whole X/Y numbers).
 */
export function ground(vb, perPx) {
  const corners = [
    fromMap(vb.x, vb.y),
    fromMap(vb.x + vb.width, vb.y),
    fromMap(vb.x, vb.y + vb.height),
    fromMap(vb.x + vb.width, vb.y + vb.height),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const x0 = Math.floor(Math.min(...xs)) - 1;
  const x1 = Math.ceil(Math.max(...xs)) + 1;
  const y0 = Math.floor(Math.min(...ys)) - 1;
  const y1 = Math.ceil(Math.max(...ys)) + 1;
  let lines = '';
  if (x1 - x0 < 160 && y1 - y0 < 160) {
    const seg = (a, b) =>
      `M${a.cx.toFixed(2)} ${a.cy.toFixed(2)}L${b.cx.toFixed(2)} ${b.cy.toFixed(2)}`;
    for (let x = x0; x <= x1; x++) lines += seg(toMap(x + 0.5, y0), toMap(x + 0.5, y1));
    for (let y = y0; y <= y1; y++) lines += seg(toMap(x0, y + 0.5), toMap(x1, y + 0.5));
  }
  const pad = 2 * perPx;
  return `<g class="map-game-ground"><rect x="${(vb.x - pad).toFixed(2)}" y="${(vb.y - pad).toFixed(2)}" width="${(vb.width + 2 * pad).toFixed(2)}" height="${(vb.height + 2 * pad).toFixed(2)}"></rect><path d="${lines}"></path></g>`;
}

/**
 * One Sanctuary: its picture standing on its 3×3 tiles (`side`: their width in map units),
 * the level badge above and the name plate below. `name` is already shortened to fit.
 */
export function building(m, cx, cy, side, perPx, { name, picked, textWidth }) {
  // The picture stands in the upper part of its 3×3, the name plate in the lower, so a row's
  // level badges clear the plates of the row above
  const w = side * 0.98;
  const h = side * 0.76;
  const bottom = cy + side * 0.27;
  const top = bottom - h;
  let out = `<g class="map-game-sanctuary${picked ? ' is-selected' : ''}" data-uid="${esc(m.uid)}">`;
  out += `<rect class="map-game-hit" x="${(cx - side / 2).toFixed(2)}" y="${top.toFixed(2)}" width="${side.toFixed(2)}" height="${(bottom - top).toFixed(2)}"></rect>`;
  out += `<image href="${esc(m.skin || DEFAULT_PICTURE)}" x="${(cx - w / 2).toFixed(2)}" y="${top.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" preserveAspectRatio="xMidYMax meet"></image>`;
  // The level badge, as in the game: a pale pill with the number
  const badgePx = Math.min(13, Math.max(9, (side / perPx) * 0.12));
  if (m.level) {
    const bw = badgePx * 2.6 * perPx;
    const bh = badgePx * 1.5 * perPx;
    const by = top + side * 0.02;
    out += `<rect class="map-game-level" x="${(cx - bw / 2).toFixed(2)}" y="${by.toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" rx="${(bh / 2).toFixed(2)}" stroke-width="${perPx.toFixed(2)}"></rect>`;
    out += `<text class="map-game-level-text" x="${cx.toFixed(2)}" y="${(by + bh / 2).toFixed(2)}" dy="0.35em" font-size="${(badgePx * perPx).toFixed(2)}">${esc(m.level)}</text>`;
  }
  // The name plate
  const px = Math.min(13, Math.max(10, (side / perPx) * 0.13));
  const tw = textWidth(name, px) * perPx;
  const pw = tw + 10 * perPx;
  const ph = px * 1.55 * perPx;
  const py = bottom + side * 0.02;
  out += `<rect class="map-game-plate" x="${(cx - pw / 2).toFixed(2)}" y="${py.toFixed(2)}" width="${pw.toFixed(2)}" height="${ph.toFixed(2)}" rx="${(ph * 0.3).toFixed(2)}" stroke-width="${((picked ? 2 : 1) * perPx).toFixed(2)}"></rect>`;
  out += `<text class="map-game-name" x="${cx.toFixed(2)}" y="${(py + ph / 2).toFixed(2)}" dy="0.35em" font-size="${(px * perPx).toFixed(2)}">${esc(name)}</text>`;
  return `${out}</g>`;
}

/** The card over a tapped Sanctuary, as in the game. */
export function popupHtml(m, { allianceName, might, count, close }) {
  const initial = esc((m.name || '?').charAt(0).toUpperCase());
  const face = m.avatar
    ? `<img class="map-game-face" src="${esc(m.avatar)}" alt="" referrerpolicy="no-referrer" data-initial="${initial}">`
    : `<span class="map-game-face map-game-initial">${initial}</span>`;
  const frame = m.frame ? `<img class="map-game-frame" src="${esc(m.frame)}" alt="">` : '';
  const row = (label, value) => `<div><span>${esc(label)}</span><strong>${value}</strong></div>`;
  const alliance = m.tag ? `[${esc(m.tag)}]${allianceName ? ` ${esc(allianceName)}` : ''}` : '—';
  return `
    <div class="map-game-head"><strong>${m.tag ? `[${esc(m.tag)}] ` : ''}${esc(m.name)}</strong><button type="button" class="map-game-close" aria-label="${esc(close.label)}">${close.icon}</button></div>
    <div class="map-game-body">
      <span class="map-game-pic">${face}${frame}</span>
      <div class="map-game-rows">
        ${row(window.t('map_planner.game_might'), esc(might(m.power)))}
        ${row(window.t('map_planner.game_kills'), esc(count(m.kills)))}
        ${row(window.t('map_planner.game_alliance'), alliance)}
        ${m.level ? row(window.t('map_planner.game_sanctuary'), esc(m.level)) : ''}
      </div>
    </div>`;
}
