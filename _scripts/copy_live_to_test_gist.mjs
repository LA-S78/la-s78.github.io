// Copies the live data (GIST_ID) into the test Gist (TEST_GIST_ID) that dev.la-s78.app uses,
// so tests start from real data. Only reads the live Gist; only writes the test one.
// Run from GitHub: Actions -> "Copy live data to test Gist" -> Run workflow.

const live = process.env.GIST_ID;
const test = process.env.TEST_GIST_ID;
const liveToken = process.env.GIST_TOKEN;
const testToken = process.env.TEST_GIST_TOKEN || liveToken;

if (!live || !test || !liveToken) {
  console.error('❌ Needs the GIST_ID, GIST_TOKEN and TEST_GIST_ID secrets.');
  process.exit(1);
}
if (live.trim() === test.trim()) {
  console.error('❌ TEST_GIST_ID is the live Gist. It must be a separate Gist.');
  process.exit(1);
}

const headers = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'LA-S78-Compendium',
});

const res = await fetch(`https://api.github.com/gists/${live}`, { headers: headers(liveToken) });
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

const out = await fetch(`https://api.github.com/gists/${test}`, {
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
