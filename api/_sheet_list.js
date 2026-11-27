// api/_sheet_list.js
// A list of players read from an alliance's own Google Sheet (owner request, 2026-11-27):
// the Capitol nominations ("Fill from sheet") and the caravan suggestions. Each alliance
// picks where its list is with the sheet picker (js/sheet-list.js): the tab, the cells, and
// which column holds the names (and, if it likes, the player IDs, scores or points). That
// choice is kept in the alliance's dashboard settings as a "link":
//
//   { url, gid, tab, range: 'A1:D', cols: { name: 0, id: 3, score: 1 },
//     heads: { name: 'Player', … }, at, by }
//
// cols count from the range's first column. heads are the headings seen when it was linked:
// a later read that finds different ones stops (Google gives the first tab when a tab is
// gone, and a sheet's columns can be moved), so a wrong list is never used.
//
// Sheets set up with Duel Tools (WLO's script) work without picking anything: when an
// alliance has no link yet, its tab is read in the script's layout (DUEL_TOOLS below).

import { say } from './_messages.js';
import { fetchSourceTable } from './_google_source.js';

/** Which columns each kind of list has; name is always needed. */
export const LIST_ROLES = {
  capitol: ['name', 'id', 'score'],
  caravan: ['name', 'points'],
};

/** The Duel Tools layout, for alliances with no link yet (headings checked, not week-specific). */
export const DUEL_TOOLS = {
  capitol: {
    tab: 'Capitol Ranking',
    range: 'A1:D',
    cols: { name: 0, score: 1, id: 3 },
    heads: { name: 'Player', score: 'Score' },
  },
  caravan: {
    tab: 'Caravan Bank',
    range: 'I1:J30',
    cols: { name: 0, points: 1 },
    heads: { name: 'Suggested this week' },
  },
};

const MAX_WIDTH = 26;
const MAX_ROWS = 60;

const colIndex = (letters) =>
  [...letters.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** A heading as compared: letter case, numbers and bracketed bits ignored ("… (5 of 7)"). */
export const sameHeading = (a, b) => {
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^\p{L}]+/gu, ' ')
      .trim();
  return norm(a) === norm(b);
};

/** The number in a cell ("170,266,990" → 170266990), or null. */
const numberIn = (v) => {
  const s = String(v ?? '').replace(/[,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
};

/**
 * A link as sent by the page, checked and cut down to what's kept (heads are added when it's
 * read). Returns { link } or { error }.
 */
export function cleanLink(raw, kind) {
  const roles = LIST_ROLES[kind];
  const r = raw && typeof raw === 'object' ? raw : {};
  const url = String(r.url || '')
    .trim()
    .slice(0, 500);
  if (!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(url)) {
    return { error: say('api_sheets.full_link') };
  }
  const range = String(r.range || '')
    .trim()
    .toUpperCase();
  const m = /^([A-Z]{1,3})(\d{1,7}):([A-Z]{1,3})(\d{0,7})$/.exec(range);
  if (!m) return { error: say('api_sheets.list_range') };
  const width = colIndex(m[3]) - colIndex(m[1]) + 1;
  if (width < 1 || width > MAX_WIDTH) return { error: say('api_sheets.list_range') };
  const cols = {};
  for (const role of roles) {
    const v = r.cols?.[role];
    if (v === null || v === undefined || v === '') continue;
    const i = Number(v);
    if (!Number.isInteger(i) || i < 0 || i >= width) return { error: say('api_sheets.list_range') };
    cols[role] = i;
  }
  if (cols.name === undefined) return { error: say('api_sheets.list_name_needed') };
  return {
    link: {
      url,
      gid: String(r.gid || '').replace(/\D/g, ''),
      tab: String(r.tab || '')
        .trim()
        .slice(0, 100),
      range,
      cols,
    },
  };
}

/**
 * Reads the list a link points at: { rows: [{ name, id?, score?, points? }], heads, week }.
 * Throws an Error written for the leader (a changed sheet, no names, Google's own errors).
 * With no gid the tab is found by its name (Duel Tools' layout).
 */
export async function readList(link, kind) {
  const roles = LIST_ROLES[kind];
  const data = await fetchSourceTable({
    kind: 'sheet',
    url: link.url,
    gid: link.gid,
    sheet: link.gid ? '' : link.tab,
    range: link.range,
    headerRows: 1,
  });
  // The headings must be the ones seen when it was linked
  for (const role of roles) {
    const i = link.cols[role];
    const was = link.heads?.[role];
    if (i === undefined || !was) continue;
    if (!sameHeading(data.columns[i], was)) {
      throw Object.assign(
        new Error(say('api_sheets.list_changed', { tab: link.tab || '?', heading: was })),
        { code: 'changed' },
      );
    }
  }
  const rows = [];
  for (const r of data.rows) {
    const name = String(r[link.cols.name] ?? '').trim();
    // Duel Tools writes a note under its suggestions; a list ends there
    if (name.startsWith('⚠') || /^worked out/i.test(name)) break;
    if (!name) continue;
    const row = { name };
    if (link.cols.id !== undefined) {
      const id = String(r[link.cols.id] ?? '').replace(/\D/g, '');
      if (id.length >= 6 && id.length <= 20) row.id = id;
    }
    for (const role of ['score', 'points']) {
      if (link.cols[role] !== undefined) row[role] = numberIn(r[link.cols[role]]);
    }
    rows.push(row);
    if (rows.length >= MAX_ROWS) break;
  }
  if (!rows.length) throw new Error(say('api_sheets.list_no_names', { tab: link.tab || '?' }));
  const heads = {};
  for (const role of roles) {
    if (link.cols[role] !== undefined) heads[role] = data.columns[link.cols[role]] || '';
  }
  // A "Week" column (Duel Tools), shown with the list
  const weekCol = data.columns.findIndex((c) => /^week$/i.test(String(c).trim()));
  const week = weekCol >= 0 ? String(data.rows[0]?.[weekCol] || '') : '';
  return { rows, heads, week };
}

/**
 * The alliance's list: from its saved link, else (with only a sheet address saved, from
 * before links) the Duel Tools tab. Returns { rows, heads, week, link } or throws; an error
 * with code 'no_link' means the leader needs to pick where the list is.
 */
export async function readSavedList(settings, kind) {
  const saved = settings?.[`${kind}Link`];
  if (saved && saved.url) return { ...(await readList(saved, kind)), link: saved };
  const url = settings?.sheetUrl || settings?.capitolSheet;
  if (!url) throw Object.assign(new Error(say('api_sheets.list_pick')), { code: 'no_link' });
  const link = { url, gid: '', ...DUEL_TOOLS[kind] };
  try {
    return { ...(await readList(link, kind)), link: null };
  } catch (err) {
    // Not a Duel Tools sheet (or not set up yet): the leader picks the list instead. Only a
    // sheet Google won't share is worth saying as it is.
    if (err.message !== say('api_sheets.sheet_not_shared')) {
      throw Object.assign(new Error(say('api_sheets.list_pick')), { code: 'no_link' });
    }
    throw err;
  }
}

/** A newly linked list: read once (so it's known to work), with its headings kept. */
export async function linkList(raw, kind, who) {
  const { link, error } = cleanLink(raw, kind);
  if (error) throw new Error(error);
  const read = await readList(link, kind);
  const saved = { ...link, heads: read.heads, at: new Date().toISOString(), by: who || '' };
  return { ...read, link: saved };
}
