// api/_register_checks.js
// Checks an alliance's Discord server before /registerbot's portal links it to the site
// (api/register-alliance.js): the bot is in it, the person registering may manage it, and
// the channels and role they typed really are in it. Helpers, not an endpoint.

import { matchesRoleKeyword } from './_officer_roles.js';
import { say } from './_messages.js';

const DISCORD_API = 'https://discord.com/api/v10';
const ADMINISTRATOR = 0x8n;
const MANAGE_GUILD = 0x20n;

/**
 * May this member manage the server? The owner, or a role (including @everyone, whose id is
 * the server's id) with Administrator or Manage Server.
 */
export function canManageServer(guild, memberRoleIds = []) {
  if (!guild) return false;
  const roles = Array.isArray(guild.roles) ? guild.roles : [];
  let bits = 0n;
  for (const role of roles) {
    if (role.id === guild.id || memberRoleIds.includes(role.id)) {
      try {
        bits |= BigInt(role.permissions || '0');
      } catch {
        /* a malformed value grants nothing */
      }
    }
  }
  return (bits & ADMINISTRATOR) !== 0n || (bits & MANAGE_GUILD) !== 0n;
}

/**
 * The server's own check: the bot is in it and the person registering may manage it
 * (Stewards may register on an alliance's behalf). Shared by the registration and the
 * portal's channel and role lists.
 * @returns {Promise<{ ok: true, guild: object, get: Function }
 *   | { ok: false, status: number, error: string }>}
 */
export async function checkServerAccess({ guildId, uid, steward = false, botToken }) {
  const get = (path) =>
    fetch(`${DISCORD_API}${path}`, {
      headers: { Authorization: `Bot ${botToken}` },
      signal: AbortSignal.timeout(5000),
    });
  const fail = (status, error) => ({ ok: false, status, error });

  // The bot is in the server (the server, with its roles, is only visible to the bot then)
  const guildRes = await get(`/guilds/${guildId}`);
  if (guildRes.status === 403 || guildRes.status === 404) {
    return fail(400, say('api_register.bot_not_in_server'));
  }
  if (!guildRes.ok)
    return fail(502, say('api_register.server_check_failed', { status: guildRes.status }));
  const guild = await guildRes.json();

  // The person registering may manage it (Stewards may register on an alliance's behalf)
  if (!steward) {
    if (!uid) {
      return fail(403, say('api_register.old_link'));
    }
    const isOwner = guild.owner_id && guild.owner_id === uid;
    if (!isOwner) {
      const memberRes = await get(`/guilds/${guildId}/members/${uid}`);
      if (memberRes.status === 404) {
        return fail(403, say('api_register.not_member', { server: guild.name }));
      }
      if (!memberRes.ok) {
        return fail(502, say('api_register.roles_check_failed', { status: memberRes.status }));
      }
      const member = await memberRes.json();
      if (!canManageServer(guild, member.roles || [])) {
        return fail(403, say('api_register.needs_manage', { server: guild.name }));
      }
    }
  }
  return { ok: true, guild, get };
}

const POSTABLE = new Set([0, 5]); // text and announcement channels

/**
 * What the portal offers to pick from (owner, 2026-11-28: pick, don't paste IDs): the
 * server's text channels in Discord's order, under their category, and its roles, highest
 * first, leaving out @everyone and roles that belong to bots or integrations.
 */
export function serverChoices(guild, channels = []) {
  const list = Array.isArray(channels) ? channels : [];
  const categories = new Map(list.filter((c) => c.type === 4).map((c) => [c.id, c]));
  const catPos = (c) => {
    const cat = categories.get(c.parent_id);
    return cat ? cat.position || 0 : -1; // channels outside a category come first, as in Discord
  };
  const outChannels = list
    .filter((c) => POSTABLE.has(c.type))
    .sort(
      (a, b) =>
        catPos(a) - catPos(b) ||
        String(a.parent_id || '').localeCompare(String(b.parent_id || '')) ||
        (a.position || 0) - (b.position || 0),
    )
    .map((c) => ({
      id: String(c.id),
      name: String(c.name || ''),
      category: categories.get(c.parent_id)?.name || null,
    }));
  const roles = (Array.isArray(guild?.roles) ? guild.roles : [])
    .filter((r) => r && r.id !== guild.id && !r.managed && String(r.name || '').trim())
    .sort((a, b) => (b.position || 0) - (a.position || 0))
    .map((r) => ({
      id: String(r.id),
      name: String(r.name).trim(),
      color: r.color ? `#${Number(r.color).toString(16).padStart(6, '0')}` : null,
    }));
  return { serverName: guild?.name || '', channels: outChannels, roles };
}

/**
 * Checks the target server for a registration.
 * @param {object} p
 * @param {string} p.guildId the server to link
 * @param {string|null} p.uid Discord id of the person registering (from the /registerbot link)
 * @param {boolean} p.steward a Steward registering on an alliance's behalf (no admin check)
 * @param {string} p.alertChannelId
 * @param {string} p.officerChannelId
 * @param {string|null} p.alertRoleId
 * @param {string[]} p.delegatedRoles role names (lower case)
 * @param {string} p.botToken
 * @returns {Promise<{ ok: true, warnings: string[], serverName: string }
 *   | { ok: false, status: number, error: string }>}
 */
export async function checkTargetServer({
  guildId,
  uid,
  steward = false,
  alertChannelId,
  officerChannelId,
  alertRoleId = null,
  delegatedRoles = [],
  botToken,
}) {
  const fail = (status, error) => ({ ok: false, status, error });
  const access = await checkServerAccess({ guildId, uid, steward, botToken });
  if (!access.ok) return access;
  const { guild, get } = access;

  // The channels and role typed are in this server
  const channelsRes = await get(`/guilds/${guildId}/channels`);
  if (!channelsRes.ok) {
    return fail(502, say('api_register.channels_check_failed', { status: channelsRes.status }));
  }
  const channels = await channelsRes.json();
  const channelIds = new Set((Array.isArray(channels) ? channels : []).map((c) => c.id));
  if (!channelIds.has(alertChannelId)) {
    return fail(
      400,
      say('api_register.alert_channel_missing', { id: alertChannelId, server: guild.name }),
    );
  }
  if (officerChannelId && !channelIds.has(officerChannelId)) {
    return fail(
      400,
      say('api_register.officer_channel_missing', { id: officerChannelId, server: guild.name }),
    );
  }
  const roles = Array.isArray(guild.roles) ? guild.roles : [];
  if (alertRoleId && !roles.some((r) => r.id === alertRoleId)) {
    return fail(
      400,
      say('api_register.alert_role_missing', { id: alertRoleId, server: guild.name }),
    );
  }

  // Delegated role names that match no role: saved anyway (the role may be made later)
  const warnings = delegatedRoles
    .filter((name) => !roles.some((r) => matchesRoleKeyword(r.name, name)))
    .map((name) => say('api_register.role_not_found', { server: guild.name, role: name }));

  return { ok: true, warnings, serverName: guild.name || '' };
}
