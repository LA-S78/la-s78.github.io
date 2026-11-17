// Telling alliances apart in the browser, by the same rules as the server (api/_alliances.js,
// owner 2026-11-17): letter case counts (RâvN and RÂVN are two alliances), accents don't
// (RAVN is RÂVN written without the accent).

/** A tag's letters without accents, letter case kept (RÂVN -> RAVN, RâvN -> RavN). */
export function tagLetters(tag) {
  return String(tag || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/** The same alliance: the same letters, accents aside (RÂVN = RAVN, RÂVN ≠ RâvN). */
export function sameTag(a, b) {
  const x = tagLetters(a);
  return Boolean(x) && x === tagLetters(b);
}

/**
 * Which of `tags` a typed tag means: the exact tag, else the same letters without accents,
 * else, typed in another letter case, the one alliance it can only mean; null otherwise.
 */
export function findTag(tags, tag) {
  const want = tagLetters(tag);
  if (!want) return null;
  const list = [...(tags || [])];
  const typed = String(tag).trim();
  if (list.includes(typed)) return typed;
  const same = list.find((t) => tagLetters(t) === want);
  if (same) return same;
  const loose = list.filter((t) => tagLetters(t).toLowerCase() === want.toLowerCase());
  return loose.length === 1 ? loose[0] : null;
}

/**
 * The alliances a tag typed in another letter case could mean, when findTag can't choose
 * (maintainer review, 2026-11-17): "ravn" with both RâvN and RÂVN registered gives
 * ['RÂVN', 'RâvN']; [] when findTag finds one or none is close. A caller that would
 * otherwise create a new alliance from the typed text asks the person to type it exactly.
 */
export function ambiguousTags(tags = [], tag) {
  const want = tagLetters(tag).toLowerCase();
  if (!want || findTag(tags, tag)) return [];
  const loose = [...tags].filter((t) => tagLetters(t).toLowerCase() === want);
  return loose.length > 1 ? loose : [];
}
