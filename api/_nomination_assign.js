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

/** The three chest kinds of a set (stored keys). */
export const CHEST_TYPES = ['commanders_will', 'loyal_servant', 'followers_heart'];

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
 * Chests the King has already handed out in the game (`locked`) can't move: those players
 * keep exactly that chest, even if it is no longer available (e.g. a result corrected from
 * Won to Lost after a set-2 chest was given), and the other names are sorted around them.
 * @param {string[]} ranked cleaned names, best first
 * @param {{standard: object, kingdom_war?: object}} counts from chestCounts()
 * @param {{pool: string, chest: string, name: string}[]} [locked] handed-out chests
 * @returns {{ recipients: object, reserves: string[], unfilled: number }}
 *   recipients mirrors the stored shape: { standard: {commanders_will: [...], ...},
 *   kingdom_war?: {...} }, each list in ranking order; unfilled = chests with no name yet
 */
export function assignChests(ranked, counts, locked = []) {
  const recipients = {};
  const left = {};
  const lockedOk = locked.filter(
    (l) =>
      ['standard', 'kingdom_war'].includes(l?.pool) && CHEST_TYPES.includes(l?.chest) && l.name,
  );
  for (const pool of new Set([...Object.keys(counts), ...lockedOk.map((l) => l.pool)])) {
    recipients[pool] = { commanders_will: [], loyal_servant: [], followers_heart: [] };
    left[pool] = { ...(counts[pool] || {}) };
  }
  const lockedNames = new Set();
  for (const { pool, chest, name } of lockedOk) {
    if (lockedNames.has(name.toLowerCase())) continue; // one chest per player
    lockedNames.add(name.toLowerCase());
    recipients[pool][chest].push(name);
    left[pool][chest] = Math.max(0, (left[pool][chest] || 0) - 1);
  }

  const free = ranked.filter((name) => !lockedNames.has(name.toLowerCase()));
  let next = 0;
  let unfilled = 0;
  for (const [pool, chest] of CHEST_ORDER) {
    const n = left[pool]?.[chest] || 0;
    for (let i = 0; i < n; i++) {
      if (next < free.length) recipients[pool][chest].push(free[next++]);
      else unfilled++;
    }
  }

  // Each chest's names in the order of the list (handed-out names not in it come first).
  const position = new Map(ranked.map((name, i) => [name.toLowerCase(), i]));
  const at = (name) => position.get(name.toLowerCase()) ?? -1;
  for (const pool of Object.values(recipients)) {
    for (const names of Object.values(pool)) names.sort((x, y) => at(x) - at(y));
  }
  return { recipients, reserves: free.slice(next), unfilled };
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
