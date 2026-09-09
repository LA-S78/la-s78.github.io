import { readFileSync } from 'fs';

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  console.error('❌ Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID.');
  process.exit(1);
}

const schemas = JSON.parse(readFileSync('.github/discord.json', 'utf8'));

const targets = [
  { name: 'nap', guildId: process.env.DISCORD_GUILD_ID_NAP || process.env.DISCORD_GUILD_ID },
  { name: 'wlo', guildId: process.env.DISCORD_GUILD_ID_WLO }
];

for (const target of targets) {
  if (!target.guildId) {
    console.log(`ℹ️ Skipping profile "${target.name}": Guild ID not set.`);
    continue;
  }

  const commands = schemas[target.name] || [];
  const url = `https://discord.com/api/v10/applications/${clientId}/guilds/${target.guildId}/commands`;

  console.log(`Deploying ${commands.length} commands to "${target.name}" (${target.guildId})...`);

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ Failed on "${target.name}": ${res.status} ${err}`);
    process.exit(1);
  }

  console.log(`✅ Profile "${target.name}" updated successfully.`);
}