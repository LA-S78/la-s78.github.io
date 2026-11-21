// api/_tracker.js
// The Last Asylum Tracker API (https://api.lastasylumtracker.com/docs): alliances' member
// lists and Might, from a third-party tracker of the game (owner decision, 2026-11-17).
// Helpers, not an endpoint.
//
// - The key is the owner's, in Vercel as LAT_API_KEY (1,000 requests a day on a free
//   account; every call counts). Without it, everything here answers null and the site
//   works as before.
// - Only what the site needs leaves this file: names, ids, Might, in-game rank, Sanctuary
//   level, join date and pictures (the roster view). The tracker also sends map positions,
//   online times and daily activity; those are dropped here and never stored or shown.
// - Unofficial and run by one person: a slow or failed answer is null, never an error, so
//   no page or save depends on it.

import { isTestDeployment } from './_gist.js';
import { SERVER_NUMBER } from './_server.js';

const BASE = 'https://api.lastasylumtracker.com/v1';
/** Our kingdom (the tracker's server number). */
// The game server, set in one place (api/_server.js)
export const TRACKER_SERVER = SERVER_NUMBER;
/** Member lists are reused for an hour in a warm server instance (the tracker's own age). */
const CACHE_MS = 60 * 60 * 1000;
const cache = new Map();

/**
 * The tracker key, or '' when this deployment mustn't use it. The test site never uses the
 * tracker (it would spend the live site's 1,000 requests a day: the key is the same), unless
 * TRACKER_ON_TEST=on is set there for a deliberate test (plan for alliance IDs, 2026-11-20).
 */
export function trackerKey(env = process.env) {
  if (isTestDeployment() && String(env.TRACKER_ON_TEST || '').trim() !== 'on') return '';
  return String(env.LAT_API_KEY || '').trim();
}

export const trackerConfigured = (env = process.env) => Boolean(trackerKey(env));

const GAME_IMAGES = 'https://phs-image.globallap.com/';

/**
 * A member's picture as the site shows it: a player's own picture stays on the game's image
 * server (its address changes whenever they change it); a default portrait or a frame, which
 * the tracker hosts, becomes our own copy under /game-art/ (api/_game_art.js), so pages
 * never load files from the tracker's server. null for anything else.
 */
export function pictureUrl(value) {
  const v = String(value || '');
  if (v.startsWith(GAME_IMAGES) && /^[\w./-]+$/.test(v.slice(GAME_IMAGES.length))) return v;
  const art = v.match(
    /^(?:https:\/\/(?:api\.)?lastasylumtracker\.com)?\/static\/(avatars\/head_\d{1,7}|frames\/frame_\d{1,7}|alliance\/badge_\d{1,7}|hq\/skin_\d{1,7})\.png$/,
  );
  return art ? `/game-art/${art[1]}.png` : null;
}

/** Forgets a "not found" answer kept for a tag (after a Steward links or renames it). */
export function forgetMissing(tag) {
  const key = String(tag || '').trim();
  if (cache.get(key)?.missing) cache.delete(key);
}

/** Was this tag looked up in the last hour and not found? (so its gap is expected) */
export function knownMissing(tag) {
  const hit = cache.get(String(tag || '').trim());
  return Boolean(hit && hit.missing && Date.now() - hit.at < CACHE_MS);
}

/** A count the roster may leave out: a number, or null when missing. */
const count = (v) =>
  v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);

/** What the site keeps of an alliance answer. */
function slim(d) {
  return {
    tag: String(d.abbr || ''),
    name: String(d.name || ''),
    // The game's own number for the alliance: it stays when the tag changes (owner,
    // 2026-11-20: HMDA became Arch), so lookups can fall back to it (api/_alliance_ids.js)
    aid:
      Number(d.union_id) ||
      Number((Array.isArray(d.members) ? d.members.find((m) => m && m.aid) : null)?.aid) ||
      null,
    power: Number(d.power) || 0,
    memberCount: Number(d.member_count) || (Array.isArray(d.members) ? d.members.length : 0),
    // For the Alliance standings cards (owner request, 2026-11-19): room, level and the
    // alliance's in-game badge (our copy under /game-art/alliance/)
    capacity: Number(d.capacity) || null,
    level: Number(d.level) || null,
    badge: pictureUrl(d.badge_url),
    members: (Array.isArray(d.members) ? d.members : [])
      .map((m) => ({
        uid: String(m.uid ?? m.player_id ?? ''),
        name: String(m.nick_name ?? m.name ?? ''),
        power: Number(m.power) || 0,
        // For the roster view (owner request, 2026-11-18): the in-game rank and title
        // ("R4 · Diplomat"), Sanctuary level, when they joined, and their pictures
        rank: String(m.rank_label || '').slice(0, 40),
        level: Number(m.lv ?? m.level) || null,
        joinedAt: m.joined_at || null,
        avatar: pictureUrl(m.avatar_url),
        frame: pictureUrl(m.frame_url),
        // Today's giving (owner request, 2026-11-19; leaders only, api/dashboard.js):
        // alliance research donations (daily_tech) and help with members' construction and
        // research (daily_honor). null when missing: the game leaves out a member who
        // hasn't donated or helped since the daily reset, so pages show that as 0. The game's
        // weekly "activity" score is left out on purpose (owner: it counts Survival Battle
        // as much as Alliance Duel, so it misjudges players).
        tech: count(m.daily_tech),
        help: count(m.daily_honor),
        // Where their Sanctuary is (game X/Y, 0–1000): leaders only, on the territory map
        // (owner request, 2026-11-19; api/dashboard.js ?positions=1)
        // Total kills (the Stats tab's achievements)
        kills: count(m.kills),
        x: count(m.x),
        y: count(m.y),
      }))
      .filter((m) => m.name),
    ageSeconds: Number(d.age_seconds) || 0,
    live: d.cached === false,
    at: Date.now(),
  };
}

// ---------------------------------------------------------------------------------------
// Where the day's tracker requests go (owner request, 2026-11-20; the Steward tools page)
// ---------------------------------------------------------------------------------------
// Every request is labelled by what made it (`use`): automation (the daily Stats snapshot,
// the Top 4 race), alliance (dashboards, nominations, the King's console), public (the
// standings cards), steward (the Steward tools). Each server counts them, with the latest
// usage the tracker reported (every answer carries it), and saves its counts to the Gist
// (tracker-usage.json) every few minutes. A server shut down before saving loses its count:
// the Steward page shows the tracker's own total beside them, the gap as "Not recorded".

export const USAGE_FILE = 'tracker-usage.json';
const FLUSH_MS = 5 * 60000;
const KEEP_USAGE_DAYS = 7;
/** The tracker's day: its 1,000 requests start again at 00:00 UTC. */
export const usageDay = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);
const usage = { day: usageDay(), counts: {}, last: null, savedLast: null, flushedAt: Date.now() };

function noteRequest(use, quota) {
  const today = usageDay();
  if (usage.day !== today) {
    usage.day = today;
    usage.counts = {};
  }
  usage.counts[use] = (usage.counts[use] || 0) + 1;
  if (quota && Number.isFinite(Number(quota.used))) {
    usage.last = {
      used: Number(quota.used),
      limit: Number(quota.limit) || null,
      at: new Date().toISOString(),
    };
  }
  if (Date.now() - usage.flushedAt > FLUSH_MS) {
    usage.flushedAt = Date.now();
    const saving = flushTrackerUsage().catch((err) =>
      console.warn('Tracker usage not saved:', err.message),
    );
    // Kept alive after the page's answer has gone (Vercel freezes the function otherwise)
    import('./_after_response.js')
      .then(({ getWaitUntil }) => getWaitUntil()?.(saving))
      .catch(() => {});
  }
}

/** This server's counts not saved yet, and its latest usage: { day, counts, last }. */
export function unsavedUsage() {
  return { day: usage.day, counts: { ...usage.counts }, last: usage.last };
}

/** Adds this server's counts to the Gist's (and its latest usage), then starts again. */
export async function flushTrackerUsage() {
  const pending = unsavedUsage();
  // Nothing new since the last save: no Gist write
  if (!Object.keys(pending.counts).length && pending.last === usage.savedLast) return;
  const { updateGist, gistJson } = await import('./_gist.js');
  await updateGist((gist) => {
    const d = gistJson(gist, USAGE_FILE, { days: {} });
    d.days = d.days || {};
    const day = (d.days[pending.day] = d.days[pending.day] || { by: {}, last: null });
    for (const [use, n] of Object.entries(pending.counts)) day.by[use] = (day.by[use] || 0) + n;
    if (pending.last && (!day.last || pending.last.used >= day.last.used)) day.last = pending.last;
    for (const old of Object.keys(d.days).sort().slice(0, -KEEP_USAGE_DAYS)) delete d.days[old];
    return { files: { [USAGE_FILE]: d }, description: 'Tracker usage' };
  });
  usage.savedLast = pending.last;
  // Only what was saved is taken off (requests made meanwhile stay counted here)
  if (usage.day === pending.day) {
    for (const [use, n] of Object.entries(pending.counts)) {
      usage.counts[use] = Math.max(0, (usage.counts[use] || 0) - n);
      if (!usage.counts[use]) delete usage.counts[use];
    }
  }
}

/** One request to the tracker, noted under `use`: { ok, status, data } (data may be null). */
async function trackerGet(path, { key, use = 'other', timeoutMs = 4000, fetchImpl = fetch }) {
  const res = await fetchImpl(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      // The tracker's Cloudflare refuses requests without a normal user agent
      'User-Agent': 'Mozilla/5.0 (compatible; la-s78.app)',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  noteRequest(use, data && data.quota);
  return { ok: res.ok, status: res.status, data };
}

/**
 * An alliance on our server by its exact tag (letter case counts, as on the site), or null.
 * `fresh: true` asks the game itself (about a second; the tracker's own copy can be days
 * old), and is what the ascension snapshots use. `timeoutMs` keeps pages quick.
 * Returns { tag, name, power, memberCount, members: [{ uid, name, power }], ageSeconds, live }.
 */
export async function fetchAlliance(
  tag,
  {
    fresh = false,
    timeoutMs = 4000,
    newerThan = 0,
    freshWithinMs = 0,
    use = 'other',
    env = process.env,
    fetchImpl = fetch,
  } = {},
) {
  const key = trackerKey(env);
  const clean = String(tag || '').trim();
  if (!key || !clean) return null;
  const hit = cache.get(clean);
  // `newerThan`: a copy kept here from before that time is not used (a leader refreshed the
  // roster on another server instance since; the tracker has the newer copy)
  // `freshWithinMs`: a live answer this recent counts as live (two daily snapshots asking at
  // the same minute share one request)
  if (fresh && freshWithinMs && hit && hit.live && Date.now() - hit.at < freshWithinMs) return hit;
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS && hit.at >= newerThan) {
    return hit.missing ? null : hit;
  }
  try {
    const path = `/alliances/${TRACKER_SERVER}/${encodeURIComponent(clean)}${fresh ? '?fresh=1' : ''}`;
    const res = await trackerGet(path, { key, use, timeoutMs, fetchImpl });
    if (!res.ok) {
      // 409: the tag could mean more than one alliance; 404: not on the server; 429: out of
      // today's requests. All mean "no list" here.
      console.warn(`Tracker: [${clean}] answered HTTP ${res.status}`);
      // An alliance the tracker doesn't have (or can't tell apart) is remembered for the hour
      // too, so pages don't ask again and again (each ask counts against the day's 1,000)
      if (res.status === 404 || res.status === 409)
        cache.set(clean, { missing: true, at: Date.now() });
      return null;
    }
    if (!res.data) return null;
    const data = slim(res.data);
    // Only the alliance asked for (the tracker matches tags by letter case too)
    if (data.tag !== clean) {
      cache.set(clean, { missing: true, at: Date.now() });
      return null;
    }
    cache.set(clean, data);
    return data;
  } catch (err) {
    console.warn(`Tracker: [${clean}] failed:`, err.message);
    return null;
  }
}

/**
 * An alliance by the game's own number for it (its `aid`), whatever its tag is now; the same
 * answer as fetchAlliance, or null. Used when a tag the site knows isn't found (renamed in
 * the game): api/_alliance_ids.js.
 */
export async function fetchAllianceById(
  aid,
  { fresh = false, timeoutMs = 4000, use = 'other', env = process.env, fetchImpl = fetch } = {},
) {
  const key = trackerKey(env);
  const id = Number(aid);
  if (!key || !Number.isInteger(id) || id <= 0) return null;
  try {
    const res = await trackerGet(`/alliances/${id}${fresh ? '?fresh=1' : ''}`, {
      key,
      use,
      timeoutMs,
      fetchImpl,
    });
    if (!res.ok || !res.data) {
      console.warn(`Tracker: alliance #${id} answered HTTP ${res.status}`);
      return null;
    }
    const data = slim(res.data);
    return data.tag ? data : null;
  } catch (err) {
    console.warn(`Tracker: alliance #${id} failed:`, err.message);
    return null;
  }
}

/**
 * Members' pictures by name, for pages that show players by the name a leader typed (Caravan
 * Rotor, nomination list, King's console): { name: { avatar, frame } }. Members with neither
 * are left out; the page shows their initial. `allianceFrame`: the alliance's own avatar frame
 * (api/_alliance_images.js allianceFrame), used for everyone when given.
 */
export function memberPictures(alliance, allianceFrame = null) {
  if (!alliance) return null;
  const out = {};
  for (const m of alliance.members) {
    // The alliance's own avatar frame, when switched on, replaces every in-game frame
    const frame = allianceFrame || m.frame;
    if (m.avatar || frame) out[m.name] = { avatar: m.avatar, frame };
  }
  return out;
}

/** A name's letters and digits, lower case (as js/name-check.js): "•FENRIR•" = "fenrir". */
export function foldName(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Does a typed line look like a player ID rather than a name? (the game's IDs: digits) */
export const looksLikeId = (typed) => /^\d{5,12}$/.test(String(typed || '').trim());

/**
 * The member a leader means by what they typed (owner request, 2026-11-18): exactly their
 * name, else their player ID, else the one member whose name reads the same (letter case,
 * decorations). null if none, or without a member list.
 */
export function findMember(typed, members) {
  const t = String(typed || '').trim();
  if (!t || !Array.isArray(members)) return null;
  const exact = members.find((m) => m.name === t);
  if (exact) return exact;
  if (looksLikeId(t)) {
    const byId = members.find((m) => m.uid === t);
    if (byId) return byId;
  }
  const folded = foldName(t);
  const same = folded ? members.filter((m) => foldName(m.name) === folded) : [];
  return same.length === 1 ? same[0] : null;
}

/**
 * One player, live from the game (the Steward tools' player lookup, owner request
 * 2026-11-20; one tracker request each, Stewards only). By player ID: the tracker has no
 * name lookup. Returns { player, quota } or { error: 'not_found' | 'unavailable' }.
 * `history` keeps only the changes that matter when checking a player: earlier names and
 * alliances, newest first.
 */
export async function fetchPlayer(
  uid,
  { use = 'steward', fresh = true, env = process.env, fetchImpl = fetch } = {},
) {
  const key = trackerKey(env);
  const id = String(uid || '').trim();
  if (!key) return { error: 'unavailable' };
  if (!/^\d{5,15}$/.test(id)) return { error: 'not_found' };
  try {
    const res = await trackerGet(`/players/${id}${fresh ? '?fresh=1' : ''}`, {
      key,
      use,
      timeoutMs: 8000,
      fetchImpl,
    });
    if (res.status === 404 || res.status === 422) return { error: 'not_found' };
    if (!res.ok || !res.data) return { error: 'unavailable', status: res.status };
    const d = res.data;
    const changes = [];
    let last = null;
    // Oldest first, so each name or alliance change is kept once, with when it was first seen
    for (const h of [...(Array.isArray(d.history) ? d.history : [])].sort(
      (a, b) => (a.observed_at || 0) - (b.observed_at || 0),
    )) {
      const now = { name: String(h.nick || ''), tag: String(h.union_abbr || '') };
      if (!last || now.name !== last.name || now.tag !== last.tag) {
        changes.push({
          ...now,
          at: h.observed_at ? new Date(h.observed_at * 1000).toISOString() : null,
        });
        last = now;
      }
    }
    const rank = (k) => (d.ranks && d.ranks[k] && Number(d.ranks[k].rank)) || null;
    const when = (sec) => (Number(sec) ? new Date(Number(sec) * 1000).toISOString() : null);
    return {
      player: {
        uid: String(d.uid ?? d.player_id ?? id),
        name: String(d.nick_name ?? d.nick ?? ''),
        server: Number(d.sid ?? d.kid) || null,
        tag: String(d.alliance_abbr ?? d.union_abbr ?? ''),
        allianceName: String(d.alliance_name ?? d.union_name ?? ''),
        power: Number(d.power) || 0,
        kills: count(d.kills),
        level: Number(d.lv ?? d.level) || null,
        vip: count(d.vip),
        x: count(d.x),
        y: count(d.y),
        online: d.online === true,
        shielded: Number(d.shielding) > 0,
        language: d.language ? String(d.language).slice(0, 8) : null,
        likes: count(d.likes),
        avatar: pictureUrl(d.avatar_url),
        frame: pictureUrl(d.frame_url),
        // The Sanctuary's skin (the map's game view): null without one. The tracker's own
        // picture for "no skin" (castle_N.png) is an old look, so it isn't used.
        skin: d.skin_id ? pictureUrl(d.hq_skin || d.city_skin_icon) : null,
        skinName: d.skin_id ? String(d.skin_name || '').slice(0, 60) : '',
        ranks: { might: rank('power'), kills: rank('kills'), heroes: rank('heroes') },
        firstSeen: when(d.first_seen_at),
        lastSeen: when(d.last_seen_at),
        live: d.cached === false,
        history: changes.reverse().slice(0, 20),
      },
      quota: d.quota || null,
    };
  } catch (err) {
    console.warn(`Tracker: player ${id} failed:`, err.message);
    return { error: 'unavailable' };
  }
}

/** Today's tracker requests ({ limit, used, remaining, … }): costs one request itself. */
export async function fetchQuota({ use = 'steward', env = process.env, fetchImpl = fetch } = {}) {
  const key = trackerKey(env);
  if (!key) return null;
  try {
    const res = await trackerGet('/quota', { key, use, timeoutMs: 5000, fetchImpl });
    return (res.ok && res.data && res.data.quota) || null;
  } catch {
    return null;
  }
}
