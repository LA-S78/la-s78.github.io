// api/_gist.js
// Shared access to the GitHub Gist that stores the site's live data
// (map-state.json, rewards-data.json, rewards-nominations.json, calendar-state.json,
// proposal-log.json).
// Files starting with "_" in api/ are helpers, not public endpoints.

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
  return content ? JSON.parse(content) : fallback;
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
    body.files[name] = { content: JSON.stringify(data, null, 2) };
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
 * Objects are merged key by key; lists by item (items `theirs` added are added, items it
 * removed are removed); where both changed the same value differently, `mine` wins.
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
  let out = await change(from);
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
    out = await change(from);
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

/**
 * Copies every file of the live Gist (GIST_ID) into the test Gist (TEST_GIST_ID) used by the
 * test site, for /devupdate. Only reads the live Gist and only writes the test one. Runs on
 * the live site, which can see the real values (Vercel never hands out values marked
 * Sensitive to anything else).
 * @returns {Promise<string[]>} the names of the files copied
 * @throws {Error} with a message for the person running it (missing or same test Gist, …)
 */
export async function copyLiveGistToTest({ timeoutMs } = {}) {
  const liveId = (process.env.GIST_ID || '').trim();
  const testId = (process.env.TEST_GIST_ID || '').trim();
  const liveToken = process.env.GIST_TOKEN;
  const testToken = process.env.TEST_GIST_TOKEN || liveToken;
  if (!liveId || !liveToken) throw new Error('The live Gist (GIST_ID, GIST_TOKEN) is not set.');
  if (!testId) throw new Error('TEST_GIST_ID is not set for Production in Vercel.');
  if (testId === liveId)
    throw new Error('TEST_GIST_ID is the live Gist. It must be a separate Gist.');

  const signal = () => (timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {});
  const res = await fetch(`${GIST_API}/${liveId}`, {
    headers: headers(liveToken),
    cache: 'no-store',
    ...signal(),
  });
  if (!res.ok) throw new Error(`Could not read the live Gist (${res.status}).`);
  const files = {};
  for (const [name, file] of Object.entries((await res.json()).files || {})) {
    if (file.truncated) throw new Error(`${name} is too large to copy this way.`);
    files[name] = { content: file.content };
  }

  const out = await fetch(`${GIST_API}/${testId}`, {
    method: 'PATCH',
    headers: headers(testToken, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      description: `Test data, copied from the live data at ${new Date().toISOString()}`,
      files,
    }),
    ...signal(),
  });
  if (!out.ok) throw new Error(`Could not write the test Gist (${out.status}).`);
  return Object.keys(files);
}
