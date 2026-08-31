const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const DATA_DIR = path.resolve(__dirname, '../_data');
const OUTPUT_FILE = path.resolve(__dirname, '_generated_translations.js');

const SUPPORTED_LOCALES = ['en', 'es', 'de', 'fr', 'ru', 'it', 'tr', 'uk'];

const rulesByLang = {};
const sbByLang = {};
const botByLang = {};

SUPPORTED_LOCALES.forEach((lang) => {
  // 1. Rules
  const rulesPath = path.join(DATA_DIR, lang, 'rules.yml');
  if (fs.existsSync(rulesPath)) {
    try { rulesByLang[lang] = yaml.load(fs.readFileSync(rulesPath, 'utf8')); } catch (e) {}
  }

  // 2. Survival Battle
  const sbPath = path.join(DATA_DIR, lang, 'survival_battle.yml');
  if (fs.existsSync(sbPath)) {
    try { sbByLang[lang] = yaml.load(fs.readFileSync(sbPath, 'utf8')); } catch (e) {}
  }

  // 3. Bot UI Strings
  const botPath = path.join(DATA_DIR, lang, 'bot.yml');
  if (fs.existsSync(botPath)) {
    try { botByLang[lang] = yaml.load(fs.readFileSync(botPath, 'utf8')); } catch (e) {
      console.warn(`⚠️ Failed to parse ${botPath}:`, e.message);
    }
  }
});

const fileContent = `/**
 * AUTO-GENERATED AT BUILD TIME FROM _data/
 * DO NOT EDIT MANUALLY.
 */
export const RULES_DATA = ${JSON.stringify(rulesByLang, null, 2)};
export const SB_DATA = ${JSON.stringify(sbByLang, null, 2)};
export const BOT_DATA = ${JSON.stringify(botByLang, null, 2)};
`;

fs.writeFileSync(OUTPUT_FILE, fileContent, 'utf8');
console.log(`✅ Build-time translations successfully generated at ${OUTPUT_FILE}`);