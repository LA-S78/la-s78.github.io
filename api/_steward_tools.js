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
import { renamedAlliances } from './_alliance_ids.js';
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

function lookupsLeft(gist) {
  const d = gistJson(gist, FILE, {});
  const used = d.lookups?.day === gameDay() ? Number(d.lookups.count) || 0 : 0;
  return { used, left: Math.max(0, LOOKUPS_PER_DAY - used), max: LOOKUPS_PER_DAY };
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
      // NAP alliances renamed in the game, still measured by their game number meanwhile
      renamed: await renamedAlliances(
        napTags(gistJson(gist, 'map-state.json', { alliances: {} }).alliances || {}),
      ).catch(() => []),
    });
  }

  if (what === 'positions') return napPositions(req, res, { gist, session });

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
