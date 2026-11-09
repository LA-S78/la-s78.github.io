// api/_gist.js
// Shared access to the GitHub Gist that stores the site's live data
// (map-state.json, rewards-data.json, rewards-nominations.json, calendar-state.json).
// Files starting with "_" in api/ are helpers, not public endpoints.

const GIST_API = 'https://api.github.com/gists';
const USER_AGENT = 'LA-S78-Compendium';

function gistConfig() {
  return { id: process.env.GIST_ID, token: process.env.GIST_TOKEN };
}

/** True when the GIST_ID and GIST_TOKEN environment variables are both set. */
export function isGistConfigured() {
  const { id, token } = gistConfig();
  return Boolean(id && token);
}

function headers(token, extra = {}) {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': USER_AGENT,
    ...extra
  };
}

/**
 * Downloads the whole Gist (all files) in one request.
 * @param {object} [options]
 * @param {number} [options.timeoutMs] abort after this many ms (Discord replies must finish within 3 s)
 * @returns {Promise<object>} the GitHub Gist API response
 * @throws {Error} "GitHub Gist error (<status>)" (with `.status` set) when GitHub answers with an error
 */
export async function readGist({ timeoutMs } = {}) {
  const { id, token } = gistConfig();
  const res = await fetch(`${GIST_API}/${id}`, {
    headers: headers(token),
    cache: 'no-store',
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {})
  });
  if (!res.ok) {
    const err = new Error(`GitHub Gist error (${res.status})`);
    err.status = res.status; // lets callers tell a GitHub error from a network failure
    throw err;
  }
  return res.json();
}

/**
 * Parses one JSON file from a Gist returned by readGist().
 * Returns `fallback` when the file is missing or empty.
 */
export function gistJson(gist, filename, fallback = {}) {
  const content = gist?.files?.[filename]?.content;
  return content ? JSON.parse(content) : fallback;
}

/**
 * Saves one or more JSON files to the Gist in a single request (so they change together).
 * @param {Object<string, object>} files e.g. { 'map-state.json': state }
 * @param {object} [options]
 * @param {string} [options.description] Gist description, shown in its revision history
 * @param {number} [options.timeoutMs]
 * @throws {Error} "GitHub Gist update failed (<status>)" (with `.status` set) when GitHub rejects the update
 */
export async function writeGist(files, { description, timeoutMs } = {}) {
  const { id, token } = gistConfig();
  const body = { files: {} };
  if (description) body.description = description;
  for (const [name, data] of Object.entries(files)) {
    body.files[name] = { content: JSON.stringify(data, null, 2) };
  }

  const res = await fetch(`${GIST_API}/${id}`, {
    method: 'PATCH',
    headers: headers(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {})
  });
  if (!res.ok) {
    const err = new Error(`GitHub Gist update failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json().catch(() => ({}));
}
