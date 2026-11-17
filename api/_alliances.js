// api/_alliances.js
// Shared alliance helpers for the API ("_" files are helpers, not endpoints).

import ALLIANCES from './_alliances_data.js'; // generated from _data/alliances.yml

/** Colour for an alliance with none of its own (_data/alliances.yml). */
export const DEFAULT_FALLBACK_COLORS = ALLIANCES.colors;

/** The Vercel setting name (DISCORD_<name>) holding each alliance's NAP role ID. */
export const ALLIANCE_ROLE_SETTINGS = ALLIANCES.role_settings || {};

/**
 * The alliance whose NAP role (set in Vercel as DISCORD_<name>, listed in role_settings)
 * a member holds, by its real tag (e.g. "RÂVN", not "RAVN"); null if none matches.
 * Only these settings are checked, so other DISCORD_* settings (bot token, server IDs,
 * the R4/R5 roles) can never be taken for an alliance.
 * @param {string[]} roleIds the member's role IDs in the NAP server
 */
export function allianceFromRoleIds(roleIds = [], env = process.env) {
  for (const [tag, name] of Object.entries(ALLIANCE_ROLE_SETTINGS)) {
    // Trimmed: a value pasted into Vercel with a stray space or line break still matches.
    const roleId = String(env[`DISCORD_${name}`] || '').trim();
    if (roleId && roleIds.includes(roleId)) return tag;
  }
  return null;
}

/** Rank #1's tag and the three rotation seats [A, B, C] before any live schedule exists. */
export const STARTING_ROTATION = ALLIANCES.starting_rotation;

// ---------------------------------------------------------------------------------------
// Telling alliances apart (owner, 2026-11-17): RâvN and RÂVN are two alliances, so letter
// case counts. Accents don't: RAVN is RÂVN written without the accent.
// ---------------------------------------------------------------------------------------

/** A tag's letters without accents, letter case kept (RÂVN -> RAVN, RâvN -> RavN). */
export function tagLetters(tag) {
  return String(tag || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** The same alliance: the same letters, accents aside (RÂVN = RAVN, RÂVN ≠ RâvN). */
export function sameTag(a, b) {
  const x = tagLetters(a);
  return Boolean(x) && x === tagLetters(b);
}

/**
 * Which of `tags` a tag written some other way means: the exact tag, else the same letters
 * without accents (RAVN -> RÂVN), else, for a tag typed in another letter case (ravn), the
 * one alliance it can only mean. null when none, or when it could be more than one.
 */
export function findTag(tags = [], tag) {
  const want = tagLetters(tag);
  if (!want) return null;
  const list = [...tags];
  if (list.includes(String(tag).trim())) return String(tag).trim();
  const same = list.filter((t) => tagLetters(t) === want);
  if (same.length) return same[0];
  const loose = list.filter((t) => tagLetters(t).toLowerCase() === want.toLowerCase());
  return loose.length === 1 ? loose[0] : null;
}

/**
 * An alliance's file-safe name for its stored files (dashboard, pictures): its letters and
 * digits in capitals (RÂVN -> RAVN, HeKi -> HEKI), as before. When another alliance in
 * `tags` already has those capitals (RâvN beside RÂVN), the letter case is kept instead
 * (RavN), so the two never share a file.
 */
export function tagSlug(tag, tags = []) {
  const kept = tagLetters(tag).replace(/[^A-Za-z0-9]/g, '');
  const caps = kept.toUpperCase();
  if (!kept) return 'UNKNOWN';
  if (kept === caps) return caps;
  const clash = [...tags].some(
    (t) => !sameTag(t, tag) && tagLetters(t).replace(/[^A-Za-z0-9]/g, '') === caps,
  );
  return clash ? kept : caps;
}

/** A calendar event's scope: 'global' (any letter case), or the same alliance (sameTag). */
export function sameScope(a, b) {
  const x = String(a || 'global').trim();
  const y = String(b || 'global').trim();
  if (x.toLowerCase() === 'global' || y.toLowerCase() === 'global') {
    return x.toLowerCase() === y.toLowerCase();
  }
  return sameTag(x, y);
}

/** An alliance's role colour, by its exact tag or the same letters without accents (RAVN/RÂVN). */
export function roleColorFor(tag, roleColors = {}) {
  if (roleColors[tag]) return roleColors[tag];
  const key = Object.keys(roleColors).find((k) => sameTag(k, tag));
  return key ? roleColors[key] : null;
}

/**
 * Strips private Discord bot configuration fields before sending alliance data to public clients.
 * Preserves exact tag capitalization and diacritics (e.g., RÂVN, RâvN, râvn, HeKi).
 */
export function sanitizeAlliances(rawAlliances = {}, roleColors = {}) {
  const sanitized = {};

  Object.entries(rawAlliances).forEach(([tag, data]) => {
    const cleanTag = tag.trim();
    if (!cleanTag) return;

    // The same order as the Alliance page (js/alliance.js resolveAllianceColor): the
    // alliance's Discord role colour (getRoleColors in _role_colors.js), then a colour chosen
    // on the site (the gold #b8975a counts as none), then _data/alliances.yml.
    const storedColor = data?.color;
    const resolvedColor =
      roleColorFor(cleanTag, roleColors) ||
      (storedColor && storedColor !== '#b8975a'
        ? storedColor
        : DEFAULT_FALLBACK_COLORS[cleanTag] || storedColor || null);

    sanitized[cleanTag] = {
      tag: cleanTag,
      name: data?.name || cleanTag,
      rank:
        data?.rank !== undefined && data?.rank !== null && data?.rank !== ''
          ? Number(data.rank)
          : null,
      type: data?.type || (data?.parent_tag ? 'academy' : 'main'),
      parent_tag: data?.parent_tag ? String(data.parent_tag).trim() : null,
      academies: Array.isArray(data?.academies)
        ? data.academies.map((a) => String(a).trim()).filter(Boolean)
        : [],
      is_nap: data?.is_nap !== undefined ? Boolean(data.is_nap) : true,
      color: resolvedColor,
    };
  });

  return sanitized;
}
