// api/_alliances.js
// Shared alliance helpers for the API ("_" files are helpers, not endpoints).

import ALLIANCES from './_alliances_data.js'; // generated from _data/alliances.yml

/** Colour for an alliance with none of its own (_data/alliances.yml). */
export const DEFAULT_FALLBACK_COLORS = ALLIANCES.colors;

/** The Vercel setting name (DISCORD_<name>) holding each alliance's NAP role ID. */
export const ALLIANCE_ROLE_SETTINGS = ALLIANCES.role_settings || {};

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
