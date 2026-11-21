// api/_calendar_ids.js
// Calendar events by alliance ID (docs/ALLIANCE-IDS-PLAN.md, step 3, 2026-11-22).
//
// calendar-state.json's `custom_events` each have a `scope`: "global" (server-wide) or the
// alliance's tag. Stored by ID (`version: 2`, after a Steward runs the move), an alliance
// event's scope is the alliance's ID instead. As with the alliance list (api/_map_state.js),
// gistJson() gives every reader the tag form and updateGist() saves in the stored form, so the
// rest of the code doesn't change. A scope that isn't an alliance in the register stays as
// written. Events' own titles ("[WLO] Muster") are text people see and stay as written.

import { ID_PATTERN, followMerged, onMap, GAME, SERVER } from './_register.js';

export const CALENDAR_FILE = 'calendar-state.json';
export const isById = (stored) => Boolean(stored && stored.version === 2);

const mapScopes = (state, fn) => ({
  ...state,
  ...(Array.isArray(state.custom_events)
    ? {
        custom_events: state.custom_events.map((e) =>
          e && typeof e.scope === 'string' ? { ...e, scope: fn(e.scope) } : e,
        ),
      }
    : {}),
});

/** The tag form of the stored file (unchanged when it's stored by tag). */
export function calendarView(stored, register) {
  if (!isById(stored)) return stored;
  const tagOf = (v) =>
    ID_PATTERN.test(v) ? followMerged(register, register.alliances[v])?.tag || v : v;
  const { version: _v, ...state } = stored;
  return mapScopes(state, tagOf);
}

/** The tag form turned into the stored-by-ID form: { stored, register: null }. */
export function calendarByIdForm(view, register) {
  const here = (a) => a.game === GAME && String(a.server) === SERVER;
  const idOf = (tag) => {
    if (tag.toLowerCase() === 'global') return tag;
    return (
      Object.values(register.alliances).find((a) => onMap(a) && here(a) && a.tag === tag)?.id || tag
    );
  };
  const { version: _v, ...state } = view || {};
  return { stored: { version: 2, ...mapScopes(state, idOf) }, register: null };
}

/** Back to tags (the undo). */
export const calendarByTagForm = (stored, register) => calendarView(stored, register);

/** Counts for a move's report: alliance events, server-wide events, other scopes. */
export function countCalendar(view, register) {
  const here = (a) => a.game === GAME && String(a.server) === SERVER;
  const known = new Set(
    Object.values(register.alliances)
      .filter((a) => onMap(a) && here(a))
      .map((a) => a.tag),
  );
  let alliance = 0;
  let global = 0;
  let other = 0;
  for (const e of view?.custom_events || []) {
    const s = String(e?.scope || 'global');
    if (s.toLowerCase() === 'global') global += 1;
    else if (known.has(s)) alliance += 1;
    else other += 1;
  }
  return { alliance, global, other };
}
