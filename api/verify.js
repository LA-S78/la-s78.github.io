// api/verify.js (Vercel Serverless Function)
import axios from 'axios';

export default async function handler(req, res) {
  // Allow local development environment testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { code, redirectUri } = req.body;
  if (!code || !redirectUri) {
    return res.status(400).json({ error: 'Missing OAuth authorization code or redirect URI' });
  }

  // Helper function to dynamically locate keys matching your alliance-prefixed architecture
  const findEnvVar = (suffix, fallbackValue) => {
    const matchedKey = Object.keys(process.env).find(key => key.endsWith(suffix));
    return matchedKey ? process.env[matchedKey] : fallbackValue;
  };

  // --- DYNAMIC ENVIRONMENT ENGINES ---
  const CLIENT_ID = findEnvVar('CLIENT_ID', process.env.DISCORD_CLIENT_ID);
  const CLIENT_SECRET = findEnvVar('CLIENT_SECRET', process.env.DISCORD_CLIENT_SECRET);
  const DISCORD_BOT_TOKEN = findEnvVar('BOT_TOKEN', process.env.DISCORD_BOT_TOKEN);
  
  // High Command and Community Roles
  const R4_ROLE_ID = findEnvVar('R4', process.env.DISCORD_R4);
  const R5_ROLE_ID = findEnvVar('R5', process.env.DISCORD_R5);
  const MEMBER_ROLE_ID = findEnvVar('MEMBER_ROLE_ID', findEnvVar('MEMBER', process.env.DISCORD_MEMBER_ROLE_ID));

  // Dynamic Guild ID Lookup: Catches 'DISCORD_WLO_GUILD_ID' or a bare alias like 'DISCORD_WLO'
  let GUILD_ID = findEnvVar('GUILD_ID', null);
  if (!GUILD_ID) {
    const bareAllianceKey = Object.keys(process.env).find(key => 
      key.startsWith('DISCORD_') && 
      !key.endsWith('CLIENT_ID') && 
      !key.endsWith('CLIENT_SECRET') && 
      !key.endsWith('BOT_TOKEN') && 
      !key.endsWith('R4') && 
      !key.endsWith('R5') && 
      !key.endsWith('MEMBER') &&
      !key.endsWith('MEMBER_ROLE_ID')
    );
    GUILD_ID = bareAllianceKey ? process.env[bareAllianceKey] : process.env.DISCORD_GUILD_ID;
  }

  try {
    // STEP 1: Exchange the temporary authorization code for a secure access token
    const tokenParams = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    });

    const tokenResponse = await axios.post(
      'https://discord.com/api/v10/oauth2/token',
      tokenParams.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    // STEP 2: Use the fresh access token to pull the user's true Discord profile
    const userResponse = await axios.get('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const { id: discordUserId, username, avatar: avatarHash } = userResponse.data;

    // Build the global CDN profile image address safely
    const avatarUrl = avatarHash 
      ? `https://cdn.discordapp.com/avatars/${discordUserId}/${avatarHash}.png`
      : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(discordUserId) % 5n)}.png`;

    // STEP 3: Talk to your alliance server using your privileged bot token to find their roles
    let userRoles = [];
    try {
      const guildResponse = await axios.get(
        `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordUserId}`,
        {
          headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }
        }
      );
      userRoles = guildResponse.data.roles;
    } catch (guildError) {
      // 404 signals an authenticated user who isn't inside your server ecosystem
      if (guildError.response && guildError.response.status === 404) {
        return res.status(200).json({ 
          role: 'public', 
          username: username, 
          avatar: avatarUrl,
          message: 'User is not a member of the target alliance server.' 
        });
      }
      throw guildError; 
    }

    // STEP 4: Evaluate credentials against R5/R4 hierarchies
    let accessLevel = 'public';
    
    const isLeadership = (R4_ROLE_ID && userRoles.includes(R4_ROLE_ID)) || 
                         (R5_ROLE_ID && userRoles.includes(R5_ROLE_ID));

    if (isLeadership) {
      accessLevel = 'leadership';
    } else if (MEMBER_ROLE_ID && userRoles.includes(MEMBER_ROLE_ID)) {
      accessLevel = 'member';
    } else if (!MEMBER_ROLE_ID && userRoles.length > 0) {
      // Failsafe fallback: if no specific member suffix is found, server presence acts as validation
      accessLevel = 'member';
    }

    // STEP 5: Return the validated operational payload right back to your main.js engine
    return res.status(200).json({
      role: accessLevel,
      username: username,
      avatar: avatarUrl
    });

  } catch (error) {
    console.error('Secure Firewall Handshake Error:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failsafe connection or token exchange issue.' });
  }
}