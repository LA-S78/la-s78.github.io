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

/** Alliances on the map, of a game and server: { id: entry }. */
function activeOn(register, { game = GAME, server = SERVER } = {}) {
  return Object.fromEntries(
    Object.entries(register.alliances).filter(
      ([, a]) => onMap(a) && a.game === game && String(a.server) === String(server),
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

/** On the map now: an active entry that hasn't left it (passes and tag lookups use only these). */
export const onMap = (a) => Boolean(a && a.status === 'active' && !a.off_map);

/** An entry a Steward merged into another (linkRegister) leads to that one. */
export function followMerged(register, entry) {
  let e = entry;
  for (let i = 0; e && e.status === 'merged' && i < 5; i++) e = register.alliances[e.merged_into];
  return e || null;
}

/**
 * The register brought in step with the alliance list (map-state.json's alliances) and the
 * tracker numbers measured (stats/alliance-ids.json's ids). Returns { register, added, linked,
 * parked } (counts; `register` is a new object).
 *
 * Never reuses an ID by tag alone (owner question, 2026-11-21: alliance A renames, alliance B
 * takes A's old tag): an entry whose tag left the map is marked `off_map` (kept, nothing
 * removed), and a tag that appears while any entry is off the map gets a NEW entry marked
 * `pending`, with the off-map entries as `maybe`. A Steward then says whether it's one of them
 * (linkRegister) or a new alliance; until then the new one starts with nothing of theirs. A
 * Discord setting another entry already has is never given to a new one. A tracker number is
 * only filled in where the entry has none and no other entry has it.
 */
export function syncRegister(register, mapAlliances = {}, trackerIds = {}, now = new Date()) {
  const out = { version: 1, alliances: { ...register.alliances } };
  let added = 0;
  let linked = 0;
  let parked = 0;
  const at = now.toISOString();
  const here = (a) => a.game === GAME && String(a.server) === SERVER;
  const mapTags = new Set(Object.keys(mapAlliances || {}).filter((t) => t.trim()));
  const hadEntries = Object.keys(out.alliances).length > 0;

  // First: entries whose tag left the map
  for (const a of Object.values(out.alliances)) {
    if (onMap(a) && here(a) && !mapTags.has(a.tag)) {
      out.alliances[a.id] = { ...a, off_map: at };
      parked += 1;
    }
  }
  for (const [tag, data] of Object.entries(mapAlliances || {})) {
    if (!tag.trim()) continue;
    let entry = Object.values(out.alliances).find((a) => onMap(a) && here(a) && a.tag === tag);
    if (!entry) {
      const id = newAllianceId(out.alliances);
      const parkedNow = Object.values(out.alliances).filter(
        (a) => a.status === 'active' && a.off_map && here(a),
      );
      const settingTaken = (v) =>
        Object.values(out.alliances).some((a) => a.status !== 'merged' && a.discord_var === v);
      const setting = ALLIANCE_ROLE_SETTINGS[tag] || null;
      entry = {
        id,
        game: GAME,
        server: SERVER,
        tag,
        name: String(data?.name || ''),
        status: 'active',
        created: at,
        // An alliance added later held its tag only from now (old passes are dated by this)
        tags: [{ tag, from: hadEntries ? at : null, to: null }],
        color: data?.color || DEFAULT_FALLBACK_COLORS[tag] || null,
        discord_var: setting && !settingTaken(setting) ? setting : null,
        links: {},
      };
      if (parkedNow.length) {
        // Same tag first: the likeliest answer, but never assumed
        const maybe = parkedNow.sort((a, b) => (b.tag === tag) - (a.tag === tag)).map((a) => a.id);
        entry.pending = { at, maybe };
      }
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
  return { register: out, added, linked, parked };
}

/**
 * A Steward's answer for a pending entry: `sameAs` is the off-map entry it really is (that
 * alliance renamed, or back on the map), or null for a new alliance. Same alliance: the old
 * entry takes the new tag (its tag history, Discord setting and tracker link kept; the new
 * one's filled in only where it had none) and is on the map again; the new entry becomes
 * `merged` into it (kept, so nothing that saw its ID is lost). Returns the new register, or
 * null if the answer doesn't fit (no longer pending, or not one of its choices).
 */
export function linkRegister(register, newId, sameAs, now = new Date()) {
  const fresh = register.alliances[newId];
  if (!fresh || !fresh.pending || !onMap(fresh)) return null;
  const out = { version: 1, alliances: { ...register.alliances } };
  if (!sameAs) {
    const { pending: _done, ...rest } = fresh;
    out.alliances[newId] = rest;
    return out;
  }
  const old = register.alliances[sameAs];
  if (!old || old.status !== 'active' || !old.off_map || !fresh.pending.maybe?.includes(sameAs))
    return null;
  const at = now.toISOString();
  const tags = (old.tags || []).map((h) => (h.to ? h : { ...h, to: at }));
  if (old.tag !== fresh.tag) tags.push({ tag: fresh.tag, from: at, to: null });
  else if (tags.length) tags[tags.length - 1] = { ...tags[tags.length - 1], to: null };
  const { off_map: _back, ...oldRest } = old;
  out.alliances[sameAs] = {
    ...oldRest,
    tag: fresh.tag,
    name: fresh.name || old.name,
    color: fresh.color || old.color,
    tags,
    discord_var: old.discord_var || fresh.discord_var || null,
    links: { ...(fresh.links || {}), ...(old.links || {}) },
  };
  const { pending: _p, ...freshRest } = fresh;
  out.alliances[newId] = { ...freshRest, status: 'merged', merged_into: sameAs, merged: at };
  return out;
}

/** Entries waiting for a Steward's answer, for the Steward tools page. */
export function pendingAlliances(register) {
  return Object.values(register.alliances)
    .filter((a) => a.pending && onMap(a))
    .map((a) => ({
      id: a.id,
      tag: a.tag,
      name: a.name,
      color: a.color,
      at: a.pending.at,
      maybe: (a.pending.maybe || [])
        .map((id) => register.alliances[id])
        .filter((o) => o && o.status === 'active' && o.off_map)
        .map((o) => ({ id: o.id, tag: o.tag, name: o.name, color: o.color })),
    }));
}

/** A Steward's answer, saved (one Gist save). Returns false if it no longer fits. */
export async function answerPending(newId, sameAs) {
  let ok = false;
  await updateGist((fresh) => {
    const next = linkRegister(readRegister(fresh), newId, sameAs || null);
    ok = Boolean(next);
    if (!next) return null;
    return {
      files: { [REGISTER_FILE]: next },
      description: sameAs
        ? `Alliance register: ${newId} is ${sameAs}`
        : `Alliance register: ${newId} is a new alliance`,
    };
  });
  return ok;
}

/** Keeps the Gist's register in step (one save, only when something changed). */
export async function updateRegister(gist, trackerIds = {}, { dryRun = false } = {}) {
  const mapAlliances = gistJson(gist, 'map-state.json', { alliances: {} }).alliances || {};
  const preview = syncRegister(readRegister(gist), mapAlliances, trackerIds);
  if (dryRun || (!preview.added && !preview.linked && !preview.parked)) {
    return { added: preview.added, linked: preview.linked, parked: preview.parked, saved: false };
  }
  let result = { added: 0, linked: 0, parked: 0 };
  await updateGist(
    (fresh) => {
      const synced = syncRegister(
        readRegister(fresh),
        gistJson(fresh, 'map-state.json', { alliances: {} }).alliances || {},
        trackerIds,
      );
      result = synced;
      if (!synced.added && !synced.linked && !synced.parked) return null;
      return {
        files: { [REGISTER_FILE]: synced.register },
        description: `Alliance register: ${synced.added} added, ${synced.linked} linked, ${synced.parked} off the map`,
      };
    },
    { gist },
  );
  return { added: result.added, linked: result.linked, parked: result.parked, saved: true };
}

// ---------------------------------------------------------------------------------------
// Sign-in and passes (plan step 1): a member's alliance follows its ID, not the tag
// ---------------------------------------------------------------------------------------

/**
 * The alliance whose Discord role is in the Vercel setting DISCORD_<name> (the setting stays
 * with an alliance through a rename). { entry } when it's on the map; { stale: true } when it
 * isn't (renamed and not linked yet, or gone): never guessed by tag then. null if no entry has it.
 */
export function allianceByDiscordVar(register, name) {
  if (!name) return null;
  const all = Object.values(register.alliances).filter(
    (a) => a.discord_var === name && a.status !== 'retired',
  );
  if (!all.length) return null;
  const entry = all.map((a) => followMerged(register, a)).find(onMap);
  return entry ? { entry } : { stale: true };
}

/**
 * The alliance a sign-in pass means, as it is now. Returns { entry }, { stale: true } (the
 * member must sign in again: never guessed), or null (the register can't say: the pass is
 * used as it is).
 *  - A pass with an ID: that alliance if it's on the map (or the one a Steward merged it into);
 *    otherwise stale, NEVER its tag (another alliance may have that tag now).
 *  - A pass with only a tag (the alliance wasn't in the register yet when they signed in): stale
 *    if the register knows that tag now (signing in again gives the ID); null if no alliance in
 *    the register has ever had it.
 * (Until 2026-11-22, passes from before step 1 were matched by the date they were issued; those
 * passes are no longer accepted, so that's gone: plan step 8.)
 */
export function allianceForPass(register, { allianceId, alliance } = {}) {
  const entries = Object.values(register.alliances);
  if (!entries.length) return null;
  if (allianceId) {
    const entry = followMerged(register, allianceById(register, allianceId));
    return onMap(entry) ? { entry } : { stale: true };
  }
  if (!alliance || alliance === 'Independent') return null;
  const known = entries.some(
    (a) =>
      a.game === GAME &&
      String(a.server) === SERVER &&
      (a.tags?.length ? a.tags : [{ tag: a.tag }]).some((h) => findTag([h.tag], alliance)),
  );
  return known ? { stale: true } : null;
}

/**
 * A verified pass with its alliance brought up to date from the register: `alliance` becomes
 * the alliance's current tag and `allianceId` its ID. When the register says the pass can't be
 * trusted any more (stale), the member counts as having no alliance (`allianceStale: true`,
 * so pages can ask them to sign in again). Unchanged when the register can't say. Every
 * endpoint that checks a member's alliance calls this after reading the Gist.
 */
export function withCurrentAlliance(session, gist) {
  if (!session) return session;
  const found = allianceForPass(readRegister(gist), session);
  if (!found) return session;
  if (found.stale) {
    const { allianceId: _gone, ...rest } = session;
    return { ...rest, alliance: 'Independent', allianceStale: true };
  }
  return { ...session, alliance: found.entry.tag, allianceId: found.entry.id };
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
