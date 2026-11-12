/**
 * js/i18n.js
 * The tools' text in the page's language, for scripts:
 *   t('dashboard.save')                       -> "Save" (or the translation)
 *   t('dashboard.saved_by', { name: 'Ana' })  -> fills {name}
 *   tn('dashboard.players', 3)                -> uses dashboard.players_one / players_other
 * The strings come from the page (<script id="tool-strings">, written by the layout from
 * _data/<lang>/tools.yml; see _plugins/tool_strings.rb). Anything not translated yet
 * falls back to English; a key with no English text shows the key itself.
 * Results are plain text: put them in the page with textContent, or through escapeHtml().
 */
(() => {
  let source = null;
  let data = { lang: 'en', en: {}, t: {} };
  // Read again after a page change (Turbo replaces the page, and with it the strings).
  const strings = () => {
    const el = document.getElementById('tool-strings');
    if (el && el !== source) {
      source = el;
      try {
        data = JSON.parse(el.textContent);
      } catch (e) {
        data = { lang: 'en', en: {}, t: {} };
      }
    }
    return data;
  };
  const find = (tree, key) =>
    key
      .split('.')
      .reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), tree);
  const fill = (text, vars) =>
    text.replace(/\{([a-z_][a-z0-9_]*)\}/gi, (whole, name) =>
      vars && vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : whole,
    );

  function t(key, vars) {
    const d = strings();
    let text = find(d.t, key);
    if (typeof text !== 'string') text = find(d.en, key);
    if (typeof text !== 'string') {
      console.warn(`No text for "${key}" (_data/en/tools.yml)`);
      return key;
    }
    return fill(text, vars);
  }

  /**
   * Singular or plural ({n} is filled in): the language's own form for n (e.g. Russian and
   * Ukrainian key_few for 2–4), else key_other, else key_one for 1.
   */
  function tn(key, n, vars) {
    const d = strings();
    let form = Number(n) === 1 ? 'one' : 'other';
    try {
      form = new Intl.PluralRules(d.lang || 'en').select(Number(n));
    } catch (e) {
      // older browser: one/other only
    }
    const has = (k) => typeof find(d.t, k) === 'string' || typeof find(d.en, k) === 'string';
    const pick = [`${key}_${form}`, Number(n) === 1 ? `${key}_one` : `${key}_other`, `${key}_other`].find(has);
    return t(pick || `${key}_other`, { n, ...vars });
  }

  /**
   * As t(), but as HTML: the text is escaped, then `html` pieces (already safe HTML, e.g.
   * a <strong> or a countdown <span>) go into their {placeholders}, wherever the
   * translation puts them. th('rewards_card.time_left', { time: '<span>3h</span>' })
   */
  function th(key, html = {}, vars = {}) {
    const marks = {};
    Object.keys(html).forEach((name, i) => {
      marks[name] = `\u0001${i}\u0001`;
    });
    let out = window.escapeHtml(t(key, { ...vars, ...marks }));
    Object.keys(html).forEach((name, i) => {
      out = out.split(`\u0001${i}\u0001`).join(html[name]);
    });
    return out;
  }

  /** The page's language code, e.g. for dates and numbers. */
  const lang = () => strings().lang || 'en';

  window.t = t;
  window.tn = tn;
  window.th = th;
  window.i18nLang = lang;
})();
