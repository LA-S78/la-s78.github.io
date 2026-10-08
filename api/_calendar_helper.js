// api/_calendar_helper.js

export const DEFAULT_CALENDAR_CONFIG = {
  cycle_anchor: '2026-09-21T02:00:00Z', // Monday 00:00 GT (UTC-2)
  cycle_length_days: 28,
  server_tz_offset_hours: -2, // GT is UTC-2
  capitol_rotation: [
    { week: 1, is_kw: true, phase: 'Kingdom War Week 1', capitol_rank: 3 },
    { week: 2, is_kw: true, phase: 'Kingdom War Week 2', capitol_rank: 2 },
    { week: 3, is_kw: true, phase: 'Kingdom War Week 3', capitol_rank: 1 },
    { week: 4, is_kw: false, phase: 'NAP Rest Week (Off-Week)', capitol_rank: 4 }
  ]
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

  const weekConfig = config.capitol_rotation.find(w => w.week === currentWeekNumber) || {
    week: currentWeekNumber,
    is_kw: false,
    phase: 'Unknown Phase',
    capitol_rank: 4
  };

  // Calculate upcoming reset (00:00 GT / 02:00 UTC)
  const daysSinceAnchor = Math.floor((targetTime - anchorTime) / MS_PER_DAY);
  const nextResetTime = new Date(anchorTime + ((daysSinceAnchor + 1) * MS_PER_DAY));

  // Saturday of the current week (Day 6 of the week = Kingdom War Battle day)
  const daysUntilSaturday = 6 - dayOfWeekNumber;
  const kwBattleTime = new Date(anchorTime + ((daysSinceAnchor + daysUntilSaturday) * MS_PER_DAY));

  return {
    cycleDay, // 1 to 28
    currentWeekNumber, // 1 to 4
    dayOfWeekNumber, // 1 to 7 (1 = Mon, 7 = Sun)
    isKW: weekConfig.is_kw,
    phaseName: weekConfig.phase,
    capitolRank: weekConfig.capitol_rank,
    nextResetUtc: nextResetTime.toISOString(),
    nextResetTimestamp: Math.floor(nextResetTime.getTime() / 1000),
    kwBattleTimestamp: Math.floor(kwBattleTime.getTime() / 1000),
    isKWBattleDay: weekConfig.is_kw && dayOfWeekNumber === 6
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
    const dayStartUtc = new Date(anchorTime + (dayOffset * MS_PER_DAY));
    const dayEndUtc = new Date(anchorTime + ((dayOffset + 1) * MS_PER_DAY));

    const totalDays = config.cycle_length_days;
    const cycleDay = (((dayOffset % totalDays) + totalDays) % totalDays) + 1;
    const weekNum = Math.floor((cycleDay - 1) / 7) + 1;
    const dayOfWeek = ((cycleDay - 1) % 7) + 1; // 1 = Mon ... 6 = Sat, 7 = Sun
    const weekConfig = config.capitol_rotation.find(w => w.week === weekNum);

    const dateStr = dayStartUtc.toISOString().split('T')[0];

    // 1. Weekly Capitol Rotation Banner (Start of each Monday)
    if (dayOfWeek === 1) {
      events.push({
        id: `capitol-w${weekNum}-${dateStr}`,
        title: `👑 Capitol Rotation: Rank #${weekConfig.capitol_rank}`,
        description: `Week ${weekNum} begins. Alliance Rank #${weekConfig.capitol_rank} holds Capitol privileges.`,
        start: dayStartUtc.toISOString(),
        end: new Date(dayStartUtc.getTime() + (7 * MS_PER_DAY)).toISOString(),
        type: 'rotation',
        color: '#b8975a',
        allDay: true
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
        allDay: true
      });
    }

    // 3. Might Snapshot Windows (KW Week 1, Days 3–5)
    if (weekNum === 1 && (dayOfWeek >= 3 && dayOfWeek <= 5)) {
      events.push({
        id: `might-snapshot-d${dayOfWeek}-${dateStr}`,
        title: `📸 Capitol Might Snapshot (Day ${dayOfWeek})`,
        description: `Contenders must surpass current holder's might before daily reset (00:00 GT).`,
        start: new Date(dayEndUtc.getTime() - (10 * 60 * 1000)).toISOString(),
        end: dayEndUtc.toISOString(),
        type: 'snapshot',
        color: '#3b82f6',
        allDay: false
      });
    }
  }

  return events;
}