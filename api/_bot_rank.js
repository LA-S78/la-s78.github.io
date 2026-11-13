// api/_bot_rank.js
// /rank: list and set NAP standings.
// Split out of api/interactions.js unchanged.

import { InteractionResponseType } from 'discord-interactions';
import { NOT_HANDLED, resolveActorName, sendEphemeralMessage } from './_bot_common.js';
import { say } from './_messages.js';
import { listAllianceRanks, setAllianceRank } from './_rank_helper.js';
import { isSteward } from './_stewards.js';

/** --- /rank COMMAND --- */
export async function handleRankCommand(ctx) {
  const { res, interaction, name, options, resolvedHost, lang, userId } = ctx;
  const sub = options?.[0];

  if (sub?.name === 'list') {
    try {
      const ranks = await listAllianceRanks();
      const desc = ranks.length
        ? ranks.map((a) => `**#${a.rank}** — \`[${a.tag}]\``).join('\n')
        : say('bot_admin.rank_none');

      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: say('bot_admin.rank_title'),
              color: 0xb8975a,
              description: desc,
              footer: { text: 'la-s78.app' },
              timestamp: new Date().toISOString(),
            },
          ],
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 5,
                  label: say('bot_admin.rank_open'),
                  url: `https://${resolvedHost}/${lang}/alliance.html`,
                },
              ],
            },
          ],
        },
      });
    } catch (err) {
      return sendEphemeralMessage(res, say('bot_admin.rank_fetch_failed', { reason: err.message }));
    }
  }

  if (sub?.name === 'set') {
    if (!isSteward(userId)) {
      return sendEphemeralMessage(res, say('bot_admin.rank_denied'));
    }

    const tagOption = sub.options?.find((o) => o.name === 'tag');
    const rankOption = sub.options?.find((o) => o.name === 'rank');

    if (!tagOption || !rankOption) {
      return sendEphemeralMessage(res, say('bot_admin.rank_missing'));
    }

    const author = resolveActorName(interaction, 'Leadership');

    try {
      const result = await setAllianceRank({
        tag: tagOption.value,
        rank: rankOption.value,
        updatedBy: author,
      });

      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: say('bot_admin.rank_set_title'),
              color: 0x22c55e,
              description: say('bot_admin.rank_set_text', {
                tag: result.tag,
                rank: result.newRank,
                previous:
                  result.previousRank === 'Unranked'
                    ? say('bot_admin.rank_unranked')
                    : `#${result.previousRank}`,
              }),
              footer: { text: say('bot_admin.rank_updated_by', { name: author }) },
              timestamp: new Date().toISOString(),
            },
          ],
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 5,
                  label: say('bot_admin.rank_view'),
                  url: `https://${resolvedHost}/${lang}/alliance.html`,
                },
              ],
            },
          ],
        },
      });
    } catch (err) {
      return sendEphemeralMessage(res, say('bot_admin.rank_set_failed', { reason: err.message }));
    }
  }
  return NOT_HANDLED;
}
