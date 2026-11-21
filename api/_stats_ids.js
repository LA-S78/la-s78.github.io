// api/_stats_ids.js
// The Top 4 race's and Stats tab's Blob files by alliance ID (docs/ALLIANCE-IDS-PLAN.md,
// step 6, 2026-11-22), so a renamed alliance's growth chart, positions and tracker number carry
// on under its new tag.
//
// Stored by ID (`version: 2` in the file), under stats/ (test/stats/ on the test site):
//   summary.json        `alliances` and `members` keyed by ID;
//   days/<date>.json    `alliances` keyed by ID, each entry keeping `tag`: the tag it had that
//                       day (so an old day still reads naturally);
//   top.json            each alliance's own lists (`lists`) keyed by ID (players' `tag` is a
//                       label, rebuilt every day);
//   positions.json      `alliances` keyed by ID;
//   alliance-ids.json   the tracker numbers (`ids`, `renamed`, `mismatch`) keyed by ID.
// Not changed: player-series.json and skins.json (by player), player-index.json (rebuilt every
// day, the tag is a label), and the race's history in the Gist (ascension.json).
//
// api/_stats.js reads and writes every Blob file through readJson/writeJson; those call
// statsView / statsStored here. Reading a by-ID file gives the tag form (keys are the alliances'
// tags now); writing gives the by-ID form once a Steward has moved the files
// (alliance-id-moves.json: { stats: true }). Both need the register, read from the Gist and
// kept a minute. If it can't be read, they throw rather than guess (a read that came back
// empty could otherwise be written over the history).

import { ID_PATTERN, followMerged, onMap, readRegister, GAME, SERVER } from './_register.js';

export const MOVES_FILE = 'alliance-id-moves.json';

/** Which part of each file holds alliances by key. */
const KEYED = {
  summary: ['alliances', 'members'],
  day: ['alliances'],
  top: ['lists'],
  positions: ['alliances'],
  ids: ['ids', 'renamed', 'mismatch'],
};

/** The kind of a stats file from its path (after stats/ or test/stats/), or null. */
export function statsKind(path) {
  const m = /(?:^|\/)stats\/(.+)$/.exec(String(path || ''));
  if (!m || m[1].startsWith('backup')) return null;
  const name = m[1];
  if (/^days\/\d{4}-\d{2}-\d{2}\.json$/.test(name)) return 'day';
  return (
    {
      'summary.json': 'summary',
      'top.json': 'top',
      'positions.json': 'positions',
      'alliance-ids.json': 'ids',
    }[name] || null
  );
}

export const isById = (data) => Boolean(data && data.version === 2);

/** tag → ID: an alliance on the map with that tag now, else the one alliance that ever had it. */
function toIdFn(register) {
  const here = (a) => a.game === GAME && String(a.server) === SERVER;
  const all = Object.values(register.alliances).filter(here);
  const now = new Map(all.filter(onMap).map((a) => [a.tag, a.id]));
  return (tag) => {
    if (typeof tag !== 'string') return tag;
    if (now.has(tag)) return now.get(tag);
    const had = new Set(
      all
        .filter((a) => (a.tags || []).some((h) => h.tag === tag))
        .map((a) => followMerged(register, a)?.id || a.id),
    );
    return had.size === 1 ? [...had][0] : tag;
  };
}

/** ID → the alliance's tag now. */
function toTagFn(register) {
  return (v) =>
    typeof v === 'string' && ID_PATTERN.test(v)
      ? followMerged(register, register.alliances[v])?.tag || v
      : v;
}

const rekey = (obj, fn, each) =>
  obj && typeof obj === 'object' && !Array.isArray(obj)
    ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [fn(k), each ? each(k, v) : v]))
    : obj;

function convert(kind, data, fn, toIds) {
  const out = { ...data };
  for (const part of KEYED[kind] || []) {
    if (!(part in out)) continue;
    if (kind === 'top' && part === 'lists') {
      // `all` is the whole server's list, not an alliance
      out.lists = rekey(out.lists, (k) => (k === 'all' ? k : fn(k)));
    } else if (kind === 'day' && toIds) {
      // Each day's entry keeps the tag it had that day
      out[part] = rekey(out[part], fn, (k, v) =>
        v && typeof v === 'object' && !('tag' in v) ? { ...v, tag: k } : v,
      );
    } else out[part] = rekey(out[part], fn);
  }
  return out;
}

const strip = (data) => {
  const { version: _v, ...rest } = data || {};
  return rest;
};

/** A by-ID file in the tag form (anything else unchanged). */
export function statsView(kind, data, register) {
  if (!kind || !isById(data)) return data;
  return convert(kind, strip(data), toTagFn(register), false);
}

/** A tag-form file in the by-ID form. */
export function statsByIdForm(kind, data, register) {
  if (!kind || !data || typeof data !== 'object' || isById(data)) return data;
  return { version: 2, ...convert(kind, strip(data), toIdFn(register), true) };
}

/** As the move compares it: a day's entries carry their tag (the move adds it). */
export function statsOriginal(kind, data) {
  return kind === 'day' ? convert(kind, data, (k) => k, true) : data;
}

// --- The register and the switch, from the Gist, kept a minute ---------------------------
let cache = null;
export async function statsContext({ fresh = false } = {}) {
  if (cache?.pinned) return cache;
  if (!fresh && cache && Date.now() - cache.at < 60000) return cache;
  const { readGist, gistJson } = await import('./_gist.js');
  const gist = await readGist({ timeoutMs: 5000 });
  cache = {
    at: Date.now(),
    register: readRegister(gist),
    moved: Boolean(gistJson(gist, MOVES_FILE, {}).stats),
  };
  return cache;
}
/** For tests: set what statsContext gives. */
export function setStatsContext(ctx) {
  if (cache?.pinned && !ctx?.pinned) {
    // A test's context stays until the test replaces it; only the switch is updated
    if (ctx === null) return;
  }
  cache = ctx ? { at: Date.now(), ...ctx } : null;
}

/** What readJson gives for a file just read: the tag form. Throws if the register can't be read. */
export async function afterRead(path, data) {
  const kind = statsKind(path);
  if (!kind || !isById(data)) return data;
  return statsView(kind, data, (await statsContext()).register);
}

/** What writeJson stores: the by-ID form once the files are moved. */
export async function beforeWrite(path, data) {
  const kind = statsKind(path);
  if (!kind || isById(data)) return data;
  const ctx = await statsContext();
  return ctx.moved ? statsByIdForm(kind, data, ctx.register) : data;
}
