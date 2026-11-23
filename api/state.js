// api/state.js
import { isGistConfigured, readGist, gistJson } from './_gist.js';
import { allianceFrames, applyAllianceFrames } from './_alliance_images.js';
import { sanitizeAlliances } from './_alliances.js';
import { readRegister } from './_register.js';
import { formerlyTags } from './_rename.js';
import { liveImages } from './_alliance_images.js';
import { getRoleColors } from './_role_colors.js';
import { DEFAULT_CALENDAR_CONFIG } from './_calendar_helper.js';
import { describeRewardPeriod, getRewardPeriod } from './_reward_period.js';
// Unified Read-Only State Proxy for Map, Rewards, and Alliance Hierarchy

import { BASELINE_SCHEDULES } from './_cycle_helper.js';
import { fetchAlliance, knownMissing } from './_tracker.js';
import { lookupPlayer, readStatsSummary, readTopPlayers, withPublicIds } from './_stats.js';
import { verifySessionToken } from './_tokens.js';
import { isSteward } from './_stewards.js';

/** Is this request from a signed-in Steward? (their pass in the Authorization header) */
function stewardSession(req) {
  const pass = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  if (!pass || !process.env.DISCORD_BOT_TOKEN) return false;
  const session = verifySessionToken(pass, process.env.DISCORD_BOT_TOKEN);
  return Boolean(session && isSteward(session.uid));
}

/**
 * Ensures cycle_state always returns valid numbers and never has an empty active_schedule.
 */
function resolveCycleState(raw = {}) {
  const macroCycle = Number(raw?.macro_cycle) || 1;
  const baseline = BASELINE_SCHEDULES[macroCycle] || BASELINE_SCHEDULES[1];

  const hasValidSchedule =
    raw?.active_schedule &&
    typeof raw.active_schedule === 'object' &&
    Object.keys(raw.active_schedule).length > 0;

  return {
    macro_cycle: macroCycle,
    current_week:
      raw?.current_week !== undefined && raw?.current_week !== null ? Number(raw.current_week) : 1,
    override_count: Number(raw?.override_count) || 0,
    active_schedule: hasValidSchedule ? raw.active_schedule : { ...baseline },
    history: Array.isArray(raw?.history) ? raw.history : [],
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isGistConfigured()) {
    return res.status(500).json({ error: 'Server Gist configuration missing' });
  }

  const scope = String(req.query.scope || 'all').toLowerCase();

  try {
    const [gist, roleColors] = await Promise.all([readGist(), getRoleColors()]);
    const mapState = gistJson(gist, 'map-state.json');
    const rewardsState = gistJson(gist, 'rewards-data.json');

    const cleanAlliances = sanitizeAlliances(mapState.alliances || {}, roleColors);
    const version = String(mapState.lastUpdated || mapState.revision || 'initial');
    // The Stats answers are kept an hour under their address, `v` included (Gemini's review,
    // 2026-11-22): any `v` but the current one is sent to the current one, so a made-up one
    // never gets an hour of its own (nor a Blob read)
    if (
      ['stats', 'stats-players'].includes(scope) &&
      req.query.v !== undefined &&
      String(req.query.v) !== version
    ) {
      res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
      res.setHeader('Location', `/api/state?scope=${scope}&v=${encodeURIComponent(version)}`);
      return res.status(307).end();
    }
    // "[Arch], formerly [HMDA]" for 30 days after a Steward renamed it (alliance IDs step 7)
    for (const [tag, was] of Object.entries(formerlyTags(readRegister(gist)))) {
      if (cleanAlliances[tag]) cleanAlliances[tag].formerly = was;
    }
    const blacklist = mapState.blacklist || { players: [], alliances: [] };
    // Approved card pictures (api/_alliance_images.js): { TAG: { card, wide } }
    const allianceImages = liveImages(gist, mapState.alliances || {});
    const resolvedCycleState = resolveCycleState(rewardsState.cycle_state);
    // This week's reward period, from the clock (api/_reward_period.js)
    const rewardPeriod = describeRewardPeriod(
      getRewardPeriod(Date.now(), {
        ...DEFAULT_CALENDAR_CONFIG,
        ...gistJson(gist, 'calendar-state.json', {}),
      }),
      rewardsState,
    );

    // Short edge cache with stale-while-revalidate
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');

    switch (scope) {
      // The alliance list's version (owner's step 7 rehearsal, 2026-11-22): the Stats answers
      // are kept an hour by Vercel, so the pages ask for them with this in the address; a
      // rename, swap or planner change gives a new one, and so fresh Stats at once
      // With each alliance's tag now by its ID, so a browser can bring its saved "My alliance"
      // up to date after a rename (Gemini's review, 2026-11-22)
      case 'version':
        return res.status(200).json({
          v: version,
          tags: Object.fromEntries(
            Object.entries(mapState.alliances || {})
              .filter(([, a]) => a?.id)
              .map(([tag, a]) => [a.id, tag]),
          ),
        });

      case 'map':
        return res.status(200).json({
          alliances: cleanAlliances,
          territory_ownership: mapState.territory_ownership || {},
          revision: mapState.revision || 'initial',
          lastUpdated: mapState.lastUpdated || null,
        });

      case 'alliances':
        return res.status(200).json({
          alliances: cleanAlliances,
          alliance_images: allianceImages,
          blacklist,
          revision: mapState.revision || 'initial',
          lastUpdated: mapState.lastUpdated || null,
        });

      // The Alliance standings cards' live numbers (owner request, 2026-11-19): each NAP
      // alliance's Might, members, level and in-game badge from the Last Asylum Tracker. Loaded
      // after the standings, so a slow tracker never holds them up. Kept 2 hours by Vercel (and
      // an hour on each server), so the tracker is asked at most about 10 times every 2 hours.
      case 'tracker': {
        const tags = Object.entries(mapState.alliances || {})
          .filter(([, a]) => a && a.is_nap !== false)
          .map(([tag]) => tag)
          .slice(0, 30);
        const found = await Promise.all(
          tags.map((tag) => fetchAlliance(tag, { timeoutMs: 3000, use: 'public' })),
        );
        const stats = {};
        tags.forEach((tag, i) => {
          const a = found[i];
          if (!a) return;
          stats[tag] = {
            power: a.power,
            members: a.memberCount,
            capacity: a.capacity,
            level: a.level,
            badge: a.badge,
          };
        });
        // Only a full answer is kept long: one with gaps (a slow lookup) is asked again soon.
        // An alliance the tracker doesn't have (HMDA, 2026-11-19) isn't a gap.
        const complete = tags.every((tag) => stats[tag] || knownMissing(tag));
        res.setHeader(
          'Cache-Control',
          complete
            ? 'public, s-maxage=7200, stale-while-revalidate=86400'
            : 's-maxage=300, stale-while-revalidate=600',
        );
        return res.status(200).json({ stats });
      }

      // The Stats tab (api/_stats.js): each NAP alliance's Might per day, with today's NAP
      // list (in rank order) and colours. Changes once a day: Vercel keeps it an hour.
      case 'stats': {
        const summary = await readStatsSummary();
        const nap = Object.entries(cleanAlliances)
          .filter(([, a]) => a && a.is_nap !== false)
          .sort(([, a], [, b]) => (Number(a.rank) || 999) - (Number(b.rank) || 999))
          .map(([tag, a]) => ({
            tag,
            name: a.name || '',
            color: a.color || null,
            rank: a.rank ?? null,
          }));
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
        return res.status(200).json({
          days: summary?.days || [],
          alliances: summary?.alliances || {},
          members: summary?.members || {},
          nap,
          updatedAt: summary?.updatedAt || null,
        });
      }

      // The Stats tab's Player lookup (api/_stats.js lookupPlayer): ?q= to search, ?id= (a
      // player's stand-in; ?uid= for Stewards) for
      // one player. NAP players from the daily snapshot only: never asks the tracker.
      case 'stats-player': {
        // Players' real IDs only for a signed-in Steward (the Steward tools page asks with
        // steward=1), never kept in a shared cache; everyone else gets stand-ins
        const steward = Boolean(req.query.steward) && stewardSession(req);
        const ask =
          req.query.id !== undefined
            ? { pid: String(req.query.id).slice(0, 20) }
            : req.query.uid !== undefined
              ? { uid: String(req.query.uid).slice(0, 20) }
              : { q: String(req.query.q || '').slice(0, 40) };
        // Alliance avatar frames over the game's default frame (api/_frames.js)
        const answer = applyAllianceFrames(
          await lookupPlayer(ask, { steward }),
          allianceFrames(gist),
        );
        res.setHeader(
          'Cache-Control',
          steward ? 'private, no-store' : 'public, s-maxage=1800, stale-while-revalidate=86400',
        );
        return res.status(200).json(answer);
      }

      // The Stats tab's Top players view (api/_stats.js topPlayers), worked out daily
      case 'stats-players': {
        const top = applyAllianceFrames(
          withPublicIds(await readTopPlayers()),
          allianceFrames(gist),
        );
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
        return res
          .status(200)
          .json(top || { day: null, days: [], players: {}, lists: {}, achievements: {} });
      }

      case 'rewards':
        return res.status(200).json({
          mode: rewardsState.mode || 'standard',
          distribution_tiers: rewardsState.distribution_tiers || [],
          cycle_state: resolvedCycleState,
          wartime_buyouts: rewardsState.wartime_buyouts || [],
          buyout_history: rewardsState.buyout_history || [],
          lastReset: rewardsState.lastReset || null,
          lastUpdated: rewardsState.lastUpdated || null,
          period: rewardPeriod,
        });

      case 'all':
      default:
        return res.status(200).json({
          map: {
            alliances: cleanAlliances,
            alliance_images: allianceImages,
            territory_ownership: mapState.territory_ownership || {},
            blacklist,
            revision: mapState.revision || 'initial',
            lastUpdated: mapState.lastUpdated || null,
          },
          rewards: {
            mode: rewardsState.mode || 'standard',
            distribution_tiers: rewardsState.distribution_tiers || [],
            cycle_state: resolvedCycleState,
            wartime_buyouts: rewardsState.wartime_buyouts || [],
            buyout_history: rewardsState.buyout_history || [],
            lastReset: rewardsState.lastReset || null,
            lastUpdated: rewardsState.lastUpdated || null,
            period: rewardPeriod,
          },
        });
    }
  } catch (error) {
    console.error('Error in /api/state:', error);
    return res.status(500).json({ error: 'Failed to load state from Gist' });
  }
}
