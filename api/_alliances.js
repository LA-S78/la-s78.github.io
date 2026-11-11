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

/**
 * Strips private Discord bot configuration fields before sending alliance data to public clients.
 * Preserves exact tag capitalization and diacritics (e.g., RÂVN, RâvN, râvn, HeKi).
 */
export function sanitizeAlliances(rawAlliances = {}) {
  const sanitized = {};

  Object.entries(rawAlliances).forEach(([tag, data]) => {
    const cleanTag = tag.trim();
    if (!cleanTag) return;

    const storedColor = data?.color;
    const resolvedColor =
      storedColor && storedColor !== '#b8975a'
        ? storedColor
        : DEFAULT_FALLBACK_COLORS[cleanTag] || storedColor || null;

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
