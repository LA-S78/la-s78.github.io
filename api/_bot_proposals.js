// api/_bot_proposals.js
// Steward review of proposals posted by /api/proposal: Approve / Reject buttons.
// Split out of api/interactions.js unchanged.

import { InteractionResponseType } from 'discord-interactions';
import { acceptProposal } from './_accept_proposal.js';
import { getWaitUntil } from './_after_response.js';
import { resolveActorName, resolveUserId, sendEphemeralMessage } from './_bot_common.js';
import { mapRevisionCache } from './_bot_map.js';
import { TEST_PROPOSAL_FIELD } from './_gist.js';
import { say } from './_messages.js';
import { isSteward } from './_stewards.js';

/** Steward Approve / Reject on a proposal message (map, rewards, standings, blacklist, overrides). */
export async function handleProposalButton(ctx) {
  const { res, interaction, custom_id, resolvedHost, t } = ctx;
  const proposalConfig = PROPOSAL_CONFIGS[custom_id];
  if (!proposalConfig) {
    return sendEphemeralMessage(res, `⚠️ Unrecognized interaction component: \`${custom_id}\`.`);
  }

  const userId = resolveUserId(interaction);
  const username = resolveActorName(interaction, 'Kingdom Steward');

  if (!isSteward(userId)) {
    return sendEphemeralMessage(res, t.admin.access_denied);
  }

  // Proposals sent from the test site (dev.la-s78.app) use test data: the live bot never
  // applies them (api/proposal.js marks them).
  const isTestProposal = (interaction.message?.embeds || []).some((e) =>
    (e.fields || []).some((f) => f.name === TEST_PROPOSAL_FIELD),
  );
  if (isTestProposal) {
    return sendEphemeralMessage(res, say('bot_admin.test_proposal'));
  }

  const {
    type: proposalType,
    isApproved,
    filePrefix,
    approveId,
    rejectId,
    approveLabel,
    rejectLabel,
  } = proposalConfig;

  // The reviewed message: status field set, both buttons disabled. It's the shared
  // war-room post, so it stays in English whoever clicks.
  const buildReviewedMessage = () => {
    const originalEmbed = JSON.parse(JSON.stringify(interaction.message.embeds[0]));
    originalEmbed.color = isApproved ? 0x22c55e : 0xef4444;

    const statusIndex = originalEmbed.fields.findIndex((f) =>
      f.name.toLowerCase().includes('status'),
    );
    const statusField = {
      name: '⚖️ Status',
      value: isApproved ? `✅ **Approved by ${username}**` : `❌ **Rejected by ${username}**`,
      inline: false,
    };

    if (statusIndex !== -1) {
      originalEmbed.fields[statusIndex] = statusField;
    } else {
      originalEmbed.fields.push(statusField);
    }

    return {
      embeds: [originalEmbed],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              custom_id: approveId,
              label: isApproved ? 'Approved' : approveLabel,
              style: 3,
              emoji: { name: '✅' },
              disabled: true,
            },
            {
              type: 2,
              custom_id: rejectId,
              label: !isApproved ? 'Rejected' : rejectLabel,
              style: 4,
              emoji: { name: '❌' },
              disabled: true,
            },
          ],
        },
      ],
    };
  };

  if (!isApproved) {
    // Reject saves nothing, so it answers straight away.
    return res.status(200).json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: buildReviewedMessage(),
    });
  }

  // Downloads the proposal attached to the Discord message and saves it. Throws on failure.
  const saveApproval = async () => {
    const blueprintAttachment = interaction.message.attachments?.find((a) =>
      a.filename.startsWith(filePrefix),
    );

    if (!blueprintAttachment) {
      throw new Error(`${filePrefix}.dat attachment is missing.`);
    }

    const blueprintRes = await fetch(blueprintAttachment.url);
    if (!blueprintRes.ok) {
      throw new Error('Failed to retrieve blueprint attachment from Discord.');
    }
    const parsedData = await blueprintRes.json();

    // Already checked above: the click came from Discord (signature) and the clicker is a
    // Steward. The proposal is saved directly here; no token is sent anywhere.
    let acceptPayload = {
      type: proposalType,
      submittedBy: username,
    };

    if (proposalType === 'rewards') {
      acceptPayload.distribution = parsedData;
    } else if (proposalType === 'alliance') {
      acceptPayload.alliances = parsedData.alliances;
      acceptPayload.blacklist = parsedData.blacklist; // only in proposals sent before the split
    } else if (proposalType === 'blacklist') {
      acceptPayload.diff = parsedData.diff;
    } else if (proposalType === 'override') {
      acceptPayload.targetWeek = parsedData.targetWeek;
      acceptPayload.threatName = parsedData.threatName;
      acceptPayload.action = parsedData.action;
      acceptPayload.displacedAlly = parsedData.displacedAlly;
    } else {
      acceptPayload.changes = parsedData;
    }

    const { status: acceptStatus, json: acceptJson } = await acceptProposal(acceptPayload, {
      baseUrl: `https://${resolvedHost}`,
    });
    if (acceptStatus < 200 || acceptStatus >= 300) {
      throw new Error(acceptJson.error || `Server responded with ${acceptStatus}`);
    }

    if (acceptJson.revision) {
      mapRevisionCache.revision = acceptJson.revision;
      mapRevisionCache.timestamp = Date.now();
    }
  };
  const failedMessage = (error) => `❌ **${t.admin.failed_update}** ${error.message}`;

  // Finishing after answering needs Vercel's waitUntil and this click's id and token
  // (Discord always sends them). Without them, save first and then answer, as before.
  const waitUntil = interaction.application_id && interaction.token ? getWaitUntil() : null;
  if (!waitUntil) {
    try {
      await saveApproval();
    } catch (error) {
      console.error('Interaction bridge failed:', error);
      return sendEphemeralMessage(res, failedMessage(error));
    }
    return res.status(200).json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: buildReviewedMessage(),
    });
  }

  // Answer Discord at once (the button shows it is working), so a slow GitHub save can't
  // run past Discord's 3-second limit, then save and edit the message. The edit uses this
  // click's own interaction token (valid 15 minutes), not the bot token.
  const webhook = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`;
  const sendToDiscord = async (url, method, body) => {
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Discord responded with ${r.status}`);
  };
  waitUntil(
    (async () => {
      try {
        await saveApproval();
      } catch (error) {
        console.error('Interaction bridge failed:', error);
        // Same private message as before; the proposal stays open and can be approved again.
        await sendToDiscord(webhook, 'POST', { content: failedMessage(error), flags: 64 }).catch(
          (e) => console.error('Could not report the failed approval:', e),
        );
        return;
      }
      try {
        await sendToDiscord(`${webhook}/messages/@original`, 'PATCH', buildReviewedMessage());
      } catch (error) {
        console.error('Approval saved, but the message could not be updated:', error);
        await sendToDiscord(webhook, 'POST', {
          content: say('bot_admin.approved_not_updated', { reason: error.message }),
          flags: 64,
        }).catch(() => {});
      }
    })(),
  );
  return res.status(200).json({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });
}

// --- PROPOSAL COMPONENT REGISTRY ---
// Maps Discord button custom_ids to their respective blueprint files and accept-proposal types
export const PROPOSAL_CONFIGS = {
  approve_proposal: {
    type: 'map',
    isApproved: true,
    filePrefix: 'strategy-blueprint',
    approveId: 'approve_proposal',
    rejectId: 'reject_proposal',
    approveLabel: 'Approve Map',
    rejectLabel: 'Reject Map',
  },
  reject_proposal: {
    type: 'map',
    isApproved: false,
    filePrefix: 'strategy-blueprint',
    approveId: 'approve_proposal',
    rejectId: 'reject_proposal',
    approveLabel: 'Approve Map',
    rejectLabel: 'Reject Map',
  },
  approve_reward_proposal: {
    type: 'rewards',
    isApproved: true,
    filePrefix: 'reward-blueprint',
    approveId: 'approve_reward_proposal',
    rejectId: 'reject_reward_proposal',
    approveLabel: 'Approve Plan',
    rejectLabel: 'Reject Plan',
  },
  reject_reward_proposal: {
    type: 'rewards',
    isApproved: false,
    filePrefix: 'reward-blueprint',
    approveId: 'approve_reward_proposal',
    rejectId: 'reject_reward_proposal',
    approveLabel: 'Approve Plan',
    rejectLabel: 'Reject Plan',
  },
  approve_alliance_proposal: {
    type: 'alliance',
    isApproved: true,
    filePrefix: 'diplomacy-blueprint',
    approveId: 'approve_alliance_proposal',
    rejectId: 'reject_alliance_proposal',
    approveLabel: 'Approve Standings',
    rejectLabel: 'Reject',
  },
  reject_alliance_proposal: {
    type: 'alliance',
    isApproved: false,
    filePrefix: 'diplomacy-blueprint',
    approveId: 'approve_alliance_proposal',
    rejectId: 'reject_alliance_proposal',
    approveLabel: 'Approve Standings',
    rejectLabel: 'Reject',
  },
  approve_blacklist_proposal: {
    type: 'blacklist',
    isApproved: true,
    filePrefix: 'blacklist-blueprint',
    approveId: 'approve_blacklist_proposal',
    rejectId: 'reject_blacklist_proposal',
    approveLabel: 'Approve Blacklist',
    rejectLabel: 'Reject',
  },
  reject_blacklist_proposal: {
    type: 'blacklist',
    isApproved: false,
    filePrefix: 'blacklist-blueprint',
    approveId: 'approve_blacklist_proposal',
    rejectId: 'reject_blacklist_proposal',
    approveLabel: 'Approve Blacklist',
    rejectLabel: 'Reject',
  },
  approve_override_proposal: {
    type: 'override',
    isApproved: true,
    filePrefix: 'override-blueprint',
    approveId: 'approve_override_proposal',
    rejectId: 'reject_override_proposal',
    approveLabel: 'Approve Defense Override',
    rejectLabel: 'Reject Override',
  },
  reject_override_proposal: {
    type: 'override',
    isApproved: false,
    filePrefix: 'override-blueprint',
    approveId: 'approve_override_proposal',
    rejectId: 'reject_override_proposal',
    approveLabel: 'Approve Defense Override',
    rejectLabel: 'Reject Override',
  },
};
