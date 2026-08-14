const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

console.log("🚀 STARTING TRANSLATION BUILD SCRIPT...");

// 1. Find the _data directory securely
const possibleDataDirs = [
  path.resolve(__dirname, '../_data'),
  path.join(process.cwd(), '_data')
];

let DATA_DIR = null;
for (const dir of possibleDataDirs) {
  if (fs.existsSync(dir)) {
    DATA_DIR = dir;
    console.log(`✅ Found _data directory at: ${DATA_DIR}`);
    break;
  }
}

// 2. Force a build failure if the folder is missing, so Vercel alerts us immediately
if (!DATA_DIR) {
  console.error("❌ CRITICAL ERROR: Could not find _data directory! Checked paths:");
  console.error(possibleDataDirs);
  process.exit(1); 
}

const OUTPUT_FILE = path.resolve(__dirname, '_generated_translations.js');
const SUPPORTED_LOCALES = ['en', 'es', 'de', 'fr', 'ru', 'it', 'tr', 'uk'];

const rulesByLang = {};
const sbByLang = {};

// 3. Parse the YAML files
SUPPORTED_LOCALES.forEach((lang) => {
  const rulesPath = path.join(DATA_DIR, lang, 'rules.yml');
  if (fs.existsSync(rulesPath)) {
    try {
      rulesByLang[lang] = yaml.load(fs.readFileSync(rulesPath, 'utf8'));
      console.log(`  ➔ Parsed ${lang}/rules.yml`);
    } catch (e) {
      console.warn(`  ⚠️ Failed to parse ${rulesPath}:`, e.message);
    }
  }

  const sbPath = path.join(DATA_DIR, lang, 'survival_battle.yml');
  if (fs.existsSync(sbPath)) {
    try {
      sbByLang[lang] = yaml.load(fs.readFileSync(sbPath, 'utf8'));
      console.log(`  ➔ Parsed ${lang}/survival_battle.yml`);
    } catch (e) {
      console.warn(`  ⚠️ Failed to parse ${sbPath}:`, e.message);
    }
  }
});

// 4. Write the file
const fileContent = `/**
 * AUTO-GENERATED AT BUILD TIME FROM _data/
 * DO NOT EDIT MANUALLY.
 */
export const RULES_DATA = ${JSON.stringify(rulesByLang, null, 2)};
export const SB_DATA = ${JSON.stringify(sbByLang, null, 2)};
`;

fs.writeFileSync(OUTPUT_FILE, fileContent, 'utf8');
console.log(`✅ Build-time translations successfully written to ${OUTPUT_FILE}`);