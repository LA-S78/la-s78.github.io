// api/_nominations.js
// Saved nominations (rewards-nominations.json): one entry per alliance holding its ranked
// list and the chests worked out from it (api/_nomination_assign.js). The chests are worked
// out again whenever what's available changes (a Kingdom War result is recorded or changed).

import { getAllianceNominationQuota } from './_rewards_helper.js';
import { assignChests, chestCounts, rankedFromSlots } from './_nomination_assign.js';

/**
 * Chests the King has ticked as handed out this period (rewards-data.json
 * `period.handed_out`): { key: { alliance, pool, chest, name, by, at } }. A handed-out chest
 * is locked: re-sorting a list never moves it (assignChests).
 */
export function handedOutFor(rewardsData, tag) {
  const all = rewardsData?.period?.handed_out || {};
  return Object.values(all).filter((h) => h && h.alliance === tag);
}

/** The key of a handed-out chest in `period.handed_out`. */
export function handedOutKey(alliance, pool, chest, name) {
  return `${alliance}:${pool}:${chest}:${String(name).trim().toLowerCase()}`;
}

/**
 * The alliance whose leader is King this period: the one scheduled to hold the Capitol in
 * the period's week (with any swap or buyout applied). Null when unknown.
 */
export function kingAlliance(rewardsData, period) {
  return rewardsData?.cycle_state?.active_schedule?.[period?.slotKey] || null;
}

/** The saved entry for an alliance's ranked list, with chests for what's available now. */
export function buildNomination(tag, names, rewardsData, mapState, submittedAt) {
  const quota = getAllianceNominationQuota(tag, rewardsData, mapState);
  // Handed-out players stay on the list (an alliance can't drop a chest already given).
  const locked = handedOutFor(rewardsData, tag);
  const listed = new Set(names.map((n) => n.toLowerCase()));
  const ranked = [
    ...locked.map((l) => l.name).filter((n) => !listed.has(n.toLowerCase())),
    ...names,
  ];
  const { recipients, reserves, unfilled } = assignChests(
    ranked,
    chestCounts(quota, quota.isKW),
    locked,
  );
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
