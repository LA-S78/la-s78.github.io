// api/accept-proposal.js

import { calculateOverrideAction } from './_cycle_helper.js';
import { isGistConfigured, readGist, gistJson, writeGist } from './_gist.js';

/**
 * Reads one Gist file for an approval, keeping this endpoint's original behaviour:
 * if GitHub answers with an error, carry on with `fallback` instead of failing.
 * WARNING: the approval then saves on top of `fallback`, which can overwrite live data.
 * Kept as-is pending maintainer review (see the open question in docs/DECISIONS.md).
 */
async function readForApproval(filename, fallback) {
  try {
    return gistJson(await readGist(), filename, fallback);
  } catch (err) {
    if (err.status) return fallback;
    throw err;
  }
}

const DEFAULT_FALLBACK_COLORS = {
  WLO: '#25bb00',
  RÂVN: '#cece00',
  RAVN: '#cece00',
  MIA: '#a400af',
  BOTS: '#0070f3',
  SVN: '#e53e3e',
  PHNX: '#dd6b20',
  HMDA: '#d53f8c',
  NAVI: '#319795',
  HeKi: '#d69e2e',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    type,
    distribution,
    changes,
    alliances: newAlliances,
    blacklist: newBlacklist,
    submittedBy,
    secretKey,
    snapshotUrl,
  } = req.body || {};

  // Authenticate request using bot secret
  const authSecret = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_SECRET;
  if (!secretKey || secretKey !== authSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!isGistConfigured()) {
    return res.status(500).json({ error: 'Gist environment variables missing on server' });
  }

  // Fallback: If legacy interaction dispatch omitted type, infer 'map' if changes are present
  const resolvedType = type || (changes ? 'map' : null);

  try {
    switch (resolvedType) {
      // ======================================================================
      // 1. REWARD DISTRIBUTION PROPOSAL ACCEPTANCE
      // ======================================================================
      case 'rewards': {
        if (!Array.isArray(distribution)) {
          return res.status(400).json({ error: 'Invalid distribution data provided' });
        }

        const existingRewards = await readForApproval('rewards-data.json', {});

        await writeGist(
          {
            'rewards-data.json': {
              ...existingRewards,
              distribution_tiers: distribution,
              lastUpdated: new Date().toISOString(),
              updatedBy: submittedBy || 'Discord Admin',
            },
          },
          {
            description: `Rewards updated by ${submittedBy || 'Admin'} at ${new Date().toISOString()}`,
          },
        );
        return res
          .status(200)
          .json({ success: true, message: 'Rewards distribution updated in Gist!' });
      }

      // ======================================================================
      // 2. MAP TERRITORY PROPOSAL ACCEPTANCE
      // ======================================================================
      case 'map': {
        if (!changes || typeof changes !== 'object') {
          return res.status(400).json({ error: 'Invalid territory changes payload.' });
        }

        const currentState = await readForApproval('map-state.json', {
          alliances: {},
          territory_ownership: {},
        });

        if (!currentState.territory_ownership) {
          currentState.territory_ownership = {};
        }

        Object.entries(changes).forEach(([cityId, change]) => {
          currentState.territory_ownership[cityId] = {
            owner: change.to,
            updatedAt: new Date().toISOString(),
          };
        });

        if (snapshotUrl) {
          currentState.lastSnapshotUrl = snapshotUrl;
        }

        const revision = Date.now().toString(36);
        currentState.revision = revision;
        currentState.lastUpdated = new Date().toISOString();
        currentState.updatedBy = submittedBy || 'Discord Admin';

        await writeGist(
          { 'map-state.json': currentState },
          {
            description: `Map updated by ${submittedBy || 'Admin'} at ${new Date().toISOString()}`,
          },
        );

        // Pre-warm Edge CDN for all 3 perspectives (capped to 1.8s timeout)
        const rawHost = req.headers['x-forwarded-host'] || req.headers.host || 'la-s78.app';
        const resolvedHost = rawHost.split(',')[0].trim();
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const baseUrl = `${protocol}://${resolvedHost}`;

        await Promise.allSettled(
          ['level', 'alliance', 'resource'].map((view) =>
            fetch(`${baseUrl}/api/map-image?view=${view}&v=${revision}&ext=.png`, {
              headers: { 'User-Agent': 'WarRoom-Prewarmer' },
              signal: AbortSignal.timeout(1800),
            }),
          ),
        ).catch(() => {});

        return res
          .status(200)
          .json({ success: true, revision, message: 'Live map updated in Gist!' });
      }

      // ======================================================================
      // 3. ALLIANCE & NAP STANDINGS PROPOSAL ACCEPTANCE
      // ======================================================================
      case 'alliance': {
        if (!newAlliances || typeof newAlliances !== 'object') {
          return res.status(400).json({ error: 'Invalid alliance data provided' });
        }

        const currentState = await readForApproval('map-state.json', {
          alliances: {},
          territory_ownership: {},
          blacklist: {},
        });

        const previousAlliances = currentState.alliances || {};
        const mergedAlliances = {};

        // Preserve exact tag casing (RÂVN, RâvN, râvn remain distinct keys)
        Object.entries(newAlliances).forEach(([tag, updatedData]) => {
          const cleanTag = tag.trim();
          if (!cleanTag) return;

          const existing = previousAlliances[cleanTag] || {};
          const incomingColor = updatedData.color;
          const resolvedColor =
            incomingColor && incomingColor !== '#b8975a'
              ? incomingColor
              : existing.color && existing.color !== '#b8975a'
                ? existing.color
                : DEFAULT_FALLBACK_COLORS[cleanTag] || incomingColor || existing.color;

          mergedAlliances[cleanTag] = {
            ...existing,
            ...updatedData,
            tag: cleanTag,
            color: resolvedColor,
            // Strictly preserve private Discord server bindings
            guild_id: existing.guild_id || updatedData.guild_id,
            alert_channel_id: existing.alert_channel_id || updatedData.alert_channel_id,
            alert_role_id: existing.alert_role_id || updatedData.alert_role_id,
            officer_channel_id: existing.officer_channel_id || updatedData.officer_channel_id,
            delegated_roles: existing.delegated_roles || updatedData.delegated_roles,
          };
        });

        currentState.alliances = mergedAlliances;

        if (newBlacklist) {
          currentState.blacklist = newBlacklist;
        }

        const revision = Date.now().toString(36);
        currentState.revision = revision;
        currentState.lastUpdated = new Date().toISOString();
        currentState.updatedBy = submittedBy || 'Discord Admin';

        await writeGist(
          { 'map-state.json': currentState },
          {
            description: `Alliances & NAP updated by ${submittedBy || 'Admin'} at ${new Date().toISOString()}`,
          },
        );

        return res
          .status(200)
          .json({ success: true, revision, message: 'Alliance standings updated in Gist!' });
      }

      // ======================================================================
      // 4. CAPITOL DEFENSE OVERRIDE (MODEL 1: SWAP OR INSTALLMENT BUYOUT)
      // ======================================================================
      case 'override': {
        const { targetWeek, threatName, action: declaredAction } = req.body || {};
        if (!targetWeek || !threatName) {
          return res.status(400).json({ error: 'Missing targetWeek or threatName' });
        }

        const rewardsState = await readForApproval('rewards-data.json', {});

        const cycleState = rewardsState.cycle_state || {
          macro_cycle: 1,
          current_week: 1,
          override_count: 0,
          active_schedule: { downtime: 'BOTS', week_1: 'RÂVN', week_2: 'MIA', week_3: 'WLO' },
        };

        // Force override_count to at least 1 if the UI explicitly declared a buyout
        if (
          declaredAction === 'buyout' &&
          (!cycleState.override_count || cycleState.override_count === 0)
        ) {
          cycleState.override_count = 1;
        }

        const result = calculateOverrideAction(cycleState, Number(targetWeek), threatName);

        // Apply state updates
        rewardsState.cycle_state = {
          ...cycleState,
          override_count: result.nextOverrideCount,
          active_schedule: result.newSchedule,
        };

        if (result.action === 'buyout' && result.buyoutTicket) {
          if (!rewardsState.wartime_buyouts) rewardsState.wartime_buyouts = [];
          rewardsState.wartime_buyouts.push(result.buyoutTicket);
        }

        rewardsState.lastUpdated = new Date().toISOString();
        rewardsState.updatedBy = submittedBy || 'Discord Admin';

        await writeGist(
          { 'rewards-data.json': rewardsState },
          {
            description: `Override Week ${targetWeek} (${result.action}) by ${submittedBy || 'Admin'}`,
          },
        );

        return res.status(200).json({
          success: true,
          action: result.action,
          message: result.summary,
          newSchedule: result.newSchedule,
        });
      }

      default:
        return res.status(400).json({
          error: `Unsupported proposal acceptance type: "${resolvedType || 'unknown'}". Supported types: "rewards", "map", "alliance", "override".`,
        });
    }
  } catch (error) {
    console.error('Accept proposal error:', error);
    return res.status(500).json({ error: error.message });
  }
}
