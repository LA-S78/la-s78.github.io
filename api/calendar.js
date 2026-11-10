// api/calendar.js
import { getCycleState, getScheduleSlot, DEFAULT_CALENDAR_CONFIG } from './_calendar_helper.js';
import { isGistConfigured, readGist, gistJson } from './_gist.js';
import { sanitizeAlliances } from './_alliances.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let calConfig = DEFAULT_CALENDAR_CONFIG;
  let mapState = { alliances: {} };
  let rewardsState = {};

  try {
    if (isGistConfigured()) {
      const gist = await readGist({ timeoutMs: 3000 });
      calConfig = { ...calConfig, ...gistJson(gist, 'calendar-state.json') };
      mapState = gistJson(gist, 'map-state.json', mapState);
      rewardsState = gistJson(gist, 'rewards-data.json', rewardsState);
    }
  } catch (err) {
    console.warn('Gist state fetch failed, utilizing defaults:', err.message);
  }

  const now = new Date();
  const currentStatus = getCycleState(now, calConfig);

  // currentStatus.clockWeek / scheduleSlot say which seat of the reward schedule is active
  // (see getScheduleSlot): the hero card and the 4-week console both follow them.

  const alliances = mapState.alliances || {};
  const activeSchedule = rewardsState.cycle_state?.active_schedule || null;

  // Resolve current Capitol Holder from active_schedule first, falling back to static rank
  const currentSlotKey = currentStatus.scheduleSlot;
  const scheduledHolderTag = activeSchedule?.[currentSlotKey]?.trim();

  let capitolHolderTag = `Rank #${currentStatus.capitolRank}`;
  let holderTag = null; // the alliance holding the Capitol, if known (for its colour)
  if (scheduledHolderTag) {
    holderTag = scheduledHolderTag;
    capitolHolderTag = `[${scheduledHolderTag}]`;
    const actualRank = alliances[scheduledHolderTag]?.rank;
    if (actualRank) {
      currentStatus.isOverrideWeek = parseInt(actualRank, 10) !== currentStatus.capitolRank;
      currentStatus.holderActualRank = parseInt(actualRank, 10);
    }
  } else {
    const holderEntry = Object.entries(alliances).find(
      ([_, data]) => parseInt(data.rank, 10) === currentStatus.capitolRank,
    );
    if (holderEntry) {
      holderTag = holderEntry[0];
      capitolHolderTag = `[${holderEntry[0]}]`;
    }
  }
  // Same colour the rest of the site shows for this alliance (/api/state's resolution).
  const capitolHolderColor = holderTag
    ? sanitizeAlliances(alliances)[holderTag]?.color || null
    : null;

  // 1. Generate System Milestones (Capitol Captures & War Battle Days)
  const cycleMilestones = [];

  const nextWeekNum = (currentStatus.currentWeekNumber % 4) + 1;
  const nextWeekConfig = calConfig.capitol_rotation.find((w) => w.week === nextWeekNum);

  const nextSlotKey = getScheduleSlot(nextWeekNum, calConfig).slotKey;
  const nextScheduledTag = activeSchedule?.[nextSlotKey]?.trim();

  let nextHolderTag = `Rank #${nextWeekConfig?.capitol_rank}`;
  let nextHolderRankLabel = `Rank #${nextWeekConfig?.capitol_rank}`;

  if (nextScheduledTag) {
    nextHolderTag = `[${nextScheduledTag}]`;
    const nextActualRank = alliances[nextScheduledTag]?.rank;
    if (nextActualRank) {
      nextHolderRankLabel =
        parseInt(nextActualRank, 10) !== nextWeekConfig?.capitol_rank
          ? `Rank #${nextActualRank} • Override Schedule`
          : `Rank #${nextActualRank}`;
    }
  } else {
    const nextHolderEntry = Object.entries(alliances).find(
      ([_, data]) => parseInt(data.rank, 10) === nextWeekConfig?.capitol_rank,
    );
    if (nextHolderEntry) nextHolderTag = `[${nextHolderEntry[0]}]`;
  }

  // The upcoming Capitol capture. The week's alliance captures it on Friday: until then
  // that is this week's alliance, afterwards next week's.
  const upcomingIsNextWeek = currentStatus.capitolCaptured;
  const captureTs = currentStatus.captureTimestamp + (upcomingIsNextWeek ? 7 * 86400 : 0);
  const capturerTag = upcomingIsNextWeek ? nextHolderTag : capitolHolderTag;
  let capturerRankLabel = nextHolderRankLabel;
  if (!upcomingIsNextWeek) {
    capturerRankLabel = currentStatus.isOverrideWeek
      ? `Rank #${currentStatus.holderActualRank} • Override Schedule`
      : `Rank #${currentStatus.holderActualRank || currentStatus.capitolRank}`;
  }

  cycleMilestones.push({
    id: `sys-capture-w${upcomingIsNextWeek ? nextWeekNum : currentStatus.currentWeekNumber}`,
    scope: 'global',
    title: `👑 Capitol Capture — ${capturerTag}`,
    description: `${capturerTag} (${capturerRankLabel}) captures the Capitol on Friday.`,
    start: new Date(captureTs * 1000).toISOString(),
    end: new Date((captureTs + 86400) * 1000).toISOString(),
    type: 'rotation',
    allDay: true,
  });

  // Kingdom War Battle Window Milestone
  if (currentStatus.isKW) {
    const kwBattleDate = new Date(currentStatus.kwBattleTimestamp * 1000);
    cycleMilestones.push({
      id: `sys-kw-battle-w${currentStatus.currentWeekNumber}`,
      scope: 'global',
      title: '⚔️ Kingdom War Battle Window',
      description: 'Active combat phase for the Capitol. 2x chest allocations apply upon victory.',
      start: kwBattleDate.toISOString(),
      end: new Date(kwBattleDate.getTime() + 4 * 3600000).toISOString(),
      type: 'war',
      allDay: false,
    });
  }

  // 2. Strict Privacy Filtering for Custom Events
  const requestedAlliance = req.query?.alliance?.trim()?.toUpperCase() || null;
  const customEvents = calConfig.custom_events || [];

  const sanitizedCustomEvents = customEvents.filter((evt) => {
    const scope = (evt.scope || 'global').trim().toUpperCase();
    if (scope === 'GLOBAL') return true;
    return requestedAlliance && scope === requestedAlliance;
  });

  // 3. Project Recurring Events Forward Across the 28-Day Cycle Horizon
  const windowStartMs = now.getTime() - 24 * 3600 * 1000;
  const windowEndMs = now.getTime() + 28 * 86400 * 1000;

  const projectedEvents = [];

  for (const evt of sanitizedCustomEvents) {
    const recurrence = evt.recurrence || 'none';

    if (recurrence === 'none') {
      const evtEndMs = new Date(evt.end || evt.start).getTime();
      if (evtEndMs >= windowStartMs) {
        projectedEvents.push(evt);
      }
      continue;
    }

    const stepMs = recurrence === '2days' ? 2 * 86400 * 1000 : 7 * 86400 * 1000;

    const baseStartMs = new Date(evt.start).getTime();
    if (isNaN(baseStartMs)) {
      projectedEvents.push(evt);
      continue;
    }

    const durationMs = evt.duration_hours
      ? parseFloat(evt.duration_hours) * 3600 * 1000
      : Math.max(1800000, new Date(evt.end).getTime() - baseStartMs || 3600000);

    let curStartMs = baseStartMs;
    if (curStartMs < windowStartMs) {
      const skipSteps = Math.floor((windowStartMs - curStartMs) / stepMs);
      curStartMs += skipSteps * stepMs;
    }

    let count = 0;
    while (curStartMs <= windowEndMs && count < 30) {
      const curEndMs = curStartMs + durationMs;
      if (curEndMs >= windowStartMs) {
        projectedEvents.push({
          ...evt,
          start: new Date(curStartMs).toISOString(),
          end: new Date(curEndMs).toISOString(),
        });
      }
      curStartMs += stepMs;
      count++;
    }
  }

  // 4. Combine and Sort Chronologically
  const allEvents = [...cycleMilestones, ...projectedEvents].sort(
    (a, b) => new Date(a.start) - new Date(b.start),
  );

  return res.status(200).json({
    status: currentStatus,
    capitolHolder: capitolHolderTag,
    capitolHolderColor,
    events: allEvents,
  });
}
