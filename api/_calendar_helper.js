// api/_calendar_helper.js

export const DEFAULT_CALENDAR_CONFIG = {
  cycle_anchor: '2026-09-21T02:00:00Z', // Monday 00:00 GT (UTC-2)
  cycle_length_days: 28,
  server_tz_offset_hours: -2, // GT is UTC-2
  // Event weeks run Monday to Saturday, and the week's alliance captures the Capitol on
  // Friday (1 = Monday ... 5 = Friday). Before that day the tag shown is the alliance that
  // *will* capture it; from the day after, the one that holds it.
  capture_day_of_week: 5,
  capitol_rotation: [
    { week: 1, is_kw: true, phase: 'Kingdom War Week 1', capitol_rank: 3 },
    { week: 2, is_kw: true, phase: 'Kingdom War Week 2', capitol_rank: 2 },
    { week: 3, is_kw: true, phase: 'Kingdom War Week 3', capitol_rank: 1 },
    { week: 4, is_kw: false, phase: 'Off-Week', capitol_rank: 4 },
  ],
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Which seat of the reward schedule a calendar week uses.
 *
 * The calendar numbers its weeks 1..4 in whatever order `capitol_rotation` lists them; the
 * reward schedule (rewards-data.json `active_schedule`) has the seats `downtime`, `week_1`,
 * `week_2`, `week_3`. The off-week is the one marked `is_kw: false` (wherever it sits in the
 * cycle), and the Kingdom War weeks count up from 1 in calendar order.
 *
 * Returns { clockWeek, slotKey }: clockWeek is 0 for downtime, 1..3 for a Kingdom War week.
 * Every caller must use this, so the website and the bot always agree on the active week.
 */
export function getScheduleSlot(weekNumber, customConfig = {}) {
  const config = { ...DEFAULT_CALENDAR_CONFIG, ...customConfig };
  const rotation = Array.isArray(config.capitol_rotation) ? config.capitol_rotation : [];
  const week = rotation.find((w) => Number(w.week) === Number(weekNumber));
  if (!week || !week.is_kw) return { clockWeek: 0, slotKey: 'downtime' };
  const clockWeek = rotation.filter((w) => w.is_kw && Number(w.week) <= Number(weekNumber)).length;
  return { clockWeek, slotKey: `week_${clockWeek}` };
}

/** Short name of a week of the reward schedule: clockWeek 0 is the off-week. */
export function weekLabel(clockWeek) {
  return Number(clockWeek) === 0 ? 'Off-Week' : `Kingdom War Week ${clockWeek}`;
}

/**
 * Calculates current cycle status for any given date
 */
export function getCycleState(targetDate = new Date(), customConfig = {}) {
  const config = { ...DEFAULT_CALENDAR_CONFIG, ...customConfig };
  const anchorTime = new Date(config.cycle_anchor).getTime();
  const targetTime = new Date(targetDate).getTime();

  const elapsedMs = targetTime - anchorTime;
  const elapsedDays = Math.floor(elapsedMs / MS_PER_DAY);

  // Modulo calculation that safely wraps negative time differences
  const totalDays = config.cycle_length_days;
  const cycleDayZeroIndexed = ((elapsedDays % totalDays) + totalDays) % totalDays;
  const cycleDay = cycleDayZeroIndexed + 1; // 1 to 28

  const currentWeekNumber = Math.floor(cycleDayZeroIndexed / 7) + 1; // 1 to 4
  const dayOfWeekNumber = (cycleDayZeroIndexed % 7) + 1; // 1 = Monday, 6 = Saturday, 7 = Sunday

  const weekConfig = config.capitol_rotation.find((w) => w.week === currentWeekNumber) || {
    week: currentWeekNumber,
    is_kw: false,
    phase: 'Unknown Phase',
    capitol_rank: 4,
  };

  // Calculate upcoming reset (00:00 GT / 02:00 UTC)
  const daysSinceAnchor = Math.floor((targetTime - anchorTime) / MS_PER_DAY);
  const nextResetTime = new Date(anchorTime + (daysSinceAnchor + 1) * MS_PER_DAY);

  // Saturday of the current week (Day 6 of the week = Kingdom War Battle day)
  const daysUntilSaturday = 6 - dayOfWeekNumber;
  const kwBattleTime = new Date(anchorTime + (daysSinceAnchor + daysUntilSaturday) * MS_PER_DAY);

  const { clockWeek, slotKey } = getScheduleSlot(currentWeekNumber, config);

  // Capitol capture day of the current week (00:00 GT of that day)
  const captureDayOfWeek = Number(config.capture_day_of_week) || 5;
  const captureTime = new Date(
    anchorTime + (daysSinceAnchor + captureDayOfWeek - dayOfWeekNumber) * MS_PER_DAY,
  );

  return {
    cycleDay, // 1 to 28
    currentWeekNumber, // 1 to 4 (calendar order; use clockWeek/scheduleSlot for the schedule)
    clockWeek, // 0 = downtime, 1 to 3 = Kingdom War week
    scheduleSlot: slotKey, // 'downtime' | 'week_1' | 'week_2' | 'week_3'
    weekName: weekLabel(clockWeek), // 'Off-Week' | 'Kingdom War Week 1..3': the name to show
    dayOfWeekNumber, // 1 to 7 (1 = Mon, 7 = Sun)
    isKW: weekConfig.is_kw,
    phaseName: weekConfig.phase,
    capitolRank: weekConfig.capitol_rank,
    nextResetUtc: nextResetTime.toISOString(),
    nextResetTimestamp: Math.floor(nextResetTime.getTime() / 1000),
    kwBattleTimestamp: Math.floor(kwBattleTime.getTime() / 1000),
    isKWBattleDay: weekConfig.is_kw && dayOfWeekNumber === 6,
    captureDayOfWeek, // 5 = Friday
    captureTimestamp: Math.floor(captureTime.getTime() / 1000),
    isCaptureDay: dayOfWeekNumber === captureDayOfWeek,
    capitolCaptured: dayOfWeekNumber > captureDayOfWeek, // this week's capture is done
  };
}

/**
 * Generates structured calendar items within a date window (e.g. for calendar.html or API endpoints)
 */
export function generateCycleEvents(startDate, endDate, customConfig = {}) {
  const config = { ...DEFAULT_CALENDAR_CONFIG, ...customConfig };
  const anchorTime = new Date(config.cycle_anchor).getTime();
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();

  const events = [];

  // Determine starting and ending cycle day boundaries
  const startElapsedDays = Math.floor((startMs - anchorTime) / MS_PER_DAY);
  const endElapsedDays = Math.ceil((endMs - anchorTime) / MS_PER_DAY);

  for (let dayOffset = startElapsedDays; dayOffset <= endElapsedDays; dayOffset++) {
    const dayStartUtc = new Date(anchorTime + dayOffset * MS_PER_DAY);
    const dayEndUtc = new Date(anchorTime + (dayOffset + 1) * MS_PER_DAY);

    const totalDays = config.cycle_length_days;
    const cycleDay = (((dayOffset % totalDays) + totalDays) % totalDays) + 1;
    const weekNum = Math.floor((cycleDay - 1) / 7) + 1;
    const dayOfWeek = ((cycleDay - 1) % 7) + 1; // 1 = Mon ... 6 = Sat, 7 = Sun
    const weekConfig = config.capitol_rotation.find((w) => w.week === weekNum);

    const dateStr = dayStartUtc.toISOString().split('T')[0];

    // 1. Weekly Capitol Rotation Banner (Start of each Monday)
    if (dayOfWeek === 1) {
      events.push({
        id: `capitol-w${weekNum}-${dateStr}`,
        title: `👑 Capitol Rotation: Rank #${weekConfig.capitol_rank}`,
        description: `Week ${weekNum} begins. Alliance Rank #${weekConfig.capitol_rank} holds Capitol privileges.`,
        start: dayStartUtc.toISOString(),
        end: new Date(dayStartUtc.getTime() + 7 * MS_PER_DAY).toISOString(),
        type: 'rotation',
        color: '#b8975a',
        allDay: true,
      });
    }

    // 2. Kingdom War Battle Window (Saturdays of KW Weeks)
    if (weekConfig.is_kw && dayOfWeek === 6) {
      events.push({
        id: `kw-battle-${dateStr}`,
        title: `⚔️ Kingdom War Battle (Week ${weekNum})`,
        description: `Active combat against opponent server. Defense and assault protocols engaged.`,
        start: dayStartUtc.toISOString(),
        end: dayEndUtc.toISOString(),
        type: 'war',
        color: '#8f0000',
        allDay: true,
      });
    }

    // 3. Might Snapshot Windows (KW Week 1, Days 3–5)
    if (weekNum === 1 && dayOfWeek >= 3 && dayOfWeek <= 5) {
      events.push({
        id: `might-snapshot-d${dayOfWeek}-${dateStr}`,
        title: `📸 Capitol Might Snapshot (Day ${dayOfWeek})`,
        description: `Contenders must surpass current holder's might before daily reset (00:00 GT).`,
        start: new Date(dayEndUtc.getTime() - 10 * 60 * 1000).toISOString(),
        end: dayEndUtc.toISOString(),
        type: 'snapshot',
        color: '#3b82f6',
        allDay: false,
      });
    }
  }

  return events;
}

/**
 * The four weeks of the current cycle for the Capitol Rotation chart (Rules page), in
 * calendar order: who captures the Capitol each week, with live ranks and overrides.
 *
 * - seat: the rank that week's rotation gives the Capitol to (capitol_rotation).
 * - tag: the alliance the reward schedule names for that week (active_schedule, which
 *   includes Steward overrides), else the plain rotation's, else whoever holds that rank.
 * - rank: that alliance's live rank.
 * - override: the schedule names a different alliance than the plain rotation for this
 *   cycle (plainSchedule, the 3-cycle wheel); replaced: who the plain rotation has there.
 *   (The wheel moves seats round, so a holder's rank differing from the seat is normal.)
 * - captureAt: that week's Friday capture (unix seconds) in the current cycle.
 * - state: 'done' (an earlier week of this cycle), 'current' (this week) or 'upcoming';
 *   captured: this week's Friday capture has happened.
 *
 * @param {object} status getCycleState() for now
 * @param {object} config the calendar settings
 * @param {object} alliances map-state alliances with their display colours
 * @param {object|null} activeSchedule rewards-data cycle_state.active_schedule
 * @param {object|null} plainSchedule the cycle's plain rotation (resolveCohortSchedule)
 */
export function describeRotation(
  status,
  config,
  alliances = {},
  activeSchedule = null,
  plainSchedule = null,
) {
  const cfg = { ...DEFAULT_CALENDAR_CONFIG, ...config };
  const rotation = Array.isArray(cfg.capitol_rotation) ? cfg.capitol_rotation : [];
  return [...rotation]
    .sort((a, b) => Number(a.week) - Number(b.week))
    .map((w) => {
      const { clockWeek, slotKey } = getScheduleSlot(w.week, cfg);
      const seat = Number(w.capitol_rank);
      const scheduled = String(activeSchedule?.[slotKey] || '').trim();
      const byRank = Object.entries(alliances).find(([, a]) => Number(a?.rank) === seat)?.[0];
      const tag = scheduled || plainSchedule?.[slotKey] || byRank || null;
      const rank =
        tag && Number.isFinite(Number(alliances[tag]?.rank)) ? Number(alliances[tag].rank) : null;
      const weekNumber = Number(w.week);
      const state =
        weekNumber < status.currentWeekNumber
          ? 'done'
          : weekNumber === status.currentWeekNumber
            ? 'current'
            : 'upcoming';
      return {
        week: weekNumber,
        clockWeek,
        isKW: Boolean(w.is_kw),
        seat,
        tag,
        rank,
        override: Boolean(
          scheduled && plainSchedule?.[slotKey] && plainSchedule[slotKey] !== scheduled,
        ),
        replaced:
          scheduled && plainSchedule?.[slotKey] && plainSchedule[slotKey] !== scheduled
            ? plainSchedule[slotKey]
            : null,
        color: (tag && alliances[tag]?.color) || null,
        captureAt: status.captureTimestamp + (weekNumber - status.currentWeekNumber) * 7 * 86400,
        state,
        captured: state === 'done' || (state === 'current' && Boolean(status.capitolCaptured)),
      };
    });
}
