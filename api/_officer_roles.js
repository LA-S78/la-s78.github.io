// Officer roles an alliance named with /registerbot (e.g. "hr", "officer"), held in the
// alliance's own Discord server. The bot treats them like R4 for its commands
// (resolveMemberAllianceContext in interactions.js); the website login uses the same rule
// here, so an officer also gets R4 access on the site.

/** Default officer roles when an alliance hasn't chosen its own (same as the bot). */
const DEFAULT_OFFICER_ROLES = ['hr', 'officer', 'leader'];
/** Discord's Administrator permission bit. */
const ADMINISTRATOR = 8n;

/**
 * True if a Discord role name matches a keyword: the whole name, or a word in it
 * ("Officer", "[WLO] officer", "war-officer"). Ignores letter case and @ [ ].
 */
export function matchesRoleKeyword(roleName, keyword) {
  if (!roleName || !keyword) return false;
  const cleanRole = roleName
    .toLowerCase()
    .replace(/[@\[\]]/g, ' ')
    .trim();
  const cleanKey = keyword
    .toLowerCase()
    .replace(/[@\[\]]/g, ' ')
    .trim();
  if (cleanRole === cleanKey) return true;
  const regex = new RegExp(`(^|\\s|_|-)${cleanKey}(\\s|_|-|$)`, 'i');
  return regex.test(cleanRole);
}

/**
 * The roles that count as leadership in an alliance's own server: R5 plus its officer roles.
 * @param {object|null} allianceData the alliance's record in map-state.json
 */
export function leadershipRoles(allianceData) {
  return ['r5', ...(allianceData?.delegated_roles || DEFAULT_OFFICER_ROLES)];
}

/**
 * The alliance's record and own server, if it has one: registered with /registerbot, or
 * WLO's server from the environment (as in the bot).
 */
function allianceServer(alliance, alliances = {}) {
  const key = Object.keys(alliances).find(
    (k) => k.toLowerCase() === String(alliance).toLowerCase(),
  );
  const record = key ? alliances[key] : null;
  if (record?.guild_id) return { guildId: String(record.guild_id).trim(), record };
  const wloGuildId = (process.env.DISCORD_GUILD_ID_WLO || process.env.DISCORD_WLO || '').trim();
  if (String(alliance).toUpperCase() === 'WLO' && wloGuildId) {
    return { guildId: wloGuildId, record: record || { delegated_roles: ['hr', 'officer'] } };
  }
  return null;
}

/**
 * Checks whether a Discord user holds leadership in their alliance's own server: one of
 * its officer roles, R5, or Administrator. Returns the matching role name, or null
 * (also when the alliance has no server of its own, or Discord doesn't answer).
 * @param {{uid: string, alliance: string, alliances: object, botToken: string, timeoutMs?: number}} args
 */
export async function findOfficerRole({ uid, alliance, alliances, botToken, timeoutMs = 2500 }) {
  const server = alliance && botToken ? allianceServer(alliance, alliances) : null;
  if (!server) return null;
  const get = async (path) => {
    const res = await fetch(`https://discord.com/api/v10/guilds/${server.guildId}${path}`, {
      headers: { Authorization: `Bot ${botToken}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok ? res.json() : null;
  };
  try {
    const [member, roles] = await Promise.all([get(`/members/${uid}`), get('/roles')]);
    if (!member || !Array.isArray(roles)) return null;
    const held = roles.filter((r) => (member.roles || []).includes(r.id));
    const allowed = leadershipRoles(server.record);
    const match = held.find((r) => allowed.some((kw) => matchesRoleKeyword(r.name, kw)));
    if (match) return match.name;
    const admin = held.find(
      (r) => (BigInt(r.permissions || '0') & ADMINISTRATOR) === ADMINISTRATOR,
    );
    return admin ? admin.name : null;
  } catch {
    return null; // Discord slow or down: stay a Member
  }
}

/**
 * Finds a player's alliance tag the way the bot does in the NAP server: a role named after
 * a known alliance ("WLO", "[WLO]" or "@WLO", any letter case). If no role matches, a
 * "[TAG]" at the start of their server nickname counts, when TAG is a known alliance (for
 * display; officer access still needs a role in that alliance's own server).
 * Returns { tag, via } (tag as stored in map-state.json; via 'role-name' or 'nickname'), or null.
 * @param {{guildId: string, roleIds: string[], nickname?: string, alliances: object, botToken: string, timeoutMs?: number}} args
 */
export async function findAllianceTag({
  guildId,
  roleIds,
  nickname,
  alliances,
  botToken,
  timeoutMs = 2500,
}) {
  const tags = Object.keys(alliances || {});
  if (!tags.length) return null;
  const byLower = new Map(tags.map((tag) => [tag.toLowerCase(), tag]));

  if (guildId && botToken && roleIds?.length) {
    try {
      const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
        headers: { Authorization: `Bot ${botToken}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const roles = res.ok ? await res.json() : [];
      for (const role of Array.isArray(roles) ? roles : []) {
        if (!roleIds.includes(role.id)) continue;
        const name = String(role.name || '')
          .toLowerCase()
          .trim();
        const bare = name.replace(/^@/, '').replace(/^\[(.*)\]$/, '$1');
        if (byLower.has(bare)) return { tag: byLower.get(bare), via: 'role-name' };
      }
    } catch {
      // Discord slow or down: try the nickname
    }
  }

  const fromNick = /^\s*\[([^\]]{1,10})\]/.exec(nickname || '');
  const nickTag = fromNick ? byLower.get(fromNick[1].trim().toLowerCase()) : null;
  return nickTag ? { tag: nickTag, via: 'nickname' } : null;
}
