// api/_bot_rank.js
// /rank: list and set NAP standings.
// Split out of api/interactions.js unchanged.

import { InteractionResponseType } from 'discord-interactions';
import { NOT_HANDLED, resolveActorName, sendEphemeralMessage } from './_bot_common.js';
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
        : 'No alliances registered in current state.';

      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: '🛡️ Server NAP Standings',
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
                  label: 'Open Diplomacy & Standings',
                  url: `https://${resolvedHost}/${lang}/alliance.html`,
                },
              ],
            },
          ],
        },
      });
    } catch (err) {
      return sendEphemeralMessage(res, `⚠️ Failed to fetch rankings: ${err.message}`);
    }
  }

  if (sub?.name === 'set') {
    if (!isSteward(userId)) {
      return sendEphemeralMessage(
        res,
        '⛔ **Access Denied:** Only designated Kingdom Stewards can update alliance rankings.',
      );
    }

    const tagOption = sub.options?.find((o) => o.name === 'tag');
    const rankOption = sub.options?.find((o) => o.name === 'rank');

    if (!tagOption || !rankOption) {
      return sendEphemeralMessage(res, '⚠️ Missing required arguments: tag and rank.');
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
              title: '👑 NAP Standing Updated',
              color: 0x22c55e,
              description: `Alliance \`[${result.tag}]\` has been assigned to **Rank #${result.newRank}** *(previously: ${result.previousRank === 'Unranked' ? 'Unranked' : `#${result.previousRank}`})*.`,
              footer: { text: `Updated by ${author}` },
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
                  label: 'View Standings',
                  url: `https://${resolvedHost}/${lang}/alliance.html`,
                },
              ],
            },
          ],
        },
      });
    } catch (err) {
      return sendEphemeralMessage(res, `⚠️ Failed to update rank: ${err.message}`);
    }
  }
  return NOT_HANDLED;
}
