// api/colors.js (Vercel Serverless Function - Public Role Colors)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  // Cache the response at Vercel's Edge CDN for 1 hour (3600 seconds) to avoid rate limits
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const findEnvVar = (suffix, fallbackValue) => {
    const matchedKey = Object.keys(process.env).find(key => key.endsWith(suffix));
    return matchedKey ? process.env[matchedKey] : fallbackValue;
  };

  const DISCORD_BOT_TOKEN = findEnvVar('BOT_TOKEN', process.env.DISCORD_BOT_TOKEN);

  let GUILD_ID = findEnvVar('GUILD_ID', null);
  if (!GUILD_ID) {
    const bareKey = Object.keys(process.env).find(key => 
      key.startsWith('DISCORD_') && !['CLIENT_ID', 'CLIENT_SECRET', 'BOT_TOKEN', 'R4', 'R5', 'MEMBER', 'MEMBER_ROLE_ID'].some(ext => key.endsWith(ext))
    );
    GUILD_ID = bareKey ? process.env[bareKey] : process.env.DISCORD_GUILD_ID;
  }

  if (!DISCORD_BOT_TOKEN || !GUILD_ID) {
    return res.status(500).json({ error: 'Missing Discord Bot environment configuration' });
  }

  try {
    // Fetch all roles from the Discord server
    const rolesReq = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/roles`, {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }
    });

    if (!rolesReq.ok) throw new Error('Failed to fetch roles from Discord API');
    
    const allRoles = await rolesReq.json();

    // Map Role ID -> Hex Color
    const roleColorMap = {};
    allRoles.forEach(role => {
      if (role.color) {
        // Convert Discord integer color (e.g. 15277667) to Hex (#e88d63)
        roleColorMap[role.id] = `#${role.color.toString(16).padStart(6, '0')}`;
      }
    });

    // Extract alliance role colors matching env vars like DISCORD_WLO, DISCORD_ARK, etc.
    const allianceColors = {};
    const excludeList = ['R5', 'R4', 'BOTS', 'MEMBER', 'CLIENT_ID', 'CLIENT_SECRET', 'BOT_TOKEN', 'MEMBER_ROLE_ID', 'GUILD_ID'];

    for (const [envKey, envValue] of Object.entries(process.env)) {
      if (envKey.startsWith('DISCORD_')) {
        const identifier = envKey.replace('DISCORD_', '');
        if (!excludeList.includes(identifier) && roleColorMap[envValue]) {
          allianceColors[identifier] = roleColorMap[envValue];
        }
      }
    }

    return res.status(200).json(allianceColors);

  } catch (error) {
    console.error('Error fetching role colors:', error.message);
    return res.status(500).json({ error: 'Could not fetch alliance role colors.' });
  }
}