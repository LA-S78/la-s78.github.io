// api/manage-event.js

// Handles creating, editing and deleting calendar events
import { isGistConfigured, readGist, gistJson, updateGist } from './_gist.js';
import { verifyToken } from './_tokens.js';
import { inLanguage, say } from './_messages.js';

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

  const { token, action, eventData, eventId } = req.body || {};

  // 1. Verify Cryptographic Token
  const tokenPayload = verifyToken(token, botSecret, { action: 'manage_events' });
  if (!tokenPayload) {
    return res.status(401).json({
      error: say('api_events.session_invalid'),
    });
  }

  const callerScope = tokenPayload.scope; // e.g., 'global' or 'WLO'
  const isGlobalAdmin = callerScope === 'global';

  try {
    // 2. Fetch current calendar state from GitHub Gist
    const gist = await readGist();
    let calendarState = gistJson(gist, 'calendar-state.json', { custom_events: [] });
    calendarState.custom_events = calendarState.custom_events || [];

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
        notification_status: {
          reminder_15m_sent: false,
          start_sent: false,
          last_notified_occurrence: null,
          // The start (ISO) of the last occurrence a reminder was posted for (api/calendar.js)
          reminded_occurrence: null,
        },
        type: isGlobalAdmin ? 'custom' : 'alliance',
        color: f.color,
        allDay: false,
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
    if (action === 'edit') {
      if (!eventId) return res.status(400).json({ error: 'Missing eventId to edit.' });
      const existing = calendarState.custom_events.find((e) => e.id === eventId);
      if (!existing) return res.status(404).json({ error: say('api_events.not_found') });
      if ((existing.scope || 'global').toLowerCase() !== callerScope.toLowerCase()) {
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
        color: f.color,
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

      const targetIndex = calendarState.custom_events.findIndex((e) => e.id === eventId);
      if (targetIndex === -1) {
        return res.status(404).json({ error: say('api_events.not_found') });
      }

      const targetEvt = calendarState.custom_events[targetIndex];
      const targetScope = (targetEvt.scope || 'global').toLowerCase();
      const currentCallerScope = callerScope.toLowerCase();

      // Zero-Crossover Silo:
      // Global Admins can ONLY delete global events.
      // Alliance Leaders can ONLY delete events matching their exact alliance tag.
      if (targetScope !== currentCallerScope) {
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
    color = null,
    description = '',
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

  // Alert Level & Role Validation
  const allowedTargets = ['role', 'custom_role', 'everyone', 'none'];
  const cleanNotifyTarget = allowedTargets.includes(notify_target) ? notify_target : 'role';
  let cleanCustomRoleId = null;
  if (cleanNotifyTarget === 'custom_role') {
    const rawRole = String(custom_role_id || '').trim();
    if (!/^\d{17,20}$/.test(rawRole)) return { error: say('api_events.role_id_needed') };
    cleanCustomRoleId = rawRole;
  }

  // Discord reminder before the start: '1h' or 'off' (more choices can come later)
  const cleanReminder = ['1h', 'off'].includes(reminder) ? reminder : 'off';

  // Sanitize Accent Color Hex
  let cleanColor = isGlobalAdmin ? '#10b981' : '#3b82f6';
  if (color && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(String(color).trim())) {
    cleanColor = String(color).trim();
  }

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
      color: cleanColor,
    },
  };
}
