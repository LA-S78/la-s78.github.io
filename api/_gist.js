// api/_gist.js
// Shared access to the GitHub Gist that stores the site's live data
// (map-state.json, rewards-data.json, rewards-nominations.json, calendar-state.json,
// proposal-log.json).
// Files starting with "_" in api/ are helpers, not public endpoints.

import { STORES, storeForFile } from './_id_stores.js';
import { readRegister, REGISTER_FILE } from './_register.js';

const GIST_API = 'https://api.github.com/gists';
const USER_AGENT = 'LA-S78-Compendium';

/**
 * True on dev.la-s78.app and other Vercel preview deployments (Vercel sets VERCEL_ENV).
 * They use test data only: see gistConfig().
 */
export function isTestDeployment() {
  return process.env.VERCEL_ENV === 'preview';
}

/** Field on a proposal sent from a test deployment; the live bot won't approve it. */
export const TEST_PROPOSAL_FIELD = '🧪 Test proposal';

/**
 * Which Gist to use. The live site uses GIST_ID. A preview deployment (dev.la-s78.app) uses
 * TEST_GIST_ID and nothing else: without it, it has no data at all rather than touching the
 * live Gist (TEST_GIST_TOKEN, if set, is its token; otherwise GIST_TOKEN). A TEST_GIST_ID equal
 * to GIST_ID is refused the same way.
 */
function gistConfig() {
  if (isTestDeployment()) {
    const testId = (process.env.TEST_GIST_ID || '').trim();
    // A test Gist set to the live one (an easy slip) counts as no test Gist at all.
    const isLive = testId && testId === (process.env.GIST_ID || '').trim();
    return {
      id: isLive ? undefined : testId || undefined,
      token: process.env.TEST_GIST_TOKEN || process.env.GIST_TOKEN,
    };
  }
  return { id: process.env.GIST_ID, token: process.env.GIST_TOKEN };
}

/** True when a Gist and its token are set (TEST_GIST_ID on a preview deployment). */
export function isGistConfigured() {
  const { id, token } = gistConfig();
  return Boolean(id && token);
}

function headers(token, extra = {}) {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': USER_AGENT,
    ...extra,
  };
}

/**
 * Downloads the whole Gist (all files) in one request.
 * @param {object} [options]
 * @param {number} [options.timeoutMs] abort after this many ms (Discord replies must finish within 3 s)
 * @returns {Promise<object>} the GitHub Gist API response
 * @throws {Error} "GitHub Gist error (<status>)" (with `.status` set) when GitHub answers with an error
 */
export async function readGist({ timeoutMs } = {}) {
  const { id, token } = gistConfig();
  const res = await fetch(`${GIST_API}/${id}`, {
    headers: headers(token),
    cache: 'no-store',
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  });
  if (!res.ok) {
    const err = new Error(`GitHub Gist error (${res.status})`);
    err.status = res.status; // lets callers tell a GitHub error from a network failure
    throw err;
  }
  return res.json();
}

/**
 * Parses one JSON file from a Gist returned by readGist().
 * Returns `fallback` when the file is missing or empty.
 */
export function gistJson(gist, filename, fallback = {}) {
  const content = gist?.files?.[filename]?.content;
  if (!content) return fallback;
  const data = JSON.parse(content);
  // Stored by alliance ID (steps 2–4): every reader gets the tag form
  const store = storeForFile(filename);
  if (store && store.isById(data)) return store.view(data, readRegister(gist));
  return data;
}

/**
 * A save's files in the form the stored ones have (alliance IDs, steps 2–4): a tag-form file
 * saved over one stored by ID is turned back into IDs, in the same save (the alliance list
 * first: it may add alliances to the register, in the same save too). `out.raw` (a move and its
 * undo) saves the files exactly as given.
 */
export function storeMapForm(out, from) {
  if (!out?.files || out.raw) return out;
  let files = out.files;
  let register = null;
  for (const store of Object.values(STORES)) {
    if (store.custom) continue;
    const mine = files[store.file];
    if (!mine) continue;
    const stored = JSON.parse(from?.files?.[store.file]?.content || 'null');
    // Stores by ID keep that form; one that moves on its own (the race) moves on this save
    if (!(store.isById(stored) || (store.autoMove && stored)) || store.isById(mine)) continue;
    register =
      register ||
      (files[REGISTER_FILE]
        ? { version: 1, alliances: files[REGISTER_FILE].alliances || {} }
        : readRegister(from));
    const converted = store.byId(mine, register);
    files = { ...files, [store.file]: converted.stored };
    if (converted.register) {
      register = converted.register;
      files[REGISTER_FILE] = register;
    }
  }
  return files === out.files ? out : { ...out, files };
}

/**
 * Saves one or more JSON files to the Gist in a single request (so they change together).
 * @param {Object<string, object>} files e.g. { 'map-state.json': state }
 * @param {object} [options]
 * @param {string} [options.description] Gist description, shown in its revision history
 * @param {number} [options.timeoutMs]
 * @throws {Error} "GitHub Gist update failed (<status>)" (with `.status` set) when GitHub rejects the update
 */
export async function writeGist(files, { description, timeoutMs } = {}) {
  const { id, token } = gistConfig();
  const body = { files: {} };
  if (description) body.description = description;
  for (const [name, data] of Object.entries(files)) {
    // null deletes the file (the alliance ID tidy-up's backups)
    body.files[name] = data === null ? null : { content: JSON.stringify(data, null, 2) };
  }

  const res = await fetch(`${GIST_API}/${id}`, {
    method: 'PATCH',
    headers: headers(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  });
  if (!res.ok) {
    const err = new Error(`GitHub Gist update failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json().catch(() => ({}));
}

/**
 * Downloads one earlier revision of the Gist (as readGist(), for that version).
 * @param {string} version a version id from the Gist's `history`
 */
export async function readGistRevision(version, { timeoutMs } = {}) {
  const { id, token } = gistConfig();
  const res = await fetch(`${GIST_API}/${id}/${version}`, {
    headers: headers(token),
    cache: 'no-store',
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  });
  if (!res.ok) {
    const err = new Error(`GitHub Gist error (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Merges two edits of the same JSON data: `theirs` and `mine` both started from `base`.
 * Objects are merged key by key; lists of items with an `id` item by item (matched by id);
 * other lists by whole item (items `theirs` added are added, items it removed are removed);
 * where both changed the same value differently, `mine` wins.
 */
export function mergeJson(base, theirs, mine) {
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  if (same(theirs, base)) return mine;
  if (same(mine, base) || same(mine, theirs)) return theirs;
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  // A list or object missing on one side (not created yet, or removed): merged as empty,
  // so additions made by the other sides are kept.
  const kind = (v) => (Array.isArray(v) ? 'list' : isObj(v) ? 'obj' : v == null ? 'none' : 'value');
  const kinds = [kind(base), kind(theirs), kind(mine)];
  const shape = kinds.find((k) => k === 'list' || k === 'obj');
  if (shape && kinds.includes('none') && kinds.every((k) => k === shape || k === 'none')) {
    const fill = (v) => (v == null ? (shape === 'list' ? [] : {}) : v);
    return mergeJson(fill(base), fill(theirs), fill(mine));
  }
  if (Array.isArray(base) && Array.isArray(theirs) && Array.isArray(mine)) {
    // Lists of items with ids (dashboard widgets, rotor players): merged item by item, so
    // two people changing different items (or the same item's different fields) both count.
    const hasId = (v) => isObj(v) && typeof v.id === 'string' && v.id !== '';
    if ([...base, ...theirs, ...mine].every(hasId)) {
      const byId = (list) => new Map(list.map((v) => [v.id, v]));
      const b = byId(base);
      const t = byId(theirs);
      const m = byId(mine);
      const order = [
        ...mine.map((v) => v.id),
        ...theirs.map((v) => v.id).filter((id) => !m.has(id)),
      ];
      return order
        .map((id) => mergeJson(b.get(id), t.get(id), m.get(id)))
        .filter((v) => v !== undefined);
    }
    const key = (v) => JSON.stringify(v);
    const inBase = new Set(base.map(key));
    const inTheirs = new Set(theirs.map(key));
    const removed = new Set(base.map(key).filter((k) => !inTheirs.has(k)));
    const merged = mine.filter((v) => !removed.has(key(v)));
    const have = new Set(merged.map(key));
    for (const v of theirs) if (!inBase.has(key(v)) && !have.has(key(v))) merged.push(v);
    return merged;
  }
  if (isObj(base) && isObj(theirs) && isObj(mine)) {
    const merged = {};
    for (const k of new Set([...Object.keys(base), ...Object.keys(theirs), ...Object.keys(mine)])) {
      const v = mergeJson(base[k], theirs[k], mine[k]);
      if (v !== undefined) merged[k] = v;
    }
    return merged;
  }
  return mine;
}

/**
 * Small file saved with every updateGist() save: the revision that save was worked out
 * from, and the files it wrote. With it, any revision's own change can be told apart from
 * what it overwrote or merely carried along.
 */
export const SAVE_INFO_FILE = 'last-save.json';

/**
 * Reads the Gist, works out a change from it and saves it, without wiping out a save that
 * someone else made at the same moment (two alliances nominating at once, a nomination
 * during the Kingdom War result, two approvals...).
 *
 * GitHub can't refuse a save when the data changed since it was read, so the check comes
 * after: every save becomes a new revision in the Gist's history, and the revision just
 * before ours should be the one we worked from. If it isn't, other saves landed in between
 * and ours overwrote them. Then, starting from the latest data:
 * - each overwritten save's own change is put back: the files it wrote, compared with the
 *   revision it was worked out from (both recorded in SAVE_INFO_FILE), merged field by
 *   field (mergeJson);
 * - our own change is taken out again, and `change` runs on the result,
 * and that is saved and checked the same way. Every save repairs what it overwrote, so all
 * changes are kept even when several land at once. At most 6 rounds, and no new round
 * after `deadline` (Discord's 3-second limit); beyond that a warning is logged. Only the
 * files we save are involved: a save leaves every other file as it is.
 *
 * @param {(gist: object) => (object|Promise<object>)} change gets the Gist (as readGist()
 *   returns it) and returns `{ files, description, ...anything }`: the files to save (whole,
 *   as writeGist() takes them). Without `files` nothing is saved. It may run more than
 *   once, so it must work only from the Gist it is given.
 * @param {object} [options]
 * @param {object} [options.gist] the Gist already read by the caller (saves a request)
 * @param {number} [options.timeoutMs] per request
 * @param {number} [options.deadline] time (ms, as Date.now()) after which no new round starts;
 *   by default 8 seconds from the start, well inside Vercel's time limit for a request
 * @returns {Promise<object>} what `change` returned the last time it ran
 */
export async function updateGist(
  change,
  { gist = null, timeoutMs, deadline = Date.now() + 8000 } = {},
) {
  const text = (data) => JSON.stringify(data, null, 2);
  const parse = (g, name) => JSON.parse(g?.files?.[name]?.content || 'null');
  const revisions = new Map(); // version -> Gist, read at most once each
  const revision = async (version) => {
    if (!revisions.has(version))
      revisions.set(version, await readGistRevision(version, { timeoutMs }));
    return revisions.get(version);
  };

  let from = gist || (await readGist({ timeoutMs })); // what our change is worked out from
  let fromVersion = from.history?.[0]?.version; // the revision that is
  let out = storeMapForm(await change(from), from);
  if (!out?.files) return out;
  // Nothing different from what is stored: no save.
  if (Object.entries(out.files).every(([n, d]) => from.files?.[n]?.content === text(d))) {
    return out;
  }

  const mine = new Set(); // our own revisions
  for (let round = 1; ; round++) {
    const saved = await writeGist(
      {
        ...out.files,
        [SAVE_INFO_FILE]: { based_on: fromVersion || null, files: Object.keys(out.files) },
      },
      { description: out.description, timeoutMs },
    );
    const history = (saved?.history || []).map((h) => h.version);
    if (history[0]) mine.add(history[0]);
    if (!fromVersion || !history[1] || history[1] === fromVersion) return out;

    if (round >= 6 || Date.now() >= deadline) {
      console.warn(
        `Gist: other saves landed during "${out.description || 'a save'}" and may not all be kept.`,
      );
      return out;
    }

    // Others saved between `fromVersion` and our save: those revisions, oldest first.
    const start = history.indexOf(fromVersion);
    // (If GitHub's history doesn't reach back that far, only the one just before ours.)
    const overwritten = (start < 0 ? history.slice(1, 2) : history.slice(1, start)).reverse();
    // A short random pause, so saves landing together don't collide again.
    await new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 700 * round));
    const latest = await readGist({ timeoutMs });

    const files = { ...latest.files };
    for (const [name, ours] of Object.entries(out.files)) {
      let data = parse(latest, name);
      for (const version of overwritten) {
        if (mine.has(version)) continue;
        const theirs = await revision(version);
        const info = parse(theirs, SAVE_INFO_FILE);
        // Only files that save wrote (the others were just carried along). A save without
        // this info (made another way) is compared with the revision just before it.
        if (info?.based_on && !(info.files || []).includes(name)) continue;
        const base = info?.based_on || history[history.indexOf(version) + 1];
        if (!base) continue;
        data = mergeJson(parse(await revision(base), name), parse(theirs, name), data);
      }
      // Our own change taken out, so `change` adds it exactly once.
      files[name] = { content: text(mergeJson(ours, parse(from, name), data)) };
    }
    from = { ...latest, files };
    fromVersion = latest.history?.[0]?.version;
    const previous = out;
    out = storeMapForm(await change(from), from);
    // Nothing of ours left to change (e.g. it is now refused): the rebuilt data, with what
    // we overwrote put back and our change taken out, must still be saved.
    if (!out?.files) {
      out = {
        ...out,
        files: Object.fromEntries(Object.keys(previous.files).map((n) => [n, parse(from, n)])),
        description: previous.description,
      };
    }
  }
}

/** Files the test copy leaves out (history, not needed to rehearse anything). */
const NOT_COPIED = new Set(['proposal-log.json', 'last-save.json']);
/** Discord IDs in an alliance's record (from /registerbot), blanked in the test copy. */
const DISCORD_FIELDS = [
  'guild_id',
  'delegated_roles',
  'alert_channel_id',
  'alert_role_id',
  'officer_channel_id',
  'officer_roles',
];
/** Stamped into the test Gist: when it was copied (shown on the test site). */
export const TEST_COPY_FILE = 'test-copy.json';

/** An alliance list without the Discord IDs that point at live servers and channels. */
export function scrubMapState(text) {
  const state = JSON.parse(text);
  for (const a of Object.values(state.alliances || {})) {
    if (!a || typeof a !== 'object') continue;
    for (const f of DISCORD_FIELDS) delete a[f];
    if ('server_event_alerts' in a) a.server_event_alerts = false;
  }
  return JSON.stringify(state, null, 2);
}

/**
 * Copies the live Gist (GIST_ID) into the test Gist (TEST_GIST_ID) used by the test site, for
 * /devupdate. Only reads the live Gist and only writes the test one. Runs on the live site,
 * which can see the real values (Vercel never hands out values marked Sensitive to anything
 * else), so no token leaves Vercel. The copy (plan for alliance IDs, 2026-11-20):
 *   - leaves out the proposal log and the last-save note (history, not needed);
 *   - blanks every alliance's Discord server, channel and role IDs (scrubMapState);
 *   - removes files the test Gist has that the live one doesn't (a clean copy);
 *   - is stamped with when it was made (test-copy.json).
 * @returns {Promise<{ copied: string[], removed: string[], copiedAt: string }>}
 * @throws {Error} with a message for the person running it (missing or same test Gist, …)
 */
export async function copyLiveGistToTest({ timeoutMs } = {}) {
  const liveId = (process.env.GIST_ID || '').trim();
  const testId = (process.env.TEST_GIST_ID || '').trim();
  const liveToken = process.env.GIST_TOKEN;
  const testToken = process.env.TEST_GIST_TOKEN || liveToken;
  if (isTestDeployment()) throw new Error('This runs on the live site only.');
  if (!liveId || !liveToken) throw new Error('The live Gist (GIST_ID, GIST_TOKEN) is not set.');
  if (!testId) throw new Error('TEST_GIST_ID is not set for Production in Vercel.');
  if (testId === liveId)
    throw new Error('TEST_GIST_ID is the live Gist. It must be a separate Gist.');

  const signal = () => (timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {});
  const read = async (id, token) => {
    const res = await fetch(`${GIST_API}/${id}`, {
      headers: headers(token),
      cache: 'no-store',
      ...signal(),
    });
    if (!res.ok)
      throw new Error(
        `Could not read the ${id === liveId ? 'live' : 'test'} Gist (${res.status}).`,
      );
    return (await res.json()).files || {};
  };
  const live = await read(liveId, liveToken);
  const test = await read(testId, testToken);

  const files = {};
  for (const [name, file] of Object.entries(live)) {
    if (NOT_COPIED.has(name)) continue;
    if (file.truncated) throw new Error(`${name} is too large to copy this way.`);
    files[name] = {
      content: name === 'map-state.json' ? scrubMapState(file.content) : file.content,
    };
  }
  const copiedAt = new Date().toISOString();
  files[TEST_COPY_FILE] = {
    content: JSON.stringify(
      { copiedAt, files: Object.keys(files), left_out: [...NOT_COPIED], discord_ids: 'blanked' },
      null,
      2,
    ),
  };
  // A clean copy: what only the test Gist has goes (a file set to null is deleted)
  const removed = Object.keys(test).filter((name) => !(name in files));
  for (const name of removed) files[name] = null;

  const out = await fetch(`${GIST_API}/${testId}`, {
    method: 'PATCH',
    headers: headers(testToken, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      description: `Test data, copied from the live data at ${copiedAt}`,
      files,
    }),
    ...signal(),
  });
  if (!out.ok) throw new Error(`Could not write the test Gist (${out.status}).`);
  return {
    copied: Object.keys(files).filter((n) => files[n] && n !== TEST_COPY_FILE),
    removed,
    copiedAt,
  };
}
