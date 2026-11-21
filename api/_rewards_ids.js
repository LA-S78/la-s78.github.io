// api/_rewards_ids.js
// Rewards, nominations, buyouts and the Capitol rotation by alliance ID
// (docs/ALLIANCE-IDS-PLAN.md, step 4, 2026-11-22). Two stores (api/_id_stores.js):
//
// rewards-data.json (`version: 2` when moved), alliances by ID in:
//   - cycle_state.active_schedule (each seat: downtime, week_1, …) and cycle_state.cohort_seats;
//   - wartime_buyouts[]: `beneficiary` and `displaced`;
//   - period.handed_out: each chest's `alliance`, and the alliance part of its key
//     ("<alliance>:<pool>:<chest>:<name>").
//   Left as written (history): cycle_state.history and buyout_history.
//
// rewards-nominations.json (`version: 2` when moved): each alliance's list under its ID, and
// the entry's own `alliance`.
//
// As for the other stores, gistJson() gives every reader the tag form and updateGist() saves
// in the stored form. Only alliances in the register become IDs; anything else stays as
// written, both ways.

import { ID_PATTERN, followMerged, onMap, GAME, SERVER } from './_register.js';

export const REWARDS_FILE = 'rewards-data.json';
export const NOMINATIONS_FILE = 'rewards-nominations.json';
export const isById = (stored) => Boolean(stored && stored.version === 2);

/** tag → ID for alliances on the map; anything else unchanged. */
function toId(register) {
  const here = (a) => a.game === GAME && String(a.server) === SERVER;
  const byTag = new Map(
    Object.values(register.alliances)
      .filter((a) => onMap(a) && here(a))
      .map((a) => [a.tag, a.id]),
  );
  return (v) => (typeof v === 'string' && byTag.has(v) ? byTag.get(v) : v);
}

/** ID → the alliance's tag now; anything else unchanged. */
function toTag(register) {
  return (v) =>
    typeof v === 'string' && ID_PATTERN.test(v)
      ? followMerged(register, register.alliances[v])?.tag || v
      : v;
}

const mapValues = (obj, fn) =>
  obj && typeof obj === 'object' && !Array.isArray(obj)
    ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]))
    : obj;

/** rewards-data.json with every alliance reference passed through `ref`. */
function convertRewards(state, ref) {
  const out = { ...state };
  if (out.cycle_state && typeof out.cycle_state === 'object') {
    const cs = { ...out.cycle_state };
    if (cs.active_schedule) cs.active_schedule = mapValues(cs.active_schedule, ref);
    if (Array.isArray(cs.cohort_seats)) cs.cohort_seats = cs.cohort_seats.map(ref);
    else if (cs.cohort_seats) cs.cohort_seats = mapValues(cs.cohort_seats, ref);
    out.cycle_state = cs;
  }
  if (Array.isArray(out.wartime_buyouts)) {
    out.wartime_buyouts = out.wartime_buyouts.map((b) =>
      b && typeof b === 'object'
        ? {
            ...b,
            ...('beneficiary' in b ? { beneficiary: ref(b.beneficiary) } : {}),
            ...('displaced' in b ? { displaced: ref(b.displaced) } : {}),
          }
        : b,
    );
  }
  const handed = out.period?.handed_out;
  if (handed && typeof handed === 'object') {
    const next = {};
    for (const [key, h] of Object.entries(handed)) {
      if (!h || typeof h !== 'object') {
        next[key] = h;
        continue;
      }
      // The key starts with the alliance ("WLO:standard:…"); older ticks have no `alliance`
      const who = typeof h.alliance === 'string' ? h.alliance : key.split(':')[0];
      const alliance = ref(who);
      const k = key.startsWith(`${who}:`) ? `${alliance}${key.slice(who.length)}` : key;
      next[k] = typeof h.alliance === 'string' ? { ...h, alliance } : h;
    }
    out.period = { ...out.period, handed_out: next };
  }
  return out;
}

/** rewards-nominations.json with each list's key and `alliance` passed through `ref`. */
function convertNominations(state, ref) {
  const out = {};
  for (const [key, entry] of Object.entries(state || {})) {
    const k = ref(key);
    out[k] =
      entry && typeof entry === 'object' && typeof entry.alliance === 'string'
        ? { ...entry, alliance: ref(entry.alliance) }
        : entry;
  }
  return out;
}

const strip = (stored) => {
  const { version: _v, ...state } = stored || {};
  return state;
};

export const rewardsView = (stored, register) =>
  isById(stored) ? convertRewards(strip(stored), toTag(register)) : stored;
export const rewardsByIdForm = (view, register) => ({
  stored: { version: 2, ...convertRewards(strip(view), toId(register)) },
  register: null,
});

export const nominationsView = (stored, register) =>
  isById(stored) ? convertNominations(strip(stored), toTag(register)) : stored;
export const nominationsByIdForm = (view, register) => ({
  stored: { version: 2, ...convertNominations(strip(view), toId(register)) },
  register: null,
});

/** Counts for the moves' reports. */
export function countRewards(view, register) {
  const known = new Set(
    Object.values(register.alliances)
      .filter(onMap)
      .map((a) => a.tag),
  );
  const sched = Object.values(view?.cycle_state?.active_schedule || {});
  return {
    seats: sched.filter((t) => known.has(t)).length,
    buyouts: (view?.wartime_buyouts || []).length,
    handed: Object.entries(view?.period?.handed_out || {}).filter(([k, h]) =>
      known.has(typeof h?.alliance === 'string' ? h.alliance : k.split(':')[0]),
    ).length,
  };
}
export function countNominations(view, register) {
  const known = new Set(
    Object.values(register.alliances)
      .filter(onMap)
      .map((a) => a.tag),
  );
  const keys = Object.keys(view || {});
  return {
    lists: keys.filter((k) => known.has(k)).length,
    other: keys.filter((k) => !known.has(k)).length,
  };
}
