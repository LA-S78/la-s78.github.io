// api/_id_stores.js
// The Gist files that can be stored by alliance ID (docs/ALLIANCE-IDS-PLAN.md, steps 2–4), and
// the Steward's move for each (2026-11-22). Each store says how to tell its forms apart and
// how to turn one into the other; api/_gist.js uses that to give every reader the tag form
// (gistJson) and to save in the stored form (updateGist), and the Steward tools page offers
// one "Move to IDs" / "Undo the move" per store.
//
// A move is one save: the file by ID, a backup of the file as it was
// (`backup-<file>-<time>.json`) and, for the alliance list, the register. It's refused
// (nothing saved) unless, turned back into tags, the new file is exactly the old one. Running
// it again does nothing. Undo turns the file back into tags, keeping every change made since.

import {
  MAP_FILE,
  isById as mapById,
  mapView,
  byIdForm as mapByIdForm,
  byTagForm as mapByTagForm,
  countRefs as countMap,
} from './_map_state.js';
import {
  CALENDAR_FILE,
  isById as calendarById,
  calendarView,
  calendarByIdForm,
  calendarByTagForm,
  countCalendar,
} from './_calendar_ids.js';

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

/** In save order: the alliance list first (it may add alliances the others then refer to). */
export const STORES = {
  map: {
    file: MAP_FILE,
    step: 2,
    isById: mapById,
    view: mapView,
    byId: mapByIdForm,
    byTag: mapByTagForm,
    // As the move compares it: each alliance's record carries its tag
    original: (state) => ({
      ...state,
      alliances: Object.fromEntries(
        Object.entries(state.alliances || {}).map(([t, a]) => [t, { ...a, tag: t }]),
      ),
    }),
    count: (view) => countMap(view),
  },
  calendar: {
    file: CALENDAR_FILE,
    step: 3,
    isById: calendarById,
    view: calendarView,
    byId: (view, register) => calendarByIdForm(view, register),
    byTag: calendarByTagForm,
    original: (state) => state,
    count: (view, register) => countCalendar(view, register),
  },
};

export const storeForFile = (file) => Object.values(STORES).find((s) => s.file === file) || null;

const backupName = (file, now, what) =>
  `backup-${file.replace(/\.json$/, '')}-${now.toISOString().slice(0, 16).replace(':', '-')}${what ? `-${what}` : ''}.json`;

/** Moves one store to IDs. Returns { moved, counts, backup } | { already: true }. */
export async function moveToIds(key, { now = new Date(), update } = {}) {
  const store = STORES[key];
  if (!store) throw new Error('Unknown store.');
  const { updateGist } = await import('./_gist.js');
  const { readRegister, REGISTER_FILE } = await import('./_register.js');
  let report = null;
  await (update || updateGist)((gist) => {
    const stored = JSON.parse(gist.files?.[store.file]?.content || 'null');
    if (!stored) throw new Error(`${store.file} is missing.`);
    if (store.isById(stored)) {
      report = { already: true };
      return {};
    }
    const before = readRegister(gist);
    const converted = store.byId(stored, before, now);
    const register = converted.register || before;
    if (!sameData(store.byTag(converted.stored, register), store.original(stored))) {
      throw new Error('The moved file does not match the original: nothing was saved.');
    }
    const backup = backupName(store.file, now);
    report = { moved: true, store: key, counts: store.count(stored, register), backup };
    return {
      raw: true,
      files: {
        [store.file]: converted.stored,
        [backup]: stored,
        ...(converted.register ? { [REGISTER_FILE]: converted.register } : {}),
      },
      description: `Alliance IDs step ${store.step}: ${store.file} moved to IDs (backup: ${backup})`,
    };
  });
  return report;
}

/** Turns one store back into tags. Returns { undone, counts, backup } | { already: true }. */
export async function moveToTags(key, { now = new Date(), update } = {}) {
  const store = STORES[key];
  if (!store) throw new Error('Unknown store.');
  const { updateGist } = await import('./_gist.js');
  const { readRegister } = await import('./_register.js');
  let report = null;
  await (update || updateGist)((gist) => {
    const stored = JSON.parse(gist.files?.[store.file]?.content || 'null');
    if (!store.isById(stored)) {
      report = { already: true };
      return {};
    }
    const register = readRegister(gist);
    const back = store.byTag(stored, register);
    const backup = backupName(store.file, now, 'by-id');
    report = { undone: true, store: key, counts: store.count(back, register), backup };
    return {
      raw: true,
      files: { [store.file]: back, [backup]: stored },
      description: `Alliance IDs step ${store.step} undone: ${store.file} back to tags (backup: ${backup})`,
    };
  });
  return report;
}

/** Each store's form, for the Steward page: { map: 'id' | 'tag', calendar: … }. */
export function storeForms(gist) {
  return Object.fromEntries(
    Object.entries(STORES).map(([key, s]) => [
      key,
      s.isById(JSON.parse(gist?.files?.[s.file]?.content || 'null')) ? 'id' : 'tag',
    ]),
  );
}
