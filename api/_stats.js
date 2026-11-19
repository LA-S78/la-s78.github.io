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
//   stats/player-series.json   each NAP player's numbers per day for 31 days (server only):
//     { days: [dates], p: { uid: { <date>: Might in millions } }, k: kills, l: Sanctuary
//       level, a: 1 when away from their alliance's hive that day }
//   stats/top.json             the Top players view, worked out at each snapshot (small):
//     { day, days, players: { uid: { name, tag, power, avatar, frame, series } },
//       lists: { all: { strongest: [uid…100], week: [[uid, gain]…50], month: […50] },
//                TAG: { strongest: […15], week: […15], month: […15] } } }
//     Each player is kept once; every alliance has its own lists, so the filter shows them.
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
const PLAYER_SERIES = () => `${prefix()}/player-series.json`;
const TOP = () => `${prefix()}/top.json`;
/** Days of each player's Might kept for the Top players view (its month and growth lines). */
const PLAYER_DAYS = 31;
const TOP_SIZES = { strongest: 100, week: 50, month: 50 };
/** Each alliance's own lists (the view's alliance filter). */
const TOP_PER_ALLIANCE = 15;
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

/** The Top players view, as the Stats tab reads it (null when nothing is saved yet). */
export async function readTopPlayers() {
  if (!blobToken()) return null;
  return readJson(TOP());
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
    // [uid, name, Might, kills, Sanctuary level, x, y, picture, frame]
    players: a.members.map((m) => [
      m.uid,
      m.name,
      m.power,
      m.kills ?? null,
      m.level,
      m.x,
      m.y,
      m.avatar || null,
      m.frame || null,
    ]),
  };
}

const millions = (n) => Math.round(n / 1e5) / 10;

/** A member more than this many tiles from their alliance's hive counts as away. Measured on
 *  the real rosters (2026-11-19): members sit within a few tiles of the middle or far off. */
const HIVE_TILES = 50;

function median(values) {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** The day `n` days before `day` (YYYY-MM-DD). */
const daysBefore = (day, n) =>
  new Date(Date.parse(`${day}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

/**
 * Adds the day's players to `series` (changed in place: last PLAYER_DAYS days only) and
 * works out the Top players lists. A gain counts only players seen on both days (the latest
 * day on or before 7 / 30 days ago, up to 3 days earlier); a player keeps their ID when they
 * move alliance, and shows their current name and alliance.
 */
export function topPlayers(series, today, day) {
  const players = [];
  for (const [tag, a] of Object.entries(today.alliances)) {
    // The alliance's hive: the middle of where its members are (half are on each side,
    // both ways); a member more than HIVE_TILES from it is away
    const xs = a.players.map((m) => m[5]).filter(Number.isFinite);
    const ys = a.players.map((m) => m[6]).filter(Number.isFinite);
    const hive = xs.length ? { x: median(xs), y: median(ys) } : null;
    for (const [uid, name, power, kills, level, x, y, avatar, frame] of a.players) {
      if (!uid || !Number.isFinite(power)) continue;
      const away =
        hive && Number.isFinite(x) && Number.isFinite(y)
          ? Math.max(Math.abs(x - hive.x), Math.abs(y - hive.y)) > HIVE_TILES
          : null;
      players.push({
        uid: String(uid),
        name,
        tag,
        power,
        kills: Number.isFinite(kills) ? kills : null,
        level: Number.isFinite(level) ? level : null,
        away,
        avatar: avatar || null,
        frame: frame || null,
      });
    }
  }
  if (!series.days.includes(day)) series.days.push(day);
  series.days.sort();
  series.days = series.days.slice(-PLAYER_DAYS);
  const keep = new Set(series.days);
  // Each player's Might (p, millions), kills (k), Sanctuary level (l) and away days (a)
  for (const key of ['p', 'k', 'l', 'a']) series[key] = series[key] || {};
  const record = (key, uid, value) => {
    if (value === null || value === undefined) return;
    series[key][uid] = { ...(series[key][uid] || {}), [day]: value };
  };
  for (const p of players) {
    record('p', p.uid, millions(p.power));
    record('k', p.uid, p.kills);
    record('l', p.uid, p.level);
    record('a', p.uid, p.away === null ? null : p.away ? 1 : 0);
  }
  for (const key of ['p', 'k', 'l', 'a']) {
    for (const [uid, s] of Object.entries(series[key])) {
      for (const d of Object.keys(s)) if (!keep.has(d)) delete s[d];
      if (!Object.keys(s).length) delete series[key][uid];
    }
  }

  // A value on the latest kept day on or before `target` (up to 3 days earlier)
  const valueAt = (key, uid, target) => {
    const s = series[key][uid] || {};
    const d = series.days
      .filter((x) => x <= target && x >= daysBefore(target, 3) && Number.isFinite(s[x]))
      .pop();
    return d ? s[d] : null;
  };
  const at = (uid, target) => {
    const v = valueAt('p', uid, target);
    return v === null ? null : v * 1e6;
  };
  const line = (uid) => series.days.map((d) => series.p[uid]?.[d] ?? null);
  const gains = (list, n) =>
    list
      .map((p) => {
        const then = at(p.uid, daysBefore(day, n));
        return then === null ? null : { ...p, change: Math.round(p.power - then) };
      })
      .filter(Boolean)
      .sort((a, b) => b.change - a.change);
  const used = new Map();
  const ids = (list, size, withGain) =>
    list.slice(0, size).map((p) => {
      used.set(p.uid, p);
      return withGain ? [p.uid, p.change] : p.uid;
    });
  const listsFor = (list, sizes) => ({
    strongest: ids(
      [...list].sort((a, b) => b.power - a.power),
      sizes.strongest,
      false,
    ),
    week: ids(gains(list, 7), sizes.week, true),
    month: ids(gains(list, 30), sizes.month, true),
  });
  const lists = { all: listsFor(players, TOP_SIZES) };
  const small = { strongest: TOP_PER_ALLIANCE, week: TOP_PER_ALLIANCE, month: TOP_PER_ALLIANCE };
  for (const tag of Object.keys(today.alliances)) {
    lists[tag] = listsFor(
      players.filter((p) => p.tag === tag),
      small,
    );
  }
  // Achievements (owner request, 2026-11-19): a podium of three per record, NAP-wide and per
  // alliance. No donations (owner: they stay off the public stats).
  const ACHIEVEMENTS = {
    strongest: (p) => p.power,
    gain_week: (p) => {
      const then = at(p.uid, daysBefore(day, 7));
      return then === null ? null : Math.round(p.power - then);
    },
    kills: (p) => p.kills,
    kills_week: (p) => {
      const then = valueAt('k', p.uid, daysBefore(day, 7));
      return then === null || p.kills === null ? null : p.kills - then;
    },
    climb_month: (p) => {
      const then = valueAt('l', p.uid, daysBefore(day, 30));
      return then === null || p.level === null ? null : p.level - then;
    },
    away: (p) => {
      const s = series.a[p.uid] || {};
      const n = Object.values(s).reduce((sum, v) => sum + v, 0);
      return n || null;
    },
  };
  const podium = (list) => {
    const out = {};
    for (const [key, value] of Object.entries(ACHIEVEMENTS)) {
      out[key] = list
        .map((p) => ({ p, v: value(p) }))
        .filter(({ v }) => Number.isFinite(v) && v > 0)
        .sort((a, b) => b.v - a.v || b.p.power - a.p.power)
        .slice(0, 3)
        .map(({ p, v }) => {
          used.set(p.uid, p);
          return [p.uid, v];
        });
    }
    return out;
  };
  const achievements = { all: podium(players) };
  for (const tag of Object.keys(today.alliances)) {
    achievements[tag] = podium(players.filter((p) => p.tag === tag));
  }

  const out = {};
  for (const [uid, p] of used) {
    out[uid] = {
      name: p.name,
      tag: p.tag,
      power: p.power,
      avatar: p.avatar,
      frame: p.frame,
      series: line(uid),
    };
  }
  return { day, days: series.days, players: out, lists, achievements };
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

  // Each player's Might over the last month, and the Top players lists from it
  const series = (await store.read(PLAYER_SERIES())) || { days: [], p: {} };
  const top = topPlayers(series, today, due.day);
  await store.write(PLAYER_SERIES(), series);
  await store.write(TOP(), top);
  report.saved = true;
  return report;
}
