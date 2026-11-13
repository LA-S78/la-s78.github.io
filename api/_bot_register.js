// api/_bot_register.js
// /registerbot: links an alliance server to the website (NAP server only).
// Split out of api/interactions.js unchanged.

import { InteractionResponseType } from 'discord-interactions';
import { NOT_HANDLED, getGistData, sendEphemeralMessage } from './_bot_common.js';
import { resolveMemberAllianceContext } from './_bot_roles.js';
import { ALLIANCE_COMMANDS_SCHEMA } from './_bot_schema.js';
import { isSteward } from './_stewards.js';
import { createToken } from './_tokens.js';
import { say } from './_messages.js';

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
    return sendEphemeralMessage(res, say('bot_register.nap_only'));
  }

  // SUB-ACTION: Broad-sync all registered alliance servers (Steward only)
  if (requestedAction === 'sync') {
    if (!isSteward(userId)) {
      return sendEphemeralMessage(res, say('bot_register.sync_denied'));
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
              title: say('bot_register.sync_title'),
              color: 0x22c55e,
              description: results.length
                ? say('bot_register.sync_done', { results: results.join('\n') })
                : say('bot_register.sync_none'),
              footer: { text: say('bot_register.sync_footer') },
              timestamp: new Date().toISOString(),
            },
          ],
          flags: 64,
        },
      });
    } catch (err) {
      return sendEphemeralMessage(res, say('bot_register.sync_failed', { reason: err.message }));
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
      return sendEphemeralMessage(res, say('bot_register.r5_only'));
    }

    if (!matchedAllianceTag) {
      return sendEphemeralMessage(
        res,
        say('bot_register.no_tag_role', { example: knownAlliances[0] || 'TAG' }),
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
            title: say('bot_register.title', { tag: matchedAllianceTag }),
            color: 0xb8975a,
            description: say('bot_register.text'),
            footer: { text: say('bot_common.link_expires_24h') },
          },
        ],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: say('bot_register.open_portal'),
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
    return sendEphemeralMessage(res, say('bot_register.busy', { reason: err.message }));
  }
  return NOT_HANDLED;
}
