// api/_dashboard.js
// The Alliance Dashboard's data and rules (api/dashboard.js is the endpoint). Helpers, not
// an endpoint.
//
// Storage: one Gist file per alliance, `dashboard-<TAG>.json` (docs/DECISIONS.md,
// "Alliance Dashboard"): small files keep every page's Gist read fast, stay well under
// GitHub's 1 MB per-file limit, and two alliances editing at once never touch the same file.

import { getAllianceNominationQuota, quotaIfWon } from './_rewards_helper.js';
import { chestCounts } from './_nomination_assign.js';
import { describeRewardPeriod } from './_reward_period.js';

/** Most bytes one alliance's dashboard file may hold (thousands of table rows). */
export const MAX_DASHBOARD_BYTES = 150 * 1024;

/** Tags compared without letter case or accents (RÂVN = ravn). */
export function foldTag(tag) {
  return String(tag || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** The alliance's key in map-state.json for a tag written any way, or null. */
export function findAllianceKey(alliances = {}, tag) {
  const want = foldTag(tag);
  if (!want) return null;
  return Object.keys(alliances).find((key) => foldTag(key) === want) || null;
}

/** The Gist file holding an alliance's dashboard (letters and digits only: RÂVN -> RAVN). */
export function dashboardFile(tag) {
  const slug = foldTag(tag)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return `dashboard-${slug || 'UNKNOWN'}.json`;
}

/**
 * An alliance's stored dashboard, filled in with defaults. `settings` and `tickets` are kept
 * for later features (e.g. help tickets) so they can be added without changing the format.
 */
export function readDashboard(gistFileJson, tag) {
  const d = gistFileJson && typeof gistFileJson === 'object' ? gistFileJson : {};
  return {
    alliance: tag,
    widgets: Array.isArray(d.widgets) ? d.widgets : [],
    settings: d.settings && typeof d.settings === 'object' ? d.settings : {},
    tickets: d.tickets ?? null,
    updatedAt: d.updatedAt || null,
    updatedBy: d.updatedBy || null,
  };
}

/**
 * What a viewer may see of a dashboard. Members get only what leadership marked for all
 * members; leaders (R4/R5/officers) and Stewards get everything. Enforced here, on the
 * server, so hidden parts never reach a member's browser.
 */
export function visibleDashboard(dashboard, leader) {
  const widgets = dashboard.widgets.filter((w) => leader || w?.visibility === 'members');
  const out = { alliance: dashboard.alliance, widgets, updatedAt: dashboard.updatedAt };
  if (leader) out.settings = dashboard.settings;
  return out;
}

/**
 * Who is looking, from the signed login pass: 'member' (sees members-only parts),
 * 'leader' (R4, R5 or an alliance officer: sees everything), 'steward' (any alliance).
 * canNominate: R5s and Stewards may open the nomination page from the dashboard (owner
 * decision); R4s and officers see the status and use /nominate in Discord.
 */
export function viewerAccess(session, steward) {
  const leader = steward || session.role === 'R4' || session.role === 'R5';
  return {
    tier: steward ? 'steward' : leader ? 'leader' : 'member',
    leader,
    canNominate: steward || session.role === 'R5',
  };
}

/**
 * The officers' weekly reward card: the period, set 2's state, this alliance's chests now
 * and if won, buyout changes, and whether its list was sent.
 */
export function rewardStatus({ tag, rewardsData, mapState, nominations, period }) {
  const current = !period.open || !rewardsData.period || rewardsData.period.id === period.id;
  const view = current ? rewardsData : { ...rewardsData, mode: 'standard', period: null };
  const quota = getAllianceNominationQuota(tag, view, mapState);
  const entry = current ? nominations?.[tag] : null;
  const chests = chestCounts(quota, quota.isKW);
  const count = (c) =>
    Object.values(c || {}).reduce(
      (sum, pool) => sum + Object.values(pool || {}).reduce((a, n) => a + Number(n || 0), 0),
      0,
    );
  return {
    period: describeRewardPeriod(period, rewardsData),
    rank: Number.isFinite(quota.rank) && quota.rank <= 50 ? quota.rank : null,
    chests,
    chestsIfWon: chestCounts(quotaIfWon(tag, view, mapState), true),
    totalNow: count(chests),
    hasBuyoutBonus: Boolean(quota.hasBuyoutBonus),
    isWloDeducted: Boolean(quota.isWloDeducted),
    buyoutThreat: quota.buyoutDetails?.threat || null,
    nomination: entry
      ? {
          submitted: true,
          ranked: Array.isArray(entry.ranked) ? entry.ranked.length : 0,
          reserves: Array.isArray(entry.reserves) ? entry.reserves.length : 0,
          unfilled: Number(entry.unfilled || 0),
          submittedAt: entry.submittedAt || null,
        }
      : { submitted: false },
  };
}
