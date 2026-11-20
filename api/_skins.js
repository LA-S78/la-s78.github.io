// api/_skins.js
// Sanctuary skins for the territory map's game view (owner request, 2026-11-20).
//
// The tracker gives a player's skin only through one player lookup each (alliance rosters
// don't have it), so skins are collected a few at a time and remembered:
//   - every night before the tracker's day ends (00:00 UTC), with half of the day's spare
//     requests (always keeping 100 spare; at least 50 a night): checkSkins, from the 5-minute
//     check in api/calendar.js. Straight through the list: players never checked first,
//     then the longest since their last check, so everyone is checked in turn.
//   - every Steward player lookup (it has the skin anyway): noteSkin.
// One Blob file, stats/skins.json: { players: { uid: [skin, checkedAt, level, x, y] },
// night: { day, budget, used } }. skin is our /game-art/hq/skin_N.png copy, or null for the
// usual building.

import { blobStore, statsPath, statsStoreReady, readSkinMap, readPositionsFile } from './_stats.js';
import { fetchPlayer, fetchQuota, trackerConfigured } from './_tracker.js';

const FILE = () => statsPath('skins.json');
/** The nightly window, in UTC: the tracker's day ends at 00:00 UTC. */
const WINDOW = { fromHour: 22, toMinute: 23 * 60 + 55 };
export const KEEP_SPARE = 100;
export const MIN_PER_NIGHT = 50;
/** Lookups in one 5-minute check (the check must stay quick). */
const PER_RUN = 40;
const BATCH = 8;

const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** The night's allowance from the day's remaining requests. */
export function nightBudget(remaining) {
  const spare = Math.max(0, Number(remaining) - KEEP_SPARE);
  return Math.min(spare, Math.max(MIN_PER_NIGHT, Math.floor(spare / 2)));
}

/** Is it skin time (22:00–23:55 UTC)? */
export function skinsDue(now = Date.now()) {
  const d = new Date(now);
  const minute = d.getUTCHours() * 60 + d.getUTCMinutes();
  return minute >= WINDOW.fromHour * 60 && minute < WINDOW.toMinute;
}

/**
 * Whom to check, in order. `players`: the positions file's members ({ uid, level, x, y });
 * `known`: the skins file's players.
 */
export function skinQueue(players, known) {
  // Straight through the list (owner, 2026-11-20): never checked first, then the longest
  // since their last check. Level and position changes aren't used to jump the queue.
  const checkedAt = (p) => (known[p.uid] ? Date.parse(known[p.uid][1]) || 0 : -1);
  return players
    .map((p) => ({ p, at: checkedAt(p) }))
    .sort((a, b) => a.at - b.at)
    .map((e) => e.p);
}

/** NAP players from the positions file, each once: [{ uid, level, x, y }]. */
function napPlayers(positions) {
  const seen = new Set();
  const out = [];
  for (const a of Object.values(positions?.alliances || {})) {
    for (const [uid, , , x, y, , , , level] of a.members || []) {
      const id = String(uid);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ uid: id, x, y, level: level ?? null });
    }
  }
  return out;
}

const entry = (player) => [
  player.skin || null,
  new Date().toISOString(),
  player.level ?? null,
  player.x ?? null,
  player.y ?? null,
];

/** A Steward's lookup found a player: their skin is kept too (no extra request). */
export async function noteSkin(player, { store = blobStore } = {}) {
  if (!player?.uid || (store === blobStore && !statsStoreReady())) return;
  const file = (await store.read(FILE())) || { players: {} };
  file.players = file.players || {};
  file.players[String(player.uid)] = entry(player);
  await store.write(FILE(), file);
}

/**
 * The nightly collection: one batch per 5-minute check inside the window, until the night's
 * allowance is used. Returns a short report for the check's answer.
 */
export async function checkSkins({
  now = Date.now(),
  dryRun = false,
  store = blobStore,
  fetchImpl,
  quota = null,
} = {}) {
  if (!skinsDue(now)) return { due: false };
  if (!trackerConfigured()) return { due: true, error: 'LAT_API_KEY is not set' };
  if (store === blobStore && !statsStoreReady()) {
    return { due: true, error: 'No Blob store on this deployment' };
  }
  const file = (await store.read(FILE())) || { players: {} };
  file.players = file.players || {};
  const day = utcDay(now);
  // The night's allowance, worked out once from the day's remaining requests
  if (file.night?.day !== day) {
    const q =
      quota || (await fetchQuota({ use: 'automation', ...(fetchImpl ? { fetchImpl } : {}) }));
    if (!q || !Number.isFinite(Number(q.remaining))) {
      return { due: true, error: 'Quota unknown: trying again on the next check' };
    }
    file.night = { day, budget: nightBudget(q.remaining), used: 0, remaining: q.remaining };
  }
  const left = Math.max(0, file.night.budget - file.night.used);
  const report = { due: true, budget: file.night.budget, usedBefore: file.night.used };
  if (!left) return { ...report, note: 'tonight’s allowance used' };

  const players = napPlayers(await readPositionsFile(store));
  const queue = skinQueue(players, file.players).slice(0, Math.min(left, PER_RUN));
  if (dryRun) return { ...report, wouldCheck: queue.length, note: 'dry run: nothing asked' };

  let checked = 0;
  let skins = 0;
  let failed = 0;
  for (let i = 0; i < queue.length; i += BATCH) {
    const answers = await Promise.all(
      queue.slice(i, i + BATCH).map((p) =>
        fetchPlayer(p.uid, {
          use: 'automation',
          // The tracker's copy is fine for a skin (live lookups are slower)
          fresh: false,
          ...(fetchImpl ? { fetchImpl } : {}),
        }).catch(() => ({ error: 'unavailable' })),
      ),
    );
    answers.forEach((a, j) => {
      file.night.used += 1; // a request either way
      const p = queue[i + j];
      if (a.player) {
        file.players[p.uid] = entry({
          ...a.player,
          // Level and position as the roster has them, which is what the next night compares
          level: p.level ?? a.player.level,
          x: p.x ?? a.player.x,
          y: p.y ?? a.player.y,
        });
        checked += 1;
        if (a.player.skin) skins += 1;
      } else if (a.error === 'not_found') {
        // Gone from the game: checked, with no skin, so they wait their turn again
        file.players[p.uid] = entry({ ...p, skin: null });
        failed += 1;
      } else failed += 1;
    });
  }
  // Players no longer in the NAP aren't kept for ever: only the ones in the positions file
  const current = new Set(players.map((p) => p.uid));
  if (current.size > 50) {
    for (const uid of Object.keys(file.players)) if (!current.has(uid)) delete file.players[uid];
  }
  await store.write(FILE(), file);
  return { ...report, checked, withSkin: skins, failed, usedAfter: file.night.used };
}

export { readSkinMap };
