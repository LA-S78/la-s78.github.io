// A small line chart as SVG markup (owner request, 2026-11-20): the Stats tab's Player
// lookup and the dashboard's alliance growth card. A classic script can use it as
// window.LineChart.
//
//   lineChart({ days: ['2026-11-19', …], lines: [{ color, values: [n|null, …] }],
//               format: (n) => '1.2B', height: 160 })
//
// Gaps (null) are skipped. Needs two days or more; returns '' otherwise.

const esc = (v) => window.escapeHtml(v);

const dateLabel = (day) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function lineChart({ days, lines, format = String, height = 160, label = '' }) {
  const W = 600;
  const H = height;
  const pad = { l: 54, r: 12, t: 10, b: 24 };
  const values = lines.flatMap((l) => l.values.filter(Number.isFinite));
  if (days.length < 2 || !values.length) return '';
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const span = hi - lo || Math.abs(hi) * 0.05 || 1;
  lo -= span * 0.1;
  hi += span * 0.1;
  const x = (i) => pad.l + (i / (days.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const ticks = [0, 0.5, 1].map((k) => lo + (hi - lo) * k);
  const grid = ticks
    .map(
      (v) =>
        `<line class="lc-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"></line><text class="lc-axis" x="${pad.l - 6}" y="${y(v).toFixed(1)}" dy="0.32em" text-anchor="end">${esc(format(v))}</text>`,
    )
    .join('');
  const ends = [0, days.length - 1]
    .map(
      (i) =>
        `<text class="lc-axis" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${i ? 'end' : 'start'}">${esc(dateLabel(days[i]))}</text>`,
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
      return `<path d="${d}" fill="none" stroke="${esc(l.color)}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"></path>${dots}`;
    })
    .join('');
  return `<svg class="lc-chart" viewBox="0 0 ${W} ${H}" role="img"${label ? ` aria-label="${esc(label)}"` : ''}>${grid}${ends}${paths}</svg>`;
}

if (typeof window !== 'undefined') window.LineChart = { lineChart };
