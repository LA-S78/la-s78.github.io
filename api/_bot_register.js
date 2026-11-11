// api/_bot_register.js
// /registerbot: links an alliance server to the website (NAP server only).
// Split out of api/interactions.js unchanged.

import { InteractionResponseType } from 'discord-interactions';
import { NOT_HANDLED, getGistData, sendEphemeralMessage } from './_bot_common.js';
import { resolveMemberAllianceContext } from './_bot_roles.js';
import { ALLIANCE_COMMANDS_SCHEMA } from './_bot_schema.js';
import { isSteward } from './_stewards.js';
import { createToken } from './_tokens.js';

/** --- /registerbot COMMAND (NAP Server Only) --- */
export async function handleRegisterBotCommand(ctx) {
  const { res, name, options, resolvedHost, guildId, member, userId, botToken } = ctx;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const napGuildId = (
    process.env.DISCORD_GUILD_ID_NAP ||
    process.env.DISCORD_GUILD_ID ||
    ''
  ).trim();

  const requestedAction = options?.find((opt) => opt.name === 'action')?.value;

  if (!napGuildId || guildId !== napGuildId) {
    return sendEphemeralMessage(
      res,
      '⚠️ This command can only be executed in the official NAP server.',
    );
  }

  // SUB-ACTION: Broad-sync all registered alliance servers (Steward only)
  if (requestedAction === 'sync') {
    if (!isSteward(userId)) {
      return sendEphemeralMessage(
        res,
        '⛔ **Access Denied:** Only designated Kingdom Stewards can broadcast-sync commands.',
      );
    }

    try {
      const gistData = await getGistData();
      const mapState = JSON.parse(gistData.files['map-state.json']?.content || '{}');
      const alliances = mapState.alliances || {};

      const results = [];
      for (const [tag, data] of Object.entries(alliances)) {
        if (!data.guild_id) continue;

        const syncRes = await fetch(
          `https://discord.com/api/v10/applications/${clientId}/guilds/${data.guild_id}/commands`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bot ${botToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(ALLIANCE_COMMANDS_SCHEMA),
          },
        );

        results.push(`${syncRes.ok ? '✅' : '❌'} **[${tag}]** (\`${data.guild_id}\`)`);
      }

      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: '🔄 Alliance Slash Commands Broad-Synced',
              color: 0x22c55e,
              description: results.length
                ? `Pushed latest command schema to:\n\n${results.join('\n')}`
                : '⚠️ No registered alliance servers found in state.',
              footer: { text: 'Last Asylum Bot Deployment Manager' },
              timestamp: new Date().toISOString(),
            },
          ],
          flags: 64,
        },
      });
    } catch (err) {
      return sendEphemeralMessage(res, `❌ Sync failed: ${err.message}`);
    }
  }

  // DEFAULT ACTION: R5 Registration Portal Link
  try {
    const gistData = await getGistData();
    const mapState = JSON.parse(gistData.files['map-state.json']?.content || '{}');
    const alliances = mapState.alliances || {};
    const knownAlliances = Object.keys(alliances);

    const { detectedTag: matchedAllianceTag, isR5 } = await resolveMemberAllianceContext({
      guildId,
      member,
      alliances,
      botToken,
    });

    if (!isR5 && !isSteward(userId)) {
      return sendEphemeralMessage(
        res,
        '⛔ **Access Denied:** Only Alliance Leaders holding the **@R5** role can register alliance servers.',
      );
    }

    if (!matchedAllianceTag) {
      return sendEphemeralMessage(
        res,
        `⚠️ Could not detect your alliance tag role. Ensure you hold your alliance role (e.g. \`@${knownAlliances[0] || 'TAG'}\`) in the NAP server.`,
      );
    }

    const tokenPayload = {
      alliance: matchedAllianceTag,
      action: 'register',
      uid: userId, // the portal checks this person may manage the server being linked
      client_id: clientId,
      exp: Date.now() + 24 * 60 * 60 * 1000,
    };
    const token = createToken(tokenPayload, botToken);
    const registerUrl = `https://${resolvedHost}/register.html?token=${token}`;

    return res.status(200).json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: `🤖 Alliance Server Setup — [${matchedAllianceTag}]`,
            color: 0xb8975a,
            description:
              "Click below to authorize the bot and link your alliance's Discord server to the website.\n\n• Installs commands (`/calendar`, `/suggest`, `/nominate`, `/rewards`, `/map`, `/sb`, `/rules`).\n• Allows configuring delegated roles (e.g. `@HR`).",
            footer: { text: 'Link is private and expires in 24 hours.' },
          },
        ],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: 'Open Registration Portal',
                url: registerUrl,
              },
            ],
          },
        ],
        flags: 64,
      },
    });
  } catch (err) {
    console.error('Registerbot error:', err);
    return sendEphemeralMessage(
      res,
      `⚠️ Service busy: ${err.message}. Please retry in a few moments.`,
    );
  }
  return NOT_HANDLED;
}
