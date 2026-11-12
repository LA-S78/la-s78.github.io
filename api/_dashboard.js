// api/_dashboard.js
// The Alliance Dashboard's data and rules (api/dashboard.js is the endpoint). Helpers, not
// an endpoint.
//
// Storage: one Gist file per alliance, `dashboard-<TAG>.json` (docs/DECISIONS.md,
// "Alliance Dashboard"): small files keep every page's Gist read fast, stay well under
// GitHub's 1 MB per-file limit, and two alliances editing at once never touch the same file.

import { getAllianceNominationQuota, quotaIfWon } from './_rewards_helper.js';
import { chestCounts } from './_nomination_assign.js';
import { describeRewardPeriod } from './_reward_period.js';
import { sourceRequest } from './_google_source.js';

/** Most bytes one alliance's dashboard file may hold (thousands of table rows). */
export const MAX_DASHBOARD_BYTES = 150 * 1024;

/** Tags compared without letter case or accents (RÂVN = ravn). */
export function foldTag(tag) {
  return String(tag || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** The alliance's key in map-state.json for a tag written any way, or null. */
export function findAllianceKey(alliances = {}, tag) {
  const want = foldTag(tag);
  if (!want) return null;
  return Object.keys(alliances).find((key) => foldTag(key) === want) || null;
}

/** The Gist file holding an alliance's dashboard (letters and digits only: RÂVN -> RAVN). */
export function dashboardFile(tag) {
  const slug = foldTag(tag)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return `dashboard-${slug || 'UNKNOWN'}.json`;
}

/**
 * An alliance's stored dashboard, filled in with defaults. `settings` and `tickets` are kept
 * for later features (e.g. help tickets) so they can be added without changing the format.
 */
export function readDashboard(gistFileJson, tag) {
  const d = gistFileJson && typeof gistFileJson === 'object' ? gistFileJson : {};
  return {
    alliance: tag,
    widgets: Array.isArray(d.widgets) ? d.widgets : [],
    settings: d.settings && typeof d.settings === 'object' ? d.settings : {},
    tickets: d.tickets ?? null,
    caravan: readCaravan(d.caravan),
    updatedAt: d.updatedAt || null,
    updatedBy: d.updatedBy || null,
  };
}

/**
 * What a viewer may see of a dashboard. Members get only what leadership marked for all
 * members; leaders (R4/R5/officers) and Stewards get everything. Enforced here, on the
 * server, so hidden parts never reach a member's browser.
 */
export function visibleDashboard(dashboard, leader) {
  const widgets = dashboard.widgets.filter((w) => leader || w?.visibility === 'members');
  const out = { alliance: dashboard.alliance, widgets, updatedAt: dashboard.updatedAt };
  if (leader) out.settings = dashboard.settings;
  // The Caravan Rotor: leaders always; members only when leaders let them (read-only, and
  // without which officer ticked each name).
  const c = dashboard.caravan;
  if (leader) out.caravan = c;
  else if (c.membersCanView) {
    out.caravan = {
      membersCanView: true,
      weekStartedAt: c.weekStartedAt,
      roster: c.roster.map(({ id, name, from, to, picked }) => ({
        id,
        name,
        from,
        to,
        picked: picked ? { at: picked.at } : null,
      })),
    };
  }
  return out;
}

/**
 * Who is looking, from the signed login pass: 'member' (sees members-only parts),
 * 'leader' (R4, R5 or an alliance officer: sees everything), 'steward' (any alliance).
 * canNominate: R5s and Stewards may open the nomination page from the dashboard (owner
 * decision); R4s and officers see the status and use /nominate in Discord.
 */
export function viewerAccess(session, steward) {
  const leader = steward || session.role === 'R4' || session.role === 'R5';
  return {
    tier: steward ? 'steward' : leader ? 'leader' : 'member',
    leader,
    canNominate: steward || session.role === 'R5',
  };
}

/**
 * The officers' weekly reward card: the period, set 2's state, this alliance's chests now
 * and if won, buyout changes, and whether its list was sent.
 */
export function rewardStatus({ tag, rewardsData, mapState, nominations, period }) {
  const current = !period.open || !rewardsData.period || rewardsData.period.id === period.id;
  const view = current ? rewardsData : { ...rewardsData, mode: 'standard', period: null };
  const quota = getAllianceNominationQuota(tag, view, mapState);
  const entry = current ? nominations?.[tag] : null;
  const chests = chestCounts(quota, quota.isKW);
  const count = (c) =>
    Object.values(c || {}).reduce(
      (sum, pool) => sum + Object.values(pool || {}).reduce((a, n) => a + Number(n || 0), 0),
      0,
    );
  return {
    period: describeRewardPeriod(period, rewardsData),
    rank: Number.isFinite(quota.rank) && quota.rank <= 50 ? quota.rank : null,
    chests,
    chestsIfWon: chestCounts(quotaIfWon(tag, view, mapState), true),
    totalNow: count(chests),
    hasBuyoutBonus: Boolean(quota.hasBuyoutBonus),
    isWloDeducted: Boolean(quota.isWloDeducted),
    buyoutThreat: quota.buyoutDetails?.threat || null,
    nomination: entry
      ? {
          submitted: true,
          ranked: Array.isArray(entry.ranked) ? entry.ranked.length : 0,
          reserves: Array.isArray(entry.reserves) ? entry.reserves.length : 0,
          unfilled: Number(entry.unfilled || 0),
          submittedAt: entry.submittedAt || null,
        }
      : { submitted: false },
  };
}

// ---------------------------------------------------------------------------------------
// Widgets: charts and tables leaders add to their dashboard.

/** Limits per alliance, so a giant sheet can't bloat the Gist. */
export const LIMITS = Object.freeze({
  widgets: 20,
  rows: 500,
  columns: 12,
  cellChars: 100,
  titleChars: 80,
  noteChars: 400,
});

export const WIDGET_TYPES = ['bar', 'line', 'pie', 'progress', 'table'];

const clip = (v, n) =>
  String(v ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .slice(0, n);
const colIndex = (v, columns) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < columns ? n : null;
};

/**
 * Checks a widget sent from the editor and returns { widget } (cleaned: only known fields,
 * text trimmed to the limits) or { error } (a message for the leader).
 * Shape: { id, type, title, note, visibility: 'members'|'r4_only', source: { kind: 'paste' },
 *   data: { columns: [...], rows: [[...], ...] }, options: { labelCol, valueCols, vertical,
 *   donut, target, targetCol, highlightCol, highlightMin } }
 */
export function cleanWidget(input, { actor = '', now = new Date().toISOString() } = {}) {
  const w = input && typeof input === 'object' ? input : {};
  if (!WIDGET_TYPES.includes(w.type)) return { error: 'Choose a chart or table type.' };
  const title = clip(w.title, LIMITS.titleChars).trim();
  if (!title) return { error: 'Give the chart or table a title.' };

  const data = w.data && typeof w.data === 'object' ? w.data : {};
  const rawColumns = Array.isArray(data.columns) ? data.columns : [];
  const rawRows = Array.isArray(data.rows) ? data.rows : [];
  if (rawColumns.length > LIMITS.columns) {
    return { error: `At most ${LIMITS.columns} columns (this table has ${rawColumns.length}).` };
  }
  if (rawRows.length > LIMITS.rows) {
    return { error: `At most ${LIMITS.rows} rows (this table has ${rawRows.length}).` };
  }
  const columns = rawColumns.map((c, i) => clip(c, LIMITS.cellChars).trim() || `Column ${i + 1}`);
  if (!columns.length) return { error: 'Paste a table first (a header row, then the data).' };
  const rows = rawRows
    .filter(Array.isArray)
    .map((r) => columns.map((_, i) => clip(r[i], LIMITS.cellChars).trim()))
    .filter((r) => r.some((cell) => cell !== ''));
  if (!rows.length) return { error: 'The table has no data rows under its header.' };

  const o = w.options && typeof w.options === 'object' ? w.options : {};
  const options = { labelCol: colIndex(o.labelCol, columns.length) ?? 0 };
  const valueCols = (Array.isArray(o.valueCols) ? o.valueCols : [])
    .map((v) => colIndex(v, columns.length))
    .filter((v) => v !== null && v !== options.labelCol);
  options.valueCols = [...new Set(valueCols)].slice(0, 6);
  if (w.type !== 'table' && !options.valueCols.length) {
    if (columns.length < 2) return { error: 'A chart needs a column of numbers to show.' };
    options.valueCols = [options.labelCol === 1 ? 0 : 1];
  }
  if (w.type === 'bar') {
    options.vertical = Boolean(o.vertical);
    // Stacked: 'sum' (totals) or 'percent' (each bar to 100%).
    if (o.stacked === 'sum' || o.stacked === 'percent') options.stacked = o.stacked;
  }
  // scale: traffic-light colours, red (low) → yellow → green (high).
  if ((w.type === 'bar' || w.type === 'progress') && o.scale) {
    options.scale = true;
    // reverse: for numbers where low is good (deaths, losses): green (low) → red (high).
    if (o.reverse) options.reverse = true;
  }
  if (w.type === 'pie') options.donut = o.donut !== false;
  if (w.type === 'progress') {
    const target = Number(o.target);
    const targetCol = colIndex(o.targetCol, columns.length);
    if (targetCol !== null) options.targetCol = targetCol;
    else if (Number.isFinite(target) && target > 0) options.target = target;
    else return { error: 'A progress chart needs a target: a number, or a column of targets.' };
  }
  if (w.type === 'table') {
    const hc = colIndex(o.highlightCol, columns.length);
    const min = Number(o.highlightMin);
    if (hc !== null && Number.isFinite(min))
      Object.assign(options, { highlightCol: hc, highlightMin: min });
  }

  // Where the data comes from: pasted, or a Google Sheet / Doc it can be synced from again.
  let source = { kind: 'paste' };
  let syncedAt;
  if (w.source && (w.source.kind === 'sheet' || w.source.kind === 'doc')) {
    const src = {
      kind: w.source.kind,
      url: clip(w.source.url, 500).trim(),
      ...(w.source.kind === 'sheet'
        ? { sheet: clip(w.source.sheet, 100).trim(), range: clip(w.source.range, 20).trim() }
        : { table: Math.max(1, Math.min(50, parseInt(w.source.table, 10) || 1)) }),
    };
    const req = sourceRequest(src);
    if (req.error) return { error: req.error };
    source = src;
    syncedAt = !Number.isNaN(Date.parse(w.syncedAt)) ? new Date(w.syncedAt).toISOString() : now;
  }

  const id = /^w_[a-z0-9]{4,20}$/.test(String(w.id || ''))
    ? w.id
    : `w_${Math.random().toString(36).slice(2, 10)}`;
  return {
    widget: {
      id,
      type: w.type,
      title,
      note: clip(w.note, LIMITS.noteChars).trim(),
      visibility: w.visibility === 'members' ? 'members' : 'r4_only',
      source,
      ...(syncedAt ? { syncedAt } : {}),
      data: { columns, rows },
      options,
      updatedAt: now,
      updatedBy: clip(actor, 60),
    },
  };
}

/**
 * Applies an edit to an alliance's stored dashboard (a copy is changed and returned):
 *   { action: 'save-widget', widget } adds it, or replaces the one with the same id;
 *   { action: 'delete-widget', id };  { action: 'move-widget', id, by: -1 | 1 }.
 * Returns { dashboard } or { error, status }.
 */
export function applyDashboardEdit(stored, edit, { actor = '', now } = {}) {
  const d = {
    ...stored,
    widgets: [...(stored.widgets || [])],
  };
  if (edit.action === 'save-widget') {
    const { widget, error } = cleanWidget(edit.widget, { actor, now });
    if (error) return { error, status: 400 };
    const at = d.widgets.findIndex((w) => w.id === widget.id);
    if (at >= 0) d.widgets[at] = widget;
    else if (d.widgets.length >= LIMITS.widgets) {
      return { error: `At most ${LIMITS.widgets} charts and tables per alliance.`, status: 400 };
    } else d.widgets.push(widget);
  } else if (edit.action === 'sync-data') {
    // Fresh data from the widget's Google Sheet / Doc (fetched by api/dashboard.js).
    const at = d.widgets.findIndex((w) => w.id === edit.id);
    if (at < 0) return { error: 'That chart was removed.', status: 404 };
    const { widget, error } = cleanWidget(
      { ...d.widgets[at], data: edit.data, syncedAt: now || new Date().toISOString() },
      { actor, now },
    );
    if (error) return { error: `The sheet's data can't be used: ${error}`, status: 400 };
    d.widgets[at] = widget;
  } else if (String(edit.action || '').startsWith('caravan-')) {
    const result = applyCaravanEdit(d.caravan, edit, { actor, now });
    if (result.error) return { error: result.error, status: 400 };
    d.caravan = result.caravan;
  } else if (edit.action === 'delete-widget') {
    const before = d.widgets.length;
    d.widgets = d.widgets.filter((w) => w.id !== edit.id);
    if (d.widgets.length === before)
      return { error: 'That chart was already removed.', status: 404 };
  } else if (edit.action === 'move-widget') {
    const at = d.widgets.findIndex((w) => w.id === edit.id);
    const to = at + (Number(edit.by) < 0 ? -1 : 1);
    if (at < 0) return { error: 'That chart was removed.', status: 404 };
    if (to >= 0 && to < d.widgets.length)
      [d.widgets[at], d.widgets[to]] = [d.widgets[to], d.widgets[at]];
  } else {
    return { error: 'Unknown change.', status: 400 };
  }
  d.updatedAt = now || new Date().toISOString();
  d.updatedBy = String(actor).slice(0, 60);
  const bytes = Buffer.byteLength(JSON.stringify(d, null, 2));
  if (bytes > MAX_DASHBOARD_BYTES) {
    return {
      error: `That would make this dashboard too big (${Math.round(bytes / 1024)} KB of ${MAX_DASHBOARD_BYTES / 1024} KB). Use fewer rows, or remove a table.`,
      status: 413,
    };
  }
  return { dashboard: d };
}

// ---------------------------------------------------------------------------------------
// Caravan Rotor: R4s pick who gets each caravan, by who is available, not a fixed queue.
// { membersCanView, weekStartedAt, roster: [{ id, name, from, to, picked: { at, by } | null }] }
// from/to: an optional Game Time (UTC-2) window, "HH:MM"; to may be empty (a single time).

export const CARAVAN_LIMITS = Object.freeze({ roster: 100, nameChars: 40 });

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function readCaravan(c) {
  const v = c && typeof c === 'object' ? c : {};
  return {
    membersCanView: Boolean(v.membersCanView),
    weekStartedAt: v.weekStartedAt || null,
    roster: (Array.isArray(v.roster) ? v.roster : []).filter((p) => p && p.id && p.name),
  };
}

/** A Game Time like "8", "20", "20:30", "2030" as "HH:MM"; '' when empty; null when invalid. */
export function gameTime(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!m) return null;
  const t = `${m[1].padStart(2, '0')}:${m[2] || '00'}`;
  return HHMM.test(t) ? t : null;
}

/** Applies a Caravan Rotor change (actions starting "caravan-"); { caravan } or { error }. */
export function applyCaravanEdit(
  stored,
  edit,
  { actor = '', now = new Date().toISOString() } = {},
) {
  const c = readCaravan(stored);
  const roster = c.roster.map((p) => ({ ...p }));
  const find = () => roster.findIndex((p) => p.id === edit.id);
  const person = () => {
    const name = clip(edit.name, CARAVAN_LIMITS.nameChars).trim();
    if (!name) return { error: 'Enter a player name.' };
    const from = gameTime(edit.from);
    const to = gameTime(edit.to);
    if (from === null || to === null)
      return { error: 'Times are Game Time like 18:00 (or leave them empty).' };
    if (to && !from) return { error: 'Give the start time too (or leave both empty).' };
    return { name, from, to };
  };
  switch (edit.action) {
    case 'caravan-add': {
      if (roster.length >= CARAVAN_LIMITS.roster && !roster.some((x) => x.id === edit.id)) {
        return { error: `At most ${CARAVAN_LIMITS.roster} players in the rotor.` };
      }
      const p = person();
      if (p.error) return p;
      const newId = /^p_[a-z0-9]{4,20}$/.test(String(edit.id || ''))
        ? edit.id
        : `p_${Math.random().toString(36).slice(2, 10)}`;
      if (roster.some((x) => x.id === newId)) break; // already added (this save, repeated)
      if (roster.some((x) => x.name.toLowerCase() === p.name.toLowerCase())) {
        return { error: `${p.name} is already in the rotor.` };
      }
      roster.push({ id: newId, ...p, picked: null });
      break;
    }
    case 'caravan-edit': {
      const at = find();
      if (at < 0) return { error: 'That player was removed.' };
      const p = person();
      if (p.error) return p;
      if (roster.some((x, i) => i !== at && x.name.toLowerCase() === p.name.toLowerCase())) {
        return { error: `${p.name} is already in the rotor.` };
      }
      Object.assign(roster[at], p);
      break;
    }
    case 'caravan-remove': {
      const at = find();
      if (at >= 0) roster.splice(at, 1);
      break;
    }
    case 'caravan-pick':
    case 'caravan-unpick': {
      const at = find();
      if (at < 0) return { error: 'That player was removed.' };
      // Picking someone already picked keeps the first pick (two officers tapping at once).
      if (edit.action === 'caravan-pick' && !roster[at].picked) {
        roster[at].picked = { at: now, by: clip(actor, 60) };
      }
      if (edit.action === 'caravan-unpick') roster[at].picked = null;
      break;
    }
    case 'caravan-new-week':
      roster.forEach((p) => (p.picked = null));
      c.weekStartedAt = now;
      break;
    case 'caravan-visibility':
      c.membersCanView = Boolean(edit.membersCanView);
      break;
    default:
      return { error: 'Unknown change.' };
  }
  return { caravan: { ...c, roster } };
}
