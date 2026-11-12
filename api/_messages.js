// api/_messages.js
// Messages the server sends to the site's pages and the Discord bot's replies, in the
// reader's language
// ("_" files are helpers, not endpoints).
//
// The English text is in _data/en/server.yml; _scripts/translate_sections.rb translates it,
// and the build bundles every language into api/_generated_translations.js (SERVER_DATA).
//
//   export default (req, res) => inLanguage(req, () => handler(req, res));   // an endpoint
//   return res.status(400).json({ error: say('api_dashboard.signed_out') });    // anywhere below
//
// The language comes from the page (js/i18n.js adds an X-Site-Lang header to the site's own
// /api/ requests), else the browser's Accept-Language, else English. The Discord bot uses
// the user's Discord language (inLocale, api/interactions.js). Code running outside either
// (tests, scheduled jobs) gets English. Technical messages for administrators
// (server set-up, raw Discord errors) stay in English and don't use this.

import { AsyncLocalStorage } from 'node:async_hooks';
import { SERVER_DATA } from './_generated_translations.js';

export const LANGUAGES = ['en', 'de', 'es', 'fr', 'it', 'ru', 'tr', 'uk'];
const current = new AsyncLocalStorage();

/** The language a request asks for: X-Site-Lang, then Accept-Language, then English. */
export function requestLanguage(req = {}) {
  const headers = req.headers || {};
  const asked = String(headers['x-site-lang'] || req.query?.lang || '').toLowerCase();
  if (LANGUAGES.includes(asked)) return asked;
  for (const part of String(headers['accept-language'] || '').split(',')) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (LANGUAGES.includes(code)) return code;
  }
  return 'en';
}

/** Runs `fn` with the request's language, so say() below answers in it. */
export function inLanguage(req, fn) {
  return current.run(requestLanguage(req), fn);
}

/** Runs `fn` in a given language (the Discord bot: the user's Discord language). */
export function inLocale(lang, fn) {
  return current.run(LANGUAGES.includes(lang) ? lang : 'en', fn);
}

/** The language of the request being handled ('en' outside one). */
export function language() {
  return current.getStore() || 'en';
}

const findIn = (tree, key) =>
  key
    .split('.')
    .reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), tree);
const find = (lang, key) => findIn(SERVER_DATA?.[lang], key);

/** A message in the current request's language (English if not translated yet), {vars} filled in. */
export function say(key, vars = {}) {
  const lang = language();
  let text = find(lang, key);
  if (typeof text !== 'string') text = find('en', key);
  if (typeof text !== 'string') return key;
  return text.replace(/\{([a-z_][a-z0-9_]*)\}/gi, (whole, name) =>
    vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : whole,
  );
}

/**
 * A message that depends on a number: key_one / key_few / key_other (as in js/i18n.js tn()),
 * chosen by the language's plural rules; {count} is filled in.
 */
export function sayCount(key, count, vars = {}) {
  const lang = language();
  const form = new Intl.PluralRules(lang).select(count);
  const has = (k) => typeof find(lang, k) === 'string' || typeof find('en', k) === 'string';
  const pick = [`${key}_${form}`, `${key}_other`, `${key}_one`].find(has) || `${key}_other`;
  return say(pick, { count, ...vars });
}

/** A date and time in UTC for messages: as before in English, in the reader's style otherwise. */
export function utcTime(ms) {
  const d = new Date(ms);
  const lang = language();
  if (lang === 'en') return d.toUTCString();
  return `${d.toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`;
}
