// api/colors.js (Vercel Serverless Function)
// Each alliance's Discord role colour, for the Alliance page and the map. The same colours
// are already applied in /api/state (see _role_colors.js); this stays for older pages.
import { getRoleColors } from './_role_colors.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  if (!(process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN)) {
    return res.status(500).json({ error: 'Missing Discord Bot Token or Guild ID' });
  }
  if (!(process.env.DISCORD_GUILD_ID || process.env.GUILD_ID)) {
    return res.status(500).json({ error: 'Missing Discord Bot Token or Guild ID' });
  }
  return res.status(200).json(await getRoleColors());
}
