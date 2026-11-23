// A small line chart as SVG markup (owner request, 2026-11-20): the Stats tab's Alliance
// growth and Player lookup, and the dashboard's alliance growth card. A classic script can
// use it as window.LineChart.
//
//   lineChart({ days: ['2026-11-19', …], lines: [{ color, name, values: [n|null, …] }],
//               format: (n) => '1.2B', height: 160, label, ticks: 3, floorZero: false,
//               classes: { svg, grid, axis }, hint })
//
// Gaps (null) are skipped. Needs two days or more; returns '' otherwise.
//
// Each day can be read (owner request, 2026-11-23: "make all default charts selectable"):
// hovering, tapping or the arrow keys (the chart can be focused) mark the day with a line and
// fill the line under the chart with its date and each line's value. A tap keeps it until
// tapped again; moving off goes back to the one kept. One listener for the whole page
// (below), so charts drawn later need nothing more.

const esc = (v) => window.escapeHtml(v);

const dateLabel = (day) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function lineChart({
  days,
  lines,
  format = String,
  height = 160,
  label = '',
  ticks: tickCount = 3,
  floorZero = false,
  classes = {},
  hint = '',
}) {
  const cls = { svg: 'lc-chart', grid: 'lc-grid', axis: 'lc-axis', ...classes };
  const W = 600;
  const H = height;
  const pad = { l: 54, r: 12, t: 10, b: 24 };
  const values = lines.flatMap((l) => l.values.filter(Number.isFinite));
  if (days.length < 2 || !values.length) return '';
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const span = hi - lo || Math.abs(hi) * 0.05 || 1;
  lo = floorZero ? Math.max(0, lo - span * 0.08) : lo - span * 0.1;
  hi += span * (floorZero ? 0.08 : 0.1);
  const x = (i) => pad.l + (i / (days.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const ticks = Array.from({ length: tickCount }, (_, k) => lo + ((hi - lo) * k) / (tickCount - 1));
  const grid = ticks
    .map(
      (v) =>
        `<line class="${cls.grid}" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"></line><text class="${cls.axis}" x="${pad.l - 6}" y="${y(v).toFixed(1)}" dy="0.32em" text-anchor="end">${esc(format(v))}</text>`,
    )
    .join('');
  const ends = [0, ...(tickCount > 3 ? [Math.floor((days.length - 1) / 2)] : []), days.length - 1]
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .map(
      (i) =>
        `<text class="${cls.axis}" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}">${esc(dateLabel(days[i]))}</text>`,
    )
    .join('');
  const paths = lines
    .map((l) => {
      const pts = l.values.map((v, i) => [i, v]).filter(([, v]) => Number.isFinite(v));
      if (!pts.length) return '';
      const d = pts
        .map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
        .join('');
      const dots =
        pts.length <= 14
          ? pts
              .map(
                ([i, v]) =>
                  `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" fill="${esc(l.color)}"></circle>`,
              )
              .join('')
          : '';
      return `<g>${l.name ? `<title>${esc(l.name)}</title>` : ''}<path d="${d}" fill="none" stroke="${esc(l.color)}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"></path>${dots}</g>`;
    })
    .join('');
  // A column per day to hover or tap, and the line that marks the day picked
  const step = (W - pad.l - pad.r) / (days.length - 1);
  const hits = days
    .map(
      (_, i) =>
        `<rect class="lc-hit" data-i="${i}" x="${Math.max(0, x(i) - step / 2).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${H}"></rect>`,
    )
    .join('');
  // What each day reads: its date, then each line's value (in the line's colour)
  const readouts = days.map((day, i) => {
    const parts = lines
      .filter((l) => Number.isFinite(l.values[i]))
      .map(
        (l) =>
          `<span class="lc-val"><i style="background:${esc(l.color)}"></i>${l.name ? `${esc(l.name)}: ` : ''}<b>${esc(format(l.values[i]))}</b></span>`,
      );
    return `<strong>${esc(dateLabel(day))}</strong>${parts.join('')}`;
  });
  const points = JSON.stringify(days.map((_, i) => x(i).toFixed(1)));
  return `<div class="lc-box" data-lc-points="${esc(points)}"><svg class="${cls.svg} lc-svg" viewBox="0 0 ${W} ${H}" role="img" tabindex="0"${label ? ` aria-label="${esc(label)}"` : ''}>${grid}${ends}${paths}<line class="lc-mark" x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}" visibility="hidden"></line>${hits}</svg><div class="lc-readout" aria-live="polite"><span class="lc-hint">${esc(hint)}</span></div><template class="lc-days">${readouts.map((r) => `<div>${r}</div>`).join('')}</template></div>`;
}

// ---------- reading a day (one set of listeners for the page) ----------

/** Marks day `i` in a chart's box (or clears it, i = null) and fills its readout. */
function show(box, i) {
  const mark = box.querySelector('.lc-mark');
  const out = box.querySelector('.lc-readout');
  if (!mark || !out) return;
  if (i === null || i === undefined) {
    mark.setAttribute('visibility', 'hidden');
    out.innerHTML = box.dataset.lcHint || out.innerHTML;
    out.classList.remove('is-on');
    return;
  }
  const xs = JSON.parse(box.dataset.lcPoints || '[]');
  const days = box.querySelector('.lc-days')?.content.children || [];
  if (!days[i]) return;
  mark.setAttribute('x1', xs[i]);
  mark.setAttribute('x2', xs[i]);
  mark.setAttribute('visibility', 'visible');
  if (box.dataset.lcHint === undefined) box.dataset.lcHint = out.innerHTML;
  out.innerHTML = days[i].innerHTML;
  out.classList.add('is-on');
  box.dataset.lcAt = String(i);
}

const boxOf = (el) => el?.closest?.('.lc-box');
const kept = (box) => (box.dataset.lcKept === undefined ? null : Number(box.dataset.lcKept));

if (typeof document !== 'undefined' && !window.__lcListening) {
  window.__lcListening = true;
  document.addEventListener('pointerover', (e) => {
    const hit = e.target.closest?.('.lc-hit');
    if (hit && e.pointerType !== 'touch') show(boxOf(hit), Number(hit.dataset.i));
  });
  document.addEventListener('pointerout', (e) => {
    const box = boxOf(e.target);
    if (!box || box.contains(e.relatedTarget)) return;
    show(box, kept(box));
  });
  document.addEventListener('click', (e) => {
    const hit = e.target.closest?.('.lc-hit');
    if (!hit) return;
    const box = boxOf(hit);
    const i = Number(hit.dataset.i);
    if (kept(box) === i) {
      delete box.dataset.lcKept;
      show(box, null);
    } else {
      box.dataset.lcKept = String(i);
      show(box, i);
    }
  });
  document.addEventListener('keydown', (e) => {
    const svg = e.target.closest?.('.lc-svg');
    if (!svg) return;
    const box = boxOf(svg);
    const n = svg.querySelectorAll('.lc-hit').length;
    const at = box.dataset.lcAt === undefined ? n : Number(box.dataset.lcAt);
    let i = null;
    if (e.key === 'ArrowLeft') i = Math.max(0, at - 1);
    else if (e.key === 'ArrowRight') i = at >= n ? n - 1 : Math.min(n - 1, at + 1);
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = n - 1;
    else if (e.key === 'Escape') {
      delete box.dataset.lcKept;
      delete box.dataset.lcAt;
      show(box, null);
      return;
    } else return;
    e.preventDefault();
    box.dataset.lcKept = String(i);
    show(box, i);
  });
}

if (typeof window !== 'undefined') window.LineChart = { lineChart };
