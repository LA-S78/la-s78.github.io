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
import { fetchAlliance, fetchAllianceById, knownMissing, forgetMissing } from './_tracker.js';

const FILE = () => statsPath('alliance-ids.json');

export async function readAllianceIds(store = blobStore) {
  if (store === blobStore && !statsStoreReady()) return { ids: {}, renamed: {}, mismatch: {} };
  const file = (await store.read(FILE())) || {};
  return { ids: file.ids || {}, renamed: file.renamed || {}, mismatch: file.mismatch || {} };
}

const save = (store, file) =>
  store.write(FILE(), { ids: file.ids, renamed: file.renamed, mismatch: file.mismatch || {} });

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
  const file = await readAllianceIds(store).catch(() => ({ ids: {}, renamed: {}, mismatch: {} }));
  let changed = false;
  /** The alliance the site knows as `tag`, by its number (it may have another tag now). */
  const byNumber = async (tag, aid) => {
    const byId = await fetchAllianceById(aid, {
      fresh: options.fresh,
      timeoutMs: options.timeoutMs,
      use: options.use,
      ...extra,
    });
    if (!byId) return null;
    if (byId.tag === tag) return byId;
    if (file.renamed[tag]?.now !== byId.tag) {
      file.renamed[tag] = { now: byId.tag, name: byId.name, at: new Date().toISOString() };
      changed = true;
    }
    return { ...byId, tag, gameTag: byId.tag };
  };
  const extra = fetchImpl ? { fetchImpl } : {};
  const one = async (tag) => {
    const known = file.ids[tag];
    // Just not found and no number to try: not asked again within the hour
    if (knownMissing(tag) && !known?.aid) return null;
    // A tag that was just not found is asked by number straight away (no second tag ask)
    let found =
      knownMissing(tag) && known ? null : await fetchAlliance(tag, { ...options, ...extra });
    // Safeguard 4 (plan step 0c): the tag now answers with a different alliance than the one
    // the site knows by it (a swap, a disbanded alliance's tag taken, another alliance using
    // it). Never measured or linked as ours: the known alliance is measured by its number, and
    // the Stewards are told; only a Steward relinks.
    if (found && known?.aid && found.aid && found.aid !== known.aid) {
      if (file.mismatch[tag]?.got !== found.aid) {
        file.mismatch[tag] = { got: found.aid, name: found.name, at: new Date().toISOString() };
        changed = true;
      }
      return byNumber(tag, known.aid);
    }
    if (found) {
      if (file.mismatch[tag]) {
        delete file.mismatch[tag];
        changed = true;
      }
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
    return byNumber(tag, known.aid);
  };
  const out = [];
  for (let i = 0; i < tags.length; i += batch) {
    out.push(...(await Promise.all(tags.slice(i, i + batch).map((t) => one(t).catch(() => null)))));
  }
  if (changed && !(store === blobStore && !statsStoreReady())) {
    try {
      await save(store, file);
    } catch (err) {
      console.warn('Alliance numbers not saved:', err.message);
    }
  }
  return out;
}

/**
 * A Steward links a NAP alliance the game no longer knows by its site tag to the tag it has
 * now (owner request, 2026-11-20: HMDA was renamed before the site ever measured it, so there
 * was no number to follow). `found`: that tag's alliance, just looked up. Saves its number
 * against the site's tag, and the rename, so measurements follow it from then on.
 */
export async function linkAlliance(siteTag, found, store = blobStore) {
  const file = await readAllianceIds(store);
  const at = new Date().toISOString();
  file.ids[siteTag] = { aid: found.aid, name: found.name, at, linked: true };
  file.renamed[siteTag] = { now: found.tag, name: found.name, at };
  delete file.mismatch[siteTag];
  await save(store, file);
  // Asked again straight away, not after the hour the "not found" answer is kept
  forgetMissing(siteTag);
  forgetMissing(found.tag);
}

/**
 * A Steward's answer to a mismatch (safeguard 4): the alliance the tag answers with now is the
 * one the site means after all (a wrong first link, or the tracker renumbering). Links the tag
 * to that number. Returns false if there's no mismatch to settle.
 */
export async function relinkAlliance(siteTag, store = blobStore) {
  const file = await readAllianceIds(store);
  const m = file.mismatch[siteTag];
  if (!m?.got) return false;
  file.ids[siteTag] = { aid: m.got, name: m.name, at: new Date().toISOString(), relinked: true };
  delete file.mismatch[siteTag];
  delete file.renamed[siteTag];
  await save(store, file);
  forgetMissing(siteTag);
  return true;
}

/** Tags whose game alliance changed under them (safeguard 4), for the Steward tools page. */
export async function mismatchedAlliances(tags, store = blobStore) {
  const { ids, mismatch } = await readAllianceIds(store).catch(() => ({ ids: {}, mismatch: {} }));
  return tags
    .filter((t) => mismatch[t])
    .map((t) => ({
      tag: t,
      got: mismatch[t].got,
      name: mismatch[t].name,
      known: ids[t]?.name || '',
      at: mismatch[t].at,
    }));
}

/** NAP alliances renamed in the game, for the Steward tools page: [{ tag, now, name, at }]. */
export async function renamedAlliances(tags, store = blobStore) {
  const { renamed } = await readAllianceIds(store).catch(() => ({ renamed: {} }));
  return tags
    .filter((t) => renamed[t])
    .map((t) => ({ tag: t, now: renamed[t].now, name: renamed[t].name, at: renamed[t].at }));
}
