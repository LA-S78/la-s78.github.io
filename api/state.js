// api/state.js
import { isGistConfigured, readGist, gistJson } from './_gist.js';
import { sanitizeAlliances } from './_alliances.js';
import { DEFAULT_CALENDAR_CONFIG } from './_calendar_helper.js';
import { describeRewardPeriod, getRewardPeriod } from './_reward_period.js';
// Unified Read-Only State Proxy for Map, Rewards, and Alliance Hierarchy

const BASELINE_SCHEDULES = {
  1: { downtime: 'BOTS', week_1: 'RÂVN', week_2: 'MIA', week_3: 'WLO' },
  2: { downtime: 'MIA', week_1: 'BOTS', week_2: 'RÂVN', week_3: 'WLO' },
  3: { downtime: 'RÂVN', week_1: 'MIA', week_2: 'BOTS', week_3: 'WLO' },
};

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
    const gist = await readGist();
    const mapState = gistJson(gist, 'map-state.json');
    const rewardsState = gistJson(gist, 'rewards-data.json');

    const cleanAlliances = sanitizeAlliances(mapState.alliances || {});
    const blacklist = mapState.blacklist || { players: [], alliances: [] };
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
          blacklist,
          revision: mapState.revision || 'initial',
          lastUpdated: mapState.lastUpdated || null,
        });

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
