// api/_alliance_ids.js
// Alliances renamed in the game (owner request, 2026-11-20: HMDA became "Arch" and its Top 4
// race and Stats measurements went missing until someone noticed).
//
// The game numbers every alliance (the tracker's union_id, `aid` in api/_tracker.js), and the
// number stays when the tag changes. So every time a NAP alliance is measured by its tag, its
// number is remembered; when a tag the site knows stops being found, the alliance is looked up
// by its number instead (one extra request, only then), measured as usual under the site's
// tag, and the Stewards are told (the Steward tools page) to rename it in the Alliance planner.
// The site never renames an alliance itself: territories, plans and Discord roles hang on the
// tag, and two alliances swapping tags would be renamed wrongly.
//
// One Blob file, stats/alliance-ids.json:
//   { ids: { TAG: { aid, name, at } }, renamed: { TAG: { now, name, at } } }

import { blobStore, statsPath, statsStoreReady } from './_stats.js';
import { fetchAlliance, fetchAllianceById, knownMissing } from './_tracker.js';

const FILE = () => statsPath('alliance-ids.json');

export async function readAllianceIds(store = blobStore) {
  if (store === blobStore && !statsStoreReady()) return { ids: {}, renamed: {} };
  const file = (await store.read(FILE())) || {};
  return { ids: file.ids || {}, renamed: file.renamed || {} };
}

/**
 * Measures alliances by tag, falling back to their remembered game number for a tag that
 * isn't found. Returns the answers in the same order as `tags` (null: not measured); an
 * answer found by number carries the site's tag, with the game's current one as `gameTag`.
 * Saves what it learned (numbers, renames) once at the end.
 */
export async function measureAlliances(
  tags,
  options = {},
  { store = blobStore, batch = 4, fetchImpl } = {},
) {
  const file = await readAllianceIds(store).catch(() => ({ ids: {}, renamed: {} }));
  let changed = false;
  const extra = fetchImpl ? { fetchImpl } : {};
  const one = async (tag) => {
    const known = file.ids[tag];
    // Just not found and no number to try: not asked again within the hour
    if (knownMissing(tag) && !known?.aid) return null;
    // A tag that was just not found is asked by number straight away (no second tag ask)
    let found =
      knownMissing(tag) && known ? null : await fetchAlliance(tag, { ...options, ...extra });
    if (found) {
      if (found.aid && (!known || known.aid !== found.aid || known.name !== found.name)) {
        file.ids[tag] = { aid: found.aid, name: found.name, at: new Date().toISOString() };
        changed = true;
      }
      if (file.renamed[tag]) {
        delete file.renamed[tag];
        changed = true;
      }
      return found;
    }
    if (!known?.aid || !knownMissing(tag)) return null;
    const byId = await fetchAllianceById(known.aid, {
      fresh: options.fresh,
      timeoutMs: options.timeoutMs,
      use: options.use,
      ...extra,
    });
    if (!byId) return null;
    if (file.renamed[tag]?.now !== byId.tag) {
      file.renamed[tag] = { now: byId.tag, name: byId.name, at: new Date().toISOString() };
      changed = true;
    }
    return { ...byId, tag, gameTag: byId.tag };
  };
  const out = [];
  for (let i = 0; i < tags.length; i += batch) {
    out.push(...(await Promise.all(tags.slice(i, i + batch).map((t) => one(t).catch(() => null)))));
  }
  if (changed && !(store === blobStore && !statsStoreReady())) {
    try {
      await store.write(FILE(), { ids: file.ids, renamed: file.renamed });
    } catch (err) {
      console.warn('Alliance numbers not saved:', err.message);
    }
  }
  return out;
}

/** NAP alliances renamed in the game, for the Steward tools page: [{ tag, now, name, at }]. */
export async function renamedAlliances(tags, store = blobStore) {
  const { renamed } = await readAllianceIds(store).catch(() => ({ renamed: {} }));
  return tags
    .filter((t) => renamed[t])
    .map((t) => ({ tag: t, now: renamed[t].now, name: renamed[t].name, at: renamed[t].at }));
}
