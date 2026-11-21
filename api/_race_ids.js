// api/_race_ids.js
// The Top 4 race by alliance ID (Gemini's review of the finished migration, 2026-11-22): the
// race keeps each Duel Day's Might per alliance (ascension.json `runs[week].days[day].power`).
// Keyed by tag, an alliance renamed between Days 3 and 5 would be split into two rows; by ID
// its three days stay one alliance, shown under its tag now.
//
// A store like the others (api/_id_stores.js), but moved on its own (`autoMove`): the next save
// of the race file stores it by ID, and the rename tool converts it first, before any rename,
// so a rename can never land on the old form. Tags that aren't an alliance in the register
// stay as written, both ways.

import { ID_PATTERN, followMerged, onMap, GAME, SERVER } from './_register.js';

export const RACE_FILE = 'ascension.json';
export const isById = (stored) => Boolean(stored && stored.version === 2);

function convert(state, fn) {
  const runs = {};
  for (const [week, run] of Object.entries(state.runs || {})) {
    if (!run || typeof run !== 'object') {
      runs[week] = run;
      continue;
    }
    const days = {};
    for (const [d, day] of Object.entries(run.days || {})) {
      days[d] =
        day && day.power && typeof day.power === 'object'
          ? {
              ...day,
              power: Object.fromEntries(Object.entries(day.power).map(([k, v]) => [fn(k), v])),
            }
          : day;
    }
    runs[week] = { ...run, ...(run.days ? { days } : {}) };
  }
  return { ...state, ...(state.runs ? { runs } : {}) };
}

const strip = (s) => {
  const { version: _v, ...rest } = s || {};
  return rest;
};

export function raceView(stored, register) {
  if (!isById(stored)) return stored;
  const toTag = (v) =>
    ID_PATTERN.test(v) ? followMerged(register, register.alliances[v])?.tag || v : v;
  return convert(strip(stored), toTag);
}

export function raceByIdForm(view, register) {
  const here = (a) => a.game === GAME && String(a.server) === SERVER;
  const byTag = new Map(
    Object.values(register.alliances)
      .filter((a) => onMap(a) && here(a))
      .map((a) => [a.tag, a.id]),
  );
  return {
    stored: { version: 2, ...convert(strip(view), (t) => byTag.get(t) || t) },
    register: null,
  };
}
