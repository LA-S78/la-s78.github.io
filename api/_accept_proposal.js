// api/_accept_proposal.js
// Saves an approved Steward proposal (rewards, map, alliance standings, Capitol override)
// to the Gist. Called directly by the Discord bot (api/interactions.js) after it has checked
// that the click came from Discord and that the clicker is a Steward. This used to be the
// public endpoint /api/accept-proposal, which took the bot token as a password; it is now an
// internal helper (files starting with "_" are not endpoints), so no token leaves the server.

import { calculateOverrideAction } from './_cycle_helper.js';
import { isGistConfigured, readGist, gistJson, writeGist } from './_gist.js';

/**
 * Reads one Gist file for an approval. Write paths never fall back to defaults when the
 * read fails (DECISIONS.md, "Data storage"): an approval saved on top of empty defaults
 * would wipe live kingdom data. If GitHub can't be read, the error propagates and the
 * Steward sees "Failed to update ..." in Discord; nothing is saved. `fallback` is only
 * used when the read succeeds but the file doesn't exist yet.
 */
const jsonResult = (status, json) => ({ status, json });

async function readForApproval(filename, fallback) {
  return gistJson(await readGist(), filename, fallback);
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

/**
 * @param {object} payload the proposal: { type, submittedBy, distribution | changes |
 *   alliances + blacklist | targetWeek + threatName + action, snapshotUrl }
 * @param {object} [options]
 * @param {string} [options.baseUrl] site address, used to pre-warm the map images after a map save
 * @returns {Promise<{status: number, json: object}>} the same status codes and bodies the
 *   endpoint used to send
 */
export async function acceptProposal(payload, { baseUrl = 'https://la-s78.app' } = {}) {
  const {
    type,
    distribution,
    changes,
    alliances: newAlliances,
    blacklist: newBlacklist,
    submittedBy,
    snapshotUrl,
  } = payload || {};

  if (!isGistConfigured()) {
    return { status: 500, json: { error: 'Gist environment variables missing on server' } };
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
          return jsonResult(400, { error: 'Invalid distribution data provided' });
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
        return jsonResult(200, { success: true, message: 'Rewards distribution updated in Gist!' });
      }

      // ======================================================================
      // 2. MAP TERRITORY PROPOSAL ACCEPTANCE
      // ======================================================================
      case 'map': {
        if (!changes || typeof changes !== 'object') {
          return jsonResult(400, { error: 'Invalid territory changes payload.' });
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
        await Promise.allSettled(
          ['level', 'alliance', 'resource'].map((view) =>
            fetch(`${baseUrl}/api/map-image?view=${view}&v=${revision}&ext=.png`, {
              headers: { 'User-Agent': 'WarRoom-Prewarmer' },
              signal: AbortSignal.timeout(1800),
            }),
          ),
        ).catch(() => {});

        return jsonResult(200, { success: true, revision, message: 'Live map updated in Gist!' });
      }

      // ======================================================================
      // 3. ALLIANCE & NAP STANDINGS PROPOSAL ACCEPTANCE
      // ======================================================================
      case 'alliance': {
        if (!newAlliances || typeof newAlliances !== 'object') {
          return jsonResult(400, { error: 'Invalid alliance data provided' });
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

        return jsonResult(200, {
          success: true,
          revision,
          message: 'Alliance standings updated in Gist!',
        });
      }

      // ======================================================================
      // 4. CAPITOL DEFENSE OVERRIDE (MODEL 1: SWAP OR INSTALLMENT BUYOUT)
      // ======================================================================
      case 'override': {
        const { targetWeek, threatName, action: declaredAction } = payload || {};
        if (!targetWeek || !threatName) {
          return jsonResult(400, { error: 'Missing targetWeek or threatName' });
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

        return jsonResult(200, {
          success: true,
          action: result.action,
          message: result.summary,
          newSchedule: result.newSchedule,
        });
      }

      default:
        return jsonResult(400, {
          error: `Unsupported proposal acceptance type: "${resolvedType || 'unknown'}". Supported types: "rewards", "map", "alliance", "override".`,
        });
    }
  } catch (error) {
    console.error('Accept proposal error:', error);
    return jsonResult(500, { error: error.message });
  }
}
