// api/verify.js (Vercel Serverless Function)
import { createSessionToken } from './_tokens.js';
import { isSteward } from './_stewards.js';
import { findAllianceTag, findOfficerRole } from './_officer_roles.js';
import { gistJson, isGistConfigured, readGist } from './_gist.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { code, redirectUri } = req.body;
  if (!code || !redirectUri) return res.status(400).json({ error: 'Missing OAuth parameters' });

  const findEnvVar = (suffix, fallbackValue) => {
    const matchedKey = Object.keys(process.env).find((key) => key.endsWith(suffix));
    return matchedKey ? process.env[matchedKey] : fallbackValue;
  };

  const CLIENT_ID = findEnvVar('CLIENT_ID', process.env.DISCORD_CLIENT_ID);
  const CLIENT_SECRET = findEnvVar('CLIENT_SECRET', process.env.DISCORD_CLIENT_SECRET);
  const DISCORD_BOT_TOKEN = findEnvVar('BOT_TOKEN', process.env.DISCORD_BOT_TOKEN);

  const R4_ROLE_ID = findEnvVar('R4', process.env.DISCORD_R4);
  const R5_ROLE_ID = findEnvVar('R5', process.env.DISCORD_R5);
  const MEMBER_ROLE_ID = findEnvVar(
    'MEMBER_ROLE_ID',
    findEnvVar('MEMBER', process.env.DISCORD_MEMBER_ROLE_ID),
  );

  let GUILD_ID = findEnvVar('GUILD_ID', null);
  if (!GUILD_ID) {
    const bareKey = Object.keys(process.env).find(
      (key) =>
        key.startsWith('DISCORD_') &&
        !['CLIENT_ID', 'CLIENT_SECRET', 'BOT_TOKEN', 'R4', 'R5', 'MEMBER', 'MEMBER_ROLE_ID'].some(
          (ext) => key.endsWith(ext),
        ),
    );
    GUILD_ID = bareKey ? process.env[bareKey] : process.env.DISCORD_GUILD_ID;
  }

  try {
    // 1. Swap Code for Token
    const tokenParams = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
    });

    const tokenReq = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    if (!tokenReq.ok) throw new Error('Failed to fetch Discord access token');
    const tokenData = await tokenReq.json();

    // 2. Get User Profile
    const userReq = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userReq.ok) throw new Error('Failed to fetch user profile');
    const userData = await userReq.json();
    const { id: discordUserId, username } = userData;

    // 3. Check Alliance Server Roles & Fetch Nickname
    const guildReq = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordUserId}`,
      {
        headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
      },
    );

    const avatarFor = (hash) =>
      hash
        ? `https://cdn.discordapp.com/avatars/${discordUserId}/${hash}.png`
        : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(discordUserId) % 5n)}.png`;

    if (guildReq.status === 404) {
      return res.status(200).json({
        role: 'public',
        username,
        avatar: avatarFor(userData.avatar),
        message: 'Not in alliance server.',
      });
    }
    if (!guildReq.ok) throw new Error('Failed to fetch guild roles');

    const guildData = await guildReq.json();
    const userRoles = guildData.roles || [];

    // PRIORITY: Server Nickname, then global username
    const displayName = guildData.nick || username;
    const avatarHash = guildData.user?.avatar || userData.avatar;
    const avatarUrl = avatarFor(avatarHash);

    // --- DYNAMIC ALLIANCE SCANNER ---
    let allianceName = 'Independent';
    const excludeList = ['R5', 'R4', 'BOTS', 'MEMBER', 'MEMBER_ROLE_ID'];

    for (const [envKey, envValue] of Object.entries(process.env)) {
      if (envKey.startsWith('DISCORD_') && userRoles.includes(envValue)) {
        const identifier = envKey.replace('DISCORD_', '');
        if (!excludeList.includes(identifier)) {
          allianceName = identifier;
          break;
        }
      }
    }

    // The registered alliances (map-state.json), read once and only when needed below.
    let alliances = null;
    const loadAlliances = async () => {
      if (alliances) return alliances;
      alliances = {};
      if (isGistConfigured()) {
        try {
          alliances =
            gistJson(await readGist({ timeoutMs: 2500 }), 'map-state.json').alliances || {};
        } catch (err) {
          console.warn('Alliance list unavailable:', err.message);
        }
      }
      return alliances;
    };

    // No alliance role set up in the environment: find it like the bot does, by role name
    // in the NAP server (or a "[TAG]" nickname).
    if (allianceName === 'Independent') {
      allianceName =
        (await findAllianceTag({
          guildId: GUILD_ID,
          roleIds: userRoles,
          nickname: guildData.nick,
          alliances: await loadAlliances(),
          botToken: DISCORD_BOT_TOKEN,
        })) || 'Independent';
    }

    // 4. Evaluate Tiers (Specific Ranks)
    let accessLevel = 'public';
    if (R5_ROLE_ID && userRoles.includes(R5_ROLE_ID)) accessLevel = 'R5';
    else if (R4_ROLE_ID && userRoles.includes(R4_ROLE_ID)) accessLevel = 'R4';
    else if (MEMBER_ROLE_ID && userRoles.includes(MEMBER_ROLE_ID)) accessLevel = 'member';
    else if (!MEMBER_ROLE_ID && userRoles.length > 0) accessLevel = 'member';

    // Officers: an alliance can name its own officer roles with /registerbot (held in the
    // alliance's own Discord server). The bot treats them like R4, so the site does too.
    let officerRole = null;
    if (accessLevel === 'member' && allianceName !== 'Independent') {
      officerRole = await findOfficerRole({
        uid: discordUserId,
        alliance: allianceName,
        alliances: await loadAlliances(),
        botToken: DISCORD_BOT_TOKEN,
      }); // null when Discord doesn't answer: stays a Member
      if (officerRole) accessLevel = 'R4';
    }

    // A signed login pass, so the server can check who is sending a proposal (the role and
    // name above are only for the page's display; the browser could edit those).
    const passSecret = process.env.DISCORD_BOT_TOKEN || DISCORD_BOT_TOKEN;
    const session =
      accessLevel !== 'public' && passSecret
        ? createSessionToken(
            { uid: discordUserId, name: displayName, role: accessLevel, alliance: allianceName },
            passSecret,
          )
        : null;

    return res.status(200).json({
      role: accessLevel,
      username: displayName,
      avatar: avatarUrl,
      alliance: allianceName,
      steward: isSteward(discordUserId),
      officer: officerRole ? officerRole : undefined,
      session,
    });
  } catch (error) {
    console.error('Handshake Error:', error.message);
    return res.status(500).json({ error: 'Failsafe connection issue.' });
  }
}
