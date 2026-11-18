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

const BASE = 'https://api.lastasylumtracker.com/v1';
/** Our kingdom (the tracker's server number). */
export const TRACKER_SERVER = 78;
/** Member lists are reused for an hour in a warm server instance (the tracker's own age). */
const CACHE_MS = 60 * 60 * 1000;
const cache = new Map();

export const trackerConfigured = (env = process.env) =>
  Boolean(String(env.LAT_API_KEY || '').trim());

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
    /^(?:https:\/\/(?:api\.)?lastasylumtracker\.com)?\/static\/(avatars\/head_\d{1,7}|frames\/frame_\d{1,7})\.png$/,
  );
  return art ? `/game-art/${art[1]}.png` : null;
}

/** What the site keeps of an alliance answer. */
function slim(d) {
  return {
    tag: String(d.abbr || ''),
    name: String(d.name || ''),
    power: Number(d.power) || 0,
    memberCount: Number(d.member_count) || (Array.isArray(d.members) ? d.members.length : 0),
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
      }))
      .filter((m) => m.name),
    ageSeconds: Number(d.age_seconds) || 0,
    live: d.cached === false,
    at: Date.now(),
  };
}

/**
 * An alliance on our server by its exact tag (letter case counts, as on the site), or null.
 * `fresh: true` asks the game itself (about a second; the tracker's own copy can be days
 * old), and is what the ascension snapshots use. `timeoutMs` keeps pages quick.
 * Returns { tag, name, power, memberCount, members: [{ uid, name, power }], ageSeconds, live }.
 */
export async function fetchAlliance(
  tag,
  { fresh = false, timeoutMs = 4000, env = process.env, fetchImpl = fetch } = {},
) {
  const key = String(env.LAT_API_KEY || '').trim();
  const clean = String(tag || '').trim();
  if (!key || !clean) return null;
  const hit = cache.get(clean);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit;
  try {
    const url = `${BASE}/alliances/${TRACKER_SERVER}/${encodeURIComponent(clean)}${fresh ? '?fresh=1' : ''}`;
    const res = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        // The tracker's Cloudflare refuses requests without a normal user agent
        'User-Agent': 'Mozilla/5.0 (compatible; la-s78.app)',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      // 409: the tag could mean more than one alliance; 404: not on the server; 429: out of
      // today's requests. All mean "no list" here.
      console.warn(`Tracker: [${clean}] answered HTTP ${res.status}`);
      return null;
    }
    const data = slim(await res.json());
    // Only the alliance asked for (the tracker matches tags by letter case too)
    if (data.tag !== clean) return null;
    cache.set(clean, data);
    return data;
  } catch (err) {
    console.warn(`Tracker: [${clean}] failed:`, err.message);
    return null;
  }
}

/**
 * Members' pictures by name, for pages that show players by the name a leader typed (Caravan
 * Rotor, nomination list, King's console): { name: { avatar, frame } }. Members with neither
 * are left out; the page shows their initial.
 */
export function memberPictures(alliance) {
  if (!alliance) return null;
  const out = {};
  for (const m of alliance.members) {
    if (m.avatar || m.frame) out[m.name] = { avatar: m.avatar, frame: m.frame };
  }
  return out;
}

/** Just the member names of an alliance (for the name checks), or null. */
export async function memberNames(tag, options) {
  const a = await fetchAlliance(tag, options);
  return a ? a.members.map((m) => m.name) : null;
}
