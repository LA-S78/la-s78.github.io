// api/_calendar_events.js
// The calendar's own events (custom_events in calendar-state.json), filtered to who may see
// them and repeated forward across a time window. Shared by the calendar page's API
// (api/calendar.js) and the Discord /calendar command (api/_bot_calendar.js), so both list
// exactly the same events. Helpers, not an endpoint.

import { sameScope } from './_alliances.js';

/**
 * Server-wide events, plus one alliance's own when `alliance` is given (letter case counts:
 * RâvN and RÂVN are two alliances; accents don't). `only`: 'global' or 'alliance' to keep
 * just one kind.
 */
export function visibleEvents(customEvents, { alliance = null, only = null } = {}) {
  return (customEvents || []).filter((evt) => {
    const isGlobal = sameScope(evt.scope, 'global');
    if (only === 'global') return isGlobal;
    if (only === 'alliance')
      return !isGlobal && Boolean(alliance) && sameScope(evt.scope, alliance);
    if (isGlobal) return true;
    return Boolean(alliance) && sameScope(evt.scope, alliance);
  });
}

/**
 * An event's title without the "[TAG] " or "[GLOBAL] " api/manage-event.js puts in front
 * when it's saved (owner, 2026-11-28: the card already says whose it is). Only that prefix:
 * other brackets at the start stay. js/calendar-views.js shownTitle() does the same.
 */
export function shownTitle(evt) {
  const title = String(evt?.title || '');
  const m = /^\[([^\]]+)\]\s*/.exec(title);
  if (!m) return title;
  const inside = m[1].trim().toLowerCase();
  const scope = String(evt?.scope || 'global')
    .trim()
    .toLowerCase();
  return inside === 'global' || inside === scope ? title.slice(m[0].length) : title;
}

/**
 * Events in the window [startMs, endMs]: one-off events that haven't ended before it, and
 * every repeat of a repeating one (weekly or every two days, at most 30) that touches it.
 */
export function projectEvents(events, { startMs, endMs }) {
  const out = [];
  for (const evt of events || []) {
    const recurrence = evt.recurrence || 'none';

    if (recurrence === 'none') {
      const evtEndMs = new Date(evt.end || evt.start).getTime();
      if (evtEndMs >= startMs) out.push(evt);
      continue;
    }

    const stepMs = recurrence === '2days' ? 2 * 86400 * 1000 : 7 * 86400 * 1000;
    const baseStartMs = new Date(evt.start).getTime();
    if (isNaN(baseStartMs)) {
      out.push(evt);
      continue;
    }

    const durationMs = evt.duration_hours
      ? parseFloat(evt.duration_hours) * 3600 * 1000
      : Math.max(1800000, new Date(evt.end).getTime() - baseStartMs || 3600000);

    let curStartMs = baseStartMs;
    if (curStartMs < startMs) {
      const skipSteps = Math.floor((startMs - curStartMs) / stepMs);
      curStartMs += skipSteps * stepMs;
    }

    let count = 0;
    while (curStartMs <= endMs && count < 30) {
      const curEndMs = curStartMs + durationMs;
      if (curEndMs >= startMs) {
        out.push({
          ...evt,
          start: new Date(curStartMs).toISOString(),
          end: new Date(curEndMs).toISOString(),
        });
      }
      curStartMs += stepMs;
      count++;
    }
  }
  return out;
}
