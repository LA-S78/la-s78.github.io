// api/_reward_period.js
// Reward periods (owner rule, see DECISIONS.md "Rewards, nominations & KvK cycle"):
//
// - Every week has one reward period. It opens at the Friday capitol event (about 20:00 GT)
//   and closes when the game expires the chests: Wednesday 00:00 GT of the next week. The
//   period belongs to the week its Friday is in ("week N"), also on Monday/Tuesday of N+1.
// - Set 1, King's Commendation, is given every week, the off-week included.
// - Set 2, King of Battle Reward, only after the server wins Kingdom War (Kingdom War weeks
//   only). The battle starts Saturday 12:00 GT and usually ends by about 14:00 GT; a Steward
//   records Won or Lost, since the site can't see the game.
// - Between Wednesday 00:00 and Friday 20:00 no period is open.
//
// No background timer exists: the website works the period out from the clock, and the bot
// moves the stored state on (syncRewardPeriod) the first time it's used in a new period.

import { DEFAULT_CALENDAR_CONFIG, getCycleState, weekLabel } from './_calendar_helper.js';
import { applySafeCycleReset } from './_rewards_helper.js';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/** Friday (5) at 20:00 GT: when the period opens. */
export const PERIOD_OPENS = { dayOfWeek: 5, hour: 20 };
/** Saturday 14:00 GT, the usual end of the battle (it starts at 12:00): Won/Lost from then. */
const BATTLE_ENDS_AFTER_OPEN = 18 * HOUR;
/** Wednesday 00:00 GT of the next week: 4 days and 4 hours after Friday 20:00. */
const CLOSES_AFTER_OPEN = 4 * DAY + 4 * HOUR;

/**
 * The reward period at a moment: the latest one that has opened, and whether it is still open.
 * @returns {{
 *   id: string, week: number, slotKey: string, weekName: string, kwWeek: boolean,
 *   opensAt: number, battleEndsAt: number, closesAt: number, nextOpensAt: number,
 *   open: boolean, battleOver: boolean
 * }} times are Unix milliseconds; `week` is the schedule week (0 = off-week, 1..3)
 */
export function getRewardPeriod(now = Date.now(), calendarConfig = {}) {
  const config = { ...DEFAULT_CALENDAR_CONFIG, ...calendarConfig };
  const t = new Date(now).getTime();
  const state = getCycleState(new Date(t), config);

  // Start of today (00:00 GT) by the calendar's own day count, then this week's Friday 20:00.
  const anchor = new Date(config.cycle_anchor).getTime();
  const todayStart = anchor + Math.floor((t - anchor) / DAY) * DAY;
  let opensAt =
    todayStart + (PERIOD_OPENS.dayOfWeek - state.dayOfWeekNumber) * DAY + PERIOD_OPENS.hour * HOUR;
  if (opensAt > t) opensAt -= 7 * DAY; // before this Friday's event: last week's period

  const week = getCycleState(new Date(opensAt), config);
  const closesAt = opensAt + CLOSES_AFTER_OPEN;
  return {
    id: new Date(opensAt).toISOString(),
    week: week.clockWeek,
    slotKey: week.scheduleSlot,
    weekName: weekLabel(week.clockWeek),
    kwWeek: Boolean(week.isKW),
    opensAt,
    battleEndsAt: opensAt + BATTLE_ENDS_AFTER_OPEN,
    closesAt,
    nextOpensAt: opensAt + 7 * DAY,
    open: t < closesAt,
    battleOver: t >= opensAt + BATTLE_ENDS_AFTER_OPEN,
  };
}

/**
 * The stored record of a period (rewards-data.json `period`).
 * result: 'pending' (Kingdom War week, not recorded yet) | 'won' | 'lost' | null (off-week).
 */
function periodRecord(period) {
  return {
    id: period.id,
    week: period.week,
    kw_week: period.kwWeek,
    opens_at: new Date(period.opensAt).toISOString(),
    closes_at: new Date(period.closesAt).toISOString(),
    result: period.kwWeek ? 'pending' : null,
    result_by: null,
    result_at: null,
  };
}

/**
 * Moves the stored reward state into the period that is open now, if it isn't already there.
 * Changes `rewardsData` in place and returns { changed, clearNominations }: when changed, the
 * caller saves it, and clears the old nominations if clearNominations.
 *
 * - A new period: the schedule advances to its week (buyout installments settle as before),
 *   set 2 is closed until a win is recorded, and last period's nominations are cleared.
 * - The schedule is never advanced onto the week it is already on (that would skip a week:
 *   the off-week starts a new 4-week cycle).
 * - The first run after reward periods were introduced adopts the open period as it is: the
 *   lists already sent stay, and the earlier Monday reset already moved the schedule.
 */
export function syncRewardPeriod(rewardsData, mapState, period, actor = 'Auto (reward period)') {
  const none = { changed: false, clearNominations: false };
  if (!period.open || rewardsData.period?.id === period.id) return none;

  if (!rewardsData.period) {
    rewardsData.period = periodRecord(period);
    if (period.kwWeek && rewardsData.mode === 'kw') rewardsData.period.result = 'won';
    if (!period.kwWeek) rewardsData.mode = 'standard';
    return { changed: true, clearNominations: false };
  }

  const currentWeek = rewardsData.cycle_state?.current_week;
  if (currentWeek !== undefined && Number(currentWeek) === Number(period.week)) {
    rewardsData.mode = 'standard';
    rewardsData.updatedBy = actor;
    rewardsData.lastUpdated = new Date().toISOString();
  } else {
    const { updatedRewards } = applySafeCycleReset(
      rewardsData,
      'standard',
      actor,
      mapState,
      period.week,
    );
    Object.assign(rewardsData, updatedRewards);
  }
  rewardsData.period = periodRecord(period);
  rewardsData.lastReset = period.id; // the King's checklist starts afresh for each period
  return { changed: true, clearNominations: true };
}

/**
 * Records the Kingdom War result for the stored period and sets the reward mode from it:
 * set 2 exists only after a win. Can be changed until the period closes.
 * Returns an error message, or null when recorded.
 */
export function recordKingdomWarResult(rewardsData, period, result, actor) {
  const stored = rewardsData.period;
  if (!period.open || !stored || stored.id !== period.id) {
    return 'No reward period is open right now.';
  }
  if (!stored.kw_week) return `The ${weekLabel(stored.week)} has no Kingdom War battle.`;
  if (result !== 'won' && result !== 'lost') return 'The result must be Won or Lost.';
  stored.result = result;
  stored.result_by = actor;
  stored.result_at = new Date().toISOString();
  rewardsData.mode = result === 'won' ? 'kw' : 'standard';
  rewardsData.lastUpdated = stored.result_at;
  rewardsData.updatedBy = actor;
  return null;
}

/**
 * What the website shows about the period (from the clock, plus the stored result when the
 * stored period is the current one).
 */
export function describeRewardPeriod(period, rewardsData = {}) {
  const stored = rewardsData.period?.id === period.id ? rewardsData.period : null;
  // Before the first run of reward periods: a win was stored as mode 'kw'
  const legacyWon = !rewardsData.period && rewardsData.mode === 'kw';
  return {
    id: period.id,
    week: period.week,
    weekName: period.weekName,
    kwWeek: period.kwWeek,
    open: period.open,
    opensAt: new Date(period.opensAt).toISOString(),
    battleEndsAt: new Date(period.battleEndsAt).toISOString(),
    closesAt: new Date(period.closesAt).toISOString(),
    nextOpensAt: new Date(period.nextOpensAt).toISOString(),
    // 'pending' | 'won' | 'lost' | null (off-week)
    result: period.kwWeek ? stored?.result || (legacyWon ? 'won' : 'pending') : null,
  };
}
