// api/_alliances.js
// Shared alliance helpers for the API ("_" files are helpers, not endpoints).

export const DEFAULT_FALLBACK_COLORS = {
  WLO: '#25bb00',
  RÂVN: '#cece00',
  RAVN: '#cece00',
  MIA: '#a400af',
  BOTS: '#0070f3',
  SVN: '#e53e3e',
  PHNX: '#dd6b20',
  HMDA: '#d53f8c',
  NAVI: '#319795',
  HeKi: '#d69e2e',
};

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
