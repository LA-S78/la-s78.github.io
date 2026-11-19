// api/_stats.js
// The Alliance page's Stats tab (owner request, 2026-11-19): a daily snapshot of every NAP
// alliance's roster from the Last Asylum Tracker, kept for growth charts and achievements.
// Helpers, not an endpoint: the snapshot is taken by the every-5-minutes reminder check
// (POST /api/calendar, as the Top 4 race), and /api/state?scope=stats gives the pages the
// summary.
//
// When: once a day, in the last minutes before the game's daily reset (00:00 GT), so each
// day's numbers are that day's final ones. About 10 tracker requests a day.
//
// Where: the private Vercel Blob store (not the Gist, which every page reads):
//   stats/days/<GT date>.json  the day's full rosters (for player views and achievements):
//     { day, at, alliances: { TAG: { power, members, level, players:
//       [[uid, name, power, kills, sanctuaryLevel, x, y], …] } } }
//   stats/summary.json         what the NAP growth view needs, small:
//     { days: [dates], alliances: { TAG: { <date>: power } }, updatedAt }
// Research donations and help are not kept (owner: they stay off the public stats).

import { get, put } from '@vercel/blob';
import { gistJson, isTestDeployment } from './_gist.js';
import { getCycleState, DEFAULT_CALENDAR_CONFIG } from './_calendar_helper.js';
import { fetchAlliance, knownMissing, trackerConfigured } from './_tracker.js';
import { ASCENSION_FILE, napTags } from './_ascension.js';

/** Snapshots are taken between 12 and 2 minutes before reset: the 5-minute check lands twice. */
const WINDOW = { from: 12, to: 2 };
const GT_OFFSET_MS = -2 * 3600000;
/** How long the growth chart keeps points (about a year). */
const KEEP_DAYS = 400;

const blobToken = () =>
  process.env.ALLIANCE_CARD_IMAGES_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN || '';
const prefix = () => (isTestDeployment() ? 'test/stats' : 'stats');
const SUMMARY = () => `${prefix()}/summary.json`;
const dayFile = (day) => `${prefix()}/days/${day}.json`;

/** The GT date (YYYY-MM-DD) of a moment. */
export const gameDay = (ms) => new Date(ms + GT_OFFSET_MS).toISOString().slice(0, 10);

/** Is a snapshot due now? The GT day ending in the next few minutes, else null. */
export function statsSnapshotDue(now, calendarConfig = {}) {
  const state = getCycleState(new Date(now), { ...DEFAULT_CALENDAR_CONFIG, ...calendarConfig });
  const minutesLeft = (Date.parse(state.nextResetUtc) - now) / 60000;
  if (minutesLeft > WINDOW.from || minutesLeft < WINDOW.to) return null;
  return { day: gameDay(now), minutesLeft };
}

async function readJson(path) {
  try {
    const blob = await get(path, { access: 'private', token: blobToken() });
    if (!blob) return null;
    return JSON.parse(await new Response(blob.stream).text());
  } catch {
    return null;
  }
}

async function writeJson(path, data) {
  await put(path, JSON.stringify(data), {
    access: 'private',
    token: blobToken(),
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/** The growth summary, as the Stats tab reads it (null when nothing is saved yet). */
export async function readStatsSummary() {
  if (!blobToken()) return null;
  return readJson(SUMMARY());
}

/**
 * Adds the Top 4 race's measured days (ascension.json; same moment of the day) to an empty
 * summary: { days, alliances }. Changes `summary` in place.
 */
export function seedFromRace(summary, gist) {
  const runs = gistJson(gist, ASCENSION_FILE, { runs: {} }).runs || {};
  for (const run of Object.values(runs)) {
    for (const d of Object.values(run.days || {})) {
      if (!d?.at) continue;
      const day = gameDay(Date.parse(d.at));
      for (const [tag, power] of Object.entries(d.power || {})) {
        if (!Number.isFinite(power)) continue;
        if (!summary.days.includes(day)) summary.days.push(day);
        summary.alliances[tag] = { ...(summary.alliances[tag] || {}), [day]: power };
      }
    }
  }
}

/** One alliance as the day's file keeps it. */
function dayEntry(a) {
  return {
    power: a.power,
    members: a.memberCount,
    level: a.level,
    players: a.members.map((m) => [m.uid, m.name, m.power, m.kills ?? null, m.level, m.x, m.y]),
  };
}

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

/**
 * Takes the day's snapshot when one is due (called by the reminder check). Alliances already
 * measured today are kept; a failed lookup is tried again on the next check in the window.
 * Returns a short report for the check's answer.
 */
const blobStore = { read: readJson, write: writeJson };

export async function checkStatsSnapshot({
  gist,
  now = Date.now(),
  dryRun = false,
  store = blobStore,
  fetchImpl,
} = {}) {
  const due = statsSnapshotDue(now, gistJson(gist, 'calendar-state.json', {}));
  if (!due) return { due: false };
  if (!trackerConfigured()) return { due: true, error: 'LAT_API_KEY is not set' };
  if (store === blobStore && !blobToken()) {
    return { due: true, error: 'No Blob store on this deployment' };
  }

  const tags = napTags(gistJson(gist, 'map-state.json', { alliances: {} }).alliances || {});
  const today = (await store.read(dayFile(due.day))) || {
    day: due.day,
    at: null,
    alliances: {},
  };
  // Not asked again: alliances done today, and ones the tracker just said it doesn't have
  const todo = tags.filter((t) => !today.alliances[t] && !knownMissing(t));
  const report = { due: true, day: due.day, measured: [], failed: [] };
  if (!todo.length) return { ...report, note: 'already taken' };

  // A live game lookup (the tracker's own copy can be hours old). On Top 4 race days the
  // race has just asked for the same alliances: that answer is reused (freshWithinMs).
  const found = await inBatches(todo, 4, (tag) =>
    fetchAlliance(tag, {
      fresh: true,
      timeoutMs: 6000,
      freshWithinMs: 10 * 60000,
      ...(fetchImpl ? { fetchImpl } : {}),
    }),
  );
  todo.forEach((tag, i) => {
    if (found[i]) {
      today.alliances[tag] = dayEntry(found[i]);
      report.measured.push(tag);
    } else report.failed.push(tag);
  });
  if (dryRun) return { ...report, note: 'dry run: nothing saved' };
  if (!report.measured.length) return report;

  today.at = today.at || new Date(now).toISOString();
  await store.write(dayFile(due.day), today);

  const summary = (await store.read(SUMMARY())) || { days: [], alliances: {} };
  // The first time: earlier points from the Top 4 race's snapshots, so the chart has a start
  if (!summary.days.length) seedFromRace(summary, gist);
  if (!summary.days.includes(due.day)) summary.days.push(due.day);
  summary.days.sort();
  for (const [tag, a] of Object.entries(today.alliances)) {
    summary.alliances[tag] = { ...(summary.alliances[tag] || {}), [due.day]: a.power };
  }
  // Only about a year of points
  const keep = new Set(summary.days.slice(-KEEP_DAYS));
  summary.days = summary.days.filter((d) => keep.has(d));
  for (const series of Object.values(summary.alliances)) {
    for (const d of Object.keys(series)) if (!keep.has(d)) delete series[d];
  }
  summary.updatedAt = new Date(now).toISOString();
  await store.write(SUMMARY(), summary);
  report.saved = true;
  return report;
}
