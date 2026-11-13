// api/_command_text.js
// Translations for Discord's command picker (the descriptions and choices shown when typing
// /), added to a command list as Discord's *_localizations fields. Helpers, not an endpoint.
//
// The text is the bot_commands section of _data/<lang>/server.yml, matched by its English
// wording, so the command lists (.github/discord.json for the main servers, deployed by
// _scripts/deploy_commands.mjs; api/_bot_schema.js for alliance servers, pushed by
// /registerbot) keep their English as it is. Text with no translation stays English only.

// Discord's names for our languages (Spanish: Spain and Latin America).
const DISCORD_LOCALES = {
  de: ['de'],
  es: ['es-ES', 'es-419'],
  fr: ['fr'],
  it: ['it'],
  ru: ['ru'],
  tr: ['tr'],
  uk: ['uk'],
};
const MAX = 100; // Discord's limit for descriptions and choice names

/** { English text: { discord locale: translation } } from server.yml data by language. */
export function commandTranslations(byLang) {
  const english = byLang?.en?.bot_commands || {};
  const table = {};
  for (const [key, en] of Object.entries(english)) {
    const out = {};
    for (const [lang, locales] of Object.entries(DISCORD_LOCALES)) {
      const text = byLang?.[lang]?.bot_commands?.[key];
      if (typeof text !== 'string' || !text.trim() || text === en || text.length > MAX) continue;
      for (const locale of locales) out[locale] = text;
    }
    if (Object.keys(out).length) table[en] = out;
  }
  return table;
}

/** A copy of a Discord command list with description/name localizations added. */
export function localizeCommands(commands, byLang) {
  const table = commandTranslations(byLang);
  const walk = (items) =>
    (items || []).map((item) => {
      const copy = { ...item };
      if (table[item.description]) copy.description_localizations = table[item.description];
      if (item.options) copy.options = walk(item.options);
      if (item.choices) {
        copy.choices = item.choices.map((c) =>
          table[c.name] ? { ...c, name_localizations: table[c.name] } : c,
        );
      }
      return copy;
    });
  return walk(commands);
}
