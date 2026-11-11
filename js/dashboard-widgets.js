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
    const columns = Array.from({ length: width }, (_, i) => head[i] || `Column ${i + 1}`);
    return { columns, rows: body.map((r) => columns.map((_, i) => r[i] ?? '')) };
  }

  /** The table back as tab-separated text (to edit it again). */
  function toText(data) {
    const line = (cells) => cells.map((c) => String(c ?? '').replace(/[\t\n]/g, ' ')).join('\t');
    return [line(data?.columns || []), ...(data?.rows || []).map(line)].join('\n');
  }

  /** A number from a cell: "15,000,000", "15M", "1.2k", "3.5B", "45%", "-7"; NaN if none. */
  function number(cell) {
    const m = String(cell ?? '')
      .replace(/[\s,]/g, '')
      .match(/^([-+]?\d*\.?\d+)([kmbt%])?$/i);
    if (!m) return NaN;
    const scale = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[(m[2] || '').toLowerCase()] || 1;
    return Number(m[1]) * scale;
  }

  /** Short form of a number: 15.2M, 1.2K, 980. */
  function short(n) {
    if (!Number.isFinite(n)) return '–';
    const a = Math.abs(n);
    const f = (v, s) => `${(Math.round(v * 10) / 10).toLocaleString()}${s}`;
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

  function legend(names) {
    if (names.length < 2) return '';
    return `<div class="dw-legend">${names
      .map((n, i) => `<span><i class="dw-s${i % SERIES}"></i>${esc(n)}</span>`)
      .join('')}</div>`;
  }

  // ---------- bar: horizontal leaderboard (best first) or vertical bars ----------
  function bar(w) {
    const s = series(w);
    const rows = s.rows.filter((r) => r.values.some(Number.isFinite));
    if (!rows.length) return empty('No numbers to chart in the chosen column.');
    const max = Math.max(...rows.flatMap((r) => r.values.filter(Number.isFinite)), 0) || 1;
    if (w.options?.vertical) {
      const shown = rows.slice(0, 30);
      const groupW = 600 / shown.length;
      const barW = Math.max(2, (groupW * 0.8) / s.values.length);
      const bars = shown
        .map((r, i) =>
          r.values
            .map((v, k) => {
              if (!Number.isFinite(v) || v <= 0) return '';
              const h = (v / max) * 170;
              const x = i * groupW + groupW * 0.1 + k * barW;
              return `<rect class="dw-s${k % SERIES}" x="${x.toFixed(1)}" y="${(190 - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}"><title>${esc(r.label)} · ${esc(s.names[k])}: ${short(v)}</title></rect>`;
            })
            .join(''),
        )
        .join('');
      return (
        frame(
          w,
          bars,
          guides(0, max),
          shown.map((r) => r.label),
        ) +
        legend(s.names) +
        more(rows.length, 30)
      );
    }
    const sorted = [...rows].sort((a, b) => (b.values[0] || 0) - (a.values[0] || 0));
    return (
      `<ol class="dw-bars">${sorted
        .map(
          (r, i) =>
            `<li class="${i >= 25 ? 'dw-extra' : ''}"><span class="dw-bar-label" title="${esc(r.label)}">${esc(r.label)}</span><span class="dw-bar-track">${r.values
              .map((v, k) =>
                Number.isFinite(v)
                  ? `<span class="dw-bar dw-s${k % SERIES}" style="width:${Math.max(0, (v / max) * 100).toFixed(1)}%" title="${esc(s.names[k])}: ${short(v)}"></span>`
                  : '',
              )
              .join('')}</span><span class="dw-bar-value">${short(r.values[0])}</span></li>`,
        )
        .join('')}</ol>` +
      legend(s.names) +
      (sorted.length > 25 ? showAll(sorted.length) : '')
    );
  }

  /**
   * Guide lines across a 600×200 chart for values `lo`…`hi` drawn between y = 190 (lo) and
   * y = 20 (hi), with their values as ordinary text beside the drawing (text inside the SVG
   * would shrink with it on a phone).
   */
  function guides(lo, hi) {
    const ys = [0, 0.5, 1].map((f) => ({ y: 190 - 170 * f, v: lo + (hi - lo) * f }));
    return {
      svg: ys
        .map(({ y }) => `<line class="dw-grid" x1="0" x2="600" y1="${y}" y2="${y}"/>`)
        .join(''),
      labels: ys
        .map(
          ({ y, v }) =>
            `<span class="dw-y" style="top:${((y / 200) * 100).toFixed(1)}%">${short(v)}</span>`,
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
    return (
      frame(
        w,
        paths,
        guides(lo, hi),
        rows.map((r) => r.label),
      ) + legend(s.names)
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
    const rings = parts
      .map((p, i) => {
        const len = (p.v / total) * C;
        const seg = `<circle class="dw-slice dw-s${i % SERIES}" r="${R}" cx="80" cy="80" stroke-width="${width}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-at).toFixed(2)}"><title>${esc(p.label)}: ${short(p.v)} (${Math.round((p.v / total) * 100)}%)</title></circle>`;
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
          `<li><i class="dw-s${i % SERIES}"></i><span>${esc(p.label)}</span><b>${Math.round((p.v / total) * 100)}%</b><small>${short(p.v)}</small></li>`,
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
            `<li class="${r.pct >= 1 ? 'is-done' : ''}${i >= 25 ? ' dw-extra' : ''}"><span class="dw-bar-label" title="${esc(r.label)}">${esc(r.label)}</span><span class="dw-bar-track"><span class="dw-bar ${r.pct >= 1 ? 'dw-s0' : 'dw-s1'}" style="width:${Math.min(100, r.pct * 100).toFixed(1)}%" title="${short(r.v)} of ${short(r.target)}"></span></span><span class="dw-bar-value">${r.pct >= 1 ? '✓ ' : ''}${Math.round(r.pct * 100)}%</span></li>`,
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

  /** Makes a rendered widget interactive (table sorting/search, "Show all"). */
  function mount(el, w) {
    if (w.type === 'table') fillTable(el, w);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-show-all]');
      if (!b) return;
      el.classList.add('dw-show-all');
      b.remove();
    });
  }

  window.DashboardWidgets = { parseTable, toText, number, short, render, mount };
})();
