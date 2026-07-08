// api/verify.js (Vercel Serverless Function - Zero Dependencies)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { code, redirectUri } = req.body;
  if (!code || !redirectUri) return res.status(400).json({ error: 'Missing OAuth parameters' });

  const findEnvVar = (suffix, fallbackValue) => {
    const matchedKey = Object.keys(process.env).find(key => key.endsWith(suffix));
    return matchedKey ? process.env[matchedKey] : fallbackValue;
  };

  const CLIENT_ID = findEnvVar('CLIENT_ID', process.env.DISCORD_CLIENT_ID);
  const CLIENT_SECRET = findEnvVar('CLIENT_SECRET', process.env.DISCORD_CLIENT_SECRET);
  const DISCORD_BOT_TOKEN = findEnvVar('BOT_TOKEN', process.env.DISCORD_BOT_TOKEN);
  
  const R4_ROLE_ID = findEnvVar('R4', process.env.DISCORD_R4);
  const R5_ROLE_ID = findEnvVar('R5', process.env.DISCORD_R5);
  const MEMBER_ROLE_ID = findEnvVar('MEMBER_ROLE_ID', findEnvVar('MEMBER', process.env.DISCORD_MEMBER_ROLE_ID));

  let GUILD_ID = findEnvVar('GUILD_ID', null);
  if (!GUILD_ID) {
    const bareKey = Object.keys(process.env).find(key => 
      key.startsWith('DISCORD_') && !['CLIENT_ID', 'CLIENT_SECRET', 'BOT_TOKEN', 'R4', 'R5', 'MEMBER', 'MEMBER_ROLE_ID'].some(ext => key.endsWith(ext))
    );
    GUILD_ID = bareKey ? process.env[bareKey] : process.env.DISCORD_GUILD_ID;
  }

  try {
    // 1. Swap Code for Token (Native Fetch)
    const tokenParams = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    });

    const tokenReq = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString()
    });
    
    if (!tokenReq.ok) throw new Error('Failed to fetch Discord access token');
    const tokenData = await tokenReq.json();

    // 2. Get User Profile
    const userReq = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    
    if (!userReq.ok) throw new Error('Failed to fetch user profile');
    const userData = await userReq.json();
    const { id: discordUserId, username, avatar: avatarHash } = userData;

    const avatarUrl = avatarHash 
      ? `https://cdn.discordapp.com/avatars/${discordUserId}/${avatarHash}.png`
      : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(discordUserId) % 5n)}.png`;

    // 3. Check Alliance Server Roles
    const guildReq = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordUserId}`, {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }
    });

    if (guildReq.status === 404) {
      return res.status(200).json({ role: 'public', username, avatar: avatarUrl, message: 'Not in alliance server.' });
    }
    if (!guildReq.ok) throw new Error('Failed to fetch guild roles');
    
    const guildData = await guildReq.json();
    const userRoles = guildData.roles || [];

    // 4. Evaluate Tiers
    let accessLevel = 'public';
    const isLeadership = (R4_ROLE_ID && userRoles.includes(R4_ROLE_ID)) || (R5_ROLE_ID && userRoles.includes(R5_ROLE_ID));

    if (isLeadership) accessLevel = 'leadership';
    else if (MEMBER_ROLE_ID && userRoles.includes(MEMBER_ROLE_ID)) accessLevel = 'member';
    else if (!MEMBER_ROLE_ID && userRoles.length > 0) accessLevel = 'member';

    return res.status(200).json({ role: accessLevel, username, avatar: avatarUrl });

  } catch (error) {
    console.error('Handshake Error:', error.message);
    return res.status(500).json({ error: 'Failsafe connection issue.' });
  }
}