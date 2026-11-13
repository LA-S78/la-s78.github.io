// api/calendar.js
import {
  describeRotation,
  getCycleState,
  getScheduleSlot,
  DEFAULT_CALENDAR_CONFIG,
} from './_calendar_helper.js';
import { isGistConfigured, readGist, gistJson } from './_gist.js';
import { sanitizeAlliances } from './_alliances.js';
import { resolveCohortSchedule } from './_cycle_helper.js';
import { getRoleColors } from './_role_colors.js';
import { describeRewardPeriod, getRewardPeriod } from './_reward_period.js';
import { checkReminders } from './_reminders.js';
import { timingSafeEqual } from 'node:crypto';

/** True when the request carries the reminder schedule's secret (compared in constant time). */
function fromReminderSchedule(req) {
  const expected = process.env.REMINDER_SECRET || '';
  const given = String(req.headers?.['x-reminder-secret'] || '');
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export default async function handler(req, res) {
  // The reminder check (api/_reminders.js), called by .github/workflows/reminders.yml. It
  // lives here rather than in a function of its own: the plan allows 12 and the site uses 11.
  if (req.method === 'POST' && req.body?.action === 'check-reminders') {
    if (!process.env.REMINDER_SECRET) {
      return res.status(503).json({ error: 'REMINDER_SECRET is not set on this deployment.' });
    }
    if (!fromReminderSchedule(req)) return res.status(401).json({ error: 'Not allowed.' });
    if (!isGistConfigured()) return res.status(503).json({ error: 'No Gist on this deployment.' });
    try {
      const report = await checkReminders({ dryRun: req.body?.dryRun === true });
      return res.status(200).json(report);
    } catch (err) {
      console.error('Reminder check failed:', err);
      return res.status(500).json({ error: err.message || 'Reminder check failed.' });
    }
  }

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
  // This week's reward period (api/_reward_period.js): the hero card shows it
  const rewardPeriod = getRewardPeriod(now.getTime(), calConfig);
  currentStatus.rewards = describeRewardPeriod(rewardPeriod, rewardsState);

  // currentStatus.clockWeek / scheduleSlot say which seat of the reward schedule is active
  // (see getScheduleSlot): the hero card and the 4-week console both follow them.

  const alliances = mapState.alliances || {};
  const activeSchedule = rewardsState.cycle_state?.active_schedule || null;
  // The plain rotation for this cycle (the 3-cycle wheel of seats; api/_cycle_helper.js). A
  // week is an override only when the schedule names someone else than this: the wheel moves
  // seats around, so the holder's rank is not expected to match the week's starting rank.
  const cycleState = rewardsState.cycle_state || {};
  const plainSchedule = resolveCohortSchedule(
    Number(cycleState.macro_cycle) || 1,
    cycleState.cohort_seats,
    mapState,
  ).schedule;
  const isOverride = (slotKey, tag) =>
    Boolean(tag && plainSchedule[slotKey] && plainSchedule[slotKey] !== tag);

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
      currentStatus.isOverrideWeek = isOverride(currentSlotKey, scheduledHolderTag);
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
  const coloured = sanitizeAlliances(alliances, await getRoleColors());
  const capitolHolderColor = holderTag ? coloured[holderTag]?.color || null : null;
  // The cycle's four weeks for the Capitol Rotation chart on the Rules page.
  currentStatus.rotation = describeRotation(
    currentStatus,
    calConfig,
    coloured,
    activeSchedule,
    plainSchedule,
  );

  // 1. Generate System Milestones (Capitol Captures & War Battle Days)
  const cycleMilestones = [];

  const nextWeekNum = (currentStatus.currentWeekNumber % 4) + 1;
  const nextWeekConfig = calConfig.capitol_rotation.find((w) => w.week === nextWeekNum);

  const nextSlotKey = getScheduleSlot(nextWeekNum, calConfig).slotKey;
  const nextScheduledTag = activeSchedule?.[nextSlotKey]?.trim();

  let nextHolderTag = `Rank #${nextWeekConfig?.capitol_rank}`;
  let nextHolderRankLabel = `Rank #${nextWeekConfig?.capitol_rank}`;
  // The same as numbers, for the page to word in its own language (js/calendar.js).
  let nextHolderRank = nextWeekConfig?.capitol_rank ?? null;
  let nextHolderOverride = false;

  if (nextScheduledTag) {
    nextHolderTag = `[${nextScheduledTag}]`;
    const nextActualRank = alliances[nextScheduledTag]?.rank;
    if (nextActualRank) {
      nextHolderOverride = isOverride(nextSlotKey, nextScheduledTag);
      nextHolderRank = parseInt(nextActualRank, 10);
      nextHolderRankLabel = nextHolderOverride
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
  let capturerRank = nextHolderRank;
  let capturerOverride = nextHolderOverride;
  if (!upcomingIsNextWeek) {
    capturerRankLabel = currentStatus.isOverrideWeek
      ? `Rank #${currentStatus.holderActualRank} • Override Schedule`
      : `Rank #${currentStatus.holderActualRank || currentStatus.capitolRank}`;
    capturerRank = currentStatus.isOverrideWeek
      ? currentStatus.holderActualRank
      : currentStatus.holderActualRank || currentStatus.capitolRank;
    capturerOverride = Boolean(currentStatus.isOverrideWeek);
  }

  cycleMilestones.push({
    id: `sys-capture-w${upcomingIsNextWeek ? nextWeekNum : currentStatus.currentWeekNumber}`,
    scope: 'global',
    title: `👑 Capitol Capture — ${capturerTag}`,
    description: `${capturerTag} (${capturerRankLabel}) captures the Capitol on Friday.`,
    // The site's own milestones carry a key and values, so each page can word them in its
    // language (js/calendar.js); title/description stay in English for anything else.
    i18n: {
      key: 'capture',
      vars: { who: capturerTag, rank: capturerRank, override: capturerOverride },
    },
    start: new Date(captureTs * 1000).toISOString(),
    end: new Date((captureTs + 86400) * 1000).toISOString(),
    type: 'rotation',
    allDay: true,
  });

  // Kingdom War battle: Saturday from 12:00 GT, usually over by about 14:00 GT
  if (currentStatus.isKW) {
    const battleStart = currentStatus.kwBattleTimestamp * 1000 + 12 * 3600000;
    cycleMilestones.push({
      id: `sys-kw-battle-w${currentStatus.currentWeekNumber}`,
      scope: 'global',
      title: '⚔️ Kingdom War Battle',
      description:
        "Starts 12:00 GT, usually over by about 14:00 GT. A win opens the King of Battle Reward chests on top of the King's Commendation.",
      i18n: { key: 'kw_battle', vars: {} },
      start: new Date(battleStart).toISOString(),
      end: new Date(battleStart + 2 * 3600000).toISOString(),
      type: 'war',
      allDay: false,
    });
  }

  // Reward periods: open Friday ~20:00 GT (after the capitol event), close Wednesday 00:00 GT.
  // The current or last period, and the next one.
  for (const opensAt of [rewardPeriod.opensAt, rewardPeriod.nextOpensAt]) {
    const p = getRewardPeriod(opensAt, calConfig);
    cycleMilestones.push({
      id: `sys-rewards-open-${p.id}`,
      scope: 'global',
      title: `🎁 Rewards Open — ${p.weekName}`,
      description: p.kwWeek
        ? "King's Commendation opens after the capitol event. King of Battle Reward follows if Saturday's Kingdom War is won; the King hands out after the result."
        : "King's Commendation opens after the capitol event (no Kingdom War this week).",
      i18n: { key: 'rewards_open', vars: { week: p.week, kw: p.kwWeek } },
      start: new Date(p.opensAt).toISOString(),
      end: new Date(p.opensAt + 3600000).toISOString(),
      type: 'rotation',
      allDay: false,
    });
    cycleMilestones.push({
      id: `sys-rewards-close-${p.id}`,
      scope: 'global',
      title: `⌛ Rewards Close — ${p.weekName}`,
      description: 'Chests expire at Wednesday 00:00 GT: hand out everything before then.',
      i18n: { key: 'rewards_close', vars: { week: p.week } },
      start: new Date(p.closesAt - 3600000).toISOString(),
      end: new Date(p.closesAt).toISOString(),
      type: 'rotation',
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

  // Whether event reminders have somewhere to go (the event form says so when they don't):
  // an alliance's registered alert channel, and the NAP Discord's channel for server events.
  // Only yes/no: the channel IDs themselves stay on the server.
  const reminderChannels = {
    alliance: requestedAlliance
      ? Object.entries(alliances).some(
          ([tag, a]) => tag.toUpperCase() === requestedAlliance && a?.alert_channel_id,
        )
      : null,
    server: Boolean(process.env.NAP_ALERT_CHANNEL_ID),
  };

  return res.status(200).json({
    status: currentStatus,
    capitolHolder: capitolHolderTag,
    capitolHolderColor,
    events: allEvents,
    reminderChannels,
  });
}
