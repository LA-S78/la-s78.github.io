// api/_ascension.js
// The Top 4 race (owner rule, 2026-11-17): NAP alliances and academies are ranked by the total
// of their Might on Alliance Duel Days 3, 4 and 5 of Kingdom War Week 1, each measured 10
// minutes before reset (23:50 GT). The four highest totals hold the Top 4 seats from the next
// 4-week cycle, once a Steward confirms (Option A's seat inheritance, docs/DECISIONS.md).
// Helpers, not an endpoint: the snapshots are taken by the every-5-minutes reminder check
// (POST /api/calendar, cron-job.org), and /api/calendar sends the results to the pages.
//
// Might comes from the Last Asylum Tracker (api/_tracker.js) as a live game lookup: the
// tracker's own copy can be days old. Stored in the Gist as ascension.json:
//   { runs: { '<week 1 Monday, GT date>': { days: { 3: { at, power: { TAG: n|null } }, 4, 5 },
//     posted } } }

import { gistJson, updateGist, isTestDeployment } from './_gist.js';
import { getCycleState, DEFAULT_CALENDAR_CONFIG } from './_calendar_helper.js';
import { trackerConfigured } from './_tracker.js';
import { measureAlliances } from './_alliance_ids.js';
import { ascensionButtons } from './_bot_ascension.js';

export const ASCENSION_FILE = 'ascension.json';
export const DUEL_DAYS = [3, 4, 5]; // Wednesday, Thursday, Friday
/** Snapshots are taken between 12 and 2 minutes before reset: the 5-minute check lands twice. */
const WINDOW = { from: 12, to: 2 };
const KEEP_RUNS = 4;
const DAY_MS = 86400000;
const GT_OFFSET_MS = -2 * 3600000;

/** The NAP alliances and academies (is_nap is on unless switched off), by their exact tags. */
export function napTags(alliances = {}) {
  return Object.entries(alliances)
    .filter(([, a]) => a && a.is_nap !== false)
    .map(([tag]) => tag);
}

/** The GT date (YYYY-MM-DD) of the Monday of `now`'s week: the run's id. */
function weekId(now, dayOfWeek) {
  const gt = new Date(now + GT_OFFSET_MS - (dayOfWeek - 1) * DAY_MS);
  return gt.toISOString().slice(0, 10);
}

/**
 * Is a snapshot due now? { runId, day } on Duel Days 3–5 of Kingdom War Week 1 in the
 * minutes before reset, else null.
 */
export function snapshotDue(now, calendarConfig = {}) {
  const state = getCycleState(new Date(now), { ...DEFAULT_CALENDAR_CONFIG, ...calendarConfig });
  if (state.clockWeek !== 1 || !DUEL_DAYS.includes(state.dayOfWeekNumber)) return null;
  const minutesLeft = (Date.parse(state.nextResetUtc) - now) / 60000;
  if (minutesLeft > WINDOW.from || minutesLeft < WINDOW.to) return null;
  return { runId: weekId(now, state.dayOfWeekNumber), day: state.dayOfWeekNumber, minutesLeft };
}

/**
 * The race's standings for one run: rows best first, { tag, days: { 3, 4, 5 }, total, complete,
 * place, top4 }. Ranked by the total of the days measured so far (a provisional order until
 * Day 5); an alliance missing one of those days comes after, unranked (its total would not be
 * comparable).
 */
export function standings(run, tags) {
  const days = (run && run.days) || {};
  const taken = DUEL_DAYS.filter((d) => days[d]);
  const all = new Set(tags || []);
  for (const d of DUEL_DAYS) for (const t of Object.keys(days[d]?.power || {})) all.add(t);
  const rows = [...all].map((tag) => {
    const per = {};
    for (const d of DUEL_DAYS) {
      const v = days[d]?.power?.[tag];
      per[d] = Number.isFinite(v) ? v : null;
    }
    const complete = taken.length > 0 && taken.every((d) => per[d] !== null);
    return {
      tag,
      days: per,
      total: complete ? taken.reduce((s, d) => s + per[d], 0) : null,
      complete,
    };
  });
  const ranked = rows.filter((r) => r.complete).sort((a, b) => b.total - a.total);
  const rest = rows.filter((r) => !r.complete).sort((a, b) => a.tag.localeCompare(b.tag));
  ranked.forEach((r, i) => {
    r.place = i + 1;
    r.top4 = i < 4;
  });
  return [...ranked, ...rest];
}

/** The latest run, as the pages show it: { id, taken: { 3: at… }, rows }, or null. */
export function latestRace(gist) {
  const runs = gistJson(gist, ASCENSION_FILE, { runs: {} }).runs || {};
  const id = Object.keys(runs).sort().pop();
  if (!id) return null;
  const run = runs[id];
  const taken = {};
  for (const d of DUEL_DAYS) taken[d] = run.days?.[d]?.at || null;
  return { id, taken, finished: Boolean(taken[5]), rows: standings(run, []) };
}

/** The results message for NAP leadership, after Day 5's snapshot. */
function resultsMessage(runId, rows, testNote) {
  const fmt = (n) => (n === null ? '—' : `${(n / 1e9).toFixed(2)}B`);
  const lines = rows.map((r) =>
    r.complete
      ? `${r.top4 ? '**' : ''}#${r.place} [${r.tag}]${r.top4 ? '**' : ''}  ${fmt(r.total)}  (${DUEL_DAYS.map((d) => fmt(r.days[d])).join(' · ')})`
      : `– [${r.tag}]  missing a day (${DUEL_DAYS.map((d) => fmt(r.days[d])).join(' · ')})`,
  );
  return {
    content: testNote || undefined,
    embeds: [
      {
        title: '👑 Top 4 race: Kingdom War Week 1 results',
        description:
          `Might totals of Alliance Duel Days 3–5 (week of ${runId}), measured 10 minutes before reset.\n\n` +
          `${lines.join('\n')}\n\n` +
          'Applying re-ranks the whole NAP list by these totals (academies included); the Top 4 ' +
          'take their Capitol seats from the **next** cycle. A Steward applies or keeps the current order below.',
        color: 0xd4af37,
        footer: { text: 'Might from the Last Asylum Tracker' },
        timestamp: new Date().toISOString(),
      },
    ],
    allowed_mentions: { parse: [] },
    components: ascensionButtons(runId),
  };
}

/**
 * Takes the snapshot when one is due (called by the reminder check). Measures every NAP
 * alliance not measured yet for that day (a failed lookup is tried again on the next check
 * inside the window), saves it, and after Day 5 posts the results to NAP leadership once.
 * Returns a short report for the check's answer.
 */
export async function checkAscension({ gist, now = Date.now(), dryRun = false } = {}) {
  const calendarConfig = gistJson(gist, 'calendar-state.json', {});
  const due = snapshotDue(now, calendarConfig);
  if (!due) return { due: false };
  if (!trackerConfigured()) return { due: true, error: 'LAT_API_KEY is not set' };

  const tags = napTags(gistJson(gist, 'map-state.json', { alliances: {} }).alliances || {});
  const stored = gistJson(gist, ASCENSION_FILE, { runs: {} });
  const done = stored.runs?.[due.runId]?.days?.[due.day]?.power || {};
  const todo = tags.filter((t) => !Number.isFinite(done[t]));
  const report = { due: true, run: due.runId, day: due.day, measured: {}, failed: [] };

  if (todo.length) {
    // By tag, or by the game's number for an alliance renamed in the game (it's still measured
    // under the site's tag; api/_alliance_ids.js)
    const results = await measureAlliances(todo, {
      fresh: true,
      timeoutMs: 6000,
      use: 'automation',
    });
    todo.forEach((tag, i) => {
      if (results[i]) report.measured[tag] = results[i].power;
      else report.failed.push(tag);
    });
  }
  if (dryRun) return { ...report, note: 'dry run: nothing saved or posted' };

  // Day 5 complete (or its window ending): the results go to NAP leadership, once
  const lastChance = due.minutesLeft < 7;
  let post = null;
  const saved = await updateGist((fresh) => {
    const data = gistJson(fresh, ASCENSION_FILE, { runs: {} });
    data.runs = data.runs || {};
    const run = (data.runs[due.runId] = data.runs[due.runId] || { days: {} });
    const day = (run.days[due.day] = run.days[due.day] || { at: null, power: {} });
    for (const tag of tags) if (!(tag in day.power)) day.power[tag] = null;
    for (const [tag, power] of Object.entries(report.measured)) day.power[tag] = power;
    day.at = day.at || new Date(now).toISOString();
    const missing = tags.filter((t) => !Number.isFinite(day.power[t]));
    if (due.day === 5 && !run.posted && (!missing.length || lastChance)) {
      run.posted = new Date(now).toISOString();
      post = standings(run, tags);
    }
    // Only the latest runs are kept
    for (const old of Object.keys(data.runs).sort().slice(0, -KEEP_RUNS)) delete data.runs[old];
    return {
      files: { [ASCENSION_FILE]: data },
      description: `Top 4 race: Day ${due.day} snapshot (${Object.keys(report.measured).length} alliances)`,
    };
  });
  report.saved = Boolean(saved);

  if (post) {
    const test = isTestDeployment();
    const live = !test && process.env.REMINDERS_LIVE === 'true';
    const channelId = test
      ? process.env.TEST_CHANNEL_ID
      : process.env.DISCORD_CHANNEL_ID_NAP_LEADERSHIP || process.env.DISCORD_WEBHOOK_CHANNEL_ID;
    const token = process.env.DISCORD_BOT_TOKEN;
    if ((test || live) && channelId && token) {
      try {
        const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(
            resultsMessage(due.runId, post, test ? '🧪 Test: would go to NAP leadership' : null),
          ),
          signal: AbortSignal.timeout(4000),
        });
        report.posted = res.ok ? 'sent' : `Discord error ${res.status}`;
      } catch (err) {
        report.posted = `failed: ${err.message}`;
      }
    } else {
      report.posted = 'not posted (reminders not live, or no channel)';
    }
  }
  return report;
}
