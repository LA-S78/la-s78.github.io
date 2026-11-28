// api/_kw_battle.js
// The Kingdom War battle the site adds every Kingdom War week (Saturday from 12:00 GT, from
// the rotation; api/calendar.js). Stewards can edit it (owner, 2026-11-28): its description
// and its Discord reminder (on or off, when, who it pings), kept in calendar-state.json as
// `kw_battle`. Its day, time and length follow the rotation, so they can't change, and it
// can't be deleted. Helpers, not an endpoint.

import { getCycleState } from './_calendar_helper.js';

export const KW_BATTLE_ID = 'sys-kw-battle';
const HOUR = 3600000;
const WEEK = 7 * 24 * HOUR;
/** Saturday's battle: 12:00 GT, usually over by about 14:00 GT. */
const BATTLE_HOURS = 2;

/** An id of the battle (every week's carries the date after this prefix). */
export const isKwBattleId = (id) => String(id || '').startsWith(KW_BATTLE_ID);

/** The Stewards' settings for the battle (none yet: {}). */
export function kwBattleSettings(calConfig) {
  const s = calConfig?.kw_battle;
  return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
}

/** The fields a battle on the calendar takes from the settings (reminder and description). */
export function kwBattleFields(settings) {
  return {
    reminder: settings.reminder === '1h' ? '1h' : 'off',
    reminder_minutes: settings.reminder_minutes ?? 60,
    notify_target: settings.notify_target || 'role',
    custom_role_id: settings.custom_role_id || null,
    editable: 'kw_battle',
  };
}

/** The start (ms) of the battles from `fromMs` on, over the next few weeks. */
export function kwBattleStarts(fromMs, calConfig, weeks = 5) {
  const starts = new Set();
  for (let k = 0; k < weeks; k++) {
    const week = getCycleState(new Date(fromMs + k * WEEK), calConfig);
    if (!week.isKW) continue;
    const start = week.kwBattleTimestamp * 1000 + 12 * HOUR;
    if (start + BATTLE_HOURS * HOUR >= fromMs) starts.add(start);
  }
  return [...starts].sort((a, b) => a - b);
}

/**
 * The next battle as an event for the reminder check (api/_reminders.js), or null when its
 * reminder is off. `notification_status` remembers the battle it was last posted for.
 */
export function kwBattleReminderEvent(calConfig, now) {
  const settings = kwBattleSettings(calConfig);
  if (settings.reminder !== '1h') return null;
  // The battle that just started still counts (a "when it starts" reminder comes up to 15 minutes late)
  const [start] = kwBattleStarts(now - 15 * 60000, calConfig);
  if (!start) return null;
  return {
    id: KW_BATTLE_ID,
    scope: 'global',
    title: 'Kingdom War Battle',
    description:
      settings.description ||
      "Starts 12:00 GT, usually over by about 14:00 GT. A win opens the King of Battle Reward chests on top of the King's Commendation.",
    start: new Date(start).toISOString(),
    end: new Date(start + BATTLE_HOURS * HOUR).toISOString(),
    recurrence: 'none',
    event_type: 'kvk_battle',
    color: '#8f0000',
    ...kwBattleFields(settings),
    notification_status: settings.notification_status || {},
  };
}
