// api/state.js - Unified Kingdom State Proxy & Data Sanitizer
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { scope = 'all' } = req.query;
  const GIST_ID = process.env.GIST_ID;
  const GIST_TOKEN = process.env.GIST_TOKEN;

  // Fallback defaults in case Gist is empty or unreachable
  const fallbackState = {
    alliances: {},
    blacklist: { players: [], alliances: [] },
    territory_ownership: {},
    rewards: { mode: 'standard', distribution_tiers: [], lastReset: null },
    revision: 'initial',
    lastUpdated: new Date().toISOString()
  };

  if (!GIST_ID) {
    return res.status(200).json(formatScopedResponse(fallbackState, scope));
  }

  try {
    const headers = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'WarRoom-StateProxy'
    };

    if (GIST_TOKEN) {
      headers.Authorization = `Bearer ${GIST_TOKEN}`;
    }

    // 1. Single round-trip fetch retrieving all Gist state files simultaneously
    const gistRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers,
      signal: AbortSignal.timeout(3500)
    });

    if (!gistRes.ok) {
      throw new Error(`GitHub Gist error: ${gistRes.status} ${gistRes.statusText}`);
    }

    const gistData = await gistRes.json();

    const rawMapContent = gistData.files?.['map-state.json']?.content;
    const rawRewardsContent = gistData.files?.['rewards-data.json']?.content;

    const rawMapState = rawMapContent ? JSON.parse(rawMapContent) : {};
    const rawRewardsState = rawRewardsContent ? JSON.parse(rawRewardsContent) : {};

    // 2. Strict Projection & Data Sanitization (Data Minimization)
    // Only pass diplomatic data. Completely strips guild_id, alert_channel_id, alert_role_id,
    // officer_channel_id, and delegated_roles.
    const sanitizedAlliances = {};
    if (rawMapState.alliances && typeof rawMapState.alliances === 'object') {
      Object.entries(rawMapState.alliances).forEach(([tag, data]) => {
        const cleanTag = tag.toUpperCase().trim();
        sanitizedAlliances[cleanTag] = {
          tag: cleanTag,
          name: data?.name || cleanTag,
          rank: typeof data?.rank === 'number' ? data.rank : (parseInt(data?.rank, 10) || null),
          type: data?.type || (data?.parent_tag ? 'academy' : 'main'),
          parent_tag: data?.parent_tag ? data.parent_tag.toUpperCase().trim() : null,
          academies: Array.isArray(data?.academies)
            ? data.academies.map(a => String(a).toUpperCase().trim())
            : [],
          is_nap: data?.is_nap !== undefined ? Boolean(data.is_nap) : true,
          color: data?.color || '#B8975A'
        };
      });
    }

    const sanitizedBlacklist = {
      players: Array.isArray(rawMapState.blacklist?.players) ? rawMapState.blacklist.players : [],
      alliances: Array.isArray(rawMapState.blacklist?.alliances) ? rawMapState.blacklist.alliances : []
    };

    const sanitizedTerritory = rawMapState.territory_ownership || {};
    const revision = rawMapState.revision || rawMapState.lastUpdated || Date.now().toString(36);
    const lastUpdated = rawMapState.lastUpdated || new Date().toISOString();

    const sanitizedRewards = {
      mode: rawRewardsState.mode || 'standard',
      distribution_tiers: Array.isArray(rawRewardsState.distribution_tiers)
        ? rawRewardsState.distribution_tiers
        : [],
      lastReset: rawRewardsState.lastReset || null,
      lastUpdated: rawRewardsState.lastUpdated || null
    };

    const unifiedState = {
      alliances: sanitizedAlliances,
      blacklist: sanitizedBlacklist,
      territory_ownership: sanitizedTerritory,
      rewards: sanitizedRewards,
      revision,
      lastUpdated
    };

    // 3. Edge CDN Caching
    // Cache for 60 seconds on Vercel CDN; keep serving stale data for up to 5 minutes while revalidating
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    return res.status(200).json(formatScopedResponse(unifiedState, scope));

  } catch (err) {
    console.error('State Proxy Error:', err.message);
    // Return graceful fallback on upstream failure
    return res.status(200).json(formatScopedResponse(fallbackState, scope));
  }
}

/**
 * Filters the unified state into targeted client payloads based on query scope.
 */
function formatScopedResponse(state, scope) {
  const cleanScope = String(scope).toLowerCase().trim();

  switch (cleanScope) {
    // Used by alliance.html (Diplomacy, NAP rankings, and Blacklist)
    case 'alliances':
    case 'diplomacy':
    case 'ranks':
      return {
        alliances: state.alliances,
        blacklist: state.blacklist,
        revision: state.revision,
        lastUpdated: state.lastUpdated
      };

    // Used by map.html (Backward-compatible with map-state.js)
    case 'map':
    case 'territory':
      return {
        alliances: state.alliances,
        territory_ownership: state.territory_ownership,
        revision: state.revision,
        lastUpdated: state.lastUpdated
      };

    // Used by distribute.html and nominate.html (Backward-compatible with rewards-state.js)
    case 'rewards':
      return {
        mode: state.rewards.mode,
        distribution_tiers: state.rewards.distribution_tiers,
        lastReset: state.rewards.lastReset,
        lastUpdated: state.rewards.lastUpdated
      };

    // Default: Complete unified kingdom snapshot
    case 'all':
    default:
      return state;
  }
}