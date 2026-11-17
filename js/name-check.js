// Checks player names typed by leaders (Caravan Rotor, nomination list) against their
// alliance's member list from the Last Asylum Tracker (api/_tracker.js; owner request,
// 2026-11-17). It only advises: a name the list doesn't have is still saved (the list can
// be an hour old, or a player just joined).
//
//   checkName('fenrir', ['•FENRIR•', 'Odin']) → { status: 'spelling', match: '•FENRIR•' }
//
// Statuses: 'ok' (exactly a member's name), 'spelling' (a member's name written another
// way: letter case, spaces or decorations like •, ★, _), 'unknown' (with up to 3 close
// names in `suggestions`), or null when there is no member list to check against.
// A classic script can use it as window.NameCheck.

/** A name's letters and digits, lower case: "•FENRIR•" and "fenrir" read the same. */
export function foldName(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** How many single-letter changes turn one string into the other. */
function distance(a, b) {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return row[b.length];
}

export function checkName(name, members) {
  if (!Array.isArray(members) || !members.length) return null;
  const typed = String(name || '').trim();
  if (!typed) return null;
  if (members.includes(typed)) return { status: 'ok', match: typed };
  const folded = foldName(typed);
  const same = members.filter((m) => foldName(m) === folded && folded);
  if (same.length === 1) return { status: 'spelling', match: same[0] };
  // Close names: a few letters off, or one name inside the other ("Fen" for "•FENRIR•")
  const limit = Math.max(1, Math.floor(folded.length / 4));
  const suggestions = members
    .map((m) => ({ m, f: foldName(m) }))
    .filter(({ f }) => f && folded)
    .map(({ m, f }) => ({
      m,
      d: f.includes(folded) || folded.includes(f) ? 0.5 : distance(folded, f),
    }))
    .filter(({ d }) => d <= limit)
    .sort((x, y) => x.d - y.d)
    .slice(0, 3)
    .map(({ m }) => m);
  return { status: 'unknown', suggestions };
}

if (typeof window !== 'undefined') window.NameCheck = { checkName, foldName };
