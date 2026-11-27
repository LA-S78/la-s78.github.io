/**
 * js/sheet-list.js - the sheet picker for a list of players (owner request, 2026-11-27).
 *
 * Shows where a list is in an alliance's own Google Sheet: its tabs, the chosen tab's grid
 * (drag over the list, or tap two corners on a phone), and which column holds the names and,
 * if the sheet has them, the player IDs, scores or points. Used by "Fill from sheet" on the
 * nomination page and the caravan suggestions on the dashboard, so any sheet layout works,
 * as the dashboard's charts do. The server reads and keeps the choice (api/_sheet_list.js).
 *
 *   SheetList.mount(el, {
 *     roles: ['name', 'id', 'score'],      // name is always needed; the rest are optional
 *     preset: { tab, range, cols },        // a known layout (Duel Tools), picked when found
 *     url: '…', link: { tab, gid, range, cols } | null,   // what's saved
 *     ask: (action, body) => Promise<json>,  // 'sheet-tabs' {url}, 'sheet-grid' {url, gid},
 *                                            // 'sheet-link' {link}
 *     onLinked: (result) => {},            // the server's answer to 'sheet-link'
 *   });
 *
 * Strings: the page's `sheet_list` section (_data/<lang>/tools.yml). Styles: the dashboard's
 * grid (.dash-grid) and .sheet-list (_css/portal/70-alliance-dashboard.css).
 */
(function () {
  const L = (key, vars) => t(`sheet_list.${key}`, vars);
  const colIndex = (letters) =>
    [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const colLetter = (i) => {
    let s = '';
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26))
      s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  };
  /** "A1:D20" or "A1:D" → { c1, c2, r1, r2 (Infinity when open) }, or null. */
  function rangeOf(text) {
    const m = /^([A-Z]{1,3})(\d+):([A-Z]{1,3})(\d*)$/i.exec(String(text || '').trim());
    if (!m) return null;
    const c1 = colIndex(m[1].toUpperCase());
    const c2 = colIndex(m[3].toUpperCase());
    const r2 = m[4] ? +m[4] : Infinity;
    return {
      c1: Math.min(c1, c2),
      c2: Math.max(c1, c2),
      r1: Math.min(+m[2], r2),
      r2: Math.max(+m[2], r2),
    };
  }
  const rangeText = (r, toBottom) =>
    `${colLetter(r.c1)}${r.r1}:${colLetter(r.c2)}${toBottom || r.r2 === Infinity ? '' : r.r2}`;

  // A first guess at each column from its heading
  const GUESS = {
    name: /name|player|member|nick|who/i,
    id: /\bid\b|uid|player id/i,
    score: /score|total|points|pts|merit/i,
    points: /points|pts|bank|balance|score/i,
  };

  function mount(el, opts) {
    const roles = opts.roles || ['name'];
    let tabs = [];
    let grid = null; // { letters, rows: [{ n, cells }], more }
    let range = null; // { c1, c2, r1, r2 }
    let cols = {}; // role → index within the range
    let tab = null; // { name, gid }
    let tabsFor = '';
    const saved = opts.link || null;

    el.classList.add('sheet-list');
    el.innerHTML = `
      <p class="dash-muted dash-small">${escapeHtml(L('intro'))}</p>
      <div class="sheet-list-bar">
        <input type="url" class="sl-url" placeholder="https://docs.google.com/spreadsheets/d/…" aria-label="${escapeHtml(L('link_label'))}" autocomplete="off">
        <button type="button" class="btn btn-secondary sl-open">${uiIcon('table')}${escapeHtml(L('open'))}</button>
      </div>
      <p class="dash-muted dash-small sl-status" aria-live="polite"></p>
      <label class="sl-tab-row" hidden>${escapeHtml(L('tab'))}
        <select class="sl-tab" data-site-select data-search="${escapeHtml(L('tab'))}"></select>
      </label>
      <div class="sl-grid-box" hidden>
        <p class="dash-muted dash-small">${escapeHtml(L('grid_help'))}</p>
        <div class="dash-grid sl-grid"></div>
        <p class="dash-muted dash-small sl-grid-note"></p>
      </div>
      <div class="sl-cols" hidden>
        <p class="dash-small sl-range"></p>
        <label class="sl-bottom"><input type="checkbox" class="sl-to-bottom" checked> ${escapeHtml(L('to_bottom'))}</label>
        <div class="sl-roles">${roles
          .map(
            (r) =>
              `<label>${escapeHtml(L(`role_${r}`))}<select data-role="${r}" data-site-select></select></label>`,
          )
          .join('')}</div>
        <p class="dash-muted dash-small">${escapeHtml(L('preview'))}</p>
        <ol class="sl-preview"></ol>
        <button type="button" class="btn sl-use">${uiIcon('check')}${escapeHtml(L('use'))}</button>
        <p class="dash-small sl-error" aria-live="polite"></p>
      </div>`;
    const $ = (sel) => el.querySelector(sel);
    $('.sl-url').value = opts.url || '';
    const status = (text) => ($('.sl-status').textContent = text || '');
    const error = (text) => ($('.sl-error').textContent = text || '');

    async function loadTabs(force) {
      const url = $('.sl-url').value.trim();
      if (!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(url)) {
        status(url ? L('not_sheet') : '');
        return;
      }
      if (url === tabsFor && !force) return;
      tabsFor = url;
      status(L('finding_tabs'));
      try {
        ({ tabs } = await opts.ask('sheet-tabs', { url }));
      } catch (err) {
        tabsFor = '';
        status(err.message);
        return;
      }
      status('');
      const fromLink = (url.match(/gid=(\d+)/) || [])[1];
      const presetTab = opts.preset && tabs.find((x) => x.name === opts.preset.tab);
      const chosen =
        (saved && tabs.find((x) => x.gid === saved.gid)) ||
        presetTab ||
        tabs.find((x) => x.gid === fromLink) ||
        tabs[0];
      $('.sl-tab').innerHTML = tabs
        .map(
          (x) =>
            `<option value="${escapeHtml(x.gid)}"${x === chosen ? ' selected' : ''}>${escapeHtml(x.name)}</option>`,
        )
        .join('');
      $('.sl-tab-row').hidden = false;
      // What was saved (or the Duel Tools layout) is shown picked
      const start =
        saved && chosen.gid === saved.gid ? saved : chosen === presetTab ? opts.preset : null;
      if (start === opts.preset && !saved) status(L('duel_tools', { tab: presetTab.name }));
      loadGrid(chosen, start);
    }

    async function loadGrid(which, start) {
      tab = which;
      grid = null;
      range = null;
      cols = {};
      $('.sl-cols').hidden = true;
      $('.sl-grid-box').hidden = false;
      $('.sl-grid').innerHTML =
        `<div class="dash-muted dash-small">${escapeHtml(L('loading'))}</div>`;
      try {
        ({ grid } = await opts.ask('sheet-grid', {
          url: $('.sl-url').value.trim(),
          gid: which.gid,
        }));
      } catch (err) {
        $('.sl-grid').innerHTML = `<div class="dash-error">${escapeHtml(err.message)}</div>`;
        return;
      }
      drawGrid();
      if (start && rangeOf(start.range)) {
        range = rangeOf(start.range);
        $('.sl-to-bottom').checked = range.r2 === Infinity;
        cols = { ...(start.cols || {}) };
        showCols();
      }
    }

    function drawGrid() {
      const start = colIndex(grid.letters[0] || 'A');
      let html = '<table><thead><tr><th class="corner"></th>';
      grid.letters.forEach((l) => (html += `<th class="col" data-col="${colIndex(l)}">${l}</th>`));
      html += '</tr></thead><tbody>';
      for (const row of grid.rows) {
        html += `<tr><th class="row">${row.n}</th>`;
        row.cells.forEach((v, i) => {
          html += `<td data-c="${start + i}" data-r="${row.n}" title="${escapeHtml(v)}">${escapeHtml(v.length > 18 ? `${v.slice(0, 17)}…` : v)}</td>`;
        });
        html += '</tr>';
      }
      $('.sl-grid').innerHTML = `${html}</tbody></table>`;
      $('.sl-grid-note').textContent = grid.more ? L('grid_more') : '';
      highlight();
    }

    /** A cell's text from the grid ("" when it isn't shown). */
    function cellText(c, r) {
      if (!grid) return '';
      const row = grid.rows.find((x) => x.n === r);
      const i = c - colIndex(grid.letters[0] || 'A');
      return row && i >= 0 ? (row.cells[i] ?? '') : '';
    }
    /** The list's rows as the grid shows them (headings row left out, blank names skipped). */
    function listRows() {
      if (!range || !grid) return [];
      return grid.rows
        .filter((x) => x.n > range.r1 && x.n <= range.r2)
        .map((x) => x.n)
        .filter((n) => cellText(range.c1 + (cols.name ?? 0), n).trim() !== '');
    }

    function highlight(drag) {
      const r = drag || range;
      const mapped = new Set(
        Object.entries(cols)
          .filter(([k]) => k !== 'name')
          .map(([, v]) => v),
      );
      el.querySelectorAll('.sl-grid td, .sl-grid th.col').forEach((cell) => {
        const c = Number(cell.dataset.c ?? cell.dataset.col);
        const inCols = r && c >= r.c1 && c <= r.c2;
        const rel = r ? c - r.c1 : -1;
        const lab = Boolean(inCols && !drag && rel === cols.name);
        const val = Boolean(inCols && !drag && mapped.has(rel));
        if (cell.tagName === 'TH') {
          cell.classList.toggle('is-lab', lab);
          cell.classList.toggle('is-val', val);
          return;
        }
        const n = Number(cell.dataset.r);
        const inside = inCols && n >= r.r1 && n <= r.r2;
        cell.classList.toggle('is-in', Boolean(inside));
        cell.classList.toggle('is-head', Boolean(inside && n === r.r1));
        cell.classList.toggle('is-lab', Boolean(inside && lab));
        cell.classList.toggle('is-val', Boolean(inside && val));
      });
    }

    /** The column choices for the picked cells, a first guess for each, and the preview. */
    function showCols(guess) {
      const width = range.c2 - range.c1 + 1;
      const heads = [];
      for (let i = 0; i < width; i++) heads.push(cellText(range.c1 + i, range.r1));
      if (guess) {
        cols = {};
        const taken = new Set();
        roles.forEach((role) => {
          const i = heads.findIndex((h, j) => !taken.has(j) && GUESS[role] && GUESS[role].test(h));
          if (i >= 0) {
            cols[role] = i;
            taken.add(i);
          }
        });
        if (cols.name === undefined) {
          // The first column that isn't mostly numbers
          const rows = listRows();
          const i = heads.findIndex(
            (_, j) =>
              !taken.has(j) && rows.some((n) => !/^[\d,.\s-]*$/.test(cellText(range.c1 + j, n))),
          );
          cols.name = i >= 0 ? i : 0;
        }
      }
      el.querySelectorAll('.sl-roles select').forEach((sel) => {
        const role = sel.dataset.role;
        const opt = (v, text) =>
          `<option value="${v}"${String(cols[role] ?? '') === String(v) ? ' selected' : ''}>${escapeHtml(text)}</option>`;
        sel.innerHTML =
          (role === 'name' ? '' : opt('', L('none'))) +
          heads.map((h, i) => opt(i, `${colLetter(range.c1 + i)}${h ? ` · ${h}` : ''}`)).join('');
      });
      $('.sl-range').textContent = L('range', {
        range: rangeText(range, $('.sl-to-bottom').checked),
      });
      $('.sl-cols').hidden = false;
      error('');
      preview();
      highlight();
    }

    function preview() {
      const rows = listRows().slice(0, 5);
      const extra = roles.filter((r) => r !== 'name' && cols[r] !== undefined);
      $('.sl-preview').innerHTML = rows.length
        ? rows
            .map((n) => {
              const bits = extra.map((r) => cellText(range.c1 + cols[r], n)).filter(Boolean);
              return `<li><span>${escapeHtml(cellText(range.c1 + cols.name, n))}</span>${bits.length ? `<span class="dash-muted"> · ${escapeHtml(bits.join(' · '))}</span>` : ''}</li>`;
            })
            .join('')
        : `<li class="dash-muted">${escapeHtml(L('no_rows'))}</li>`;
    }

    // Picking the cells: drag with a mouse; on a touch screen, tap one corner then the other
    let anchor = null;
    let dragging = false;
    let pointerKind = 'mouse';
    const cellAt = (ev) => ev.target.closest && ev.target.closest('.sl-grid td');
    const posOf = (cell) => ({ c: Number(cell.dataset.c), r: Number(cell.dataset.r) });
    const pick = (a, b) => ({
      c1: Math.min(a.c, b.c),
      c2: Math.max(a.c, b.c),
      r1: Math.min(a.r, b.r),
      r2: Math.max(a.r, b.r),
    });
    function finish(a, b) {
      const r = pick(a, b);
      anchor = null;
      $('.sl-grid-note').textContent = grid && grid.more ? L('grid_more') : '';
      if (r.r2 === r.r1) return highlight(); // a heading alone isn't a list
      range = r;
      if ($('.sl-to-bottom').checked) range.r2 = Infinity;
      showCols(true);
    }
    const box = $('.sl-grid');
    box.addEventListener('pointerdown', (ev) => {
      pointerKind = ev.pointerType || 'mouse';
      const cell = cellAt(ev);
      if (!cell || pointerKind !== 'mouse' || ev.button !== 0) return;
      ev.preventDefault();
      anchor = posOf(cell);
      dragging = true;
      highlight(pick(anchor, anchor));
    });
    box.addEventListener('pointerover', (ev) => {
      if (!dragging) return;
      const cell = cellAt(ev);
      if (cell) highlight(pick(anchor, (box._last = posOf(cell))));
    });
    document.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      finish(anchor, box._last || anchor);
      box._last = null;
    });
    box.addEventListener('click', (ev) => {
      if (pointerKind === 'mouse') return;
      const cell = cellAt(ev);
      if (!cell) return;
      if (!anchor) {
        anchor = posOf(cell);
        highlight(pick(anchor, anchor));
        $('.sl-grid-note').textContent = L('tap_second');
      } else finish(anchor, posOf(cell));
    });

    $('.sl-open').addEventListener('click', () => loadTabs(true));
    $('.sl-url').addEventListener('change', () => loadTabs());
    $('.sl-tab').addEventListener('change', () => {
      const which = tabs.find((x) => x.gid === $('.sl-tab').value);
      if (which) loadGrid(which, saved && saved.gid === which.gid ? saved : null);
    });
    $('.sl-to-bottom').addEventListener('change', () => {
      if (!range) return;
      if ($('.sl-to-bottom').checked) range.r2 = Infinity;
      else range.r2 = Math.max(range.r1 + 1, ...listRows());
      showCols();
    });
    el.querySelector('.sl-roles').addEventListener('change', (ev) => {
      const sel = ev.target.closest('select[data-role]');
      if (!sel) return;
      if (sel.value === '') delete cols[sel.dataset.role];
      else cols[sel.dataset.role] = Number(sel.value);
      preview();
      highlight();
    });
    $('.sl-use').addEventListener('click', async () => {
      if (!range || !tab) return error(L('pick_first'));
      const btn = $('.sl-use');
      btn.disabled = true;
      error(L('saving'));
      try {
        const out = await opts.ask('sheet-link', {
          link: {
            url: $('.sl-url').value.trim(),
            gid: tab.gid,
            tab: tab.name,
            range: rangeText(range, $('.sl-to-bottom').checked),
            cols,
          },
        });
        error('');
        opts.onLinked && opts.onLinked(out);
      } catch (err) {
        error(err.message);
      } finally {
        btn.disabled = false;
      }
    });

    if ($('.sl-url').value.trim()) loadTabs();
    return { reload: () => loadTabs(true) };
  }

  window.SheetList = { mount };
})();
