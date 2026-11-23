/**
 * js/site-select.js - the site's dropdown (owner decision, 2026-11-15).
 *
 * Upgrades a normal <select data-site-select> into a themed dropdown whose options can show a
 * line icon and a short second line (e.g. an event type's icon and its usual length), which a
 * browser's own dropdown can't. The <select> stays in the page as the real value: forms,
 * `select.value`, and 'change' listeners keep working unchanged, and if this script doesn't
 * run the plain dropdown is still there.
 *
 *   <select id="x" data-site-select>
 *     <option value="a" data-icon='<path d="…"/>' data-hint="0.5h">Name</option>
 *   </select>
 *
 * data-icon: the SVG inside a 24x24 line icon (the site's icon style). Only trusted markup from
 *            the site's own data (e.g. _data/event_types.yml): it's put into the page as is.
 * data-hint: a short second line, shown smaller beside the name.
 * data-search on the <select> (2026-11-23): a search box at the top of the open list, for long
 *            lists (e.g. 100 player names); its value is the box's placeholder, and
 *            data-search-none the text when nothing matches. Matching ignores letter case,
 *            accents and symbols ("human" finds "●Human●"): names containing what's typed,
 *            else names with its letters in order ("drcs" finds "DracaryS").
 *
 * Options added or replaced later (select.innerHTML = …), a value set in code (select.value =
 * …, which fires no event), the select hidden or disabled, and dropdowns added to the page
 * later are all picked up by themselves. (SiteSelect.sync(select) still redraws on demand.) Keyboard: arrows, Home/End, typing a letter, Enter/Space to pick, Escape
 * to close; screen readers get a button and a listbox.
 */
(function () {
  const upgraded = new WeakMap(); // select -> its dropdown
  let uid = 0;

  const svg = (inner, cls) =>
    inner
      ? `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`
      : '';
  const esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const content = (opt) =>
    `${svg(opt.dataset.icon, 'site-select-ic')}<span class="site-select-text">${esc(opt.textContent.trim())}</span>${
      opt.dataset.hint ? ` <span class="site-select-hint">${esc(opt.dataset.hint)}</span>` : ''
    }`;

  function enhance(select) {
    if (!select || upgraded.has(select)) return upgraded.get(select);
    // Back/forward: the page loader (Turbo) shows its saved copy of the page, dropdown
    // already drawn but not wired up. Take the old one apart and build it afresh.
    const stale = select.parentElement;
    if (stale?.classList.contains('site-select')) {
      stale.parentNode.insertBefore(select, stale);
      stale.remove();
    }
    const id = select.id || `site-select-${++uid}`;
    if (!select.id) select.id = id;
    const wrap = document.createElement('div');
    wrap.className = 'site-select';
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add('site-select-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'site-select-btn';
    button.id = `${id}-button`;
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    const list = document.createElement('ul');
    list.className = 'site-select-list';
    list.id = `${id}-list`;
    list.setAttribute('role', 'listbox');
    list.tabIndex = -1;
    list.hidden = true;
    button.setAttribute('aria-controls', list.id);
    wrap.append(button, list);

    // Its name: the <label for>, or a <label> around it, else the select's aria-label
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`) || wrap.closest('label');
    if (label) {
      if (!label.id) label.id = `${id}-label`;
      // A label around it: name it by the label's own text, not the whole label
      const own = label.contains(wrap) ? label.querySelector(':scope > span') : null;
      if (own && !own.id) own.id = `${id}-label-text`;
      const nameId = own ? own.id : label.id;
      button.setAttribute('aria-labelledby', `${nameId} ${button.id}`);
      list.setAttribute('aria-labelledby', nameId);
      label.addEventListener('click', (e) => {
        if (wrap.contains(e.target)) return; // a click on the dropdown itself
        e.preventDefault();
        button.focus();
      });
    } else if (select.getAttribute('aria-label')) {
      button.setAttribute('aria-label', select.getAttribute('aria-label'));
      list.setAttribute('aria-label', select.getAttribute('aria-label'));
    }

    let active = -1; // the highlighted option (its data-index) while open
    let typed = '';
    let typedAt = 0;
    const options = () => [...select.options].filter((o) => !o.hidden);

    // The search box (data-search): an input above the options, inside the open list
    const searchable = select.hasAttribute('data-search');
    let search = null;
    const fold = (t) =>
      String(t || '')
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '');
    /** Hides the options that don't match the box; highlights the first that does. */
    function filter() {
      const q = fold(search?.value);
      const items = [...list.querySelectorAll('[role="option"]')];
      const texts = items.map((li) => fold(li.textContent));
      const inOrder = (t) => {
        let at = 0;
        for (const ch of q) {
          at = t.indexOf(ch, at) + 1;
          if (!at) return false;
        }
        return true;
      };
      let ok = texts.map((t) => !q || t.includes(q));
      if (q && !ok.some(Boolean)) ok = texts.map(inOrder);
      items.forEach((li, i) => (li.hidden = !ok[i]));
      list.querySelectorAll('.site-select-group').forEach((g) => (g.hidden = Boolean(q)));
      const none = list.querySelector('.site-select-none');
      if (none) none.hidden = ok.some(Boolean);
      const first = items.find((li) => !li.hidden);
      if (first) highlight(Number(first.dataset.index));
    }

    function build() {
      const html = [];
      let index = 0;
      for (const child of select.children) {
        if (child.tagName === 'OPTGROUP') {
          html.push(`<li class="site-select-group" role="presentation">${esc(child.label)}</li>`);
          for (const o of child.children) if (!o.hidden) html.push(item(o, index++));
        } else if (!child.hidden) html.push(item(child, index++));
      }
      list.innerHTML = html.join('');
      if (searchable) {
        const q = search ? search.value : '';
        list.insertAdjacentHTML(
          'afterbegin',
          `<li class="site-select-search" role="presentation"><input type="search" autocomplete="off" spellcheck="false" placeholder="${esc(select.dataset.search || '')}" aria-label="${esc(select.dataset.search || select.getAttribute('aria-label') || '')}" aria-controls="${list.id}"></li>`,
        );
        list.insertAdjacentHTML(
          'beforeend',
          `<li class="site-select-none" role="presentation" hidden>${esc(select.dataset.searchNone || '')}</li>`,
        );
        search = list.querySelector('.site-select-search input');
        search.value = q;
        search.addEventListener('input', filter);
        if (q) filter();
      }
      sync();
    }
    function item(o, i) {
      return `<li class="site-select-option${o.disabled ? ' is-disabled' : ''}" role="option" id="${id}-opt-${i}" data-index="${i}" aria-selected="false"${o.disabled ? ' aria-disabled="true"' : ''}>${content(o)}</li>`;
    }
    function sync() {
      const chosen = select.options[select.selectedIndex];
      button.innerHTML = `<span class="site-select-value">${chosen ? content(chosen) : ''}</span><svg class="site-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>`;
      button.disabled = select.disabled;
      wrap.hidden = select.hidden; // a dropdown hidden until it's needed hides its button too
      const opts = options();
      list.querySelectorAll('[role="option"]').forEach((li) => {
        li.setAttribute(
          'aria-selected',
          opts[Number(li.dataset.index)] === chosen ? 'true' : 'false',
        );
      });
    }
    function highlight(i) {
      const items = list.querySelectorAll('[role="option"]');
      if (!items.length) return;
      active = Math.max(0, Math.min(items.length - 1, i));
      items.forEach((li, n) => li.classList.toggle('is-active', n === active));
      list.setAttribute('aria-activedescendant', items[active].id);
      search?.setAttribute('aria-activedescendant', items[active].id);
      items[active].scrollIntoView({ block: 'nearest' });
    }
    /** Moves the highlight `by` options among those shown (the search hides some). */
    function move(by) {
      const shown = [...list.querySelectorAll('[role="option"]')]
        .filter((li) => !li.hidden)
        .map((li) => Number(li.dataset.index));
      if (!shown.length) return;
      if (by === -Infinity) return highlight(shown[0]);
      if (by === Infinity) return highlight(shown[shown.length - 1]);
      const at = shown.indexOf(active);
      highlight(shown[Math.max(0, Math.min(shown.length - 1, (at < 0 ? -1 : at) + by))]);
    }
    function open() {
      if (button.disabled || !list.hidden) return;
      list.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      wrap.classList.add('is-open');
      // Open upwards when there isn't room below
      const r = button.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      wrap.classList.toggle(
        'opens-up',
        below < Math.min(list.scrollHeight, 320) + 12 && r.top > below,
      );
      highlight(Math.max(0, options().indexOf(select.options[select.selectedIndex])));
      if (search) {
        search.value = '';
        filter();
        highlight(Math.max(0, options().indexOf(select.options[select.selectedIndex])));
        search.focus({ preventScroll: true });
      } else list.focus({ preventScroll: true });
      document.addEventListener('pointerdown', outside, true);
    }
    function close(focusButton = true) {
      if (list.hidden) return;
      list.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      wrap.classList.remove('is-open', 'opens-up');
      list.removeAttribute('aria-activedescendant');
      document.removeEventListener('pointerdown', outside, true);
      if (focusButton) button.focus({ preventScroll: true });
    }
    function outside(e) {
      if (!wrap.contains(e.target)) close(false);
    }
    function choose(i) {
      const o = options()[i];
      if (!o || o.disabled) return;
      const changed = select.value !== o.value || select.selectedIndex !== o.index;
      select.selectedIndex = o.index;
      sync();
      close();
      if (changed) {
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    button.addEventListener('click', () => (list.hidden ? open() : close()));
    button.addEventListener('keydown', (e) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        open();
      }
    });
    list.addEventListener('click', (e) => {
      const li = e.target.closest('[role="option"]');
      if (li) choose(Number(li.dataset.index));
    });
    list.addEventListener('pointermove', (e) => {
      const li = e.target.closest('[role="option"]');
      if (li && Number(li.dataset.index) !== active) highlight(Number(li.dataset.index));
    });
    list.addEventListener('keydown', (e) => {
      const inBox = search && e.target === search;
      if (e.key === 'ArrowDown') move(1);
      else if (e.key === 'ArrowUp') move(-1);
      else if (e.key === 'Home' && !inBox) move(-Infinity);
      else if (e.key === 'End' && !inBox) move(Infinity);
      else if (e.key === 'PageDown') move(5);
      else if (e.key === 'PageUp') move(-5);
      else if (e.key === 'Enter' || (e.key === ' ' && !inBox)) {
        if (list.querySelector(`[data-index="${active}"]:not([hidden])`)) choose(active);
      } else if (inBox && e.key !== 'Escape' && e.key !== 'Tab')
        return; // typing in the box
      else if (e.key === 'Escape') close();
      else if (e.key === 'Tab') {
        close(false);
        return; // let Tab move on
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Typing jumps to the next option starting with the letters typed
        const now = Date.now();
        typed = now - typedAt < 700 ? typed + e.key.toLowerCase() : e.key.toLowerCase();
        typedAt = now;
        const opts = options();
        const from = typed.length > 1 ? active : active + 1;
        for (let n = 0; n < opts.length; n++) {
          const i = (from + n) % opts.length;
          if (opts[i].textContent.trim().toLowerCase().startsWith(typed)) {
            highlight(i);
            break;
          }
        }
      } else return;
      e.preventDefault();
    });
    list.addEventListener('focusout', (e) => {
      if (!wrap.contains(e.relatedTarget)) close(false);
    });
    // The select changed by its form, or its options replaced by code
    select.addEventListener('change', sync);
    select.form?.addEventListener('reset', () => setTimeout(sync));
    new MutationObserver(build).observe(select, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'hidden', 'data-icon', 'data-hint'],
    });

    // A value set in code fires no event: the select's own value and selectedIndex are watched
    // on this select, so the button follows whatever sets them
    for (const prop of ['value', 'selectedIndex']) {
      const native = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
      Object.defineProperty(select, prop, {
        configurable: true,
        get() {
          return native.get.call(this);
        },
        set(v) {
          native.set.call(this, v);
          sync();
        },
      });
    }

    build();
    const api = { sync, build, open, close };
    upgraded.set(select, api);
    return api;
  }

  function enhanceAll(root = document) {
    root.querySelectorAll('select[data-site-select]').forEach(enhance);
  }

  window.SiteSelect = {
    enhance,
    enhanceAll,
    /** After setting select.value in code: show it on the button. */
    sync(select) {
      upgraded.get(select)?.sync();
    },
  };

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => enhanceAll());
  else enhanceAll();
  document.addEventListener('turbo:load', () => enhanceAll());
  document.addEventListener('turbo:frame-render', () => enhanceAll());
  // Dropdowns a script adds later (an editor drawn on demand): upgraded as they arrive
  let pending = false;
  new MutationObserver((records) => {
    if (pending) return;
    if (!records.some((r) => [...r.addedNodes].some((n) => n.nodeType === 1))) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      enhanceAll();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
