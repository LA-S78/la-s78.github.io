// Copies the live data (GIST_ID) into the test Gist (TEST_GIST_ID) that dev.la-s78.app uses,
// so tests start from real data. Only reads the live Gist; only writes the test one.
// Run from GitHub: Actions -> "Copy live data to test Gist" -> Run workflow.
//
// The settings come from Vercel (the workflow downloads them with `vercel pull`):
// GIST_ID / GIST_TOKEN from Production, TEST_GIST_ID (and TEST_GIST_TOKEN, if any) from
// Preview. A GitHub secret of the same name, if set, is used instead.

import { existsSync, readFileSync } from 'fs';

/** Reads a dotenv file written by `vercel pull` (KEY="value" lines). */
function readEnvFile(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    out[m[1]] = value;
  }
  return out;
}

const live = readEnvFile(process.env.LIVE_ENV_FILE || '.vercel/live.env');
const preview = readEnvFile(process.env.TEST_ENV_FILE || '.vercel/test.env');
const pick = (name, from) => (process.env[name] || from[name] || '').trim();

const liveId = pick('GIST_ID', live);
const liveToken = pick('GIST_TOKEN', live);
const testId = pick('TEST_GIST_ID', preview);
const testToken = pick('TEST_GIST_TOKEN', preview) || liveToken;

const missing = [
  !liveId && 'GIST_ID (Vercel, Production)',
  !liveToken && 'GIST_TOKEN (Vercel, Production)',
  !testId && 'TEST_GIST_ID (Vercel, Preview)',
].filter(Boolean);
if (missing.length) {
  console.error(`❌ Missing: ${missing.join(', ')}.`);
  console.error(
    '   If it is set in Vercel but marked "Sensitive", Vercel never hands it out: add it as a GitHub secret of the same name instead.',
  );
  process.exit(1);
}
if (liveId === testId) {
  console.error('❌ TEST_GIST_ID is the live Gist. It must be a separate Gist.');
  process.exit(1);
}

const headers = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'LA-S78-Compendium',
});

const res = await fetch(`https://api.github.com/gists/${liveId}`, { headers: headers(liveToken) });
if (!res.ok) {
  console.error(`❌ Could not read the live Gist (${res.status}).`);
  process.exit(1);
}
const files = {};
for (const [name, file] of Object.entries((await res.json()).files || {})) {
  if (file.truncated) {
    console.error(`❌ ${name} is too large to copy this way.`);
    process.exit(1);
  }
  files[name] = { content: file.content };
}

const out = await fetch(`https://api.github.com/gists/${testId}`, {
  method: 'PATCH',
  headers: { ...headers(testToken), 'Content-Type': 'application/json' },
  body: JSON.stringify({
    description: `Test data, copied from the live data at ${new Date().toISOString()}`,
    files,
  }),
});
if (!out.ok) {
  console.error(`❌ Could not write the test Gist (${out.status}): ${await out.text()}`);
  process.exit(1);
}
console.log(`✅ Copied ${Object.keys(files).length} file(s): ${Object.keys(files).join(', ')}`);
