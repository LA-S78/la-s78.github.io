// api/_map_state.js
// The alliance list and territories by alliance ID (docs/ALLIANCE-IDS-PLAN.md, step 2,
// 2026-11-21).
//
// map-state.json is stored in one of two forms:
//   - by tag (as always): alliances: { TAG: {...} }, parent_tag / academies / territory owners
//     are tags;
//   - by ID (`version: 2`, after a Steward runs the move): alliances: { al_…: { tag, ... } },
//     `parent` and `academies` are IDs, territory owners are IDs. The record's `tag` is only the
//     label it had when saved (a safety net); the register (alliance-register.json) says what
//     the alliance is called now.
//
// The rest of the site keeps working with tags: gistJson() turns the stored file into the
// tag-keyed view (each alliance also carries its `id`), and updateGist() turns a tag-keyed
// file back into the form that is stored, in the same save, so no code can write the wrong
// form. A save made by ID adds any new alliance to the register in that same save (the
// "never by tag alone" rules of step 1 apply: a removed alliance is marked off the map; a new
// tag while one is off the map waits for a Steward's answer).
//
// A reference that isn't an alliance on the list (a territory "Unclaimed", a typo, an alliance
// removed later) is kept as the text it was, both ways.

import { ID_PATTERN, followMerged, onMap, syncRegister, GAME, SERVER } from './_register.js';

export const MAP_FILE = 'map-state.json';
export const isById = (stored) => Boolean(stored && stored.version === 2);

/** The tag-keyed view of the stored file (unchanged when it's stored by tag). */
export function mapView(stored, register) {
  if (!isById(stored)) return stored;
  const tagOf = (id) => {
    if (!ID_PATTERN.test(String(id || ''))) return null;
    return (
      followMerged(register, register.alliances[id])?.tag || stored.alliances?.[id]?.tag || null
    );
  };
  const ref = (v) => (typeof v === 'string' ? tagOf(v) || v : v);
  const alliances = {};
  for (const [id, rec] of Object.entries(stored.alliances || {})) {
    if (!rec || typeof rec !== 'object') continue;
    const tag = tagOf(id) || id;
    const { parent, academies, ...rest } = rec;
    const out = { ...rest, tag };
    if ('parent' in rec) out.parent_tag = parent ? ref(parent) : null;
    if ('academies' in rec)
      out.academies = Array.isArray(academies) ? academies.map(ref) : academies;
    out.id = followMerged(register, register.alliances[id])?.id || id;
    alliances[tag] = out;
  }
  const { version: _v, ...state } = stored;
  return {
    ...state,
    alliances,
    territory_ownership: mapOwners(stored.territory_ownership, ref),
  };
}

function mapOwners(ownership, ref) {
  if (!ownership || typeof ownership !== 'object') return ownership;
  return Object.fromEntries(
    Object.entries(ownership).map(([city, o]) => [
      city,
      o && typeof o === 'object' && typeof o.owner === 'string' ? { ...o, owner: ref(o.owner) } : o,
    ]),
  );
}

/**
 * The tag-keyed view turned into the stored-by-ID form. Returns { stored, register, added,
 * parked } (`register` is the updated register when it changed, else null).
 */
export function byIdForm(view, register, now = new Date()) {
  const list = view?.alliances || {};
  const synced = syncRegister(register, list, {}, now);
  const reg = synced.register;
  const here = (a) => a.game === GAME && String(a.server) === SERVER;
  const idOfTag = (tag) =>
    Object.values(reg.alliances).find((a) => onMap(a) && here(a) && a.tag === tag)?.id || null;
  // Only alliances on this list become IDs; anything else stays as written
  const ref = (v) => (typeof v === 'string' && list[v] ? idOfTag(v) || v : v);
  const alliances = {};
  for (const [tag, rec] of Object.entries(list)) {
    if (!tag.trim() || !rec || typeof rec !== 'object') continue;
    const id = idOfTag(tag);
    if (!id) throw new Error(`No register entry for ${tag}.`);
    const { id: _id, parent_tag, academies, ...rest } = rec;
    const out = { ...rest, tag };
    if ('parent_tag' in rec) out.parent = parent_tag ? ref(parent_tag) : null;
    if ('academies' in rec)
      out.academies = Array.isArray(academies) ? academies.map(ref) : academies;
    alliances[id] = out;
  }
  const { version: _v, ...state } = view;
  const stored = {
    version: 2,
    ...state,
    alliances,
    territory_ownership: mapOwners(view.territory_ownership, ref),
  };
  const changed = synced.added || synced.parked || synced.linked;
  return { stored, register: changed ? reg : null, added: synced.added, parked: synced.parked };
}

/** Back to the by-tag form (the move's undo): the view without the IDs. */
export function byTagForm(stored, register) {
  const view = mapView(stored, register);
  const alliances = Object.fromEntries(
    Object.entries(view.alliances || {}).map(([tag, { id: _id, ...rec }]) => [tag, rec]),
  );
  return { ...view, alliances };
}

/** Counts for a move's report: alliances, links between them, territories with an owner. */
export function countRefs(view) {
  const list = view?.alliances || {};
  let links = 0;
  let loose = 0;
  for (const a of Object.values(list)) {
    for (const t of [a.parent_tag, ...(Array.isArray(a.academies) ? a.academies : [])]) {
      if (!t) continue;
      if (list[t]) links += 1;
      else loose += 1;
    }
  }
  let owned = 0;
  let other = 0;
  for (const o of Object.values(view?.territory_ownership || {})) {
    if (!o?.owner) continue;
    if (list[o.owner]) owned += 1;
    else other += 1;
  }
  return { alliances: Object.keys(list).length, links, loose, owned, other };
}

/** Keys in a fixed order, so two forms can be compared. */
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
const sameData = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/** A by-tag file as the move compares it: each alliance's record carries its tag. */
const withTags = (state) => ({
  ...state,
  alliances: Object.fromEntries(
    Object.entries(state.alliances || {}).map(([t, a]) => [t, { ...a, tag: t }]),
  ),
});

const backupName = (now, what) =>
  `backup-map-state-${now.toISOString().slice(0, 16).replace(':', '-')}${what ? `-${what}` : ''}.json`;

/**
 * The move (a Steward's button): map-state.json from tags to IDs, in one save with a backup
 * of the file as it was (`backup-map-state-<time>.json`) and the register brought in step.
 * Checked before saving: turned back into tags, it must be the file it was (each alliance's
 * record also gets its tag). Running it again changes nothing. Returns a report:
 * { moved: true, counts, backup } | { already: true } | throws.
 */
export async function moveMapToIds({ now = new Date(), update } = {}) {
  const { updateGist } = await import('./_gist.js');
  const { readRegister, REGISTER_FILE } = await import('./_register.js');
  let report = null;
  await (update || updateGist)((gist) => {
    const stored = JSON.parse(gist.files?.[MAP_FILE]?.content || 'null');
    if (!stored) throw new Error('map-state.json is missing.');
    if (isById(stored)) {
      report = { already: true };
      return {};
    }
    const converted = byIdForm(stored, readRegister(gist), now);
    const register = converted.register || readRegister(gist);
    if (!sameData(byTagForm(converted.stored, register), withTags(stored))) {
      throw new Error('The moved file does not match the original: nothing was saved.');
    }
    const backup = backupName(now);
    report = { moved: true, counts: countRefs(stored), backup, added: converted.added };
    return {
      raw: true,
      files: {
        [MAP_FILE]: converted.stored,
        [backup]: stored,
        ...(converted.register ? { [REGISTER_FILE]: converted.register } : {}),
      },
      description: `Alliance IDs step 2: the alliance list and territories moved to IDs (backup: ${backup})`,
    };
  });
  return report;
}

/**
 * The undo: map-state.json back to tags, keeping every change made since the move (it's
 * turned back, not restored from the backup), with a backup of the by-ID file. Returns
 * { undone: true, backup } | { already: true }.
 */
export async function moveMapToTags({ now = new Date(), update } = {}) {
  const { updateGist } = await import('./_gist.js');
  const { readRegister } = await import('./_register.js');
  let report = null;
  await (update || updateGist)((gist) => {
    const stored = JSON.parse(gist.files?.[MAP_FILE]?.content || 'null');
    if (!isById(stored)) {
      report = { already: true };
      return {};
    }
    const backup = backupName(now, 'by-id');
    report = { undone: true, backup, counts: countRefs(mapView(stored, readRegister(gist))) };
    return {
      raw: true,
      files: { [MAP_FILE]: byTagForm(stored, readRegister(gist)), [backup]: stored },
      description: `Alliance IDs step 2 undone: the alliance list and territories back to tags (backup: ${backup})`,
    };
  });
  return report;
}

/** Which form the stored file has, for the Steward page: 'id' or 'tag'. */
export const mapForm = (gist) =>
  isById(JSON.parse(gist?.files?.[MAP_FILE]?.content || 'null')) ? 'id' : 'tag';
