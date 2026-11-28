// api/_guild_roles.js
// The Discord roles a calendar reminder can ping, for the event form's "a specific role"
// and an alliance's opt-in to a server-wide event (owner, 2026-11-28: pick a role, don't
// paste its ID). Alliance events ping roles in the alliance's own registered server; server-
// wide events, roles in the NAP server. Helpers, not an endpoint.

import { findTag } from './_alliances.js';

const TIMEOUT_MS = 3000;

/** The Discord server a scope's reminders go to: the NAP server ('global') or the alliance's. */
export function roleServerFor(scope, alliances = {}, env = process.env) {
  if (String(scope || '').toLowerCase() === 'global') {
    return (env.DISCORD_GUILD_ID_NAP || env.DISCORD_GUILD_ID || '').trim() || null;
  }
  const tag = findTag(Object.keys(alliances || {}), scope);
  const own = tag && alliances[tag]?.guild_id ? String(alliances[tag].guild_id).trim() : '';
  if (own) return own;
  // WLO's server is set on the deployment rather than registered (api/_bot_roles.js)
  const wlo = (env.DISCORD_GUILD_ID_WLO || env.DISCORD_WLO || '').trim();
  return String(scope).toUpperCase() === 'WLO' && wlo ? wlo : null;
}

/**
 * The server's roles a reminder can ping, highest first: [{ id, name, color }]. Left out:
 * @everyone (a choice of its own) and roles that belong to bots or integrations.
 */
export async function listGuildRoles(
  guildId,
  { token = process.env.DISCORD_BOT_TOKEN, fetchImpl = fetch } = {},
) {
  const res = await fetchImpl(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = new Error(`Discord returned HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return (await res.json())
    .filter((r) => r && r.id !== guildId && !r.managed && String(r.name || '').trim())
    .sort((a, b) => (b.position || 0) - (a.position || 0))
    .map((r) => ({
      id: String(r.id),
      name: String(r.name).trim(),
      color: r.color ? `#${Number(r.color).toString(16).padStart(6, '0')}` : null,
    }));
}
