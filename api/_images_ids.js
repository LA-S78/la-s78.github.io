// api/_images_ids.js
// The alliance pictures' index by alliance ID (docs/ALLIANCE-IDS-PLAN.md, step 5, 2026-11-22).
//
// alliance-images.json keys everything by the alliance's slug (tagSlug: RÂVN → RAVN, RâvN →
// RavN): `live`, `useFrame` and `missing` by slug, and `slug` in each pending, decided and sent
// entry. Stored by ID (`version: 2`), those are the alliance's ID. The picture files themselves
// keep their names (`RAVN-card-….webp`): no file is renamed, so no address or cache breaks.
// As for the other stores (api/_id_stores.js), readers get the slug form and saves keep the
// stored form; a slug that isn't an alliance on the map stays as written.

import { ID_PATTERN, followMerged, onMap, GAME, SERVER } from './_register.js';
import { tagSlug } from './_alliances.js';

export const IMAGES_FILE = 'alliance-images.json';
export const isById = (stored) => Boolean(stored && stored.version === 2);

/** slug → ID and ID → slug, for the alliances on the map (slugs as the site makes them). */
function slugMaps(register) {
  const here = (a) => a.game === GAME && String(a.server) === SERVER;
  const active = Object.values(register.alliances).filter((a) => onMap(a) && here(a));
  const tags = active.map((a) => a.tag);
  const bySlug = new Map(active.map((a) => [tagSlug(a.tag, tags), a.id]));
  const toId = (v) => (typeof v === 'string' && bySlug.has(v) ? bySlug.get(v) : v);
  const toSlug = (v) => {
    if (typeof v !== 'string' || !ID_PATTERN.test(v)) return v;
    const e = followMerged(register, register.alliances[v]);
    return e?.tag ? tagSlug(e.tag, tags.includes(e.tag) ? tags : [...tags, e.tag]) : v;
  };
  return { toId, toSlug };
}

const rekey = (obj, fn) =>
  obj && typeof obj === 'object' && !Array.isArray(obj)
    ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [fn(k), v]))
    : obj;
const reslug = (v, fn) =>
  v && typeof v === 'object' && 'slug' in v ? { ...v, slug: fn(v.slug) } : v;
const eachValue = (obj, fn) =>
  obj && typeof obj === 'object' && !Array.isArray(obj)
    ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, reslug(v, fn)]))
    : obj;

function convert(state, fn) {
  const out = { ...state };
  for (const k of ['live', 'useFrame', 'missing']) if (k in out) out[k] = rekey(out[k], fn);
  for (const k of ['pending', 'decided']) if (k in out) out[k] = eachValue(out[k], fn);
  if (Array.isArray(out.sent)) out.sent = out.sent.map((v) => reslug(v, fn));
  return out;
}

const strip = (stored) => {
  const { version: _v, ...state } = stored || {};
  return state;
};

export const imagesView = (stored, register) =>
  isById(stored) ? convert(strip(stored), slugMaps(register).toSlug) : stored;
export const imagesByIdForm = (view, register) => ({
  stored: { version: 2, ...convert(strip(view), slugMaps(register).toId) },
  register: null,
});

export function countImages(view, register) {
  const { toId } = slugMaps(register);
  const live = Object.keys(view?.live || {});
  return {
    alliances: live.filter((s) => toId(s) !== s).length,
    pending: Object.keys(view?.pending || {}).length,
  };
}
