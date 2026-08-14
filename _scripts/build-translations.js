// _scripts/build-translations.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const DATA_DIR = path.join(process.cwd(), '_data');
const OUTPUT_FILE = path.join(process.cwd(), 'api', '_generated_translations.js');

const SUPPORTED_LOCALES = ['en', 'es', 'de', 'fr', 'ru', 'it', 'tr', 'uk'];

const rulesByLang = {};
const sbByLang = {};

SUPPORTED_LOCALES.forEach((lang) => {
  // 1. Parse rules.yml
  const rulesPath = path.join(DATA_DIR, lang, 'rules.yml');
  if (fs.existsSync(rulesPath)) {
    try {
      rulesByLang[lang] = yaml.load(fs.readFileSync(rulesPath, 'utf8'));
    } catch (e) {
      console.warn(`Failed to parse ${rulesPath}:`, e.message);
    }
  }

  // 2. Parse survival_battle.yml
  const sbPath = path.join(DATA_DIR, lang, 'survival_battle.yml');
  if (fs.existsSync(sbPath)) {
    try {
      sbByLang[lang] = yaml.load(fs.readFileSync(sbPath, 'utf8'));
    } catch (e) {
      console.warn(`Failed to parse ${sbPath}:`, e.message);
    }
  }
});

const fileContent = `/**
 * AUTO-GENERATED AT BUILD TIME FROM _data/
 * DO NOT EDIT MANUALLY.
 */

export const RULES_DATA = ${JSON.stringify(rulesByLang, null, 2)};
export const SB_DATA = ${JSON.stringify(sbByLang, null, 2)};
`;

fs.writeFileSync(OUTPUT_FILE, fileContent, 'utf8');
console.log(`✅ Build-time translations generated at ${OUTPUT_FILE}`);