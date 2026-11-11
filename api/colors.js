// api/colors.js (Vercel Serverless Function)
import { ALLIANCE_ROLE_SETTINGS } from './_alliances.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  // 1. Each alliance's role ID in the NAP server, from its DISCORD_<name> setting
  // (the names are listed in _data/alliances.yml, role_settings)
  const ALLIANCE_ENVS = Object.fromEntries(
    Object.entries(ALLIANCE_ROLE_SETTINGS).map(([tag, name]) => [
      tag,
      process.env[`DISCORD_${name}`],
    ]),
  );

  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN;
  const GUILD_ID = process.env.DISCORD_GUILD_ID || process.env.GUILD_ID;

  if (!BOT_TOKEN || !GUILD_ID) {
    return res.status(500).json({ error: 'Missing Discord Bot Token or Guild ID' });
  }

  try {
    // 2. Fetch all server roles from Discord REST API
    const rolesReq = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/roles`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });

    if (!rolesReq.ok) {
      const errText = await rolesReq.text();
      console.error('Discord API Error:', errText);
      return res.status(rolesReq.status).json({ error: 'Discord API request failed' });
    }

    const allRoles = await rolesReq.json();
    const roleMap = new Map(allRoles.map((r) => [r.id, r.color]));

    // 3. Match explicit environment role IDs to Hex colors
    const allianceColors = {};

    for (const [tag, roleId] of Object.entries(ALLIANCE_ENVS)) {
      if (!roleId) continue;

      const rawColor = roleMap.get(roleId);

      if (rawColor !== undefined && rawColor !== 0) {
        // Convert Discord integer color (e.g. 15277667) to Hex string (#E88D63)
        allianceColors[tag] = `#${rawColor.toString(16).padStart(6, '0')}`;
      } else if (rawColor === 0) {
        // Fallback for roles that have no custom color set in Discord
        allianceColors[tag] = '#FFFFFF';
      }
    }

    return res.status(200).json(allianceColors);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Failed to fetch role colors' });
  }
}
