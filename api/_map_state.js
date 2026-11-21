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
