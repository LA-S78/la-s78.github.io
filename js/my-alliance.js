/**
 * Your own alliance, picked out across the site.
 *
 * Signed in with an alliance (localStorage "auth-alliance", set at sign-in), its tag glows
 * wherever an alliance tag is shown: the calendar (Capitol card, the week's king, the cycle
 * grid, the Capitol Rotation cards), the alliance standings, the rewards tiers and the map's
 * buff summary. The card holding it (a Capitol Rotation week, a standings row, a buff
 * summary row) is picked out too, in the alliance's colour. Both are still: a pulse was
 * distracting.
 * CSS: _css/style/30-components-cards.css (.is-my-ally, .is-my-ally-card).
 *
 * Tags are recognised by their text ("[WLO]" or "WLO"), accents and case ignored, so the
 * pages that draw them need no changes. Tags drawn later (data arriving, a view switched)
 * are picked up as they appear.
 */
(function () {
  // Where a tag is shown (each holds just the tag, e.g. "[WLO]")
  const TAGS = '.ally-text, .ladder-tag, .alliance-badge, .buff-row-tag, #hero-capitol-holder';
  // The card around a tag that glows with it
  const CARDS = '.alliance-ladder-row, .ops-week-card, .buff-row';

  const norm = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
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
      if (card.classList.contains('is-my-ally-card') !== yes)
        card.classList.toggle('is-my-ally-card', yes);
      const colour = cards.get(card) || '';
      if (card.style.getPropertyValue('--my-ally') !== colour)
        card.style.setProperty('--my-ally', colour);
    });
  }

  window.MyAlliance = { refresh: () => mark() };

  // After a Steward renames your alliance, the tag saved at sign-in is the old one: the
  // alliance's tag now, by its ID, once per visit (Gemini's review, 2026-11-22)
  (async () => {
    try {
      const id = localStorage.getItem('auth-alliance-id');
      if (!id || sessionStorage.getItem('my-alliance-checked') === id) return;
      sessionStorage.setItem('my-alliance-checked', id);
      const res = await fetch('/api/state?scope=version');
      const now = res.ok ? (await res.json()).tags?.[id] : null;
      if (now && now !== localStorage.getItem('auth-alliance')) {
        localStorage.setItem('auth-alliance', now);
        mark();
        window.renderIdentityPill?.();
      }
    } catch {
      // Not now: the next visit asks again
    }
  })();

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => mark());
  else mark();
  document.addEventListener('turbo:load', () => mark());
  document.addEventListener('turbo:frame-render', () => mark());
  // Signed in or out in another tab
  window.addEventListener('storage', (e) => {
    if (e.key === 'auth-alliance' || e.key === null) mark();
  });
  // Tags drawn later: marked as soon as they're added, before the browser paints them (the
  // observer runs once for each batch of changes), so a redrawn card never shows a frame
  // without its highlight. Only classes and styles change here, which the observer doesn't
  // watch, so it doesn't call itself.
  new MutationObserver(() => mark()).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
})();
