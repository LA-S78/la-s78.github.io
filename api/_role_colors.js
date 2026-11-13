// api/_role_colors.js
// Each alliance's colour from its NAP role in Discord ("_" files are helpers, not endpoints).
// This is the colour the Alliance page and the map show first, so the server uses it too
// (sanitizeAlliances in _alliances.js): the calendar, the dashboard and every page reading
// /api/state then show the same colour.

import { ALLIANCE_ROLE_SETTINGS } from './_alliances.js';

const TTL_MS = 10 * 60 * 1000; // role colours rarely change; Discord limits how often we ask
const TIMEOUT_MS = 2500; // a slow Discord must not hold up the page's data
let cache = { at: 0, colors: null };

/** A colour too dark to read as text on the site's dark surfaces (perceived brightness < 15%). */
export function tooDark(rgb) {
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.15;
}

/**
 * { tag: '#rrggbb' } for every alliance whose role (DISCORD_<name>, listed in role_settings)
 * is found in the NAP server and has a readable colour (a role without a colour, or a
 * near-black one, is left out, so the alliance keeps its site or default colour). Kept for 10 minutes. Never throws: without a bot token, or if Discord fails,
 * it returns the last known colours (or {}), and alliances keep their stored colours.
 */
export async function getRoleColors({
  env = process.env,
  fetchImpl = fetch,
  now = Date.now(),
} = {}) {
  if (cache.colors && now - cache.at < TTL_MS) return cache.colors;
  const token = env.DISCORD_BOT_TOKEN || env.BOT_TOKEN;
  const guild = env.DISCORD_GUILD_ID || env.GUILD_ID;
  if (!token || !guild) return cache.colors || {};
  try {
    const res = await fetchImpl(`https://discord.com/api/v10/guilds/${guild}/roles`, {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Discord returned HTTP ${res.status}`);
    const roles = new Map((await res.json()).map((r) => [r.id, r.color]));
    const colors = {};
    for (const [tag, name] of Object.entries(ALLIANCE_ROLE_SETTINGS)) {
      const roleId = String(env[`DISCORD_${name}`] || '').trim();
      const raw = roleId ? roles.get(roleId) : undefined;
      if (raw === undefined) continue;
      // No colour set (0) or too dark to read on the dark pages: leave it to the site's own
      // colour or the default (maintainer review).
      if (!raw || tooDark(raw)) continue;
      colors[tag] = `#${raw.toString(16).padStart(6, '0')}`;
    }
    cache = { at: now, colors };
    return colors;
  } catch (err) {
    console.warn('Could not read the alliance role colours from Discord:', err.message);
    return cache.colors || {};
  }
}

/** For tests: forget the cached colours. */
export function clearRoleColorCache() {
  cache = { at: 0, colors: null };
}
