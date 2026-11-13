// api/_reminders.js
// Calendar reminders on Discord ("_" files are helpers, not endpoints). cron-job.org calls
// POST /api/calendar every 10 minutes with { action: 'check-reminders' } and the
// REMINDER_SECRET header (GitHub's schedule never started; "Run workflow" on
// .github/workflows/reminders.yml runs one by hand); api/calendar.js hands the request here.
// Owner design, 2026-11-13:
//   - Only events whose `reminder` is '1h' (set on the event form). Events made before
//     reminders existed have none, so they never fire.
//   - Posted once per occurrence, at most an hour before it starts. A check can come a few
//     minutes late, so the message shows the start as a Discord timestamp (each
//     reader's own time, with a live countdown) rather than "in 1 hour".
//   - Alliance events go to that alliance's alert channel (from /registerbot). Server-wide
//     (Steward) events go to the NAP Discord (NAP_ALERT_CHANNEL_ID) and to the alert channel
//     of alliances that opted in (server_event_alerts).
//   - Who is pinged follows the event's notify_target: the alliance's alert role, a custom
//     role, @everyone, or nobody.
// Safety:
//   - The live site posts nothing until REMINDERS_LIVE=true is set in Vercel: until then a
//     check only reports what it would send ("dry run") and records nothing.
//   - A test deployment (dev.la-s78.app) uses the test Gist and posts every reminder to
//     TEST_CHANNEL_ID instead, pinging nobody, with the real destination written in it.
//   - A request can ask for a dry run ({ dryRun: true }) anywhere.

import { readGist, gistJson, updateGist, isTestDeployment } from './_gist.js';
import { inLocale, say } from './_messages.js';

const HOUR = 3600 * 1000;
const STEPS = { '2days': 2 * 24 * HOUR, weekly: 7 * 24 * HOUR };

/** The start (ms) of the event's next occurrence from `now` (repeating events step forward). */
export function nextOccurrence(evt, now) {
  const base = new Date(evt.start).getTime();
  if (Number.isNaN(base)) return null;
  const step = STEPS[evt.recurrence];
  if (!step || base >= now) return base;
  return base + Math.ceil((now - base) / step) * step;
}

/** Events due for a reminder: reminder on, next occurrence within the hour, not yet reminded. */
export function dueReminders(events, now) {
  const due = [];
  for (const evt of events || []) {
    if (evt?.reminder !== '1h') continue;
    const start = nextOccurrence(evt, now);
    if (start === null || start <= now || start - now > HOUR) continue;
    const occurrence = new Date(start).toISOString();
    if (evt.notification_status?.reminded_occurrence === occurrence) continue;
    due.push({ evt, start, occurrence });
  }
  return due;
}

/** The alliance record for a tag, whatever its letter case (tags like RâvN). */
function allianceFor(alliances, tag) {
  const wanted = String(tag || '').toUpperCase();
  const entry = Object.entries(alliances || {}).find(([t]) => t.toUpperCase() === wanted);
  return entry ? { tag: entry[0], ...entry[1] } : null;
}

/** Who to ping in a channel: a role ID, 'everyone', or null (nobody). */
function pingFor(evt, alertRoleId) {
  switch (evt.notify_target) {
    case 'everyone':
      return 'everyone';
    case 'none':
      return null;
    case 'custom_role':
      return evt.custom_role_id || alertRoleId || null;
    default: // 'role': the channel's own alert role; registration says a blank one means @everyone
      return alertRoleId || 'everyone';
  }
}

/**
 * Where an event's reminder goes: [{ channelId, ping, label }]. `label` names the destination
 * for reports and test posts (an alliance tag or "NAP").
 */
export function targetsFor(evt, alliances, napChannelId) {
  const scope = String(evt.scope || 'global');
  if (scope.toLowerCase() !== 'global') {
    const a = allianceFor(alliances, scope);
    if (!a?.alert_channel_id) return [];
    return [
      { channelId: a.alert_channel_id, ping: pingFor(evt, a.alert_role_id), label: `[${a.tag}]` },
    ];
  }
  const targets = [];
  // The NAP Discord: a custom role is the NAP's own; "role" has no NAP-wide default, so nobody
  if (napChannelId) {
    const ping = evt.notify_target === 'role' ? null : pingFor(evt, null);
    targets.push({ channelId: napChannelId, ping, label: 'NAP' });
  }
  // Alliances that opted in: their own alert role (a custom NAP role means nothing there)
  for (const [tag, a] of Object.entries(alliances || {})) {
    if (!a?.server_event_alerts || !a.alert_channel_id) continue;
    const ping =
      evt.notify_target === 'none'
        ? null
        : evt.notify_target === 'everyone'
          ? 'everyone'
          : a.alert_role_id || 'everyone';
    targets.push({ channelId: a.alert_channel_id, ping, label: `[${tag}]` });
  }
  return targets;
}

/** The Discord message for one reminder (in English for now; owner decision). */
function reminderMessage(evt, start, ping, testNote) {
  const unix = Math.floor(start / 1000);
  const mention = ping === 'everyone' ? '@everyone' : ping ? `<@&${ping}>` : '';
  const title = String(evt.title || '').slice(0, 240);
  const embed = {
    title: say('reminders.title', { title }),
    description: String(evt.description || '').slice(0, 1000) || undefined,
    color:
      Number.parseInt(
        String(evt.color || '#3b82f6')
          .replace('#', '')
          .padEnd(6, '0')
          .slice(0, 6),
        16,
      ) || 0x3b82f6,
    fields: [{ name: say('reminders.starts'), value: `<t:${unix}:F> (<t:${unix}:R>)` }],
  };
  if (testNote) embed.footer = { text: testNote };
  return {
    // On a test deployment the would-be ping is shown as text in the footer, not sent
    content: testNote ? '' : mention,
    embeds: [embed],
    allowed_mentions: testNote
      ? { parse: [] }
      : ping === 'everyone'
        ? { parse: ['everyone'] }
        : ping
          ? { roles: [ping] }
          : { parse: [] },
  };
}

/**
 * Runs one reminder check. Returns a report: { mode, checked, due: [...] } where mode is
 * 'live', 'test' or 'dry-run'.
 */
export async function checkReminders({ dryRun = false, now = Date.now() } = {}) {
  return inLocale('en', async () => {
    const test = isTestDeployment();
    const live = !test && process.env.REMINDERS_LIVE === 'true';
    const mode = dryRun || (!test && !live) ? 'dry-run' : test ? 'test' : 'live';
    const testChannel = process.env.TEST_CHANNEL_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;

    const gist = await readGist({ timeoutMs: 4000 });
    const events = gistJson(gist, 'calendar-state.json', { custom_events: [] }).custom_events || [];
    const alliances = gistJson(gist, 'map-state.json', { alliances: {} }).alliances || {};
    const due = dueReminders(events, now);

    // Which settings this deployment has (yes/no only, never the values), so a report shows
    // at once when a variable is missing from it (e.g. not ticked for Preview, or no redeploy)
    const settings = {
      deployment: process.env.VERCEL_ENV || 'unknown',
      napChannel: Boolean(process.env.NAP_ALERT_CHANNEL_ID),
      testChannel: Boolean(testChannel),
      botToken: Boolean(botToken),
      remindersLive: process.env.REMINDERS_LIVE === 'true',
    };
    const report = { mode, settings, checked: events.length, due: [] };
    const sent = []; // { id, occurrence } of reminders actually posted
    for (const { evt, start, occurrence } of due) {
      const targets = targetsFor(evt, alliances, process.env.NAP_ALERT_CHANNEL_ID);
      const item = { id: evt.id, title: evt.title, occurrence, targets: [] };
      report.due.push(item);
      let anyPosted = false;
      for (const target of targets) {
        const result = {
          to: target.label,
          ping: target.ping ? (target.ping === 'everyone' ? '@everyone' : 'role') : 'nobody',
        };
        item.targets.push(result);
        if (mode === 'dry-run') {
          result.status = 'not sent (dry run)';
          continue;
        }
        const channelId = mode === 'test' ? testChannel : target.channelId;
        if (!channelId || !botToken) {
          result.status = mode === 'test' ? 'no TEST_CHANNEL_ID' : 'no bot token';
          continue;
        }
        const testNote =
          mode === 'test'
            ? `🧪 Test reminder: would go to ${target.label}, pinging ${result.ping}`
            : null;
        try {
          const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(reminderMessage(evt, start, target.ping, testNote)),
            signal: AbortSignal.timeout(4000),
          });
          result.status = res.ok ? 'sent' : `Discord error ${res.status}`;
          if (res.ok) anyPosted = true;
        } catch (err) {
          result.status = `failed: ${err.message}`;
        }
      }
      if (!targets.length) item.note = 'nowhere to post (no alert channel)';
      // Recorded once anything was posted, so it isn't posted again; if every post failed it
      // is tried again on the next check (until the event starts)
      if (anyPosted) sent.push({ id: evt.id, occurrence });
    }

    if (sent.length) {
      await updateGist((fresh) => {
        const state = gistJson(fresh, 'calendar-state.json', { custom_events: [] });
        for (const e of state.custom_events || []) {
          const done = sent.find((s) => s.id === e.id);
          if (done) {
            e.notification_status = {
              ...(e.notification_status || {}),
              reminded_occurrence: done.occurrence,
            };
          }
        }
        return {
          files: { 'calendar-state.json': state },
          description: `Calendar reminders posted (${sent.length})`,
        };
      });
    }
    return report;
  });
}
