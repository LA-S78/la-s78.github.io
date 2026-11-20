// A player's picture in their in-game frame (owner request, 2026-11-18), from the Last Asylum
// Tracker (api/_tracker.js): the roster view, Caravan Rotor, nomination list, King's console,
// and (2026-11-20) the Stats tab, the Steward player lookup and the territory map's card.
// Styles: _css/style/27-player-portraits.css. A classic script can use it as
// window.PlayerPortrait.
//
//   portrait({ name, avatar, frame }, 'sm')           → the picture's markup
//   portraitFor('fenrir', { '•FENRIR•': {...} }, 'sm') → the same, found by a typed name
//
// A player's own picture loads from the game's image server without a referrer; default
// portraits and frames are our own copies (/game-art/). Browsers keep both: their addresses
// change whenever the picture does.

import { foldName } from './name-check.js';

const esc = (v) => window.escapeHtml(v);

export function portrait(m, size = 'md') {
  const initial = esc((m.name || '?').trim().charAt(0).toUpperCase() || '?');
  const pic = m.avatar
    ? `<img class="pf-pic" src="${esc(m.avatar)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-initial="${initial}">`
    : `<span class="pf-pic pf-initial">${initial}</span>`;
  const frame = m.frame
    ? `<img class="pf-frame" src="${esc(m.frame)}" alt="" loading="lazy" decoding="async">`
    : '';
  return `<span class="player-portrait pf-${size}" aria-hidden="true">${pic}${frame}</span>`;
}

/**
 * The pictures of the member a typed name means: exactly that name, or the one member whose
 * name reads the same (letter case, spaces, decorations; js/name-check.js). null if none.
 */
export function pictureFor(name, pictures) {
  if (!pictures || !name) return null;
  if (pictures[name]) return pictures[name];
  const folded = foldName(name);
  if (!folded) return null;
  const same = Object.keys(pictures).filter((n) => foldName(n) === folded);
  return same.length === 1 ? pictures[same[0]] : null;
}

/**
 * A typed name's picture: '' when there are no pictures to show (no tracker), the member's
 * picture when found, otherwise their initial (so the names stay lined up).
 */
export function portraitFor(name, pictures, size = 'sm') {
  if (!pictures) return '';
  return portrait({ name, ...(pictureFor(name, pictures) || {}) }, size);
}

window.PlayerPortrait = { portrait, pictureFor, portraitFor };

// A picture that doesn't load shows the initial, and a frame that doesn't load goes (for every
// portrait on the page, whenever it was drawn)
if (typeof document !== 'undefined' && !window.__portraitErrors) {
  window.__portraitErrors = true;
  document.addEventListener(
    'error',
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.closest('.player-portrait')) return;
      if (img.classList.contains('pf-frame')) return img.remove();
      if (!img.classList.contains('pf-pic')) return;
      const span = document.createElement('span');
      span.className = 'pf-pic pf-initial';
      span.textContent = img.dataset.initial || '?';
      img.replaceWith(span);
    },
    true,
  );
}
