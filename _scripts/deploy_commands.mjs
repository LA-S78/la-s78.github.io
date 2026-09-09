import { readFileSync } from 'fs';

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  console.error('❌ Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID environment variables.');
  process.exit(1);
}

const commands = JSON.parse(readFileSync('.github/discord.json', 'utf8'));

// If a Guild ID is provided, updates are instantaneous (best for testing/private servers).
// If no Guild ID is provided, it updates Global commands (can take up to 1 hour to propagate).
const url = guildId 
  ? `https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`
  : `https://discord.com/api/v10/applications/${clientId}/commands`;

console.log(`Transmitting ${commands.length} commands to Discord...`);

const res = await fetch(url, {
  method: 'PUT',
  headers: {
    'Authorization': `Bot ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(commands)
});

if (!res.ok) {
  const err = await res.text();
  console.error(`❌ Failed to sync slash commands: ${res.status} ${err}`);
  process.exit(1);
}

console.log('✅ Successfully registered slash commands.');