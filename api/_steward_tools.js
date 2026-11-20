// api/_steward_tools.js
// The Steward tools page (portal/steward.html; owner request, 2026-11-20): a place of the
// Stewards' own. Reached through /api/dashboard?steward=… (no new server function), Stewards
// only (checked here, whatever the page shows):
//   ?steward=overview          what's waiting: alliance pictures to review, the Top 4 race,
//                              and today's player lookups left
//   ?steward=player&uid=<id>   one player, live from the game (any server, any alliance):
//                              one tracker request, at most LOOKUPS_PER_DAY a day between all
//                              Stewards (counted in the Gist, steward-tools.json)
//   ?steward=quota             the tracker's requests used today (costs one request itself)
//   ?steward=positions         every NAP player's Sanctuary for the territory map's "All NAP
//                              players" (from the daily snapshot or the last Refresh: free)
//   ?steward=positions&refresh=1   asks the game again for every NAP alliance (one request
//                              each), at most POSITIONS_PER_DAY a day between all Stewards
//                              and one every POSITIONS_COOLDOWN_MIN minutes
// The overview also shows the day's tracker usage without asking the tracker: the latest
// figure any of its answers gave (with its time) and what made the requests (tracker-usage.json,
// kept by api/_tracker.js).

import { gistJson, updateGist } from './_gist.js';
import { isSteward } from './_stewards.js';
import { readImages, IMAGE_KINDS } from './_alliance_images.js';
import { latestRace } from './_ascension.js';
import { fetchPlayer, fetchQuota, unsavedUsage, usageDay, USAGE_FILE } from './_tracker.js';
import { say } from './_messages.js';
import { readNapPositions, refreshNapPositions } from './_stats.js';
import { noteSkin } from './_skins.js';
import { renamedAlliances, readAllianceIds, linkAlliance } from './_alliance_ids.js';
import { readStatsSummary } from './_stats.js';
import { fetchAlliance as fetchAllianceByTag } from './_tracker.js';
import { sanitizeAlliances } from './_alliances.js';
import { getRoleColors } from './_role_colors.js';
import { napTags } from './_ascension.js';

export const LOOKUPS_PER_DAY = 30;
const FILE = 'steward-tools.json';
/** The game day (GT, UTC-2): the allowance starts again at the 00:00 GT reset. */
const gameDay = (ms = Date.now()) => new Date(ms - 2 * 3600000).toISOString().slice(0, 10);

/** Today's tracker usage (UTC day): { day, by: { use: n }, last: { used, limit, at } | null }. */
export function trackerUsage(gist) {
  const day = usageDay();
  const saved = gistJson(gist, USAGE_FILE, {}).days?.[day] || {};
  const by = { ...(saved.by || {}) };
  let last = saved.last || null;
  // This server's own requests not saved yet
  const here = unsavedUsage();
  if (here.day === day) {
    for (const [use, n] of Object.entries(here.counts)) by[use] = (by[use] || 0) + n;
    if (here.last && usageDay(Date.parse(here.last.at)) === day) {
      if (!last || here.last.used >= last.used) last = here.last;
    }
  }
  return { day, by, last };
}

export const POSITIONS_PER_DAY = 8;
export const POSITIONS_COOLDOWN_MIN = 15;

/** The map's Refresh: { left, max, waitMinutes, lastAt }. */
export function positionsRefreshState(gist, now = Date.now()) {
  const r = gistJson(gist, FILE, {}).positions || {};
  const used = r.day === gameDay(now) ? Number(r.count) || 0 : 0;
  const last = Date.parse(r.lastAt || '');
  const waitMs = Number.isFinite(last) ? last + POSITIONS_COOLDOWN_MIN * 60000 - now : 0;
  return {
    left: Math.max(0, POSITIONS_PER_DAY - used),
    max: POSITIONS_PER_DAY,
    waitMinutes: waitMs > 0 ? Math.ceil(waitMs / 60000) : 0,
    lastAt: Number.isFinite(last) ? r.lastAt : null,
  };
}

async function napPositions(req, res, { gist, session }) {
  const before = positionsRefreshState(gist);
  if (!req.query.refresh) {
    return res.status(200).json({ ...(await readNapPositions({ gist })), refresh: before });
  }
  if (!before.left || before.waitMinutes) {
    return res.status(429).json({
      error: say(before.left ? 'api_dashboard.positions_wait' : 'api_dashboard.positions_used', {
        minutes: before.waitMinutes,
      }),
      refresh: before,
    });
  }
  // Counted first (a slow refresh can't be started twice meanwhile)
  let refresh = before;
  try {
    await updateGist(
      (fresh) => {
        const d = gistJson(fresh, FILE, {});
        const today = gameDay();
        const count = (d.positions?.day === today ? Number(d.positions.count) || 0 : 0) + 1;
        d.positions = { day: today, count, lastAt: new Date().toISOString() };
        refresh = positionsRefreshState({ files: { [FILE]: { content: JSON.stringify(d) } } });
        return {
          files: { [FILE]: d },
          description: `NAP positions refreshed by ${session.name || 'a Steward'}`,
        };
      },
      { gist },
    );
  } catch (err) {
    console.warn('Positions refresh not counted:', err.message);
  }
  try {
    const out = await refreshNapPositions({ gist });
    return res.status(200).json({ ...out, refresh });
  } catch (err) {
    return res.status(502).json({ error: err.message, refresh });
  }
}

/** Alliance links a day between all Stewards (each costs a tracker request, found or not). */
export const LINKS_PER_DAY = 10;

function linksLeft(gist) {
  const d = gistJson(gist, FILE, {});
  const used = d.links?.day === gameDay() ? Number(d.links.count) || 0 : 0;
  return { used, left: Math.max(0, LINKS_PER_DAY - used), max: LINKS_PER_DAY };
}

/** Counts one alliance link attempt (it asked the tracker). */
async function countLink(gist, session) {
  try {
    await updateGist(
      (fresh) => {
        const d = gistJson(fresh, FILE, {});
        const today = gameDay();
        const count = (d.links?.day === today ? Number(d.links.count) || 0 : 0) + 1;
        d.links = { day: today, count };
        return {
          files: { [FILE]: d },
          description: `Alliance link by ${session.name || 'a Steward'}`,
        };
      },
      { gist },
    );
  } catch (err) {
    console.warn('Alliance link not counted:', err.message);
  }
}

function lookupsLeft(gist) {
  const d = gistJson(gist, FILE, {});
  const used = d.lookups?.day === gameDay() ? Number(d.lookups.count) || 0 : 0;
  return { used, left: Math.max(0, LOOKUPS_PER_DAY - used), max: LOOKUPS_PER_DAY };
}

/** Renamed NAP alliances, each with its colour (Discord role colour first, as elsewhere). */
async function renamedWithColours(gist) {
  const raw = gistJson(gist, 'map-state.json', { alliances: {} }).alliances || {};
  const list = await renamedAlliances(napTags(raw));
  if (!list.length) return list;
  const colours = sanitizeAlliances(raw, await getRoleColors().catch(() => ({})));
  return list.map((r) => ({ ...r, color: colours[r.tag]?.color || null }));
}

/**
 * NAP alliances the latest Top 4 race day or Stats snapshot couldn't find, with no game
 * number saved for them and not already followed as renamed: [{ tag, name, color }].
 */
async function unfoundAlliances(gist) {
  const raw = gistJson(gist, 'map-state.json', { alliances: {} }).alliances || {};
  const tags = napTags(raw);
  const missing = new Set();
  const race = latestRace(gist);
  const raceDays = Object.entries(race?.taken || {})
    .filter(([, at]) => at)
    .map(([d]) => d);
  if (raceDays.length) {
    for (const row of race.rows) {
      if (tags.includes(row.tag) && raceDays.every((d) => !Number.isFinite(row.days?.[d])))
        missing.add(row.tag);
    }
  }
  const summary = await readStatsSummary().catch(() => null);
  const lastDay = summary?.days?.[summary.days.length - 1];
  if (lastDay) {
    for (const t of tags) if (!Number.isFinite(summary.alliances?.[t]?.[lastDay])) missing.add(t);
  }
  if (!missing.size) return [];
  const { ids, renamed } = await readAllianceIds();
  const colours = sanitizeAlliances(raw, await getRoleColors().catch(() => ({})));
  return [...missing]
    .filter((t) => !ids[t]?.aid && !renamed[t])
    .map((t) => ({ tag: t, name: raw[t]?.name || '', color: colours[t]?.color || null }));
}

/** ?steward=link&tag=HMDA&now=Arch: the alliance the site calls `tag` is `now` in the game. */
async function linkRenamed(req, res, { gist, session }) {
  const raw = gistJson(gist, 'map-state.json', { alliances: {} }).alliances || {};
  const tag = String(req.query.tag || '').trim();
  const now = String(req.query.now || '')
    .trim()
    .replace(/^\[|\]$/g, '')
    .slice(0, 24);
  if (!napTags(raw).includes(tag) || !now) {
    return res.status(400).json({ error: say('api_dashboard.link_bad') });
  }
  if (now === tag) return res.status(400).json({ error: say('api_dashboard.link_same') });
  // Another alliance the site already has: not this one under a new name
  if (Object.keys(raw).includes(now)) {
    return res.status(409).json({ error: say('api_dashboard.link_taken', { tag: `[${now}]` }) });
  }
  // At most LINKS_PER_DAY a day: a stuck page or repeated typos can't use up requests
  const before = linksLeft(gist);
  if (!before.left) {
    return res.status(429).json({ error: say('api_dashboard.links_used'), links: before });
  }
  const found = await fetchAllianceByTag(now, { fresh: true, timeoutMs: 7000, use: 'steward' });
  await countLink(gist, session);
  const links = { ...before, used: before.used + 1, left: before.left - 1 };
  if (!found) {
    return res
      .status(404)
      .json({ error: say('api_dashboard.link_not_found', { tag: `[${now}]` }), links });
  }
  if (!found.aid) return res.status(502).json({ error: say('api_dashboard.player_unavailable') });
  await linkAlliance(tag, found);
  return res.status(200).json({ linked: { tag, now: found.tag, name: found.name }, links });
}

export async function stewardTools(req, res, { gist, session }) {
  if (!isSteward(session.uid)) {
    return res.status(403).json({ error: say('api_dashboard.stewards_only') });
  }
  const what = String(req.query.steward);

  if (what === 'overview') {
    const images = readImages(gist);
    const pending = Object.values(images.pending)
      .sort((a, b) => a.at - b.at)
      .map((p) => ({
        id: p.id,
        tag: p.tag,
        kind: p.kind,
        label: IMAGE_KINDS[p.kind]?.label || p.kind,
        by: p.name,
        at: p.at,
      }));
    const race = latestRace(gist);
    return res.status(200).json({
      pending,
      race: race
        ? {
            id: race.id,
            taken: race.taken,
            finished: race.finished,
            top: race.rows.filter((r) => r.complete).slice(0, 6),
            missing: race.rows.filter((r) => !r.complete).map((r) => r.tag),
          }
        : null,
      lookups: lookupsLeft(gist),
      usage: trackerUsage(gist),
      // NAP alliances renamed in the game, still measured by their game number meanwhile,
      // with the alliance's colour (as on the rest of the site)
      renamed: await renamedWithColours(gist).catch(() => []),
      // NAP alliances the game didn't find, with no number to follow: a Steward can link them
      unfound: await unfoundAlliances(gist).catch(() => []),
      links: linksLeft(gist),
    });
  }

  if (what === 'positions') return napPositions(req, res, { gist, session });
  if (what === 'link') return linkRenamed(req, res, { gist, session });

  if (what === 'quota') {
    const quota = await fetchQuota();
    return res.status(200).json({ quota, usage: trackerUsage(gist) });
  }

  if (what === 'player') {
    const before = lookupsLeft(gist);
    if (!before.left) {
      return res.status(429).json({ error: say('api_dashboard.lookups_used'), lookups: before });
    }
    const found = await fetchPlayer(req.query.uid, { use: 'steward' });
    if (found.error) {
      return res.status(found.error === 'not_found' ? 404 : 502).json({
        error: say(
          found.error === 'not_found'
            ? 'api_dashboard.player_not_found'
            : 'api_dashboard.player_unavailable',
        ),
        lookups: before,
      });
    }
    // The map's game view keeps their skin (no extra request)
    try {
      await noteSkin(found.player);
    } catch (err) {
      console.warn('Skin not kept:', err.message);
    }
    // Counted once it worked (a failed lookup doesn't use up the day's allowance)
    let lookups = { ...before, used: before.used + 1, left: before.left - 1 };
    try {
      await updateGist(
        (fresh) => {
          const d = gistJson(fresh, FILE, {});
          const today = gameDay();
          const count = (d.lookups?.day === today ? Number(d.lookups.count) || 0 : 0) + 1;
          d.lookups = { day: today, count };
          lookups = {
            used: count,
            left: Math.max(0, LOOKUPS_PER_DAY - count),
            max: LOOKUPS_PER_DAY,
          };
          return {
            files: { [FILE]: d },
            description: `Steward lookup by ${session.name || 'a Steward'}`,
          };
        },
        { gist },
      );
    } catch (err) {
      console.warn('Steward lookup not counted:', err.message);
    }
    return res
      .status(200)
      .json({ player: found.player, quota: found.quota, lookups, usage: trackerUsage(gist) });
  }

  return res.status(400).json({ error: 'Unknown request.' });
}
