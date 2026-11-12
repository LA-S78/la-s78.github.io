/**
 * js/dashboard-widgets.js
 * Draws the Alliance Dashboard's charts and tables (portal/dashboard.html) from a widget:
 *   { type: 'bar'|'line'|'pie'|'progress'|'table', title, note, visibility,
 *     data: { columns, rows }, options: { labelCol, valueCols, vertical, donut, target,
 *     targetCol, highlightCol, highlightMin }, updatedAt }
 * Everything is plain SVG/HTML coloured with the theme's CSS variables (.dw-s0 … .dw-s5 in
 * _css/portal/70-alliance-dashboard.css), so charts follow Plague, Sanctuary and Miasma.
 * Every value from the data goes through escapeHtml() (js/escape-html.js).
 *
 * window.DashboardWidgets = { parseTable, toText, number, render, mount }
 */
(() => {
  const esc = (v) => window.escapeHtml(String(v ?? ''));
  const SERIES = 6; // colours .dw-s0 … .dw-s5
  const pct1 = (f) => `${Math.round(f * 1000) / 10}%`;
  const isPercentCell = (cell) => /%\s*$/.test(String(cell ?? ''));

  // Numbers in a readout keep one more decimal than the chart (1.26B, not 1.3B).
  const exact = (n) => short(n, 2);

  /**
   * Makes a chart part selectable, like a territory on the map: hovering, tapping or Enter
   * highlights it and fills the info card under the chart with `title`, an optional `badge`
   * and `lines` ("Name: value"); line `on` is the part itself (shown bold). Parts sharing a
   * `key` (a pie slice and its legend row) light up together. See selectable().
   */
  function pick(title, lines, on = -1, key = '', badge = '') {
    const text = lines.map((l) => esc(l)).join('&#10;');
    return `data-tip="${esc(title)}" data-lines="${text}" data-on="${on}"${key ? ` data-key="${esc(key)}"` : ''}${badge ? ` data-badge="${esc(badge)}"` : ''} tabindex="0"`;
  }

  /**
   * A table pasted from Google Sheets / Excel (tab-separated) or a CSV (commas or
   * semicolons, "quoted, cells" allowed). The first row is the header.
   * @returns {{ columns: string[], rows: string[][] }}
   */
  function parseTable(text) {
    const lines = String(text || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .filter((l) => l.trim() !== '');
    if (!lines.length) return { columns: [], rows: [] };
    const first = lines[0];
    const sep = first.includes('\t')
      ? '\t'
      : first.split(';').length > first.split(',').length
        ? ';'
        : ',';
    const split = (line) => {
      if (sep === '\t') return line.split('\t');
      const out = [];
      let cell = '';
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quoted) {
          if (ch === '"' && line[i + 1] === '"') (cell += '"'), i++;
          else if (ch === '"') quoted = false;
          else cell += ch;
        } else if (ch === '"' && cell === '') quoted = true;
        else if (ch === sep) out.push(cell), (cell = '');
        else cell += ch;
      }
      out.push(cell);
      return out;
    };
    const [head, ...body] = lines.map((l) => split(l).map((c) => c.trim()));
    const width = Math.max(head.length, ...body.map((r) => r.length));
    return {
      columns: headings(head, width),
      rows: body.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? '')),
    };
  }

  /**
   * Column names from a header row. A heading merged over two columns in Sheets/Excel pastes
   * as a name then a blank: the blank becomes "<name> (2)" (then (3)…), so it can be chosen.
   */
  function headings(head, width) {
    const out = [];
    let last = '';
    let n = 1;
    for (let i = 0; i < width; i++) {
      const h = String(head[i] ?? '').trim();
      if (h) (out[i] = h), (last = h), (n = 1);
      else out[i] = last ? `${last} (${++n})` : `Column ${i + 1}`;
    }
    return out;
  }

  /** The table back as tab-separated text (to edit it again). */
  function toText(data) {
    const line = (cells) => cells.map((c) => String(c ?? '').replace(/[\t\n]/g, ' ')).join('\t');
    return [line(data?.columns || []), ...(data?.rows || []).map(line)].join('\n');
  }

  /**
   * A number from a cell: "15,000,000", "15M", "1.2k", "3.5B", "45%", "-7", and "2/16"
   * (2: a count out of a total, as in "2 of 16 weeks"); NaN if none.
   */
  function number(cell) {
    const text = String(cell ?? '').replace(/[\s,]/g, '');
    const frac = text.match(/^(\d*\.?\d+)\/\d*\.?\d+$/);
    if (frac) return Number(frac[1]);
    const m = text.match(/^([-+]?\d*\.?\d+)([kmbt%])?$/i);
    if (!m) return NaN;
    const scale = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[(m[2] || '').toLowerCase()] || 1;
    return Number(m[1]) * scale;
  }

  /** Short form of a number: 15.2M, 1.2K, 980. */
  function short(n, digits = 1) {
    if (!Number.isFinite(n)) return '–';
    const a = Math.abs(n);
    const k = 10 ** digits;
    const f = (v, s) => `${(Math.round(v * k) / k).toLocaleString()}${s}`;
    if (a >= 1e9) return f(n / 1e9, 'B');
    if (a >= 1e6) return f(n / 1e6, 'M');
    if (a >= 1e4) return f(n / 1e3, 'K');
    return (Math.round(n * 100) / 100).toLocaleString();
  }

  function series(w) {
    const o = w.options || {};
    const cols = w.data?.columns || [];
    const label = o.labelCol ?? 0;
    const values = (o.valueCols && o.valueCols.length ? o.valueCols : [label === 1 ? 0 : 1]).filter(
      (c) => c < cols.length,
    );
    const rows = (w.data?.rows || []).map((r) => ({
      label: r[label] ?? '',
      values: values.map((c) => number(r[c])),
      cells: r,
    }));
    return { label, values, names: values.map((c) => cols[c]), rows };
  }

  // Traffic-light stops (red → yellow → green), softened for the dark themes.
  const RAMP = [
    [196, 80, 72],
    [214, 168, 58],
    [96, 170, 86],
  ];

  /** The red → yellow → green colour at `f` (0 = low … 1 = high), tinted towards the theme. */
  function ramp(f) {
    const x = Math.min(1, Math.max(0, Number.isFinite(f) ? f : 0)) * (RAMP.length - 1);
    const i = Math.min(RAMP.length - 2, Math.floor(x));
    const t = x - i;
    const rgb = RAMP[i].map((c, j) => Math.round(c + (RAMP[i + 1][j] - c) * t));
    return `color-mix(in srgb, rgb(${rgb.join(', ')}) 85%, var(--accent-color))`;
  }

  /**
   * A series' colour: the theme palette (.dw-s0…), or with options.scale traffic-light
   * colours: across the columns (first red, last green) or, given `frac`, by size
   * (0 = red … 1 = green). Returns the attributes: class="…" and, if needed, style="…".
   */
  function paint(w, k, n, extra = '', css = '', frac) {
    const styles = [];
    let cls = extra;
    const f = frac ?? (n > 1 ? k / (n - 1) : undefined);
    if (w.options?.scale && f !== undefined) styles.push(`--dw: ${ramp(f)}`);
    else cls = `${extra ? `${extra} ` : ''}dw-s${k % SERIES}`;
    if (css) styles.push(css);
    return `class="${cls}"${styles.length ? ` style="${styles.join('; ')}"` : ''}`;
  }

  function legend(names, w) {
    if (names.length < 2) return '';
    return `<div class="dw-legend">${names
      .map((n, i) => `<span><i ${paint(w, i, names.length)}></i>${esc(n)}</span>`)
      .join('')}</div>`;
  }

  // ---------- bar: horizontal (one row each) or vertical; side by side or stacked ----------
  // options.stacked: '' (side by side) | 'sum' (stacked totals) | 'percent' (stacked to 100%).
  // Side-by-side horizontal bars are a best-first leaderboard; stacked bars keep the sheet's
  // order. Vertical charts with many rows switch to horizontal on narrow screens (phones).
  function bar(w) {
    const s = series(w);
    const o = w.options || {};
    const stacked = o.stacked === 'sum' || o.stacked === 'percent' ? o.stacked : '';
    const rows = s.rows.filter((r) => r.values.some(Number.isFinite));
    if (!rows.length) return empty('No numbers to chart in the chosen column.');
    const total = (r) => r.values.reduce((t, v) => t + (Number.isFinite(v) && v > 0 ? v : 0), 0);
    const n = s.values.length;
    // A segment's tooltip: its share (stacked to 100%) and the cell as written in the sheet.
    const tip = (r, k) => {
      const v = r.values[k];
      const cell = r.cells[s.values[k]];
      const pct =
        stacked === 'percent' && total(r) ? ` ${Math.round((v / total(r)) * 1000) / 10}%` : '';
      const raw = pct && cell !== undefined && !/%\s*$/.test(cell) ? ` (${cell})` : '';
      return `${r.label} · ${s.names[k]}:${pct || ` ${short(v)}`}${raw}`;
    };

    // The readout for a bar: every column of its row, the tapped one bold.
    const colTotal = s.values.map((_, k) =>
      rows.reduce(
        (t, r) => t + (Number.isFinite(r.values[k]) && r.values[k] > 0 ? r.values[k] : 0),
        0,
      ),
    );
    const readout = (r) => {
      const keys = [];
      const lines = [];
      const badges = [];
      r.values.forEach((v, k) => {
        if (!Number.isFinite(v)) return;
        const cell = r.cells[s.values[k]];
        let text;
        if (stacked === 'percent') {
          text = total(r) ? pct1(v / total(r)) : short(v);
          badges.push(text);
          if (cell !== undefined && v !== 0 && !isPercentCell(cell)) text += ` (${cell})`;
        } else if (stacked === 'sum') {
          text = `${exact(v)}${total(r) ? ` (${pct1(v / total(r))})` : ''}`;
          badges.push(exact(v));
        } else {
          text = exact(v);
          badges.push(text);
          if (!isPercentCell(cell) && colTotal[k] > 0 && v > 0 && rows.length > 1)
            text += ` · ${pct1(v / colTotal[k])} of all`;
        }
        keys.push(k);
        lines.push(n > 1 || stacked ? `${s.names[k]}: ${text}` : text);
      });
      if (stacked === 'sum' && lines.length > 1) lines.push(`Total: ${exact(total(r))}`);
      return {
        lines,
        on: (k) => keys.indexOf(k),
        badge: (k) => badges[keys.indexOf(k)] ?? '',
        rowBadge: stacked === 'sum' ? exact(total(r)) : stacked ? '' : (badges[0] ?? ''),
      };
    };

    // One column with traffic-light colours: each bar by its size (biggest green).
    const peak = Math.max(...rows.map((r) => r.values[0]).filter(Number.isFinite), 0) || 1;
    const bySize = (r) => (n === 1 && !stacked ? r.values[0] / peak : undefined);

    const horizontal = () => {
      const list = stacked
        ? rows
        : [...rows].sort((a, b) => (b.values[0] || 0) - (a.values[0] || 0));
      const max =
        stacked === 'percent'
          ? 1
          : Math.max(
              ...list.map((r) =>
                stacked ? total(r) : Math.max(...r.values.filter(Number.isFinite), 0),
              ),
              0,
            ) || 1;
      const items = list
        .map((r, i) => {
          const scale = stacked === 'percent' ? total(r) || 1 : max;
          const ro = readout(r);
          const segs = r.values
            .map((v, k) =>
              Number.isFinite(v) && (!stacked || v > 0)
                ? `<span ${paint(w, k, n, 'dw-bar', `width:${Math.max(0, (v / scale) * 100).toFixed(2)}%`, bySize(r))} title="${esc(tip(r, k))}" ${pick(r.label, ro.lines, ro.on(k), '', ro.badge(k))}></span>`
                : '',
            )
            .join('');
          const value = stacked === 'percent' ? '' : short(stacked ? total(r) : r.values[0]);
          return `<li class="${i >= 25 ? 'dw-extra' : ''}" ${pick(r.label, ro.lines, -1, '', ro.rowBadge)}><span class="dw-bar-label" title="${esc(r.label)}">${esc(r.label)}</span><span class="dw-bar-track${stacked ? ' dw-stack' : ''}">${segs}</span><span class="dw-bar-value">${value}</span></li>`;
        })
        .join('');
      return `<ol class="dw-bars${stacked === 'percent' ? ' dw-no-value' : ''}">${items}</ol>${legend(s.names, w)}${list.length > 25 ? showAll(list.length) : ''}`;
    };

    if (!o.vertical) return horizontal();

    const shown = rows.slice(0, 30);
    const top =
      stacked === 'percent'
        ? 100
        : Math.max(
            ...shown.map((r) =>
              stacked ? total(r) : Math.max(...r.values.filter(Number.isFinite), 0),
            ),
            0,
          ) || 1;
    const groupW = 600 / shown.length;
    const barW = stacked ? Math.max(2, groupW * 0.7) : Math.max(2, (groupW * 0.8) / n);
    const rects = shown
      .map((r, i) => {
        let base = 190;
        const ro = readout(r);
        return r.values
          .map((v, k) => {
            if (!Number.isFinite(v) || v <= 0) return '';
            const value = stacked === 'percent' ? (v / (total(r) || 1)) * 100 : v;
            const h = (value / top) * 170;
            const x = stacked ? i * groupW + groupW * 0.15 : i * groupW + groupW * 0.1 + k * barW;
            const y = stacked ? base - h : 190 - h;
            if (stacked) base -= h;
            return `<rect ${paint(w, k, n, '', '', bySize(r))} x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" ${pick(r.label, ro.lines, ro.on(k), '', ro.badge(k))}><title>${esc(tip(r, k))}</title></rect>`;
          })
          .join('');
      })
      .join('');
    const g = guides(0, top, stacked === 'percent' ? (v) => `${Math.round(v)}%` : undefined);
    const vertical =
      frame(
        w,
        rects,
        g,
        shown.map((r) => r.label),
      ) +
      legend(s.names, w) +
      more(rows.length, 30);
    // Many vertical bars don't fit a phone: there, the same chart as horizontal rows.
    return rows.length > 8
      ? `<div class="dw-wide">${vertical}</div><div class="dw-narrow">${horizontal()}</div>`
      : vertical;
  }

  /**
   * Guide lines across a 600×200 chart for values `lo`…`hi` drawn between y = 190 (lo) and
   * y = 20 (hi), with their values as ordinary text beside the drawing (text inside the SVG
   * would shrink with it on a phone).
   */
  function guides(lo, hi, label) {
    const ys = [0, 0.5, 1].map((f) => ({ y: 190 - 170 * f, v: lo + (hi - lo) * f }));
    if (!label) {
      // Close values (1.15B … 1.35B) need more decimals, or two labels read "1.2B".
      let digits = 1;
      while (digits < 3 && new Set(ys.map(({ v }) => short(v, digits))).size < ys.length) digits++;
      label = (v) => short(v, digits);
    }
    return {
      svg: ys
        .map(({ y }) => `<line class="dw-grid" x1="0" x2="600" y1="${y}" y2="${y}"/>`)
        .join(''),
      labels: ys
        .map(
          ({ y, v }) =>
            `<span class="dw-y" style="top:${((y / 200) * 100).toFixed(1)}%">${label(v)}</span>`,
        )
        .join(''),
    };
  }

  /** An SVG chart with its value labels, and labels under it (first and last, or all if few). */
  function frame(w, svgInner, g, xLabels) {
    const xs =
      xLabels.length <= 8
        ? xLabels
        : [xLabels[0], xLabels[Math.floor(xLabels.length / 2)], xLabels[xLabels.length - 1]];
    return `<div class="dw-chart"><svg class="dw-svg" viewBox="0 0 600 200" role="img" aria-label="${esc(w.title)}">${g.svg}${svgInner}</svg>${g.labels}</div><div class="dw-xaxis">${xs
      .map((x) => `<span title="${esc(x)}">${esc(x)}</span>`)
      .join('')}</div>`;
  }

  // ---------- line: one line per value column, rows in their order ----------
  function line(w) {
    const s = series(w);
    const rows = s.rows;
    if (rows.length < 2) return empty('A line needs at least two rows.');
    const all = rows.flatMap((r) => r.values.filter(Number.isFinite));
    if (!all.length) return empty('No numbers to chart in the chosen column.');
    // Trends: the chart spans the data's own range (a little margin), not from zero, so
    // growth from 1.20B to 1.45B is visible.
    let lo = Math.min(...all);
    let hi = Math.max(...all);
    const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.1 || 1;
    lo -= pad;
    hi += pad;
    if (Math.min(...all) >= 0 && lo < 0) lo = 0;
    const x = (i) => 8 + (i * 584) / (rows.length - 1);
    const y = (v) => 190 - ((v - lo) / (hi - lo)) * 170;
    const paths = s.values
      .map((_, k) => {
        const pts = rows
          .map((r, i) => (Number.isFinite(r.values[k]) ? [x(i), y(r.values[k]), r] : null))
          .filter(Boolean);
        const d = pts
          .map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`)
          .join('');
        const dots =
          pts.length <= 40
            ? pts
                .map(
                  ([px, py, r]) =>
                    `<circle class="dw-dot dw-s${k % SERIES}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="6"><title>${esc(r.label)} · ${esc(s.names[k])}: ${short(r.values[k])}</title></circle>`,
                )
                .join('')
            : '';
        return `<path class="dw-line dw-s${k % SERIES}" d="${d}"/>${dots}`;
      })
      .join('');
    // One tall tap area per row (the dots are too small to tap on a phone): its readout lists
    // every line's value there and the change since the row before.
    const colW = 584 / (rows.length - 1);
    const hits = rows
      .map((r, i) => {
        const lines = s.values
          .map((_, k) => {
            const v = r.values[k];
            if (!Number.isFinite(v)) return null;
            const prev = i ? rows[i - 1].values[k] : NaN;
            const change =
              Number.isFinite(prev) && prev !== 0
                ? ` (${v >= prev ? '+' : '−'}${pct1(Math.abs(v - prev) / Math.abs(prev))})`
                : '';
            return `${s.names[k]}: ${exact(v)}${change}`;
          })
          .filter(Boolean);
        const left = Math.max(0, x(i) - colW / 2);
        const right = Math.min(600, x(i) + colW / 2);
        return `<rect class="dw-hit" x="${left.toFixed(1)}" y="0" width="${(right - left).toFixed(1)}" height="200" ${pick(r.label, lines)}/>`;
      })
      .join('');
    return (
      frame(
        w,
        paths + hits,
        guides(lo, hi),
        rows.map((r) => r.label),
      ) + legend(s.names, w)
    );
  }

  // ---------- pie / donut: first value column; the 7 biggest, the rest as "Other" ----------
  function pie(w) {
    const s = series(w);
    let parts = s.rows
      .map((r) => ({ label: r.label, v: r.values[0] }))
      .filter((p) => Number.isFinite(p.v) && p.v > 0)
      .sort((a, b) => b.v - a.v);
    if (!parts.length) return empty('No positive numbers to chart in the chosen column.');
    if (parts.length > 7) {
      const other = parts.slice(6).reduce((t, p) => t + p.v, 0);
      parts = [...parts.slice(0, 6), { label: 'Other', v: other }];
    }
    const total = parts.reduce((t, p) => t + p.v, 0);
    const donut = w.options?.donut !== false;
    // A donut is a 26-wide ring; a full pie is a ring as wide as its radius (fills to the middle).
    const R = donut ? 60 : 40;
    const width = donut ? 26 : 80;
    const C = 2 * Math.PI * R;
    let at = 0;
    const pieTip = (p, i) =>
      pick(
        p.label,
        [`${s.names[0] || 'Value'}: ${exact(p.v)}`, `Total: ${exact(total)}`],
        -1,
        `p${i}`,
        pct1(p.v / total),
      );
    const rings = parts
      .map((p, i) => {
        const len = (p.v / total) * C;
        const seg = `<circle class="dw-slice dw-s${i % SERIES}" ${pieTip(p, i)} r="${R}" cx="80" cy="80" stroke-width="${width}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-at).toFixed(2)}"><title>${esc(p.label)}: ${short(p.v)} (${Math.round((p.v / total) * 100)}%)</title></circle>`;
        at += len;
        return seg;
      })
      .join('');
    const middle = donut
      ? `<text class="dw-total" x="80" y="78" text-anchor="middle">${short(total)}</text><text class="dw-axis" x="80" y="95" text-anchor="middle">${esc(String(s.names[0] || 'total').slice(0, 14))}</text>`
      : '';
    return `<div class="dw-pie"><svg viewBox="0 0 160 160" role="img" aria-label="${esc(w.title)}"><g transform="rotate(-90 80 80)">${rings}</g>${middle}</svg><ul class="dw-pie-legend">${parts
      .map(
        (p, i) =>
          `<li ${pieTip(p, i)}><i class="dw-s${i % SERIES}"></i><span>${esc(p.label)}</span><b>${Math.round((p.v / total) * 100)}%</b><small>${short(p.v)}</small></li>`,
      )
      .join('')}</ul></div>`;
  }

  // ---------- progress: each row against a target (a number, or a column of targets) ----------
  function progress(w) {
    const s = series(w);
    const o = w.options || {};
    const rows = s.rows
      .map((r) => {
        const target = o.targetCol !== undefined ? number(r.cells[o.targetCol]) : Number(o.target);
        const v = r.values[0];
        return { ...r, v, target, pct: Number.isFinite(v) && target > 0 ? v / target : NaN };
      })
      .filter((r) => Number.isFinite(r.pct))
      .sort((a, b) => b.pct - a.pct);
    if (!rows.length) return empty('No numbers (or targets) to compare.');
    const done = rows.filter((r) => r.pct >= 1).length;
    return (
      `<div class="dw-progress-summary"><b>${done}</b> of ${rows.length} reached the target${o.targetCol === undefined ? ` (${short(Number(o.target))})` : ''}</div>` +
      `<ol class="dw-bars dw-progress">${rows
        .map(
          (r, i) =>
            `<li class="${r.pct >= 1 ? 'is-done' : ''}${i >= 25 ? ' dw-extra' : ''}" ${pick(r.label, [`${s.names[0] || 'Value'}: ${exact(r.v)} of ${exact(r.target)}`, r.pct >= 1 ? 'Target reached ✓' : `To go: ${exact(r.target - r.v)}`], -1, '', r.pct >= 1 ? '✓ Done' : `${Math.round(r.pct * 100)}%`)}><span class="dw-bar-label" title="${esc(r.label)}">${esc(r.label)}</span><span class="dw-bar-track"><span ${o.scale ? paint(w, 0, 1, 'dw-bar', `width:${Math.min(100, r.pct * 100).toFixed(1)}%`, r.pct) : `class="dw-bar ${r.pct >= 1 ? 'dw-s0' : 'dw-s1'}" style="width:${Math.min(100, r.pct * 100).toFixed(1)}%"`} title="${short(r.v)} of ${short(r.target)}"></span></span><span class="dw-bar-value">${r.pct >= 1 ? '✓ ' : ''}${Math.round(r.pct * 100)}%</span></li>`,
        )
        .join('')}</ol>` +
      (rows.length > 25 ? showAll(rows.length) : '')
    );
  }

  // ---------- table: search, click a heading to sort, optional highlight ----------
  function table(w) {
    const cols = w.data?.columns || [];
    if (!cols.length) return empty('No table yet.');
    const many = (w.data?.rows || []).length > 8;
    return `${many ? '<input type="search" class="dw-search" placeholder="Search…" aria-label="Search this table">' : ''}<div class="dw-table-wrap"><table class="dw-table"><thead><tr>${cols
      .map((c, i) => `<th><button type="button" data-col="${i}">${esc(c)}</button></th>`)
      .join('')}</tr></thead><tbody></tbody></table></div><div class="dw-table-foot"></div>`;
  }

  function fillTable(el, w) {
    const o = w.options || {};
    const body = el.querySelector('tbody');
    const foot = el.querySelector('.dw-table-foot');
    const search = el.querySelector('.dw-search');
    let sortCol = null;
    let desc = true;
    let showAllRows = false;
    const draw = () => {
      const q = (search?.value || '').trim().toLowerCase();
      let rows = (w.data?.rows || []).filter(
        (r) => !q || r.some((c) => String(c).toLowerCase().includes(q)),
      );
      if (sortCol !== null) {
        rows = [...rows].sort((a, b) => {
          const na = number(a[sortCol]);
          const nb = number(b[sortCol]);
          const cmp =
            Number.isFinite(na) && Number.isFinite(nb)
              ? na - nb
              : String(a[sortCol]).localeCompare(String(b[sortCol]), undefined, { numeric: true });
          return desc ? -cmp : cmp;
        });
      }
      const shown = showAllRows ? rows : rows.slice(0, 100);
      body.innerHTML = shown
        .map((r) => {
          const hit = o.highlightCol !== undefined && number(r[o.highlightCol]) >= o.highlightMin;
          return `<tr class="${hit ? 'is-hit' : ''}">${r
            .map((c, i) => `<td>${hit && i === o.highlightCol ? '✓ ' : ''}${esc(c)}</td>`)
            .join('')}</tr>`;
        })
        .join('');
      foot.innerHTML =
        rows.length > shown.length
          ? `<button type="button" class="dw-more">Show all ${rows.length} rows</button>`
          : q
            ? `${rows.length} matching`
            : '';
      el.querySelectorAll('th button').forEach((b) => {
        const on = Number(b.dataset.col) === sortCol;
        b.dataset.sort = on ? (desc ? 'desc' : 'asc') : '';
      });
    };
    el.querySelector('thead').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-col]');
      if (!b) return;
      const c = Number(b.dataset.col);
      desc = sortCol === c ? !desc : true;
      sortCol = c;
      draw();
    });
    foot.addEventListener('click', (e) => {
      if (e.target.closest('.dw-more')) (showAllRows = true), draw();
    });
    search?.addEventListener('input', draw);
    draw();
  }

  const empty = (text) => `<div class="dw-empty">${esc(text)}</div>`;
  const more = (n, cap) =>
    n > cap ? `<div class="dw-note">Showing the first ${cap} of ${n} rows.</div>` : '';
  const showAll = (n) =>
    `<button type="button" class="dw-more" data-show-all>Show all ${n}</button>`;

  /** The chart or table for a widget, as HTML (call mount() after inserting it). */
  function render(w) {
    try {
      return { bar, line, pie, progress, table }[w.type]?.(w) ?? empty('Unknown chart type.');
    } catch (err) {
      return empty(`This chart couldn't be drawn (${err.message}).`);
    }
  }

  /**
   * Chart parts work like territories on the map (js/map.js): hovering one (or tapping it
   * on a phone, or Tab + Enter) gives it the map's glowing outline and fills the info card
   * under the chart. Moving off clears it; a tap or click keeps it until tapped again,
   * Escape, or a tap outside the chart.
   */
  function selectable(el, hint) {
    // The editor's preview box is redrawn in place: drop the listeners of the last drawing.
    el.dwSelectable?.abort();
    const ctl = new AbortController();
    el.dwSelectable = ctl;
    const { signal } = ctl;
    const card = document.createElement('div');
    card.className = 'info-card idle dw-info';
    card.setAttribute('aria-live', 'polite');
    el.append(card);
    let current = null;
    let pinned = false;
    const idle = () => {
      card.classList.add('idle');
      card.innerHTML = `<div class="info-header"><h3>${esc(hint)}</h3></div>`;
    };
    const HL = ['--hl-line', '--hl-glow', '--hl-soft'];
    const unlight = () =>
      el.querySelectorAll('.dw-sel').forEach((x) => {
        x.classList.remove('dw-sel');
        HL.forEach((v) => x.style.removeProperty(v));
      });
    // The highlight takes the part's own colour (its --dw); a part of several colours (a
    // whole stacked row, a line-chart week) keeps the theme's.
    const colourOf = (lit) => {
      const own = (x) => getComputedStyle(x).getPropertyValue('--dw').trim();
      for (const x of lit) if (own(x)) return own(x);
      const inside = new Set(
        [...lit].flatMap((x) => [...x.querySelectorAll('.dw-bar, i')].map(own)).filter(Boolean),
      );
      return inside.size === 1 ? [...inside][0] : '';
    };
    const tint = (x, c) => {
      if (!c) return HL.forEach((v) => x.style.removeProperty(v));
      x.style.setProperty('--hl-line', `color-mix(in srgb, ${c} 60%, white)`);
      x.style.setProperty('--hl-glow', c);
      x.style.setProperty('--hl-soft', `color-mix(in srgb, ${c} 80%, transparent)`);
    };
    const clear = () => {
      unlight();
      tint(card, '');
      current = null;
      pinned = false;
      idle();
    };
    const show = (part) => {
      unlight();
      current = part;
      const key = part.dataset.key;
      const lit = key ? el.querySelectorAll(`[data-key="${CSS.escape(key)}"]`) : [part];
      const colour = colourOf(lit);
      lit.forEach((x) => {
        x.classList.add('dw-sel');
        tint(x, colour);
      });
      tint(card, colour);
      card.classList.remove('idle');
      card.textContent = '';
      const head = document.createElement('div');
      head.className = 'info-header';
      if (part.dataset.badge) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = part.dataset.badge;
        head.append(badge);
      }
      const name = document.createElement('h3');
      name.textContent = part.dataset.tip;
      head.append(name);
      const details = document.createElement('div');
      details.className = 'info-details';
      const on = Number(part.dataset.on);
      part.dataset.lines.split('\n').forEach((line, i) => {
        if (i) {
          const dot = document.createElement('span');
          dot.className = 'info-divider';
          dot.setAttribute('aria-hidden', 'true');
          dot.textContent = '•';
          details.append(dot);
        }
        const item = document.createElement('span');
        item.className = `info-item${i === on ? ' is-on' : ''}`;
        const at = line.indexOf(': ');
        if (at > 0) {
          const label = document.createElement('strong');
          label.textContent = `${line.slice(0, at)}:`;
          item.append(label, ` ${line.slice(at + 2)}`);
        } else item.textContent = line;
        details.append(item);
      });
      card.append(head, details);
    };
    idle();
    const partOf = (e) => {
      const part = e.target.closest?.('[data-tip]');
      return part && el.contains(part) ? part : null;
    };
    el.addEventListener(
      'pointerover',
      (e) => {
        if (e.pointerType !== 'mouse' || pinned) return;
        const part = partOf(e);
        if (part && part !== current) show(part);
      },
      { signal },
    );
    el.addEventListener(
      'pointerleave',
      (e) => {
        if (e.pointerType === 'mouse' && !pinned) clear();
      },
      { signal },
    );
    el.addEventListener(
      'click',
      (e) => {
        const part = partOf(e);
        if (!part) return pinned && !e.target.closest('.dw-info') ? clear() : undefined;
        if (pinned && part === current) return clear();
        show(part);
        pinned = true;
      },
      { signal },
    );
    el.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') return clear();
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-tip]')) {
          e.preventDefault();
          if (pinned && e.target === current) clear();
          else {
            show(e.target);
            pinned = true;
          }
        }
      },
      { signal },
    );
    document.addEventListener(
      'click',
      (e) => {
        if (!el.isConnected) return ctl.abort();
        if (pinned && !el.contains(e.target)) clear();
      },
      { signal },
    );
  }

  /** Makes a rendered widget interactive (table sorting/search, "Show all", tap to read). */
  function mount(el, w) {
    if (w.type === 'table') fillTable(el, w);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-show-all]');
      if (!b) return;
      el.classList.add('dw-show-all');
      b.remove();
    });
    const hint = { bar: 'a bar', line: 'a week', pie: 'a slice', progress: 'a row' }[w.type];
    if (hint && el.querySelector('[data-tip]')) selectable(el, `Tap or hover over ${hint}`);
  }

  window.DashboardWidgets = { parseTable, toText, number, short, render, mount };
})();
