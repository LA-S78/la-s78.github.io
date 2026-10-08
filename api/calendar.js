// api/calendar.js
import { getCycleState, DEFAULT_CALENDAR_CONFIG } from './_calendar_helper.js';

async function getGistData(gistId, gistToken) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      Authorization: `Bearer ${gistToken}`,
      'User-Agent': 'WarRoom-App'
    },
    signal: AbortSignal.timeout(3000)
  });

  if (!res.ok) throw new Error(`GitHub Gist error (${res.status})`);
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GIST_ID = process.env.GIST_ID;
  const GIST_TOKEN = process.env.GIST_TOKEN;

  let calConfig = DEFAULT_CALENDAR_CONFIG;
  let mapState = { alliances: {} };

  try {
    if (GIST_ID && GIST_TOKEN) {
      const gistData = await getGistData(GIST_ID, GIST_TOKEN);
      const calRaw = gistData.files?.['calendar-state.json']?.content;
      const mapRaw = gistData.files?.['map-state.json']?.content;

      if (calRaw) calConfig = { ...calConfig, ...JSON.parse(calRaw) };
      if (mapRaw) mapState = JSON.parse(mapRaw);
    }
  } catch (err) {
    console.warn('Gist state fetch failed, utilizing defaults:', err.message);
  }

  const now = new Date();
  const currentStatus = getCycleState(now, calConfig);

  // Resolve current Capitol Holder tag
  const alliances = mapState.alliances || {};
  const holderEntry = Object.entries(alliances).find(
    ([_, data]) => parseInt(data.rank, 10) === currentStatus.capitolRank
  );
  const capitolHolderTag = holderEntry
    ? `[${holderEntry[0]}]`
    : `Rank #${currentStatus.capitolRank}`;

  // 1. Generate System Milestones (Rotation Transfers & War Battle Days)
  const cycleMilestones = [];

  // Next Phase / Rotation Milestone
  const daysUntilNextWeek = 7 - currentStatus.dayOfWeekNumber + 1;
  const nextWeekResetTs = currentStatus.nextResetTimestamp + (daysUntilNextWeek - 1) * 86400;
  const nextWeekNum = (currentStatus.currentWeekNumber % 4) + 1;
  const nextWeekConfig = calConfig.capitol_rotation.find((w) => w.week === nextWeekNum);

  const nextHolderEntry = Object.entries(alliances).find(
    ([_, data]) => parseInt(data.rank, 10) === nextWeekConfig?.capitol_rank
  );
  const nextHolderTag = nextHolderEntry
    ? `[${nextHolderEntry[0]}]`
    : `Rank #${nextWeekConfig?.capitol_rank}`;

  cycleMilestones.push({
    id: `sys-rotation-w${nextWeekNum}`,
    scope: 'global',
    title: `👑 Capitol Transfer — ${nextHolderTag}`,
    description: `Rotation Phase transfer to ${nextHolderTag} (Rank #${nextWeekConfig?.capitol_rank}).`,
    start: new Date(nextWeekResetTs * 1000).toISOString(),
    end: new Date(nextWeekResetTs * 1000 + 3600000).toISOString(),
    type: 'rotation',
    allDay: false
  });

  // Kingdom War Battle Window Milestone
  if (currentStatus.isKW) {
    const kwBattleDate = new Date(currentStatus.kwBattleTimestamp * 1000);
    cycleMilestones.push({
      id: `sys-kw-battle-w${currentStatus.currentWeekNumber}`,
      scope: 'global',
      title: '⚔️ Kingdom War Battle Window',
      description: 'Active combat phase for the Capitol. 2x chest allocations apply.',
      start: kwBattleDate.toISOString(),
      end: new Date(kwBattleDate.getTime() + 4 * 3600000).toISOString(),
      type: 'war',
      allDay: false
    });
  }

  // 2. Strict Privacy Filtering for Custom Events
  const requestedAlliance = req.query?.alliance?.trim()?.toUpperCase() || null;
  const customEvents = calConfig.custom_events || [];

  const sanitizedCustomEvents = customEvents.filter((evt) => {
    const scope = (evt.scope || 'global').trim().toUpperCase();

    // Global events are always visible
    if (scope === 'GLOBAL') return true;

    // Alliance events are ONLY visible if the request is scoped to that exact alliance
    return requestedAlliance && scope === requestedAlliance;
  });

  // 3. Project Recurring Events Forward Across the 28-Day Cycle Horizon
  const windowStartMs = now.getTime() - (24 * 3600 * 1000); // Retain events active in the last 24h
  const windowEndMs = now.getTime() + (28 * 86400 * 1000);  // Project 28 days forward

  const projectedEvents = [];

  for (const evt of sanitizedCustomEvents) {
    const recurrence = evt.recurrence || 'none';

    // One-time event: include if not expired beyond window
    if (recurrence === 'none') {
      const evtEndMs = new Date(evt.end || evt.start).getTime();
      if (evtEndMs >= windowStartMs) {
        projectedEvents.push(evt);
      }
      continue;
    }

    // Recurring event ('2days' or 'weekly')
    const stepMs = recurrence === '2days' 
      ? 2 * 86400 * 1000 
      : 7 * 86400 * 1000;

    const baseStartMs = new Date(evt.start).getTime();
    if (isNaN(baseStartMs)) {
      projectedEvents.push(evt);
      continue;
    }

    const durationMs = evt.duration_hours 
      ? parseFloat(evt.duration_hours) * 3600 * 1000 
      : Math.max(1800000, new Date(evt.end).getTime() - baseStartMs || 3600000);

    // Fast-forward to current window if the original date was in the past
    let curStartMs = baseStartMs;
    if (curStartMs < windowStartMs) {
      const skipSteps = Math.floor((windowStartMs - curStartMs) / stepMs);
      curStartMs += skipSteps * stepMs;
    }

    // Generate occurrences across the 28-day window (capped at 30 instances)
    let count = 0;
    while (curStartMs <= windowEndMs && count < 30) {
      const curEndMs = curStartMs + durationMs;
      if (curEndMs >= windowStartMs) {
        projectedEvents.push({
          ...evt,
          start: new Date(curStartMs).toISOString(),
          end: new Date(curEndMs).toISOString()
        });
      }
      curStartMs += stepMs;
      count++;
    }
  }

  // 4. Combine and Sort Chronologically
  const allEvents = [...cycleMilestones, ...projectedEvents].sort(
    (a, b) => new Date(a.start) - new Date(b.start)
  );

  return res.status(200).json({
    status: currentStatus,
    capitolHolder: capitolHolderTag,
    events: allEvents
  });
}