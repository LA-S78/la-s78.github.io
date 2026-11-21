// api/_rename.js
// The rename tool (docs/ALLIANCE-IDS-PLAN.md, step 7, 2026-11-22). Everything the site keeps
// about an alliance is stored by its ID (steps 2–6), so renaming is a change to the register:
// the alliance's tag (and its tag history). Every page reads the new tag from there.
//
// Owner decisions (2026-11-22, the maintainer's recommendations):
//   - only Stewards rename, swap and retire (on the Steward tools page);
//   - "[Arch], formerly [HMDA]" is shown publicly for 30 days after a rename (formerlyTags),
//     then only on Steward pages;
//   - retired alliances are kept (with their history) in a collapsed section on the Steward
//     page, hidden from every public list, and can be brought back.
//
// Safeguards: a tag can belong to one alliance on the map at a time (letter case counts,
// accents don't: RâvN and RÂVN stay two); two alliances trade tags only with the swap, in one
// save; the tool refuses while any store is still kept by tag (the Steward page's moves).

import { readRegister, REGISTER_FILE, onMap, GAME, SERVER } from './_register.js';
import { sameTag } from './_alliances.js';

export const FORMERLY_DAYS = 30;
const TAG_OK = /^[^\s:[\]@/\\]{1,12}$/u;

const here = (a) => a.game === GAME && String(a.server) === SERVER;
/** WLO's tag is written into the code (the Capitol defender, its Discord server): not renamed. */
const FIXED = ['WLO'];
const fixed = (tag) => FIXED.some((f) => sameTag(f, tag));
const clean = (t) =>
  String(t || '')
    .trim()
    .replace(/^\[(.*)\]$/, '$1');

/** The register with one alliance's tag changed, its history closed and opened. */
function withTag(register, id, tag, at) {
  const a = register.alliances[id];
  const tags = (a.tags || []).map((h) => (h.to ? h : { ...h, to: at }));
  tags.push({ tag, from: at, to: null });
  return { ...register, alliances: { ...register.alliances, [id]: { ...a, tag, tags } } };
}

/**
 * Renames an alliance on the map. Returns { register } or { error: key, vars }.
 * Refused: an unknown or retired alliance, an empty or odd tag, the same tag, or a tag
 * another alliance on the map has (by sameTag: RAVN is RÂVN; RâvN is not).
 */
export function renameInRegister(register, id, newTag, now = new Date()) {
  const a = register.alliances[id];
  const tag = clean(newTag);
  if (!a || !onMap(a)) return { error: 'rename_unknown' };
  if (!TAG_OK.test(tag)) return { error: 'rename_bad_tag' };
  if (tag === a.tag) return { error: 'rename_same' };
  if (fixed(a.tag) || fixed(tag)) return { error: 'rename_fixed', vars: { tag: FIXED[0] } };
  const clash = Object.values(register.alliances).find(
    (o) => o.id !== id && onMap(o) && here(o) && sameTag(o.tag, tag),
  );
  if (clash) return { error: 'rename_taken', vars: { tag: clash.tag } };
  return { register: withTag(register, id, tag, now.toISOString()) };
}

/** Two alliances on the map trade tags, in one go. */
export function swapInRegister(register, idA, idB, now = new Date()) {
  const a = register.alliances[idA];
  const b = register.alliances[idB];
  if (!a || !b || idA === idB || !onMap(a) || !onMap(b)) return { error: 'rename_unknown' };
  if (fixed(a.tag) || fixed(b.tag)) return { error: 'rename_fixed', vars: { tag: FIXED[0] } };
  const at = now.toISOString();
  return { register: withTag(withTag(register, idA, b.tag, at), idB, a.tag, at) };
}

/** Retires an alliance that is off the map (removed in the planner), or brings it back. */
export function retireInRegister(register, id, retire = true, now = new Date()) {
  const a = register.alliances[id];
  if (!a) return { error: 'rename_unknown' };
  if (retire) {
    if (a.status !== 'active' || !a.off_map) return { error: 'retire_on_map' };
    return {
      register: {
        ...register,
        alliances: {
          ...register.alliances,
          [id]: { ...a, status: 'retired', retired: now.toISOString() },
        },
      },
    };
  }
  if (a.status !== 'retired') return { error: 'rename_unknown' };
  const { retired: _r, ...rest } = a;
  return {
    register: {
      ...register,
      alliances: { ...register.alliances, [id]: { ...rest, status: 'active' } },
    },
  };
}

/** { currentTag: formerTag } for alliances renamed in the last FORMERLY_DAYS days (public). */
export function formerlyTags(register, now = Date.now()) {
  const since = new Date(now - FORMERLY_DAYS * 86400000).toISOString();
  const out = {};
  for (const a of Object.values(register.alliances)) {
    if (!onMap(a)) continue;
    const closed = (a.tags || []).filter((h) => h.to && h.to >= since && h.tag !== a.tag);
    if (closed.length) out[a.tag] = closed[closed.length - 1].tag;
  }
  return out;
}

/** The Steward page's list: every alliance with its history (retired ones too). */
export function allianceRoster(register) {
  return Object.values(register.alliances)
    .filter((a) => here(a) && a.status !== 'merged')
    .map((a) => ({
      id: a.id,
      tag: a.tag,
      name: a.name || '',
      color: a.color || null,
      status: a.status,
      onMap: onMap(a),
      retired: a.retired || null,
      tags: (a.tags || []).map((h) => ({ tag: h.tag, from: h.from, to: h.to })),
    }))
    .sort((x, y) => x.tag.localeCompare(y.tag));
}

/**
 * Saves a register change (rename, swap, retire), refusing unless every store is kept by ID.
 * `change(register)` returns { register } or { error, vars }. In the alliance list (by ID),
 * each record's `tag` label is brought up to date in the same save. Returns { ok } or
 * { error, vars }.
 */
export async function saveRegisterChange(change, description) {
  const { updateGist } = await import('./_gist.js');
  const idStores = await import('./_id_stores.js');
  const { storeForms } = idStores;
  const { forgetMissing } = await import('./_tracker.js');
  let result = null;
  await updateGist((gist) => {
    const forms = storeForms(gist);
    const byTag = Object.entries(forms)
      .filter(([, f]) => f !== 'id')
      .map(([k]) => k);
    if (byTag.length) {
      result = { error: 'rename_not_moved', vars: { stores: byTag.join(', ') } };
      return {};
    }
    const before = readRegister(gist);
    // A store that moves on its own (the race) is moved first, by the tags as they were, so a
    // rename never lands on the old form and splits an alliance (Gemini's review, 2026-11-22)
    const { STORES } = idStores;
    const early = {};
    for (const s of Object.values(STORES)) {
      if (!s.autoMove) continue;
      const raw = JSON.parse(gist.files?.[s.file]?.content || 'null');
      if (raw && !s.isById(raw)) early[s.file] = s.byId(raw, before).stored;
    }
    const out = change(before);
    if (out.error) {
      result = out;
      return {};
    }
    const map = JSON.parse(gist.files?.['map-state.json']?.content || 'null');
    const files = { ...early, [REGISTER_FILE]: out.register };
    if (map?.version === 2) {
      const alliances = { ...map.alliances };
      for (const [id, rec] of Object.entries(alliances)) {
        const tag = out.register.alliances[id]?.tag;
        if (tag && rec?.tag !== tag) alliances[id] = { ...rec, tag };
      }
      files['map-state.json'] = { ...map, alliances, lastUpdated: new Date().toISOString() };
    }
    const changed = Object.values(out.register.alliances).filter(
      (a) => before.alliances[a.id]?.tag !== a.tag,
    );
    result = {
      ok: true,
      changed: changed.map((a) => ({ id: a.id, from: before.alliances[a.id].tag, to: a.tag })),
    };
    return { raw: true, files, description };
  });
  // The tracker's "not found" memory for the old and new tags, so measuring starts at once
  for (const c of result?.changed || []) {
    forgetMissing(c.from);
    forgetMissing(c.to);
  }
  return result;
}

/**
 * The tag an alliance on the map has now, for a tag written before a rename (a planner draft
 * or map change made earlier): the tag itself if an alliance on the map has it; else the one
 * alliance on the map that ever had it; else the tag as written.
 */
export function currentTagFor(register, tag) {
  if (typeof tag !== 'string' || !tag) return tag;
  const live = Object.values(register.alliances).filter((a) => onMap(a) && here(a));
  if (live.some((a) => a.tag === tag)) return tag;
  const had = live.filter((a) => (a.tags || []).some((h) => h.tag === tag));
  return had.length === 1 ? had[0].tag : tag;
}

/** The current tag for an alliance ID (followed through a Steward's merge), or null. */
export function currentTagOfId(register, id) {
  let a = register.alliances[String(id || '')];
  for (let i = 0; a && a.status === 'merged' && i < 5; i++) a = register.alliances[a.merged_into];
  return a && onMap(a) ? a.tag : null;
}
