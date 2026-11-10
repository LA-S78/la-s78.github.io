// api/_nomination_assign.js
// Turns an alliance's ranked list of players (best first) into chests. The list is what is
// saved; the chests are always worked out from it and from the chests available right now,
// so when set 2 opens (a Kingdom War win) or a count changes, the same list is simply
// re-sorted and the best players still get the best chests. Names beyond the available
// chests are kept as reserves. Each player gets at most one chest.
//
// Chest quality, best first (in-game gem values: 2,500 / 2,200 / 1,250 / 1,100 / 500 / 400):
// set 2's gold (Honor Vanguard), set 1's gold (Commander's Will), set 2's purple (Fearless
// Hero), set 1's purple (Loyal Servant), set 2's blue (Logistics Support), set 1's blue
// (Follower's Heart). Stored with the original keys: `standard` = set 1, `kingdom_war` = set 2.

export const CHEST_ORDER = [
  ['kingdom_war', 'commanders_will'],
  ['standard', 'commanders_will'],
  ['kingdom_war', 'loyal_servant'],
  ['standard', 'loyal_servant'],
  ['kingdom_war', 'followers_heart'],
  ['standard', 'followers_heart'],
];

/** Most names one list may hold (every chest of both sets, plus reserves). */
export const MAX_RANKED_NAMES = 80;
/** Longest player name accepted. */
export const MAX_NAME_LENGTH = 40;

/**
 * Chest counts for an alliance from getAllianceNominationQuota()'s result.
 * withSet2: include set 2. Its gold count comes from the quota, so for an "if won" preview
 * compute the quota as if won (see quotaIfWon in _rewards_helper.js).
 */
export function chestCounts(quotaData, withSet2) {
  const q = quotaData?.quotas || {};
  const set1 = {
    commanders_will: Number(q.commanders_will_regular || 0),
    loyal_servant: Number(q.loyal_servant || 0),
    followers_heart: Number(q.followers_heart || 0),
  };
  return {
    standard: set1,
    ...(withSet2
      ? {
          kingdom_war: {
            commanders_will: Number(q.commanders_will_kw || 0),
            loyal_servant: set1.loyal_servant,
            followers_heart: set1.followers_heart,
          },
        }
      : {}),
  };
}

/**
 * Cleans a list of names: trimmed, no blanks, no repeats (any letter case), capped.
 * Returns { names, error } (error is a message for the first problem found, or null).
 */
export function cleanRankedList(raw) {
  if (!Array.isArray(raw)) return { names: [], error: 'The list of players is missing.' };
  const names = [];
  const seen = new Set();
  for (const value of raw) {
    const name = String(value ?? '').trim();
    if (!name) continue;
    if (name.length > MAX_NAME_LENGTH) {
      return { names, error: `"${name.slice(0, 20)}…" is longer than ${MAX_NAME_LENGTH} letters.` };
    }
    const key = name.toLowerCase();
    if (seen.has(key)) return { names, error: `${name} is in the list twice.` };
    seen.add(key);
    names.push(name);
  }
  if (names.length === 0) return { names, error: 'Enter at least one player.' };
  if (names.length > MAX_RANKED_NAMES) {
    return { names, error: `At most ${MAX_RANKED_NAMES} players per list.` };
  }
  return { names, error: null };
}

/**
 * Assigns chests to a ranked list, best chest to the first name.
 * @param {string[]} ranked cleaned names, best first
 * @param {{standard: object, kingdom_war?: object}} counts from chestCounts()
 * @returns {{ recipients: object, reserves: string[], unfilled: number }}
 *   recipients mirrors the stored shape: { standard: {commanders_will: [...], ...},
 *   kingdom_war?: {...} }, each list in ranking order; unfilled = chests with no name yet
 */
export function assignChests(ranked, counts) {
  const recipients = {};
  for (const pool of Object.keys(counts)) {
    recipients[pool] = { commanders_will: [], loyal_servant: [], followers_heart: [] };
  }
  let next = 0;
  let unfilled = 0;
  for (const [pool, chest] of CHEST_ORDER) {
    const n = counts[pool]?.[chest] || 0;
    for (let i = 0; i < n; i++) {
      if (next < ranked.length) recipients[pool][chest].push(ranked[next++]);
      else unfilled++;
    }
  }
  return { recipients, reserves: ranked.slice(next), unfilled };
}

/**
 * A ranked list from slots saved before lists were kept (or sent by an old open page):
 * the names in chest-quality order.
 */
export function rankedFromSlots(recipients = {}) {
  const pools = recipients.standard ? recipients : { standard: recipients };
  const names = [];
  for (const [pool, chest] of CHEST_ORDER) {
    for (const name of pools[pool]?.[chest] || []) names.push(name);
  }
  return names;
}
