// api/_nominations.js
// Saved nominations (rewards-nominations.json): one entry per alliance holding its ranked
// list and the chests worked out from it (api/_nomination_assign.js). The chests are worked
// out again whenever what's available changes (a Kingdom War result is recorded or changed).

import { getAllianceNominationQuota } from './_rewards_helper.js';
import { assignChests, chestCounts, rankedFromSlots } from './_nomination_assign.js';

/** The saved entry for an alliance's ranked list, with chests for what's available now. */
export function buildNomination(tag, ranked, rewardsData, mapState, submittedAt) {
  const quota = getAllianceNominationQuota(tag, rewardsData, mapState);
  const { recipients, reserves, unfilled } = assignChests(ranked, chestCounts(quota, quota.isKW));
  return {
    alliance: tag,
    rank: quota.rank,
    mode: quota.isKW ? 'kw' : 'standard',
    period: rewardsData.period?.id || null,
    ranked,
    reserves,
    unfilled,
    recipients,
    hasBuyoutBonus: quota.hasBuyoutBonus,
    isWloDeducted: quota.isWloDeducted,
    buyoutTicketId: quota.buyoutDetails?.ticketId || null,
    submittedAt,
  };
}

/**
 * Records who receives a buyout's restitution chests: the last gold of each set in the
 * beneficiary's list (as the King's page shows it). Changes rewardsData in place.
 */
export function recordBuyoutNominees(rewardsData, entry) {
  if (!entry.buyoutTicketId || !Array.isArray(rewardsData.wartime_buyouts)) return;
  const ticket = rewardsData.wartime_buyouts.find((b) => b.id === entry.buyoutTicketId);
  const week = rewardsData.cycle_state?.current_week;
  const inst = ticket?.installments?.find((i) => Number(i.week) === Number(week));
  if (!inst) return;
  inst.nominated_players = {
    regular: (entry.recipients.standard?.commanders_will || []).slice(-1),
    kw: (entry.recipients.kingdom_war?.commanders_will || []).slice(-1),
  };
  inst.status = 'nominated';
}

/**
 * Works out every alliance's chests again from its ranked list (entries saved before lists
 * were kept are read back into a list in chest order). Returns the new nominations.
 */
export function reassignAllNominations(nominations = {}, rewardsData, mapState) {
  const out = {};
  for (const [tag, entry] of Object.entries(nominations || {})) {
    if (!entry || typeof entry !== 'object') continue;
    const ranked = Array.isArray(entry.ranked)
      ? entry.ranked
      : rankedFromSlots(entry.recipients || {});
    out[tag] = buildNomination(tag, ranked, rewardsData, mapState, entry.submittedAt || null);
    recordBuyoutNominees(rewardsData, out[tag]);
  }
  return out;
}
