// api/_cycle_helper.js

import { STARTING_ROTATION } from './_alliances.js';

/** The rotation wheel: who holds each week in cycles 1-3, from seats A, B, C and rank #1. */
function wheel([seatA, seatB, seatC], rankOneTag) {
  return {
    1: { downtime: seatA, week_1: seatB, week_2: seatC, week_3: rankOneTag },
    2: { downtime: seatC, week_1: seatA, week_2: seatB, week_3: rankOneTag },
    3: { downtime: seatB, week_1: seatC, week_2: seatA, week_3: rankOneTag },
  };
}

/** The three cycles' schedules before any live data (from _data/alliances.yml). */
export const BASELINE_SCHEDULES = wheel(STARTING_ROTATION.seats, STARTING_ROTATION.rank_one);

/**
 * Resolves the 3-cycle cohort seats [SeatA, SeatB, SeatC] and Rank #1 holder.
 * Uses Option A (Seat Inheritance): if a new alliance enters the Top 4 in mapState,
 * they inherit the exact wheel seat vacated by the alliance that dropped out of Top 4.
 */
export function resolveCohortSchedule(macroCycle = 1, previousCohort = null, mapState = null) {
  const defaultCohort = [...STARTING_ROTATION.seats]; // [Seat A, Seat B, Seat C]
  let cohort =
    Array.isArray(previousCohort) && previousCohort.length === 3
      ? [...previousCohort]
      : [...defaultCohort];
  let rankOneTag = STARTING_ROTATION.rank_one;

  const alliances = mapState?.alliances || {};
  const rankedList = Object.entries(alliances)
    .map(([tag, data]) => ({ tag: tag.trim(), rank: parseInt(data?.rank, 10) }))
    .filter((a) => !isNaN(a.rank) && a.rank >= 1 && a.rank <= 4)
    .sort((a, b) => a.rank - b.rank);

  if (rankedList.length === 4) {
    rankOneTag = rankedList[0].tag;
    const topThreeChallengers = rankedList.slice(1).map((a) => a.tag);

    // Replace any seat holder who dropped out of Ranks #2-#4 with the newcomer
    const newcomers = topThreeChallengers.filter((tag) => !cohort.includes(tag));
    cohort = cohort.map((seatTag) => {
      if (topThreeChallengers.includes(seatTag)) return seatTag;
      return newcomers.shift() || seatTag;
    });
  }

  const [seatA, seatB, seatC] = cohort;

  // 3-Cycle Permutation Wheel across Seats A, B, C
  const wheelByCycle = wheel([seatA, seatB, seatC], rankOneTag);

  return {
    cohort,
    schedule: wheelByCycle[macroCycle] || wheelByCycle[1],
  };
}

/**
 * Evaluates an override request under Model 1:
 * - 1st Override in cycle: Calendar Swap with Week 3 (Cost: 0 chests)
 * - 2nd Override in cycle: 2-Installment Buyout (Cost: 1 Reg+1 KW in W2, 1 Reg+1 KW in W3)
 */
export function calculateOverrideAction(cycleState = {}, targetWeek, threatName) {
  const currentCount = Number(cycleState.override_count) || 0;
  const currentSchedule = { ...(cycleState.active_schedule || {}) };
  const targetWeekKey = `week_${targetWeek}`;
  const scheduledAlliance = currentSchedule[targetWeekKey];
  const macroCycle = Number(cycleState.macro_cycle) || 1;

  if (scheduledAlliance === 'WLO') {
    throw new Error(`WLO is already scheduled for Week ${targetWeek}. No override needed.`);
  }

  if (currentCount === 0) {
    currentSchedule[targetWeekKey] = 'WLO';
    currentSchedule.week_3 = scheduledAlliance;

    return {
      action: 'swap',
      nextOverrideCount: 1,
      targetWeek: Number(targetWeek),
      threatName,
      defender: 'WLO',
      displacedAlliance: scheduledAlliance,
      newSchedule: currentSchedule,
      summary: `WLO swaps into Week ${targetWeek} for server defense against ${threatName}. [${scheduledAlliance}] takes Week 3 Finale (receives 2 King chests & Buff Item). Cost to WLO: 0 chests.`,
    };
  } else {
    currentSchedule[targetWeekKey] = 'WLO';

    const buyoutTicket = {
      id: `buyout_c${macroCycle}_w${targetWeek}_${Date.now().toString(36)}`,
      cycle: macroCycle,
      beneficiary: scheduledAlliance,
      threat: threatName,
      total_owed: { regular: 2, kw: 2 },
      installments: [
        {
          week: Number(targetWeek),
          payout: { regular: 1, kw: 1 },
          status: 'pending',
          nominated_players: { regular: [], kw: [] },
        },
        {
          week: 3,
          payout: { regular: 1, kw: 1 },
          status: 'pending',
          nominated_players: { regular: [], kw: [] },
        },
      ],
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    return {
      action: 'buyout',
      nextOverrideCount: 2,
      targetWeek: Number(targetWeek),
      threatName,
      defender: 'WLO',
      displacedAlliance: scheduledAlliance,
      newSchedule: currentSchedule,
      buyoutTicket,
      summary: `WLO takes Week ${targetWeek} as 2nd defense override against ${threatName}. [${scheduledAlliance}] sits out and receives a Wartime Buyout: 2 Regular Gold + 2 KW Gold chests, split as 1 Reg + 1 KW in Week ${targetWeek} and 1 Reg + 1 KW in Week 3.`,
    };
  }
}

/**
 * Rolls the cycle state forward to the next week or next 4-week macro cycle.
 */
export function advanceCycleState(cycleState = {}, mapState = null, targetClockWeek = null) {
  let macroCycle = Number(cycleState.macro_cycle) || 1;
  let currentWeek =
    cycleState.current_week !== undefined && cycleState.current_week !== null
      ? Number(cycleState.current_week)
      : 1;

  const nextWeek =
    targetClockWeek !== null ? Number(targetClockWeek) : currentWeek >= 3 ? 0 : currentWeek + 1;

  if (nextWeek === 0 || currentWeek >= 3) {
    // Advance to next 4-week cycle Downtime (Week 0) with Seat Inheritance
    macroCycle = macroCycle >= 3 ? 1 : macroCycle + 1;
    const { cohort, schedule } = resolveCohortSchedule(
      macroCycle,
      cycleState.cohort_seats,
      mapState,
    );

    return {
      macro_cycle: macroCycle,
      current_week: 0,
      override_count: 0,
      cohort_seats: cohort,
      active_schedule: schedule,
      history: Array.isArray(cycleState.history) ? cycleState.history : [],
    };
  } else {
    return {
      ...cycleState,
      macro_cycle: macroCycle,
      current_week: nextWeek,
      override_count: Number(cycleState.override_count) || 0,
    };
  }
}

/**
 * Wipes this cycle's Capitol overrides (Steward reset, /rewards): the schedule goes back to
 * the plain rotation for the current cycle (the same wheel and seat inheritance the cycle
 * uses when it moves on), the override count to 0, and active wartime buyouts move to
 * buyout_history marked 'cancelled'. Changes rewardsState in place.
 * Returns { changed, before, after, overrides, cancelled }; changed is false when there was
 * nothing to reset (then nothing was changed).
 */
export function resetOverrides(rewardsState, mapState = null, actor = '', now = new Date()) {
  const cycleState = rewardsState.cycle_state || {};
  const macroCycle = Number(cycleState.macro_cycle) || 1;
  const before = { ...(cycleState.active_schedule || {}) };
  const { cohort, schedule } = resolveCohortSchedule(macroCycle, cycleState.cohort_seats, mapState);
  const overrides = Number(cycleState.override_count) || 0;
  const buyouts = Array.isArray(rewardsState.wartime_buyouts) ? rewardsState.wartime_buyouts : [];
  const same = ['downtime', 'week_1', 'week_2', 'week_3'].every((k) => before[k] === schedule[k]);
  if (same && overrides === 0 && buyouts.length === 0) {
    return { changed: false, before, after: schedule, overrides: 0, cancelled: 0 };
  }

  const stamp = new Date(now).toISOString();
  if (!Array.isArray(rewardsState.buyout_history)) rewardsState.buyout_history = [];
  for (const buyout of buyouts) {
    rewardsState.buyout_history.push({
      ...buyout,
      status: 'cancelled',
      archivedAt: stamp,
      archivedBy: actor,
    });
  }
  rewardsState.wartime_buyouts = [];
  rewardsState.cycle_state = {
    ...cycleState,
    macro_cycle: macroCycle,
    override_count: 0,
    cohort_seats: cohort,
    active_schedule: schedule,
  };
  rewardsState.lastUpdated = stamp;
  rewardsState.updatedBy = actor;
  return { changed: true, before, after: schedule, overrides, cancelled: buyouts.length };
}
