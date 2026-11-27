// api/_google_source.js
// Reads a table from a Google Sheet or Google Doc for the Alliance Dashboard
// (docs/DECISIONS.md, "Alliance Dashboard"). Helpers, not an endpoint.
//
// Only Google's own addresses are fetched (docs.google.com, and the googleusercontent.com
// hosts its downloads redirect to), with a timeout and a size cap, so a dashboard can't be
// used to make the server fetch anything else.

import { say, sayCount } from './_messages.js';

/** An error whose message is written for the leader (shown as it is). */
const forLeader = (message) => Object.assign(new Error(message), { forLeader: true });

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;

/** Is this a host we may fetch from? */
export function isGoogleHost(host) {
  const h = String(host || '').toLowerCase();
  return h === 'docs.google.com' || /^[a-z0-9-]+\.googleusercontent\.com$/.test(h);
}

/**
 * Works out what to download for a link a leader pasted.
 * @param {{ kind: 'sheet'|'doc', url: string, sheet?: string, range?: string, table?: number }} src
 * @returns {{ fetchUrl: string, format: 'csv'|'html', table: number } | { error: string }}
 */
export function sourceRequest(src) {
  let url;
  try {
    url = new URL(String(src?.url || '').trim());
  } catch {
    return { error: say('api_sheets.full_link') };
  }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') {
    return { error: say('api_sheets.google_only') };
  }
  const parts = url.pathname.split('/').filter(Boolean);
  // A tab picked in the sheet picker comes as src.gid; else the one in the link, if any
  const gid =
    String(src?.gid || '').replace(/\D/g, '') ||
    url.searchParams.get('gid') ||
    (url.hash.match(/gid=(\d+)/) || [])[1] ||
    '';
  const range = String(src.range || '').trim();
  if (range && !/^[A-Za-z]{1,3}\d{0,7}(:[A-Za-z]{1,3}\d{0,7})?$/.test(range)) {
    return { error: say('api_sheets.range_format') };
  }
  const table = Math.max(1, Math.min(50, parseInt(src.table, 10) || 1));

  if (parts[0] === 'spreadsheets' && parts[1] === 'd') {
    if (parts[2] === 'e' && parts[3]) {
      // Published to the web: /spreadsheets/d/e/<id>/pub(html)
      const q = new URLSearchParams({ output: 'csv' });
      if (gid) q.set('gid', gid), q.set('single', 'true');
      if (range) q.set('range', range);
      return {
        fetchUrl: `https://docs.google.com/spreadsheets/d/e/${encodeURIComponent(parts[3])}/pub?${q}`,
        format: 'csv',
        table,
      };
    }
    if (parts[2]) {
      // Shared ("anyone with the link"): /spreadsheets/d/<id>/edit
      const q = new URLSearchParams({ tqx: 'out:csv' });
      const sheet = String(src.sheet || '')
        .trim()
        .slice(0, 100);
      if (sheet) q.set('sheet', sheet);
      else if (gid) q.set('gid', gid);
      if (range) q.set('range', range);
      // Charts set up with the sheet preview (2026-11-23): exactly one header row, the first
      // row of the range, as the preview shows it. Google otherwise guesses, and may merge two
      // rows into the header ("7/20 K65" + "STAR"), so the rows wouldn't match the preview.
      if (src.headerRows === 1) q.set('headers', '1');
      return {
        fetchUrl: `https://docs.google.com/spreadsheets/d/${encodeURIComponent(parts[2])}/gviz/tq?${q}`,
        format: 'csv',
        table,
      };
    }
  }
  if (parts[0] === 'document' && parts[1] === 'd') {
    if (parts[2] === 'e' && parts[3]) {
      return {
        fetchUrl: `https://docs.google.com/document/d/e/${encodeURIComponent(parts[3])}/pub`,
        format: 'html',
        table,
      };
    }
    if (parts[2]) {
      return {
        fetchUrl: `https://docs.google.com/document/d/${encodeURIComponent(parts[2])}/export?format=html`,
        format: 'html',
        table,
      };
    }
  }
  return { error: say('api_sheets.not_sheet_or_doc') };
}

/** A CSV text as rows of cells ("quoted, cells" and doubled quotes allowed). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') row.push(cell), (cell = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      (row = []), (cell = '');
    } else cell += ch;
  }
  if (cell !== '' || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function text(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (m, e) => {
      if (e[0] === '#') {
        const code =
          e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** The `n`th (1-based) <table> of an HTML page as rows of plain-text cells, or null. */
export function htmlTable(html, n = 1) {
  const tables = String(html || '').match(/<table[\s\S]*?<\/table>/gi) || [];
  const t = tables[n - 1];
  if (!t) return null;
  return (t.match(/<tr[\s\S]*?<\/tr>/gi) || [])
    .map((tr) => (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(text))
    .filter((r) => r.some((c) => c !== ''));
}

/** Rows (first = header) as the dashboard's { columns, rows }. */
export function toData(rows) {
  if (!rows || !rows.length) return { columns: [], rows: [] };
  const [head, ...body] = rows;
  const width = Math.max(...rows.map((r) => r.length));
  // A heading merged over two columns arrives as a name then a blank: "<name> (2)", as when pasted.
  const columns = [];
  let last = '';
  let n = 1;
  for (let i = 0; i < width; i++) {
    const h = String(head[i] ?? '').trim();
    if (h) (columns[i] = h), (last = h), (n = 1);
    else columns[i] = last ? `${last} (${++n})` : `Column ${i + 1}`;
  }

  return { columns, rows: body.map((r) => columns.map((_, i) => String(r[i] ?? '').trim())) };
}

/** GET with redirects followed by hand, so every hop must be a Google host. */
async function googleGet(url, { timeoutMs }) {
  const signal = AbortSignal.timeout(timeoutMs);
  let at = url;
  for (let hop = 0; hop < 5; hop++) {
    if (!isGoogleHost(new URL(at).hostname)) {
      throw forLeader(say('api_sheets.unexpected_redirect'));
    }
    const res = await fetch(at, {
      redirect: 'manual',
      signal,
      headers: { 'User-Agent': 'LA-S78-Dashboard' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      at = new URL(res.headers.get('location'), at).href;
      // Google sends a sheet or Doc that isn't shared to its sign-in page.
      if (new URL(at).hostname === 'accounts.google.com') return { status: 403, signIn: true };
      continue;
    }
    return res;
  }
  throw forLeader(say('api_sheets.too_many_redirects'));
}

/**
 * Downloads and reads the table.
 * @returns {Promise<{ columns: string[], rows: string[][] }>}
 * @throws {Error} with a message for the leader
 */
export async function fetchSourceTable(src, { timeoutMs = TIMEOUT_MS } = {}) {
  const req = sourceRequest(src);
  if (req.error) throw new Error(req.error);
  let res;
  try {
    res = await googleGet(req.fetchUrl, { timeoutMs });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw forLeader(say('api_sheets.too_slow'));
    }
    throw err.forLeader ? err : forLeader(say('api_sheets.unreachable', { reason: err.message }));
  }
  const notShared =
    src.kind === 'doc' ? say('api_sheets.doc_not_shared') : say('api_sheets.sheet_not_shared');
  if (res.status === 401 || res.status === 403 || res.status === 404) throw new Error(notShared);
  if (!res.ok) throw new Error(say('api_sheets.google_error', { status: res.status }));
  const length = Number(res.headers.get('content-length') || 0);
  if (length > MAX_BYTES) throw new Error(say('api_sheets.too_large'));
  const body = await res.text();
  if (body.length > MAX_BYTES) throw new Error(say('api_sheets.too_large'));
  const type = res.headers.get('content-type') || '';

  if (req.format === 'csv') {
    // A sign-in page instead of a CSV: the sheet isn't shared.
    if (/text\/html/i.test(type) || /^\s*<!doctype html|^\s*<html/i.test(body))
      throw new Error(notShared);
    const data = toData(parseCsv(body));
    if (!data.columns.length) throw new Error(say('api_sheets.empty'));
    return data;
  }
  if (/accounts\.google\.com|ServiceLogin/i.test(body)) throw new Error(notShared);
  const rows = htmlTable(body, req.table);
  if (!rows) {
    const count = (body.match(/<table/gi) || []).length;
    throw new Error(
      count
        ? sayCount('api_sheets.no_such_table', count, { table: req.table })
        : say('api_sheets.no_table'),
    );
  }
  return toData(rows);
}

// ---------------------------------------------------------------------------------------
// The sheet preview (owner request, 2026-11-23): a sheet's tabs, and one tab's grid as the
// sheet shows it (column letters, row numbers, merged cells), so a leader can pick a range by
// dragging over it instead of typing one. Only for the dashboard editor; the chart's own
// data is still read as above.
// ---------------------------------------------------------------------------------------

/** The sheet a link points at: { id, published } or { error }. */
export function sheetOf(urlText) {
  let url;
  try {
    url = new URL(String(urlText || '').trim());
  } catch {
    return { error: say('api_sheets.full_link') };
  }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') {
    return { error: say('api_sheets.google_only') };
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'spreadsheets' || parts[1] !== 'd' || !parts[2]) {
    return { error: say('api_sheets.not_sheet_or_doc') };
  }
  if (parts[2] === 'e' && parts[3]) return { id: parts[3], published: true };
  return { id: parts[2], published: false };
}

const sheetBase = ({ id, published }) =>
  published
    ? `https://docs.google.com/spreadsheets/d/e/${encodeURIComponent(id)}/pubhtml`
    : `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/htmlview`;

/** Reads a page of the sheet's own HTML view (with the usual checks). */
async function sheetPage(url, { timeoutMs }) {
  let res;
  try {
    res = await googleGet(url, { timeoutMs });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw forLeader(say('api_sheets.too_slow'));
    }
    throw err.forLeader ? err : forLeader(say('api_sheets.unreachable', { reason: err.message }));
  }
  if (res.signIn || [401, 403, 404].includes(res.status)) {
    throw forLeader(say('api_sheets.sheet_not_shared'));
  }
  if (!res.ok) throw forLeader(say('api_sheets.google_error', { status: res.status }));
  const body = await res.text();
  if (body.length > MAX_BYTES) throw forLeader(say('api_sheets.too_large'));
  if (/accounts\.google\.com\/(ServiceLogin|v3\/signin)/i.test(body.slice(0, 5000))) {
    throw forLeader(say('api_sheets.sheet_not_shared'));
  }
  return body;
}

/** The sheet's tabs, in order: [{ name, gid }]. */
export function tabsFromHtml(html) {
  const tabs = [];
  const seen = new Set();
  const add = (name, gid) => {
    const n = text(
      String(name)
        .replace(/\\\//g, '/')
        .replace(/\\u([0-9a-f]{4})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))),
    );
    if (!gid || seen.has(gid)) return;
    seen.add(gid);
    tabs.push({ name: n, gid: String(gid) });
  };
  // Shared view: a script list { name: "…", pageUrl: "…gid=N" }
  for (const m of String(html).matchAll(/\{name: "((?:[^"\\]|\\.)*)", pageUrl: "[^"]*?gid=(\d+)/g))
    add(m[1], m[2]);
  // Published view: <li id="sheet-button-N"><a …>Name</a>
  for (const m of String(html).matchAll(/id="sheet-button-(\d+)"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/g))
    add(m[2], m[1]);
  return tabs;
}

export async function fetchSheetTabs(src, { timeoutMs = TIMEOUT_MS } = {}) {
  const sheet = sheetOf(src?.url);
  if (sheet.error) throw new Error(sheet.error);
  const tabs = tabsFromHtml(await sheetPage(sheetBase(sheet), { timeoutMs }));
  if (!tabs.length) throw forLeader(say('api_sheets.no_tabs'));
  return tabs.slice(0, 200);
}

/** Column letters for a 0-based index: 0 → A, 26 → AA. */
export const columnLetter = (i) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

const GRID_ROWS = 200;
const GRID_COLS = 60;

/**
 * One tab's grid from the sheet's HTML view (the table Google draws, with letters along the
 * top and row numbers down the side): { letters, rows: [{ n, cells }], more }. A merged cell's
 * text is in its first cell; the cells it covers are blank. Freeze bars (columns or rows
 * without a letter or number) are left out, so positions match the sheet's own.
 */
export function gridFromHtml(html) {
  const table = (String(html).match(/<table[^>]*class="[^"]*waffle[^"]*"[\s\S]*?<\/table>/i) ||
    [])[0];
  if (!table) return null;
  const trs = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const grid = [];
  trs.forEach((tr, r) => {
    grid[r] = grid[r] || [];
    let c = 0;
    for (const m of tr.matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      while (grid[r][c] !== undefined) c++;
      const attrs = m[2];
      const cs = Math.min(
        GRID_COLS + 2,
        parseInt((attrs.match(/colspan="(\d+)"/i) || [])[1], 10) || 1,
      );
      const rs = Math.min(
        GRID_ROWS + 2,
        parseInt((attrs.match(/rowspan="(\d+)"/i) || [])[1], 10) || 1,
      );
      const value = text(m[3]);
      for (let dr = 0; dr < rs; dr++) {
        grid[r + dr] = grid[r + dr] || [];
        for (let dc = 0; dc < cs; dc++) grid[r + dr][c + dc] = dr || dc ? '' : value;
      }
      c += cs;
    }
  });
  if (!grid.length) return null;
  // The first row holds the letters; the first cell of each row its number
  const head = grid[0];
  const keep = [];
  head.forEach((h, i) => {
    if (i > 0 && /^[A-Z]{1,3}$/.test(h || '')) keep.push(i);
  });
  const rows = [];
  for (let r = 1; r < grid.length; r++) {
    const n = parseInt(grid[r]?.[0], 10);
    if (!Number.isInteger(n)) continue;
    rows.push({ n, cells: keep.slice(0, GRID_COLS).map((i) => grid[r][i] ?? '') });
  }
  // Rows after the last one with anything in it aren't needed
  let last = rows.length;
  while (last > 0 && rows[last - 1].cells.every((v) => v === '')) last--;
  return {
    letters: keep.slice(0, GRID_COLS).map((i) => head[i]),
    rows: rows.slice(0, Math.min(last, GRID_ROWS)),
    more: last > GRID_ROWS || keep.length > GRID_COLS,
  };
}

export async function fetchSheetGrid(src, { timeoutMs = TIMEOUT_MS } = {}) {
  const sheet = sheetOf(src?.url);
  if (sheet.error) throw new Error(sheet.error);
  const gid = String(src?.gid || '').replace(/\D/g, '');
  const url = `${sheetBase(sheet)}/sheet?headers=true${gid ? `&gid=${gid}` : ''}`;
  const grid = gridFromHtml(await sheetPage(url, { timeoutMs }));
  if (!grid || !grid.rows.length) throw forLeader(say('api_sheets.empty'));
  return grid;
}

// ---------------------------------------------------------------------------------------
// Across tabs (owner request, 2026-11-23, part 3 of the duel charts): the same range from
// several tabs, e.g. one tab per week ("06/14 Duel", "06/21 …"). The leader names the
// tabs with a pattern (# is any number, * anything: "#/# *") and how many of the newest
// to read (2–10). Each tab's columns are matched to the newest tab's by their heading.
// ---------------------------------------------------------------------------------------

export const MAX_TABS = 10;

/** A pattern for tabs like this one: its first word with numbers as #, then " *". */
export function tabPattern(name) {
  const words = String(name || '')
    .trim()
    .split(/\s+/);
  if (!words[0]) return '';
  return `${words[0].replace(/\d+/g, '#')}${words.length > 1 ? ' *' : ''}`;
}

/** The pattern as a test: # one or more digits, * anything, letter case ignored. */
export function patternTest(pattern) {
  const p = String(pattern || '').trim();
  if (!p) return () => false;
  const body = p
    .split('')
    .map((ch) =>
      ch === '#'
        ? '\\d+'
        : ch === '*'
          ? '.*'
          : /\s/.test(ch)
            ? '\\s+'
            : ch.replace(/[.+?^${}()|[\]\\/-]/g, '\\$&'),
    )
    .join('')
    .replace(/(\\d\+)+/g, '\\d+');
  const re = new RegExp(`^${body}$`, 'i');
  return (name) => re.test(String(name || '').trim());
}

/** The date a tab's name starts with ("06/14 Duel"), as a number to compare, or null. */
const dateKey = (name) => {
  const m = /^(\d{1,2})[/.-](\d{1,2})(?![\d])/.exec(String(name || '').trim());
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
};

/**
 * The tabs to read: those matching the pattern, the newest `count`, oldest first. Which end
 * of the sheet holds the newest is worked out from the dates the names start with (most
 * neighbouring pairs decide, so the turn of the year doesn't); without dates, the last tab
 * is the newest (where Google adds a new tab).
 */
export function pickTabs(tabs, { pattern, count }) {
  const test = patternTest(pattern);
  const matched = (tabs || []).filter((t) => test(t.name));
  const n = Math.max(2, Math.min(MAX_TABS, parseInt(count, 10) || MAX_TABS));
  let vote = 0;
  for (let i = 1; i < matched.length; i++) {
    const a = dateKey(matched[i - 1].name);
    const b = dateKey(matched[i].name);
    if (a !== null && b !== null && a !== b) vote += a > b ? 1 : -1;
  }
  const newestFirst = vote > 0;
  const chosen = newestFirst ? matched.slice(0, n) : matched.slice(-n);
  return newestFirst ? chosen.reverse() : chosen;
}

/** The link pointing at one tab (by its gid). */
function linkToTab(url, gid) {
  const u = new URL(String(url).trim());
  u.searchParams.delete('gid');
  u.hash = `gid=${gid}`;
  return u.href;
}

const headingKey = (h) =>
  String(h ?? '')
    .trim()
    .toLowerCase();

/** A tab's rows with its columns put in the order of `columns` (matched by heading). */
export function alignRows(columns, data) {
  const where = columns.map((c, i) => {
    const j = data.columns.findIndex((h) => headingKey(h) === headingKey(c));
    if (j >= 0) return j;
    // A heading that isn't there: the same place, if that place's heading isn't used elsewhere
    const at = data.columns[i];
    return at !== undefined && !columns.some((h) => headingKey(h) === headingKey(at)) ? i : -1;
  });
  return data.rows.map((r) => where.map((j) => (j >= 0 ? (r[j] ?? '') : '')));
}

/** At most this many tabs are read at once (Gemini's review: fewer bursts at Google). */
const TAB_CONCURRENCY = 4;
/** All of a multi-tab read must be done within this (the function may run 30 s; vercel.json). */
const TABS_BUDGET_MS = 20000;

/**
 * Reads the range from each chosen tab: { columns, rows, tab, older: [{ name, rows }] }, with
 * the newest tab's rows as `rows` (so every chart works as before) and the others in `older`,
 * oldest first. A tab that can't be read is left out (`skipped`), unless it's the newest.
 * Read 4 at a time (newest first), each within the usual timeout and one shared deadline: a
 * tab still waiting when the time is up is skipped, so a slow one can't fail the whole call
 * (Gemini's review, 2026-11-23).
 */
export async function fetchSourceTabs(
  src,
  { timeoutMs = TIMEOUT_MS, budgetMs = TABS_BUDGET_MS } = {},
) {
  const deadline = Date.now() + budgetMs;
  const left = () => deadline - Date.now();
  const tabs = pickTabs(
    await fetchSheetTabs(src, { timeoutMs: Math.min(timeoutMs, left()) }),
    src.tabs || {},
  );
  if (tabs.length < 2) throw forLeader(say('api_sheets.tabs_too_few'));
  const results = new Array(tabs.length);
  // Newest first, so the one the chart can't do without goes first
  const queue = tabs.map((_, i) => i).reverse();
  const worker = async () => {
    while (queue.length) {
      const i = queue.shift();
      const time = Math.min(timeoutMs, left());
      if (time < 1000) {
        results[i] = { status: 'rejected', reason: forLeader(say('api_sheets.too_slow')) };
        continue;
      }
      try {
        const value = await fetchSourceTable(
          { ...src, url: linkToTab(src.url, tabs[i].gid), sheet: '', tabs: undefined },
          { timeoutMs: time },
        );
        results[i] = { status: 'fulfilled', value };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(TAB_CONCURRENCY, tabs.length) }, worker));
  const newest = results[results.length - 1];
  if (newest.status === 'rejected') throw newest.reason;
  const { columns, rows } = newest.value;
  const older = [];
  const skipped = [];
  results.slice(0, -1).forEach((r, i) => {
    if (r.status === 'fulfilled')
      older.push({ name: tabs[i].name, rows: alignRows(columns, r.value) });
    else skipped.push(tabs[i].name);
  });
  return { columns, rows, tab: tabs[tabs.length - 1].name, older, skipped };
}
