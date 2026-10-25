// api/state.js
// Unified Read-Only State Proxy for Map, Rewards, and Alliance Hierarchy

const DEFAULT_FALLBACK_COLORS = {
  WLO: '#25bb00',
  'RÂVN': '#cece00',
  RAVN: '#cece00',
  MIA: '#a400af',
  BOTS: '#0070f3',
  SVN: '#e53e3e',
  PHNX: '#dd6b20',
  HMDA: '#d53f8c',
  NAVI: '#319795',
  HeKi: '#d69e2e'
};

const BASELINE_SCHEDULES = {
  1: { downtime: 'BOTS', week_1: 'RÂVN', week_2: 'MIA', week_3: 'WLO' },
  2: { downtime: 'MIA', week_1: 'BOTS', week_2: 'RÂVN', week_3: 'WLO' },
  3: { downtime: 'RÂVN', week_1: 'MIA', week_2: 'BOTS', week_3: 'WLO' }
};

/**
 * Ensures cycle_state always returns valid numbers and never has an empty active_schedule.
 */
function resolveCycleState(raw = {}) {
  const macroCycle = Number(raw?.macro_cycle) || 1;
  const baseline = BASELINE_SCHEDULES[macroCycle] || BASELINE_SCHEDULES[1];

  const hasValidSchedule = raw?.active_schedule &&
    typeof raw.active_schedule === 'object' &&
    Object.keys(raw.active_schedule).length > 0;

  return {
    macro_cycle: macroCycle,
    current_week: raw?.current_week !== undefined && raw?.current_week !== null ? Number(raw.current_week) : 1,
    override_count: Number(raw?.override_count) || 0,
    active_schedule: hasValidSchedule ? raw.active_schedule : { ...baseline },
    history: Array.isArray(raw?.history) ? raw.history : []
  };
}

/**
 * Strips private Discord bot configuration fields before sending alliance data to public clients.
 * Preserves exact tag capitalization and diacritics (e.g., RÂVN, RâvN, râvn, HeKi).
 */
function sanitizeAlliances(rawAlliances = {}) {
  const sanitized = {};

  Object.entries(rawAlliances).forEach(([tag, data]) => {
    const cleanTag = tag.trim();
    if (!cleanTag) return;

    const storedColor = data?.color;
    const resolvedColor =
      storedColor && storedColor !== '#b8975a'
        ? storedColor
        : DEFAULT_FALLBACK_COLORS[cleanTag] || storedColor || null;

    sanitized[cleanTag] = {
      tag: cleanTag,
      name: data?.name || cleanTag,
      rank:
        data?.rank !== undefined && data?.rank !== null && data?.rank !== ''
          ? Number(data.rank)
          : null,
      type: data?.type || (data?.parent_tag ? 'academy' : 'main'),
      parent_tag: data?.parent_tag ? String(data.parent_tag).trim() : null,
      academies: Array.isArray(data?.academies)
        ? data.academies.map(a => String(a).trim()).filter(Boolean)
        : [],
      is_nap: data?.is_nap !== undefined ? Boolean(data.is_nap) : true,
      color: resolvedColor
    };
  });

  return sanitized;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GIST_ID = process.env.GIST_ID;
  const GIST_TOKEN = process.env.GIST_TOKEN;

  if (!GIST_ID || !GIST_TOKEN) {
    return res.status(500).json({ error: 'Server Gist configuration missing' });
  }

  const scope = String(req.query.scope || 'all').toLowerCase();

  try {
    const gistRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: {
        Authorization: `Bearer ${GIST_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'WarRoom-State-Proxy'
      }
    });

    if (!gistRes.ok) {
      throw new Error(`GitHub Gist API responded with ${gistRes.status}`);
    }

    const gistData = await gistRes.json();

    const mapRaw = gistData.files?.['map-state.json']?.content;
    const rewardsRaw = gistData.files?.['rewards-data.json']?.content;

    const mapState = mapRaw ? JSON.parse(mapRaw) : {};
    const rewardsState = rewardsRaw ? JSON.parse(rewardsRaw) : {};

    const cleanAlliances = sanitizeAlliances(mapState.alliances || {});
    const blacklist = mapState.blacklist || { players: [], alliances: [] };
    const resolvedCycleState = resolveCycleState(rewardsState.cycle_state);

    // Short edge cache with stale-while-revalidate
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');

    switch (scope) {
      case 'map':
        return res.status(200).json({
          alliances: cleanAlliances,
          territory_ownership: mapState.territory_ownership || {},
          revision: mapState.revision || 'initial',
          lastUpdated: mapState.lastUpdated || null
        });

      case 'alliances':
        return res.status(200).json({
          alliances: cleanAlliances,
          blacklist,
          revision: mapState.revision || 'initial',
          lastUpdated: mapState.lastUpdated || null
        });

      case 'rewards':
        return res.status(200).json({
          mode: rewardsState.mode || 'standard',
          distribution_tiers: rewardsState.distribution_tiers || [],
          cycle_state: resolvedCycleState,
          wartime_buyouts: rewardsState.wartime_buyouts || [],
          buyout_history: rewardsState.buyout_history || [],
          lastReset: rewardsState.lastReset || null,
          lastUpdated: rewardsState.lastUpdated || null
        });

      case 'all':
      default:
        return res.status(200).json({
          map: {
            alliances: cleanAlliances,
            territory_ownership: mapState.territory_ownership || {},
            blacklist,
            revision: mapState.revision || 'initial',
            lastUpdated: mapState.lastUpdated || null
          },
          rewards: {
            mode: rewardsState.mode || 'standard',
            distribution_tiers: rewardsState.distribution_tiers || [],
            cycle_state: resolvedCycleState,
            wartime_buyouts: rewardsState.wartime_buyouts || [],
            buyout_history: rewardsState.buyout_history || [],
            lastReset: rewardsState.lastReset || null,
            lastUpdated: rewardsState.lastUpdated || null
          }
        });
    }
  } catch (error) {
    console.error('Error in /api/state:', error);
    return res.status(500).json({ error: 'Failed to load state from Gist' });
  }
}