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
  const gid = url.searchParams.get('gid') || (url.hash.match(/gid=(\d+)/) || [])[1] || '';
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
