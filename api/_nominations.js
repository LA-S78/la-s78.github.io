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

/**
 * Player IDs in nominations (owner request, 2026-11-18). Officers may type a player ID or a
 * name; each line is matched to a member of the alliance (api/_tracker.js findMember) and
 * the list is saved by name with the matched IDs alongside (`ids`: { name: uid }), so the
 * King's console can show a player's current name and picture even after a rename.
 *
 * `typed`: the cleaned list; `members`: the tracker's members (null when unavailable);
 * `previous`: the alliance's saved entry; `locked`: its handed-out chests.
 * Returns { names, ids } or { error: { key, vars } }.
 *  - An ID becomes the member's name; a typed ID nobody has is refused (and refused when
 *    the tracker can't be asked: a number would otherwise be saved as a name).
 *  - A player whose chest is already handed out keeps the name it was ticked under, even if
 *    they renamed since (the lock stays theirs).
 *  - IDs from the previous save are kept for names the tracker doesn't know now.
 */
export function resolvePlayers(typed, members, previous, locked = [], { findMember, looksLikeId }) {
  const oldIds = (previous && previous.ids) || {};
  const lockedByUid = new Map();
  for (const l of locked) if (oldIds[l.name]) lockedByUid.set(oldIds[l.name], l.name);
  const names = [];
  const ids = {};
  const seen = new Set();
  for (const raw of typed) {
    const m = findMember(raw, members);
    if (!m && looksLikeId(raw)) {
      return { error: { key: members ? 'id_not_found' : 'ids_unavailable', vars: { id: raw } } };
    }
    // A typed ID becomes the name; a typed name stays as written (the name check advises)
    let name = m && looksLikeId(raw) && m.name !== raw ? m.name : raw;
    const uid = m ? m.uid : oldIds[name] || null;
    if (uid && lockedByUid.has(uid)) name = lockedByUid.get(uid);
    const key = uid ? `#${uid}` : name.toLowerCase();
    if (seen.has(key) || seen.has(name.toLowerCase())) {
      return { error: { key: 'listed_twice', vars: { name } } };
    }
    seen.add(key);
    seen.add(name.toLowerCase());
    names.push(name);
    if (uid) ids[name] = uid;
  }
  return { names, ids };
}

/** The saved entry for an alliance's ranked list, with chests for what's available now. */
export function buildNomination(tag, names, rewardsData, mapState, submittedAt, ids = {}) {
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
    // Player IDs by name, for the names on the list that have one
    ids: Object.fromEntries(ranked.filter((n) => ids && ids[n]).map((n) => [n, String(ids[n])])),
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
    out[tag] = buildNomination(
      tag,
      ranked,
      rewardsData,
      mapState,
      entry.submittedAt || null,
      entry.ids || {},
    );
    recordBuyoutNominees(rewardsData, out[tag]);
  }
  return out;
}
