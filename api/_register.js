// api/_register.js
// The alliance register (docs/ALLIANCE-IDS-PLAN.md, step 0c, 2026-11-20): every alliance gets
// the site's own permanent ID, so that later steps can store everything by ID instead of by
// tag (a tag is only a label, and alliances change theirs in the game).
//
// One Gist file, alliance-register.json:
//   { version: 1, alliances: { al_xxxxxxxxxx: { id, game, server, tag, name, status, created,
//     tags: [{ tag, from, to }], color, discord_var, links: { tracker: { id, checked } } } } }
//
// In step 0 nothing reads it yet: the 5-minute check keeps it in step with the alliance list
// (every alliance on the map gets an entry, once; nothing is ever removed or renamed by it),
// and copies the tracker numbers the measurements learned. `discord_var` and `links` stay on
// the server: they are never sent to browsers.

import { randomInt } from 'node:crypto';
import { gistJson, updateGist } from './_gist.js';
import { ALLIANCE_ROLE_SETTINGS, DEFAULT_FALLBACK_COLORS, findTag } from './_alliances.js';

export const REGISTER_FILE = 'alliance-register.json';
export const GAME = 'lastasylum';
export const SERVER = '78';

/** Lowercase letters and digits without the easily confused 0 o 1 l i (31 characters). */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const ID_LENGTH = 10;
export const ID_PATTERN = new RegExp(`^al_[${ALPHABET}]{${ID_LENGTH}}$`);

/** A new ID that no alliance in the register has ever had (retired ones included). */
export function newAllianceId(taken = {}) {
  for (let tries = 0; tries < 20; tries++) {
    let id = 'al_';
    for (let i = 0; i < ID_LENGTH; i++) id += ALPHABET[randomInt(ALPHABET.length)];
    if (!taken[id]) return id;
  }
  // 31^10 IDs: twenty clashes in a row means something is very wrong
  throw new Error('Could not make a new alliance ID.');
}

export function readRegister(gist) {
  const d = gistJson(gist, REGISTER_FILE, {});
  return {
    version: 1,
    alliances: d.alliances && typeof d.alliances === 'object' ? d.alliances : {},
  };
}

/** Active alliances of a game and server: { id: entry }. */
function activeOn(register, { game = GAME, server = SERVER } = {}) {
  return Object.fromEntries(
    Object.entries(register.alliances).filter(
      ([, a]) => a.status === 'active' && a.game === game && String(a.server) === String(server),
    ),
  );
}

/**
 * The active alliance a typed tag means, by today's rules (findTag: exact; accents aside;
 * another letter case only if it can mean one alliance). null if none, or ambiguous.
 */
export function allianceByTag(register, tag, where = {}) {
  const active = Object.values(activeOn(register, where));
  const key = findTag(
    active.map((a) => a.tag),
    tag,
  );
  return key ? active.find((a) => a.tag === key) || null : null;
}

export const allianceById = (register, id) => register.alliances[String(id)] || null;

/**
 * The register brought in step with the alliance list (map-state.json's alliances) and the
 * tracker numbers measured (stats/alliance-ids.json's ids). Returns { register, added, linked }
 * (counts; `register` is a new object). Only adds: an alliance on the map with no active entry
 * for its tag gets one; an entry whose tag left the map is kept (retiring is a Steward's
 * decision, later steps). A tracker number is only filled in where the entry has none: a
 * different number for a linked alliance is a mismatch for the Stewards (safeguard 4), never
 * an overwrite.
 */
export function syncRegister(register, mapAlliances = {}, trackerIds = {}, now = new Date()) {
  const out = { version: 1, alliances: { ...register.alliances } };
  let added = 0;
  let linked = 0;
  const at = now.toISOString();
  for (const [tag, data] of Object.entries(mapAlliances || {})) {
    if (!tag.trim()) continue;
    const existing = Object.values(out.alliances).find(
      (a) =>
        a.status === 'active' && a.game === GAME && String(a.server) === SERVER && a.tag === tag,
    );
    let entry = existing;
    if (!entry) {
      const id = newAllianceId(out.alliances);
      entry = {
        id,
        game: GAME,
        server: SERVER,
        tag,
        name: String(data?.name || ''),
        status: 'active',
        created: at,
        tags: [{ tag, from: null, to: null }],
        color: data?.color || DEFAULT_FALLBACK_COLORS[tag] || null,
        discord_var: ALLIANCE_ROLE_SETTINGS[tag] || null,
        links: {},
      };
      out.alliances[id] = entry;
      added += 1;
    }
    const aid = Number(trackerIds?.[tag]?.aid);
    if (aid && !entry.links?.tracker?.id) {
      // One alliance per tracker number: a number another entry has is left for the Stewards
      const taken = Object.values(out.alliances).some(
        (a) => a.id !== entry.id && Number(a.links?.tracker?.id) === aid,
      );
      if (!taken) {
        out.alliances[entry.id] = {
          ...entry,
          links: { ...(entry.links || {}), tracker: { id: aid, checked: at } },
        };
        linked += 1;
      }
    }
  }
  return { register: out, added, linked };
}

/** Keeps the Gist's register in step (one save, only when something changed). */
export async function updateRegister(gist, trackerIds = {}, { dryRun = false } = {}) {
  const mapAlliances = gistJson(gist, 'map-state.json', { alliances: {} }).alliances || {};
  const preview = syncRegister(readRegister(gist), mapAlliances, trackerIds);
  if (dryRun || (!preview.added && !preview.linked)) {
    return { added: preview.added, linked: preview.linked, saved: false };
  }
  let result = { added: 0, linked: 0 };
  await updateGist(
    (fresh) => {
      const synced = syncRegister(
        readRegister(fresh),
        gistJson(fresh, 'map-state.json', { alliances: {} }).alliances || {},
        trackerIds,
      );
      result = synced;
      if (!synced.added && !synced.linked) return null;
      return {
        files: { [REGISTER_FILE]: synced.register },
        description: `Alliance register: ${synced.added} added, ${synced.linked} linked`,
      };
    },
    { gist },
  );
  return { added: result.added, linked: result.linked, saved: true };
}

// ---------------------------------------------------------------------------------------
// Sign-in and passes (plan step 1): a member's alliance follows its ID, not the tag
// ---------------------------------------------------------------------------------------

/** The active alliance whose Discord role is in the Vercel setting DISCORD_<name>. */
export function allianceByDiscordVar(register, name) {
  if (!name) return null;
  return (
    Object.values(register.alliances).find(
      (a) => a.status === 'active' && a.discord_var === name,
    ) || null
  );
}

/**
 * The alliance a sign-in pass means, as it is now: by the pass's alliance ID (new passes); else
 * by its tag (older passes); else, for a pass from before a rename, by the tag history (the one
 * place history is used: to recognise an old pass, never to look data up). null if none.
 */
export function allianceForPass(register, { allianceId, alliance } = {}) {
  const byId = allianceId ? allianceById(register, allianceId) : null;
  if (byId && byId.status === 'active') return byId;
  if (!alliance || alliance === 'Independent') return null;
  const byTag = allianceByTag(register, alliance);
  if (byTag) return byTag;
  const former = Object.values(register.alliances).filter(
    (a) => a.status === 'active' && (a.tags || []).some((h) => h.tag === alliance && h.to),
  );
  return former.length === 1 ? former[0] : null;
}

/**
 * A verified pass with its alliance brought up to date from the register: `alliance` becomes
 * the alliance's current tag and `allianceId` its ID (both unchanged when the register doesn't
 * know it). Every endpoint that checks a member's alliance calls this after reading the Gist.
 */
export function withCurrentAlliance(session, gist) {
  if (!session) return session;
  const entry = allianceForPass(readRegister(gist), session);
  return entry ? { ...session, alliance: entry.tag, allianceId: entry.id } : session;
}

/**
 * The same for code that checks a member's alliance before reading the Gist: reads it (or uses
 * `gist` if given). If the Gist can't be read, the pass is used as it is.
 */
export async function currentSession(session, gist = null) {
  if (!session) return session;
  try {
    const { readGist } = await import('./_gist.js');
    return withCurrentAlliance(session, gist || (await readGist({ timeoutMs: 3000 })));
  } catch {
    return session;
  }
}
