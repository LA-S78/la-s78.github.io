const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

console.log("🚀 STARTING TRANSLATION BUILD SCRIPT...");

const rootDir = process.cwd();
const apiDir = __dirname;

// X-RAY VISION: Print exactly what Vercel sees on the hard drive
console.log("👀 WHAT VERCEL SEES IN ROOT DIRECTORY (/vercel/path0/):");
try {
  console.log(fs.readdirSync(rootDir));
} catch (e) {
  console.log("Could not read root directory:", e.message);
}

// 1. Find the _data directory securely
const possibleDataDirs = [
  path.resolve(__dirname, '../_data'),
  path.join(rootDir, '_data')
];

let DATA_DIR = null;
for (const dir of possibleDataDirs) {
  if (fs.existsSync(dir)) {
    DATA_DIR = dir;
    console.log(`✅ Found _data directory at: ${DATA_DIR}`);
    break;
  }
}

// 2. Force a build failure if missing
if (!DATA_DIR) {
  console.error("❌ CRITICAL ERROR: Could not find _data directory!");
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
    } catch (e) {}
  }
  const sbPath = path.join(DATA_DIR, lang, 'survival_battle.yml');
  if (fs.existsSync(sbPath)) {
    try {
      sbByLang[lang] = yaml.load(fs.readFileSync(sbPath, 'utf8'));
    } catch (e) {}
  }
});

// 4. Write the file
const fileContent = `/**
 * AUTO-GENERATED AT BUILD TIME
 */
export const RULES_DATA = ${JSON.stringify(rulesByLang, null, 2)};
export const SB_DATA = ${JSON.stringify(sbByLang, null, 2)};
`;

fs.writeFileSync(OUTPUT_FILE, fileContent, 'utf8');
console.log(`✅ Build-time translations successfully written!`);