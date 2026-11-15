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
 *
 * Options added or replaced later (select.innerHTML = …) are picked up automatically. After
 * setting select.value in code (which fires no event), call SiteSelect.sync(select) so the
 * button shows it. Keyboard: arrows, Home/End, typing a letter, Enter/Space to pick, Escape
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

    // Its name: the <label for>, else the select's aria-label
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label) {
      if (!label.id) label.id = `${id}-label`;
      button.setAttribute('aria-labelledby', `${label.id} ${button.id}`);
      list.setAttribute('aria-labelledby', label.id);
      label.addEventListener('click', (e) => {
        e.preventDefault();
        button.focus();
      });
    } else if (select.getAttribute('aria-label')) {
      button.setAttribute('aria-label', select.getAttribute('aria-label'));
      list.setAttribute('aria-label', select.getAttribute('aria-label'));
    }

    let active = -1; // the highlighted option while open
    let typed = '';
    let typedAt = 0;
    const options = () => [...select.options].filter((o) => !o.hidden);

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
      sync();
    }
    function item(o, i) {
      return `<li class="site-select-option${o.disabled ? ' is-disabled' : ''}" role="option" id="${id}-opt-${i}" data-index="${i}" aria-selected="false"${o.disabled ? ' aria-disabled="true"' : ''}>${content(o)}</li>`;
    }
    function sync() {
      const chosen = select.options[select.selectedIndex];
      button.innerHTML = `<span class="site-select-value">${chosen ? content(chosen) : ''}</span><svg class="site-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>`;
      button.disabled = select.disabled;
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
      items[active].scrollIntoView({ block: 'nearest' });
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
      list.focus({ preventScroll: true });
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
      const count = list.querySelectorAll('[role="option"]').length;
      if (e.key === 'ArrowDown') highlight(active + 1);
      else if (e.key === 'ArrowUp') highlight(active - 1);
      else if (e.key === 'Home') highlight(0);
      else if (e.key === 'End') highlight(count - 1);
      else if (e.key === 'PageDown') highlight(active + 5);
      else if (e.key === 'PageUp') highlight(active - 5);
      else if (e.key === 'Enter' || e.key === ' ') choose(active);
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
})();
