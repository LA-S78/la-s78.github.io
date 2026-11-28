// api/_reminders.js
// Calendar reminders on Discord ("_" files are helpers, not endpoints). cron-job.org calls
// POST /api/calendar every 5 minutes (since 2026-11-17; 10 before) with { action: 'check-reminders' } and the
// REMINDER_SECRET header (GitHub's schedule never started; "Run workflow" on
// .github/workflows/reminders.yml runs one by hand); api/calendar.js hands the request here.
// Owner design, 2026-11-13:
//   - Only events whose `reminder` is '1h' (set on the event form: '1h' means "on"; the name is
//     from when an hour was the only choice). Events made before reminders existed have none,
//     so they never fire.
//   - When (owner request, 2026-11-17): `reminder_minutes`, 0 to 60 in steps of 10, how long
//     before the start (events from before it: 60). The check runs every 5 minutes, so a
//     reminder is posted within the 5 minutes before that time. 0 ("when it starts") is
//     posted by the first check after the start, up to 15 minutes late, and says "Starting now".
//   - Posted once per occurrence. A check can come a few minutes late, so the message shows
//     the start as a Discord timestamp (each reader's own time, with a live countdown) rather
//     than "in 1 hour".
//   - Alliance events go to that alliance's alert channel (from /registerbot). Server-wide
//     (Steward) events go to the NAP Discord (NAP_ALERT_CHANNEL_ID) and to the alert channel
//     of alliances that opted in (server_event_alerts).
//   - Who is pinged follows the event's notify_target: the alliance's alert role, a custom
//     role, @everyone, or nobody.
//   - The look (owner, 2026-11-28): a card drawn as a picture (api/_calendar_cards.js, as
//     /calendar's), attached so Discord shows it full width with no box, under one line of
//     text: the ping, the title and a live countdown (phones' notifications show only text).
//     If the card can't be drawn or Discord refuses it, the reminder goes out as before.
// Safety:
//   - The live site posts nothing until REMINDERS_LIVE=true is set in Vercel: until then a
//     check only reports what it would send ("dry run") and records nothing.
//   - A test deployment (dev.la-s78.app) uses the test Gist and posts every reminder to
//     TEST_CHANNEL_ID instead, pinging nobody, with the real destination written in it.
//   - A request can ask for a dry run ({ dryRun: true }) anywhere.

import { sendForm, sendMessage } from './_discord_send.js';
import { readGist, gistJson, updateGist, isTestDeployment } from './_gist.js';
import { inLocale, say } from './_messages.js';
import { findTag } from './_alliances.js';
import { shownTitle } from './_calendar_events.js';
import { KW_BATTLE_ID, kwBattleReminderEvent } from './_kw_battle.js';
import { optinAllowed, optinFor, optinPing } from './_event_optins.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
/** How long after the start a "when it starts" reminder may still be posted. */
const START_GRACE = 15 * MINUTE;
/** Where the event pictures are (the same on the test site). */
const SITE = 'https://la-s78.app';

/** Minutes before the start the event's reminder goes out: 0 to 60 in tens (default 60). */
export function reminderLead(evt) {
  const m = evt?.reminder_minutes;
  return Number.isInteger(m) && m >= 0 && m <= 60 && m % 10 === 0 ? m : 60;
}
const STEPS = { '2days': 2 * 24 * HOUR, weekly: 7 * 24 * HOUR };

/** The start (ms) of the event's next occurrence from `now` (repeating events step forward). */
export function nextOccurrence(evt, now) {
  const base = new Date(evt.start).getTime();
  if (Number.isNaN(base)) return null;
  const step = STEPS[evt.recurrence];
  if (!step || base >= now) return base;
  return base + Math.ceil((now - base) / step) * step;
}

/**
 * Events due for a reminder: reminder on, the next occurrence within its lead time
 * (reminderLead), not yet reminded. A "when it starts" reminder (lead 0) is due from the
 * start until START_GRACE after it, so the occurrence that just began still counts.
 */
export function dueReminders(events, now) {
  const due = [];
  for (const evt of events || []) {
    if (evt?.reminder !== '1h') continue;
    const lead = reminderLead(evt) * MINUTE;
    const grace = lead === 0 ? START_GRACE : 0;
    const start = nextOccurrence(evt, now - grace);
    if (start === null || start <= now - grace || start - now > lead) continue;
    if (lead > 0 && start <= now) continue; // started already: too late for "before"
    const occurrence = new Date(start).toISOString();
    if (evt.notification_status?.reminded_occurrence === occurrence) continue;
    due.push({ evt, start, occurrence });
  }
  return due;
}

/** The alliance record for an event's tag (findTag: RâvN and RÂVN are two alliances). */
function allianceFor(alliances, tag) {
  const key = findTag(Object.keys(alliances || {}), tag);
  return key ? { tag: key, ...alliances[key] } : null;
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
  // Alliances (owner, 2026-11-28; api/_event_optins.js): unless the event keeps its
  // reminder to the NAP, every alliance that opted in to it (or, without a choice of its
  // own, to every server event when it registered), pinging what it chose (a custom NAP
  // role means nothing in an alliance's server)
  if (!optinAllowed(evt)) return targets;
  for (const [tag, a] of Object.entries(alliances || {})) {
    if (!a?.alert_channel_id) continue;
    const choice = optinFor(evt, tag, a);
    if (!choice.on) continue;
    targets.push({
      channelId: a.alert_channel_id,
      ping: optinPing(evt, choice, a),
      label: `[${tag}]`,
    });
  }
  return targets;
}

/** The Discord message for one reminder (in English for now; owner decision). */
function reminderMessage(evt, start, ping, testNote) {
  const unix = Math.floor(start / 1000);
  const mention = ping === 'everyone' ? '@everyone' : ping ? `<@&${ping}>` : '';
  const title = String(evt.title || '').slice(0, 240);
  const embed = {
    title: say(reminderLead(evt) === 0 ? 'reminders.title_now' : 'reminders.title', { title }),
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
    allowed_mentions: mentionsFor(ping, testNote),
  };
}

/** Who a reminder may ping: the role, @everyone, or nobody (and nobody on a test). */
function mentionsFor(ping, testNote) {
  if (testNote) return { parse: [] };
  if (ping === 'everyone') return { parse: ['everyone'] };
  return ping ? { roles: [ping] } : { parse: [] };
}

/** The occurrence as an event of its own: this start, and the event's length. */
function occurrenceOf(evt, start) {
  const baseStart = Date.parse(evt.start);
  const length = evt.duration_hours
    ? parseFloat(evt.duration_hours) * HOUR
    : Math.max(30 * MINUTE, Date.parse(evt.end || evt.start) - baseStart || HOUR);
  return {
    ...evt,
    start: new Date(start).toISOString(),
    end: new Date(start + length).toISOString(),
  };
}

/**
 * The reminder's card (a PNG), as /calendar's event cards: a badge ("Starting in 15 min",
 * "Starting now"), the time in Game Time, the title, two lines of the description and whose
 * it is, over the event type's picture. The drawing code (sharp) loads only here.
 */
export async function reminderCard(evt, start, now) {
  const { eventCardData } = await import('./_bot_calendar.js');
  const { reminderCardPng, pictureData } = await import('./_calendar_cards.js');
  const [shown] = eventCardData([occurrenceOf(evt, start)], { origin: SITE });
  const minutes = Math.round((start - now) / MINUTE);
  const badge =
    reminderLead(evt) === 0 || minutes <= 0
      ? say('reminders.card_now')
      : minutes >= 55
        ? say('reminders.card_hour')
        : say('reminders.card_soon', { minutes: Math.max(5, Math.round(minutes / 5) * 5) });
  const lines = String(evt.description || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 2);
  const isGlobal = !evt.scope || String(evt.scope).toLowerCase() === 'global';
  return reminderCardPng({
    badge,
    color: shown.color,
    badgeColor: shown.base,
    time: shown.time,
    title: shown.title,
    lines,
    tag: isGlobal ? 'la-s78.app' : `[${evt.scope}] · la-s78.app`,
    picture: await pictureData(shown.picture),
  });
}

/** The reminder as a card: one line of text (the ping, the title, a countdown) and the card. */
function reminderForm(evt, start, ping, testNote, png) {
  const unix = Math.floor(start / 1000);
  const mention = ping === 'everyone' ? '@everyone' : ping ? `<@&${ping}>` : '';
  const title = shownTitle(evt).slice(0, 200);
  const line = say(reminderLead(evt) === 0 ? 'reminders.line_now' : 'reminders.line', {
    title,
    when: `<t:${unix}:R>`,
  });
  const payload = {
    // On a test deployment the would-be ping is written under it, not sent
    content: `${[testNote ? '' : mention, line].filter(Boolean).join(' ')}${testNote ? `\n-# ${testNote}` : ''}`,
    allowed_mentions: mentionsFor(ping, testNote),
    attachments: [
      {
        id: 0,
        filename: 'reminder.png',
        description: `${title} (${say('reminders.starts')} <t:${unix}:F>)`.slice(0, 1000),
      },
    ],
  };
  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));
  form.append('files[0]', new Blob([png], { type: 'image/png' }), 'reminder.png');
  return form;
}

/**
 * Marks events' occurrences as reminded (`ids`: [{ id, occurrence }]) or, with
 * `occurrence: null`, clears the mark again. One Gist save; throws if it can't be saved.
 */
async function markReminded(ids) {
  await updateGist((fresh) => {
    const state = gistJson(fresh, 'calendar-state.json', { custom_events: [] });
    // The Kingdom War battle keeps its mark in its settings (api/_kw_battle.js)
    const kwMark = ids.find((s) => s.id === KW_BATTLE_ID);
    if (kwMark) {
      const kw = state.kw_battle || {};
      if (
        kwMark.occurrence !== null ||
        kw.notification_status?.reminded_occurrence === kwMark.was
      ) {
        state.kw_battle = {
          ...kw,
          notification_status: {
            ...(kw.notification_status || {}),
            reminded_occurrence: kwMark.occurrence,
          },
        };
      }
    }
    for (const e of state.custom_events || []) {
      const mark = ids.find((s) => s.id === e.id);
      if (!mark) continue;
      // Clearing only takes back our own mark (an edit since may have changed it)
      if (mark.occurrence === null && e.notification_status?.reminded_occurrence !== mark.was)
        continue;
      e.notification_status = {
        ...(e.notification_status || {}),
        reminded_occurrence: mark.occurrence,
      };
    }
    return {
      files: { 'calendar-state.json': state },
      description: ids.some((m) => m.occurrence)
        ? `Calendar reminders posting (${ids.length})`
        : `Calendar reminders not posted, to retry (${ids.length})`,
    };
  });
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
    const calState = gistJson(gist, 'calendar-state.json', { custom_events: [] });
    // The leaders' events, and the Kingdom War battle when Stewards turned its reminder on
    const kwBattle = kwBattleReminderEvent(calState, now);
    const events = [...(calState.custom_events || []), ...(kwBattle ? [kwBattle] : [])];
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
    // Marked as reminded BEFORE posting (owner report, 2026-11-20: an Elixir Scramble reminder
    // went out twice). Posting first and saving after meant a failed save left it unmarked, so
    // the next check, five minutes later and still inside the lead time, posted it again. Now
    // a failed mark posts nothing (the next check tries again), and a reminder whose every
    // post failed is unmarked so the next check retries it: at worst one check late, never
    // twice.
    if (mode !== 'dry-run' && due.length) {
      try {
        await markReminded(due.map(({ evt, occurrence }) => ({ id: evt.id, occurrence })));
      } catch (err) {
        // Not marked: nothing posted this time, and the rest of the 5-minute check (the race,
        // the Stats snapshot) still runs
        console.error('Reminders not marked, so not posted:', err.message);
        report.error = `not marked as reminded, so not posted (tried again next check): ${err.message}`;
        report.due = due.map(({ evt, occurrence }) => ({
          id: evt.id,
          title: evt.title,
          occurrence,
        }));
        return report;
      }
    }
    const failed = []; // { id, occurrence: null, was } of reminders no post went out for
    for (const { evt, start, occurrence } of due) {
      const targets = targetsFor(evt, alliances, process.env.NAP_ALERT_CHANNEL_ID);
      const item = { id: evt.id, title: evt.title, occurrence, targets: [] };
      report.due.push(item);
      let anyPosted = false;
      let card; // drawn once for every channel (undefined: not tried yet; null: couldn't)
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
          if (card === undefined) {
            try {
              card = await reminderCard(evt, start, now);
            } catch (err) {
              console.warn('Reminder card not drawn, sending text:', err.message);
              card = null;
            }
          }
          let res = null;
          if (card) {
            res = await sendForm(channelId, reminderForm(evt, start, target.ping, testNote, card), {
              token: botToken,
            });
            result.style = res.ok ? 'card' : `card refused (${res.status}), sent as text`;
          }
          if (!res || !res.ok) {
            res = await sendMessage(channelId, reminderMessage(evt, start, target.ping, testNote), {
              token: botToken,
            });
            if (!card) result.style = 'text';
          }
          result.status = res.ok ? 'sent' : `Discord error ${res.status}`;
          if (res.ok) anyPosted = true;
        } catch (err) {
          result.status = `failed: ${err.message}`;
        }
      }
      if (!targets.length) item.note = 'nowhere to post (no alert channel)';
      // Nothing went out (Discord down, no channel): unmarked, so the next check retries it
      // (until the event starts)
      if (!anyPosted && targets.length && mode !== 'dry-run')
        failed.push({ id: evt.id, occurrence: null, was: occurrence });
    }

    if (failed.length) {
      try {
        await markReminded(failed);
      } catch (err) {
        console.error('Reminders not unmarked for a retry:', err.message);
      }
    }
    return report;
  });
}
