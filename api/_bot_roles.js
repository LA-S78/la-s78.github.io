// api/_bot_roles.js
// A member's alliance and leadership, from their Discord roles (NAP server or the alliance's own server).
// Split out of api/interactions.js unchanged.

import { leadershipRoles, matchesRoleKeyword } from './_officer_roles.js';
import { findTag } from './_alliances.js';

export const roleCacheMap = new Map();

export async function getGuildRoleMap(guildId, botToken, memberRoleIds = []) {
  const now = Date.now();
  const cached = roleCacheMap.get(guildId);

  if (cached && now - cached.timestamp < 3 * 60 * 1000) {
    const hasUnknownRole = memberRoleIds.some((id) => !cached.map.has(id));
    if (!hasUnknownRole) {
      return cached.map;
    }
  }

  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${botToken}` },
    signal: AbortSignal.timeout(2200),
  });

  if (!res.ok) throw new Error(`Discord API roles error (${res.status})`);

  const roles = await res.json();
  const map = new Map();
  // Names as written: letter case tells alliance roles apart (RâvN and RÂVN)
  roles.forEach((r) => map.set(r.id, String(r.name || '').trim()));

  roleCacheMap.set(guildId, {
    map,
    timestamp: now,
  });

  return map;
}

/**
 * Unified resolver for member alliance affiliation & leadership authorization
 * Works across both Dedicated Alliance Servers and the central NAP Server.
 */
export async function resolveMemberAllianceContext({ guildId, member, alliances = {}, botToken }) {
  const napGuildId = (
    process.env.DISCORD_GUILD_ID_NAP ||
    process.env.DISCORD_GUILD_ID ||
    ''
  ).trim();
  const wloGuildId = (process.env.DISCORD_GUILD_ID_WLO || process.env.DISCORD_WLO || '').trim();

  const memberRoleIds = member?.roles || [];
  let memberRoleNames = [];
  let roleNamesAsWritten = [];

  if (guildId && botToken && memberRoleIds.length > 0) {
    try {
      const roleMap = await getGuildRoleMap(guildId, botToken, memberRoleIds);
      roleNamesAsWritten = memberRoleIds.map((id) => roleMap.get(id)).filter(Boolean);
      memberRoleNames = roleNamesAsWritten.map((n) => n.toLowerCase());
    } catch (err) {
      console.warn('Role map lookup failed:', err.message);
    }
  }

  let detectedTag = null;
  let allianceData = null;
  let isDedicatedServer = false;

  // 1. Check if executed inside a registered Alliance Discord Server
  const registeredEntry = Object.entries(alliances).find(
    ([_, data]) => data?.guild_id && String(data.guild_id).trim() === guildId,
  );

  if (registeredEntry) {
    detectedTag = registeredEntry[0];
    allianceData = registeredEntry[1];
    isDedicatedServer = true;
  } else if (wloGuildId && guildId === wloGuildId) {
    detectedTag = 'WLO';
    allianceData = alliances['WLO'] || {
      guild_id: wloGuildId,
      delegated_roles: ['hr', 'officer'],
    };
    isDedicatedServer = true;
  }

  // 2. If in the NAP Server (or another shared server), match via Alliance Tag Role
  if (!detectedTag && (!napGuildId || guildId === napGuildId)) {
    const knownTags = Object.keys(alliances);
    // A role named after the tag (also @TAG or [TAG]): findTag, so a RâvN role means RâvN,
    // not RÂVN
    detectedTag =
      roleNamesAsWritten
        .map((r) => findTag(knownTags, r.replace(/^@/, '').replace(/^\[(.*)\]$/, '$1')))
        .find(Boolean) || null;

    if (detectedTag) {
      allianceData = alliances[detectedTag];
    }
  }

  const isR5 = memberRoleNames.some(
    (r) => r === 'r5' || r === '@r5' || matchesRoleKeyword(r, 'r5'),
  );
  const isGuildAdmin = (BigInt(member?.permissions || '0') & 8n) === 8n;
  const allowedRoles = leadershipRoles(allianceData);

  const hasDelegatedLeadership =
    isGuildAdmin ||
    memberRoleNames.some((roleName) => allowedRoles.some((kw) => matchesRoleKeyword(roleName, kw)));

  return {
    detectedTag,
    allianceData,
    isDedicatedServer,
    memberRoleNames,
    isR5,
    isGuildAdmin,
    allowedRoles,
    hasDelegatedLeadership,
  };
}
