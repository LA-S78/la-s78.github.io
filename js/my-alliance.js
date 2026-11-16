/**
 * Your own alliance, picked out across the site.
 *
 * Signed in with an alliance (localStorage "auth-alliance", set at sign-in), its tag glows
 * wherever an alliance tag is shown: the calendar (Capitol card, the week's king, the cycle
 * grid), the Capitol rotation, the alliance standings, the rewards tiers and the King's
 * console. The card holding it (a rotation week, a standings row) glows softly too, in the
 * alliance's colour, like the header's lantern. CSS: _css/style/30-components-cards.css (.is-my-ally, .is-my-ally-card).
 *
 * Tags are recognised by their text ("[WLO]" or "WLO"), accents and case ignored, so the
 * pages that draw them need no changes. Tags drawn later (data arriving, a view switched)
 * are picked up as they appear.
 */
(function () {
  // Where a tag is shown (each holds just the tag, e.g. "[WLO]")
  const TAGS = '.ally-text, .rotation-tag, .ladder-tag, .alliance-badge, #hero-capitol-holder';
  // The card around a tag that glows with it
  const CARDS = '.rotation-week, .alliance-ladder-row, .ops-week-card';

  const norm = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[[\]\s]/g, '')
      .toLowerCase();
  const mine = () => {
    try {
      return norm(localStorage.getItem('auth-alliance'));
    } catch {
      return '';
    }
  };

  function mark(root = document) {
    const tag = mine();
    const cards = new Map(); // card -> its tag's colour (as shown)
    root.querySelectorAll(TAGS).forEach((el) => {
      const yes = Boolean(tag) && norm(el.textContent) === tag;
      if (el.classList.contains('is-my-ally') !== yes) el.classList.toggle('is-my-ally', yes);
      const card = el.closest(CARDS);
      if (card && yes) cards.set(card, getComputedStyle(el).color);
    });
    root.querySelectorAll(CARDS).forEach((card) => {
      const yes = cards.has(card);
      if (card.classList.contains('is-my-ally-card') !== yes) card.classList.toggle('is-my-ally-card', yes);
      const colour = cards.get(card) || '';
      if (card.style.getPropertyValue('--my-ally') !== colour) card.style.setProperty('--my-ally', colour);
    });
  }

  window.MyAlliance = { refresh: () => mark() };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mark());
  else mark();
  document.addEventListener('turbo:load', () => mark());
  document.addEventListener('turbo:frame-render', () => mark());
  // Signed in or out in another tab
  window.addEventListener('storage', (e) => {
    if (e.key === 'auth-alliance' || e.key === null) mark();
  });
  // Tags drawn later: checked once per frame, at most
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      mark();
    });
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
