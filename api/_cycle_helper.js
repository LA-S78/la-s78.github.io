// api/_cycle_helper.js

export const BASELINE_SCHEDULES = {
  1: { downtime: 'BOTS', week_1: 'RÂVN', week_2: 'MIA', week_3: 'WLO' },
  2: { downtime: 'MIA', week_1: 'BOTS', week_2: 'RÂVN', week_3: 'WLO' },
  3: { downtime: 'RÂVN', week_1: 'MIA', week_2: 'BOTS', week_3: 'WLO' }
};

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
    // ------------------------------------------------------------------------
    // OVERRIDE 1: CALENDAR SWAP
    // ------------------------------------------------------------------------
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
      summary: `WLO swaps into Week ${targetWeek} for server defense against ${threatName}. [${scheduledAlliance}] takes Week 3 Finale (receives 2 King chests & Buff Item). Cost to WLO: 0 chests.`
    };
  } else {
    // ------------------------------------------------------------------------
    // OVERRIDE 2: TWO-INSTALLMENT BUYOUT
    // ------------------------------------------------------------------------
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
          nominated_players: { regular: [], kw: [] }
        },
        {
          week: 3,
          payout: { regular: 1, kw: 1 },
          status: 'pending',
          nominated_players: { regular: [], kw: [] }
        }
      ],
      status: 'active',
      createdAt: new Date().toISOString()
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
      summary: `WLO takes Week ${targetWeek} as 2nd defense override against ${threatName}. [${scheduledAlliance}] sits out and receives a Wartime Buyout: 2 Regular Gold + 2 KW Gold chests, split as 1 Reg + 1 KW in Week ${targetWeek} and 1 Reg + 1 KW in Week 3.`
    };
  }
}

/**
 * Rolls the cycle state forward to the next week or next 4-week macro cycle.
 */
export function advanceCycleState(cycleState = {}) {
  let macroCycle = Number(cycleState.macro_cycle) || 1;
  let currentWeek = cycleState.current_week !== undefined && cycleState.current_week !== null
    ? Number(cycleState.current_week)
    : 1;

  if (currentWeek >= 3) {
    // Advance to next 4-week cycle Downtime (Week 0)
    macroCycle = macroCycle >= 3 ? 1 : macroCycle + 1;
    currentWeek = 0; // 0 = Downtime

    return {
      macro_cycle: macroCycle,
      current_week: 0,
      override_count: 0,
      active_schedule: { ...(BASELINE_SCHEDULES[macroCycle] || BASELINE_SCHEDULES[1]) },
      history: Array.isArray(cycleState.history) ? cycleState.history : []
    };
  } else {
    return {
      ...cycleState,
      macro_cycle: macroCycle,
      current_week: currentWeek + 1,
      override_count: Number(cycleState.override_count) || 0
    };
  }
}