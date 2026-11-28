// api/manage-event.js

// Handles creating, editing and deleting calendar events
import { currentSession } from './_register.js';
import { isGistConfigured, readGist, gistJson, updateGist } from './_gist.js';
import { verifyToken, verifySessionToken } from './_tokens.js';
// The event types the form offers (generated from _data/event_types.yml by _scripts/build.rb)
import EVENT_TYPES from './_event_types.js';

const PRESET_TYPES = EVENT_TYPES.filter((t) => t.preset).map((t) => t.id);
import { isSteward } from './_stewards.js';
import { inLanguage, say } from './_messages.js';
import { findTag, sameScope } from './_alliances.js'; // RâvN's events aren't RÂVN's
import { listGuildRoles, roleServerFor } from './_guild_roles.js';
import { isKwBattleId } from './_kw_battle.js';
import { OPTIN_PINGS } from './_event_optins.js';

export default function handler(req, res) {
  return inLanguage(req, () => respond(req, res));
}

async function respond(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const botSecret = process.env.DISCORD_BOT_TOKEN;

  if (!botSecret || !isGistConfigured()) {
    return res.status(500).json({ error: 'Server configuration error: missing credentials' });
  }

  const { token, action, eventData, eventId, scope: askedScope } = req.body || {};

  // 1. Who is asking, and whose events they may manage ('global' = server-wide events):
  //    - a link from /calendar in Discord (its token carries the scope), or
  //    - the site's Discord sign-in (login pass in the Authorization header): R4 and R5
  //      manage their own alliance's events, Stewards also server-wide ones (owner decision,
  //      2026-11-13). The scope is always decided here, never taken from the page as is.
  let callerScope = null;
  const tokenPayload = token ? verifyToken(token, botSecret, { action: 'manage_events' }) : null;
  if (tokenPayload) {
    callerScope = tokenPayload.scope;
  } else {
    const pass = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    // The member's alliance as it is now (its ID in the register; plan step 1)
    const session = await currentSession(verifySessionToken(pass, botSecret));
    if (!session) {
      return res.status(401).json({ error: say('api_events.session_invalid') });
    }
    const steward = isSteward(session.uid);
    const leader = ['R4', 'R5'].includes(session.role);
    if (askedScope === 'global') callerScope = steward ? 'global' : null;
    else if (session.alliance && (leader || steward)) callerScope = String(session.alliance);
    if (!callerScope) {
      return res.status(403).json({ error: say('api_events.not_leader') });
    }
  }
  const isGlobalAdmin = callerScope === 'global';

  try {
    // 2. Fetch current calendar state from GitHub Gist
    const gist = await readGist();
    let calendarState = gistJson(gist, 'calendar-state.json', { custom_events: [] });
    calendarState.custom_events = calendarState.custom_events || [];

    // --- ACTION: THE ROLES A REMINDER CAN PING (owner, 2026-11-28) ---
    // For the form's "a specific role": the alliance's own server for its events, the NAP
    // server for server-wide ones. Only the caller's own scope (decided above).
    if (action === 'roles') {
      const alliances = gistJson(gist, 'map-state.json', { alliances: {} }).alliances || {};
      const guildId = roleServerFor(callerScope, alliances);
      if (!guildId) return res.status(200).json({ roles: [], reason: 'no_server' });
      try {
        return res.status(200).json({ roles: await listGuildRoles(guildId, { token: botSecret }) });
      } catch (err) {
        console.warn('Roles not read:', err.message);
        return res.status(200).json({ roles: [], reason: 'unreachable' });
      }
    }

    // --- ACTION: CREATE EVENT ---
    if (action === 'create') {
      const checked = cleanEventFields(eventData, isGlobalAdmin);
      if (checked.error) return res.status(400).json({ error: checked.error });
      const f = checked.fields;

      const uniqueId = `evt-${callerScope.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString(36)}`;

      const newEvent = {
        id: uniqueId,
        scope: callerScope,
        title: isGlobalAdmin ? `[GLOBAL] ${f.title}` : `[${callerScope}] ${f.title}`,
        description:
          f.description ||
          (isGlobalAdmin ? 'Kingdom-wide operation.' : `Alliance event for [${callerScope}].`),
        start: f.start,
        end: f.end,
        time_gt: f.time_gt,
        duration_hours: f.duration_hours,
        recurrence: f.recurrence,
        notify_target: f.notify_target,
        custom_role_id: f.custom_role_id,
        reminder: f.reminder,
        reminder_minutes: f.reminder_minutes,
        notification_status: {
          reminder_15m_sent: false,
          start_sent: false,
          last_notified_occurrence: null,
          // The start (ISO) of the last occurrence a reminder was posted for (api/calendar.js)
          reminded_occurrence: null,
        },
        type: isGlobalAdmin ? 'custom' : 'alliance',
        color: f.color,
        event_type: f.event_type,
        allDay: false,
        // Server-wide events: whether alliances may opt in to the reminder (api/_event_optins.js)
        ...(isGlobalAdmin ? { allow_optin: eventData?.allow_optin !== false } : {}),
        createdAt: new Date().toISOString(),
      };

      // Added to the stored list as it is when saving (updateGist), so two events made at
      // the same moment are both kept.
      await updateGist(
        (fresh) => {
          const state = gistJson(fresh, 'calendar-state.json', { custom_events: [] });
          state.custom_events = [...(state.custom_events || []), newEvent];
          state.custom_events.sort((a, b) => new Date(a.start) - new Date(b.start));
          return { files: { 'calendar-state.json': state } };
        },
        { gist },
      );

      return res.status(200).json({
        success: true,
        message: say('api_events.published', { title: newEvent.title }),
        event: newEvent,
      });
    }

    // --- ACTION: EDIT EVENT ---
    // Same checks as creating; same scope rule as deleting (an alliance edits only its own
    // events, Stewards only server-wide ones). The id, scope and creation time stay.
    // --- ACTION: AN ALLIANCE'S CHOICE FOR A SERVER-WIDE EVENT'S REMINDER (owner, 2026-11-28) ---
    // R4/R5 (their own alliance, decided above): post it in their alert channel or not, and
    // who it pings (api/_event_optins.js). The event must let alliances opt in.
    if (action === 'optin') {
      if (isGlobalAdmin) return res.status(403).json({ error: say('api_events.optin_global') });
      const alliances = gistJson(gist, 'map-state.json', { alliances: {} }).alliances || {};
      const tag = findTag(Object.keys(alliances), callerScope);
      if (!tag) return res.status(404).json({ error: say('api_events.optin_no_alliance') });
      const asked = req.body?.optin || {};
      const on = asked.on === true;
      const ping = OPTIN_PINGS.includes(asked.ping) ? asked.ping : 'role';
      let roleId = null;
      if (on && ping === 'custom_role') {
        roleId = String(asked.role_id || '').trim();
        if (!/^\d{17,20}$/.test(roleId))
          return res.status(400).json({ error: say('api_events.role_id_needed') });
      }
      if (on && !alliances[tag]?.alert_channel_id) {
        return res.status(400).json({ error: say('api_events.optin_no_channel', { tag }) });
      }
      const kw = isKwBattleId(eventId);
      const target = kw
        ? calendarState.kw_battle || {}
        : calendarState.custom_events.find((e) => e.id === eventId);
      if (!target || (!kw && !sameScope(target.scope, 'global'))) {
        return res.status(404).json({ error: say('api_events.not_found') });
      }
      if (target.allow_optin === false) {
        return res.status(403).json({ error: say('api_events.optin_closed') });
      }
      const choice = { on, ping, role_id: roleId, at: new Date().toISOString() };
      let found = false;
      await updateGist(
        (fresh) => {
          const state = gistJson(fresh, 'calendar-state.json', { custom_events: [] });
          const evt = kw
            ? (state.kw_battle = state.kw_battle || {})
            : (state.custom_events || []).find((e) => e.id === eventId);
          if (!evt) return null; // deleted meanwhile
          found = true;
          evt.optins = { ...(evt.optins || {}), [tag]: choice };
          return {
            files: { 'calendar-state.json': state },
            description: `[${tag}] reminders ${on ? 'on' : 'off'} for ${kw ? 'the Kingdom War battle' : eventId}`,
          };
        },
        { gist },
      );
      if (!found) return res.status(404).json({ error: say('api_events.not_found') });
      return res.status(200).json({
        success: true,
        message: say(on ? 'api_events.optin_on' : 'api_events.optin_off', { tag }),
      });
    }

    // The Kingdom War battle (api/_kw_battle.js; owner, 2026-11-28): Stewards change its
    // description and reminder; its day, time and length follow the rotation
    if (action === 'edit' && isKwBattleId(eventId)) {
      if (!isGlobalAdmin)
        return res.status(403).json({ error: say('api_events.kw_stewards_only') });
      const checked = cleanReminderFields(eventData || {});
      if (checked.error) return res.status(400).json({ error: checked.error });
      const description = String(eventData?.description || '')
        .trim()
        .slice(0, 1000);
      await updateGist(
        (fresh) => {
          const state = gistJson(fresh, 'calendar-state.json', { custom_events: [] });
          state.kw_battle = {
            ...(state.kw_battle || {}),
            ...checked.fields,
            description: description || null,
            allow_optin: eventData?.allow_optin !== false,
            updatedAt: new Date().toISOString(),
          };
          return {
            files: { 'calendar-state.json': state },
            description: 'Kingdom War battle edited',
          };
        },
        { gist },
      );
      return res.status(200).json({ success: true, message: say('api_events.kw_saved') });
    }

    if (action === 'edit') {
      if (!eventId) return res.status(400).json({ error: 'Missing eventId to edit.' });
      const existing = calendarState.custom_events.find((e) => e.id === eventId);
      if (!existing) return res.status(404).json({ error: say('api_events.not_found') });
      if (!sameScope(existing.scope, callerScope)) {
        return res.status(403).json({ error: say('api_events.out_of_scope') });
      }
      const checked = cleanEventFields(eventData, isGlobalAdmin);
      if (checked.error) return res.status(400).json({ error: checked.error });
      const f = checked.fields;

      const changes = {
        title: isGlobalAdmin ? `[GLOBAL] ${f.title}` : `[${existing.scope}] ${f.title}`,
        description: f.description || existing.description,
        start: f.start,
        end: f.end,
        time_gt: f.time_gt,
        duration_hours: f.duration_hours,
        recurrence: f.recurrence,
        notify_target: f.notify_target,
        custom_role_id: f.custom_role_id,
        reminder: f.reminder,
        reminder_minutes: f.reminder_minutes,
        color: f.color,
        event_type: f.event_type,
        ...(isGlobalAdmin ? { allow_optin: eventData?.allow_optin !== false } : {}),
        updatedAt: new Date().toISOString(),
      };

      let updated = null;
      await updateGist(
        (fresh) => {
          const state = gistJson(fresh, 'calendar-state.json', { custom_events: [] });
          const events = state.custom_events || [];
          const index = events.findIndex((e) => e.id === eventId);
          if (index === -1) return null; // deleted meanwhile: nothing to save
          const before = events[index];
          updated = { ...before, ...changes };
          // A new time means a new first occurrence: its reminder hasn't been posted yet
          if (before.start !== changes.start) {
            updated.notification_status = {
              ...(before.notification_status || {}),
              reminded_occurrence: null,
            };
          }
          events[index] = updated;
          events.sort((a, b) => new Date(a.start) - new Date(b.start));
          state.custom_events = events;
          return { files: { 'calendar-state.json': state } };
        },
        { gist },
      );
      if (!updated) return res.status(404).json({ error: say('api_events.not_found') });

      return res.status(200).json({
        success: true,
        message: say('api_events.updated', { title: updated.title }),
        event: updated,
      });
    }

    // --- ACTION: DELETE EVENT ---
    if (action === 'delete') {
      if (!eventId) {
        return res.status(400).json({ error: 'Missing eventId to delete.' });
      }
      // The Kingdom War battle comes from the rotation: it can be edited, not deleted
      if (isKwBattleId(eventId)) {
        return res.status(403).json({ error: say('api_events.kw_no_delete') });
      }

      const targetIndex = calendarState.custom_events.findIndex((e) => e.id === eventId);
      if (targetIndex === -1) {
        return res.status(404).json({ error: say('api_events.not_found') });
      }

      const targetEvt = calendarState.custom_events[targetIndex];

      // Zero-Crossover Silo:
      // Global Admins can ONLY delete global events.
      // Alliance Leaders can ONLY delete events matching their exact alliance tag.
      if (!sameScope(targetEvt.scope, callerScope)) {
        return res.status(403).json({
          error: say('api_events.out_of_scope'),
        });
      }

      await updateGist(
        (fresh) => {
          const state = gistJson(fresh, 'calendar-state.json', { custom_events: [] });
          state.custom_events = (state.custom_events || []).filter((e) => e.id !== eventId);
          return { files: { 'calendar-state.json': state } };
        },
        { gist },
      );

      return res.status(200).json({
        success: true,
        message: say('api_events.deleted', { title: targetEvt.title }),
      });
    }

    return res.status(400).json({ error: `Unsupported action: "${action}"` });
  } catch (err) {
    console.error('manage-event API error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

/**
 * Checks and cleans the fields of an event being created or edited. Returns { error } (a
 * message in the reader's language) or { fields }.
 */
/**
 * The Discord reminder's fields, checked: who it pings (a specific role needs its ID), on
 * ('1h') or 'off', and how long before the start (0 to 60 minutes, in tens;
 * api/_reminders.js). Shared by events and the Kingdom War battle.
 */
function cleanReminderFields({
  notify_target = 'role',
  custom_role_id = null,
  reminder = 'off',
  reminder_minutes = 60,
} = {}) {
  const allowedTargets = ['role', 'custom_role', 'everyone', 'none'];
  const target = allowedTargets.includes(notify_target) ? notify_target : 'role';
  let roleId = null;
  if (target === 'custom_role') {
    const rawRole = String(custom_role_id || '').trim();
    if (!/^\d{17,20}$/.test(rawRole)) return { error: say('api_events.role_id_needed') };
    roleId = rawRole;
  }
  const minutes = Number(reminder_minutes);
  return {
    fields: {
      notify_target: target,
      custom_role_id: roleId,
      reminder: ['1h', 'off'].includes(reminder) ? reminder : 'off',
      reminder_minutes:
        Number.isInteger(minutes) && minutes >= 0 && minutes <= 60 && minutes % 10 === 0
          ? minutes
          : 60,
    },
  };
}

function cleanEventFields(eventData, isGlobalAdmin) {
  const {
    title,
    date,
    time_gt,
    duration_hours = 1,
    recurrence = 'none',
    notify_target = 'role',
    custom_role_id = null,
    reminder = 'off',
    reminder_minutes = 60,
    color = null,
    description = '',
    event_type = null,
  } = eventData || {};

  if (!title || !date || !time_gt) return { error: say('api_events.required_fields') };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: say('api_events.date_format') };

  // 5-Minute Snapping Validation
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time_gt)) return { error: say('api_events.time_format') };
  const [hh, mm] = time_gt.split(':').map(Number);
  if (mm % 5 !== 0) return { error: say('api_events.time_step') };

  // Multi-day events: Allow up to 48 hours (e.g. Gear Event)
  const duration = Math.max(0.5, Math.min(48, parseFloat(duration_hours) || 1));

  // Recurrence Mode Validation (Mutually Exclusive)
  const allowedRecurrences = ['none', '2days', 'weekly'];
  const cleanRecurrence = allowedRecurrences.includes(recurrence) ? recurrence : 'none';

  const reminderFields = cleanReminderFields({
    notify_target,
    custom_role_id,
    reminder,
    reminder_minutes,
  });
  if (reminderFields.error) return reminderFields;
  const {
    notify_target: cleanNotifyTarget,
    custom_role_id: cleanCustomRoleId,
    reminder: cleanReminder,
    reminder_minutes: cleanReminderMinutes,
  } = reminderFields.fields;

  // Sanitize Accent Color Hex
  let cleanColor = isGlobalAdmin ? '#10b981' : '#3b82f6';
  if (color && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(String(color).trim())) {
    cleanColor = String(color).trim();
  }

  // The event type it was made from (_data/event_types.yml, a form preset): known ones only
  const cleanEventType = PRESET_TYPES.includes(event_type) ? event_type : null;

  // Game Time is UTC-2 => UTC = GT + 2 hours
  const [year, month, day] = date.split('-').map(Number);
  const startUtc = new Date(Date.UTC(year, month - 1, day, hh + 2, mm, 0));
  const endUtc = new Date(startUtc.getTime() + duration * 3600000);

  return {
    fields: {
      title: String(title)
        .trim()
        .replace(/^\[(GLOBAL|[A-Z0-9]+)\]\s*/i, ''),
      description: String(description || '').trim(),
      start: startUtc.toISOString(),
      end: endUtc.toISOString(),
      time_gt,
      duration_hours: duration,
      recurrence: cleanRecurrence,
      notify_target: cleanNotifyTarget,
      custom_role_id: cleanCustomRoleId,
      reminder: cleanReminder,
      reminder_minutes: cleanReminderMinutes,
      color: cleanColor,
      event_type: cleanEventType,
    },
  };
}
