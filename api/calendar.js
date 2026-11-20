// api/calendar.js
import { describeRotation, getCycleState, DEFAULT_CALENDAR_CONFIG } from './_calendar_helper.js';
import { isGistConfigured, readGist, gistJson } from './_gist.js';
import { findTag, sameScope, sameTag, sanitizeAlliances } from './_alliances.js';
import { liveImages } from './_alliance_images.js';
import { resolveCohortSchedule } from './_cycle_helper.js';
import { getRoleColors } from './_role_colors.js';
import { describeRewardPeriod, getRewardPeriod } from './_reward_period.js';
import { checkReminders } from './_reminders.js';
import { checkAscension, latestRace } from './_ascension.js';
import { checkStatsSnapshot } from './_stats.js';
import { flushTrackerUsage } from './_tracker.js';
import { checkSkins } from './_skins.js';
import { timingSafeEqual } from 'node:crypto';

/** True when the request carries the reminder schedule's secret (compared in constant time). */
function fromReminderSchedule(req) {
  // Spaces and line breaks anywhere in the secret don't count: a pasted value can pick them
  // up (Vercel kept line breaks inside one), and the workflow strips them all the same way
  const clean = (v) => String(v || '').replace(/\s+/g, '');
  const expected = clean(process.env.REMINDER_SECRET);
  const given = clean(req.headers?.['x-reminder-secret']);
  if (!expected) return false;
  // Compared as bytes: a header with accented or emoji characters has more bytes than
  // characters, and timingSafeEqual throws on different lengths (maintainer review)
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
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
      const dryRun = req.body?.dryRun === true;
      const report = await checkReminders({ dryRun });
      // The Top 4 race's snapshots (api/_ascension.js), on the same 5-minute check; a
      // failure here never hides the reminders' report
      try {
        report.ascension = await checkAscension({
          gist: await readGist({ timeoutMs: 4000 }),
          dryRun,
        });
      } catch (err) {
        console.error('Top 4 race check failed:', err);
        report.ascension = { error: err.message };
      }
      // The Stats tab's daily snapshot (api/_stats.js), just before each reset; after the
      // race, so on race days it reuses the race's answers
      try {
        report.stats = await checkStatsSnapshot({
          gist: await readGist({ timeoutMs: 4000 }),
          dryRun,
        });
      } catch (err) {
        console.error('Stats snapshot failed:', err);
        report.stats = { error: err.message };
      }
      // Sanctuary skins for the map's game view (api/_skins.js): before the tracker's day
      // ends, with half of its spare requests
      try {
        report.skins = await checkSkins({ dryRun });
      } catch (err) {
        console.error('Skin check failed:', err);
        report.skins = { error: err.message };
      }
      // The requests those made, saved for the Steward tools page before this server stops
      if (!dryRun) await flushTrackerUsage().catch((err) => console.warn(err.message));
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
  let gist = null;

  try {
    if (isGistConfigured()) {
      gist = await readGist({ timeoutMs: 3000 });
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
  // The holder's approved banner (api/_alliance_images.js), behind the hero card (owner,
  // 2026-11-17): the alliance the card names, before Friday's capture as after it.
  const holderKey = holderTag ? findTag(Object.keys(alliances), holderTag) : null;
  const capitolHolderImage =
    gist && holderKey ? liveImages(gist, alliances)[holderKey]?.wide || null : null;
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

  // Every week the calendar can show (owner decision, 2026-11-15: a week view with last and
  // next week, and the whole cycle as a grid): from the week before this one (or the cycle's
  // start, if earlier) to the week after this one (or the cycle's end, if later). Each week
  // gets its Friday Capitol capture (with the alliance in this cycle's rotation; another
  // cycle's seat is decided at its reset, so none is named), its Saturday Kingdom War battle
  // (KvK weeks), and its reward period (opens Friday ~20:00 GT, closes Wednesday 00:00 GT).
  const DAY_MS = 86400 * 1000;
  const WEEK_MS = 7 * DAY_MS;
  const anchorMs = new Date(calConfig.cycle_anchor).getTime();
  const cycleMs = (Number(calConfig.cycle_length_days) || 28) * DAY_MS;
  const cycleOf = (ms) => Math.floor((ms - anchorMs) / cycleMs);
  const todayStartMs = anchorMs + Math.floor((now.getTime() - anchorMs) / DAY_MS) * DAY_MS;
  const thisWeekStartMs = todayStartMs - (currentStatus.dayOfWeekNumber - 1) * DAY_MS;
  const thisCycleStartMs = todayStartMs - (currentStatus.cycleDay - 1) * DAY_MS;
  const rangeStartMs = Math.min(thisWeekStartMs - WEEK_MS, thisCycleStartMs);
  const rangeEndMs = Math.max(thisWeekStartMs + 2 * WEEK_MS, thisCycleStartMs + cycleMs);
  const seatOf = Object.fromEntries((currentStatus.rotation || []).map((r) => [r.week, r]));

  for (let weekStart = rangeStartMs; weekStart < rangeEndMs; weekStart += WEEK_MS) {
    const week = getCycleState(new Date(weekStart + 3600000), calConfig);
    const seat =
      cycleOf(weekStart) === cycleOf(now.getTime()) ? seatOf[week.currentWeekNumber] : null;
    const who = seat ? (seat.tag ? `[${seat.tag}]` : `Rank #${seat.seat}`) : null;
    const rankLabel = seat?.rank
      ? seat.override
        ? `Rank #${seat.rank} • Override Schedule`
        : `Rank #${seat.rank}`
      : null;
    cycleMilestones.push({
      id: `sys-capture-${new Date(week.captureTimestamp * 1000).toISOString()}`,
      scope: 'global',
      title: who ? `👑 Capitol Capture — ${who}` : '👑 Capitol Capture',
      description: who
        ? `${who}${rankLabel ? ` (${rankLabel})` : ''} captures the Capitol on Friday.`
        : "This cycle's seats are decided at its reset.",
      // The site's own milestones carry a key and values, so each page can word them in its
      // language (js/calendar.js); title/description stay in English for anything else.
      i18n: {
        key: 'capture',
        vars: { who, rank: seat?.rank ?? null, override: Boolean(seat?.override) },
      },
      start: new Date(week.captureTimestamp * 1000).toISOString(),
      end: new Date((week.captureTimestamp + 86400) * 1000).toISOString(),
      type: 'rotation',
      event_type: 'capitol_capture',
      allDay: true,
    });

    // Kingdom War battle: Saturday from 12:00 GT, usually over by about 14:00 GT
    if (week.isKW) {
      const battleStart = week.kwBattleTimestamp * 1000 + 12 * 3600000;
      cycleMilestones.push({
        id: `sys-kw-battle-${new Date(battleStart).toISOString()}`,
        scope: 'global',
        title: '⚔️ Kingdom War Battle',
        description:
          "Starts 12:00 GT, usually over by about 14:00 GT. A win opens the King of Battle Reward chests on top of the King's Commendation.",
        i18n: { key: 'kw_battle', vars: {} },
        start: new Date(battleStart).toISOString(),
        end: new Date(battleStart + 2 * 3600000).toISOString(),
        type: 'war',
        event_type: 'kvk_battle',
        allDay: false,
      });
    }
  }

  // Reward periods: open Friday ~20:00 GT (after the capitol event), close Wednesday 00:00 GT.
  // Every period that overlaps the weeks above.
  for (let k = -6; k <= 6; k++) {
    const p = getRewardPeriod(rewardPeriod.opensAt + k * WEEK_MS, calConfig);
    if (p.closesAt < rangeStartMs || p.opensAt >= rangeEndMs) continue;
    cycleMilestones.push({
      id: `sys-rewards-open-${p.id}`,
      scope: 'global',
      title: `🎁 Rewards Open — ${p.weekName}`,
      description: p.kwWeek
        ? "King's Commendation opens after the capitol event. King of Battle Reward follows if Saturday's Kingdom War is won; the King hands out after the result."
        : "King's Commendation opens after the capitol event (no Kingdom War this week).",
      i18n: { key: 'rewards_open', vars: { week: p.week, kw: p.kwWeek } },
      event_type: 'rewards_open',
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
      event_type: 'rewards_close',
      start: new Date(p.closesAt - 3600000).toISOString(),
      end: new Date(p.closesAt).toISOString(),
      type: 'rotation',
      allDay: false,
    });
  }

  // 2. Strict Privacy Filtering for Custom Events
  // Letter case counts (RâvN and RÂVN are two alliances); accents don't (sameScope)
  const requestedAlliance = req.query?.alliance?.trim() || null;
  const customEvents = calConfig.custom_events || [];

  const sanitizedCustomEvents = customEvents.filter((evt) => {
    if (sameScope(evt.scope, 'global')) return true;
    return Boolean(requestedAlliance) && sameScope(evt.scope, requestedAlliance);
  });

  // 3. Project Recurring Events Forward Across the 28-Day Cycle Horizon
  // The same weeks as the milestones above (last week and the whole cycle, for the week and
  // cycle views), and at least four weeks ahead
  const windowStartMs = rangeStartMs;
  const windowEndMs = Math.max(rangeEndMs, now.getTime() + 28 * 86400 * 1000);

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
          ([tag, a]) => sameTag(tag, requestedAlliance) && a?.alert_channel_id,
        )
      : null,
    server: Boolean(process.env.NAP_ALERT_CHANNEL_ID),
  };

  return res.status(200).json({
    status: currentStatus,
    capitolHolder: capitolHolderTag,
    capitolHolderColor,
    capitolHolderImage,
    // The Top 4 race's latest results (api/_ascension.js): the Rules page shows them
    ascension: gist ? latestRace(gist) : null,
    events: allEvents,
    reminderChannels,
  });
}
