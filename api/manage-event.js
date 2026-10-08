// api/manage-event.js

// Handles creating, deleting, modifying events
import crypto from 'crypto';

/**
 * Validates HMAC-SHA256 signed token and checks expiration
 */
function verifyHmacToken(token, secret) {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [dataString, signature] = parts;

  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(dataString)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(dataString, 'base64url').toString('utf8'));

    // Check expiration timestamp
    if (payload.exp && Date.now() > payload.exp) {
      return null;
    }

    if (payload.action !== 'manage_events') {
      return null;
    }

    return payload;
  } catch (err) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const botSecret = process.env.DISCORD_BOT_TOKEN;
  const gistId = process.env.GIST_ID;
  const gistToken = process.env.GIST_TOKEN;

  if (!botSecret || !gistId || !gistToken) {
    return res.status(500).json({ error: 'Server configuration error: missing credentials' });
  }

  const { token, action, eventData, eventId } = req.body || {};

  // 1. Verify Cryptographic Token
  const tokenPayload = verifyHmacToken(token, botSecret);
  if (!tokenPayload) {
    return res.status(401).json({
      error: 'Invalid, tampered, or expired session token. Please re-run /calendar in Discord.'
    });
  }

  const callerScope = tokenPayload.scope; // e.g., 'global' or 'WLO'
  const isGlobalAdmin = callerScope === 'global';

  try {
    // 2. Fetch current calendar state from GitHub Gist
    const gistRes = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        Authorization: `Bearer ${gistToken}`,
        'User-Agent': 'WarRoom-App'
      }
    });

    if (!gistRes.ok) {
      throw new Error(`GitHub Gist fetch failed (HTTP ${gistRes.status})`);
    }

    const gistData = await gistRes.json();
    const rawContent = gistData.files?.['calendar-state.json']?.content;

    let calendarState = { custom_events: [] };
    if (rawContent) {
      calendarState = JSON.parse(rawContent);
    }
    calendarState.custom_events = calendarState.custom_events || [];

    // --- ACTION: CREATE EVENT ---
    if (action === 'create') {
      const {
        title,
        date,
        time_gt,
        duration_hours = 1,
        recurrence = 'none',
        notify_target = 'role',
        custom_role_id = null,
        color = null,
        description = ''
      } = eventData || {};

      if (!title || !date || !time_gt) {
        return res.status(400).json({ error: 'Title, Date, and Game Time are required.' });
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Date must be formatted as YYYY-MM-DD.' });
      }

      // 5-Minute Snapping Validation
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time_gt)) {
        return res.status(400).json({ error: 'Game Time must be formatted as HH:MM (00:00 to 23:59).' });
      }

      const [hh, mm] = time_gt.split(':').map(Number);
      if (mm % 5 !== 0) {
        return res.status(400).json({
          error: 'Game Time must be in 5-minute increments (:00, :05, :10, :15, etc.).'
        });
      }

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
        if (!/^\d{17,20}$/.test(rawRole)) {
          return res.status(400).json({
            error: 'Target Specific Role requires a valid 17-20 digit Discord Role ID.'
          });
        }
        cleanCustomRoleId = rawRole;
      }

      // Sanitize Accent Color Hex
      let cleanColor = isGlobalAdmin ? '#10b981' : '#3b82f6';
      if (color && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(String(color).trim())) {
        cleanColor = String(color).trim();
      }

      // Game Time is UTC-2 => UTC = GT + 2 hours
      const [year, month, day] = date.split('-').map(Number);
      const startUtc = new Date(Date.UTC(year, month - 1, day, hh + 2, mm, 0));
      const endUtc = new Date(startUtc.getTime() + duration * 3600000);

      const cleanTitle = title.trim().replace(/^\[(GLOBAL\vert{}[A-Z0-9]+)\]\s*/i, '');
      const uniqueId = `evt-${callerScope.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString(36)}`;

      const newEvent = {
        id: uniqueId,
        scope: callerScope,
        title: isGlobalAdmin ? `[GLOBAL] ${cleanTitle}` : `[${callerScope}] ${cleanTitle}`,
        description: description.trim() || (isGlobalAdmin ? 'Kingdom-wide operation.' : `Alliance event for [${callerScope}].`),
        start: startUtc.toISOString(),
        end: endUtc.toISOString(),
        time_gt: time_gt,
        duration_hours: duration,
        recurrence: cleanRecurrence,
        notify_target: cleanNotifyTarget,
        custom_role_id: cleanCustomRoleId,
        notification_status: {
          reminder_15m_sent: false,
          start_sent: false,
          last_notified_occurrence: null
        },
        type: isGlobalAdmin ? 'custom' : 'alliance',
        color: cleanColor,
        allDay: false,
        createdAt: new Date().toISOString()
      };

      calendarState.custom_events.push(newEvent);
      calendarState.custom_events.sort((a, b) => new Date(a.start) - new Date(b.start));

      const patchRes = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${gistToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'WarRoom-App'
        },
        body: JSON.stringify({
          files: {
            'calendar-state.json': {
              content: JSON.stringify(calendarState, null, 2)
            }
          }
        })
      });

      if (!patchRes.ok) {
        throw new Error(`Failed to write to GitHub Gist (HTTP ${patchRes.status})`);
      }

      return res.status(200).json({
        success: true,
        message: `Operation "${newEvent.title}" published successfully.`,
        event: newEvent
      });
    }

    // --- ACTION: DELETE EVENT ---
    if (action === 'delete') {
      if (!eventId) {
        return res.status(400).json({ error: 'Missing eventId to delete.' });
      }

      const targetIndex = calendarState.custom_events.findIndex((e) => e.id === eventId);
      if (targetIndex === -1) {
        return res.status(404).json({ error: 'Event not found or already deleted.' });
      }

      const targetEvt = calendarState.custom_events[targetIndex];
      const targetScope = (targetEvt.scope || 'global').toLowerCase();
      const currentCallerScope = callerScope.toLowerCase();

      // Zero-Crossover Silo:
      // Global Admins can ONLY delete global events.
      // Alliance Leaders can ONLY delete events matching their exact alliance tag.
      if (targetScope !== currentCallerScope) {
        return res.status(403).json({
          error: 'Access Denied: You cannot modify or delete events outside your assigned scope.'
        });
      }

      calendarState.custom_events.splice(targetIndex, 1);

      const patchRes = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${gistToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'WarRoom-App'
        },
        body: JSON.stringify({
          files: {
            'calendar-state.json': {
              content: JSON.stringify(calendarState, null, 2)
            }
          }
        })
      });

      if (!patchRes.ok) {
        throw new Error(`Failed to update GitHub Gist (HTTP ${patchRes.status})`);
      }

      return res.status(200).json({
        success: true,
        message: `Deleted operation: ${targetEvt.title}`
      });
    }

    return res.status(400).json({ error: `Unsupported action: "${action}"` });

  } catch (err) {
    console.error('manage-event API error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}