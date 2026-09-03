// --- BUTTON INTERACTIONS (Map & Rewards Proposals) ---
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const { custom_id } = interaction.data;
    const userId = interaction.member?.user?.id || interaction.user?.id;
    const username = interaction.member?.user?.username || interaction.user?.username || 'Discord Admin';
    const lang = resolveUserLocale(interaction, null);
    const t = getBotStrings(lang);

    if (userId !== process.env.AUTHORIZED_USER_ID) {
      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: t.admin.access_denied, flags: 64 }
      });
    }

    const isRewardProposal = custom_id.includes('reward');
    const isApproved = custom_id === 'approve_proposal' || custom_id === 'approve_reward_proposal';

    if (isApproved) {
      try {
        const filePrefix = isRewardProposal ? 'reward-blueprint' : 'strategy-blueprint';
        const blueprintAttachment = interaction.message.attachments?.find(a =>
          a.filename.startsWith(filePrefix)
        );

        if (!blueprintAttachment) throw new Error(`${filePrefix} blueprint data is missing.`);

        const blueprintRes = await fetch(blueprintAttachment.url);
        if (!blueprintRes.ok) throw new Error('Failed to retrieve blueprint data.');
        const parsedData = await blueprintRes.json();

        const imageAttachment = interaction.message.attachments?.find(a =>
          a.contentType?.startsWith('image/') || a.filename?.match(/\.(jpg|jpeg|png)$/i)
        );

        const acceptPayload = isRewardProposal
          ? {
              type: 'rewards',
              distribution: parsedData,
              submittedBy: username,
              secretKey: process.env.DISCORD_BOT_TOKEN
            }
          : {
              changes: parsedData,
              submittedBy: username,
              secretKey: process.env.DISCORD_BOT_TOKEN,
              snapshotUrl: imageAttachment ? imageAttachment.url : null
            };

        const acceptRes = await fetch(`https://${req.headers.host}/api/accept-proposal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(acceptPayload)
        });

        if (!acceptRes.ok) {
          const errorData = await acceptRes.json().catch(() => ({}));
          throw new Error(errorData.error || `Server responded with ${acceptRes.status}`);
        }
      } catch (error) {
        console.error('Interaction bridge failed:', error);
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `❌ **${t.admin.failed_update}** ${error.message}`, flags: 64 }
        });
      }
    }

    const originalEmbed = JSON.parse(JSON.stringify(interaction.message.embeds[0]));
    delete originalEmbed.image;
    delete originalEmbed.thumbnail;
    originalEmbed.color = isApproved ? 0x22c55e : 0xef4444;

    const statusIndex = originalEmbed.fields.findIndex(f => f.name.toLowerCase().includes('status'));
    const statusField = {
      name: '⚖️ Status',
      value: isApproved ? `✅ **Approved by <@${userId}>**` : `❌ **Rejected by <@${userId}>**`,
      inline: false
    };

    if (statusIndex !== -1) {
      originalEmbed.fields[statusIndex] = statusField;
    } else {
      originalEmbed.fields.push(statusField);
    }

    const approveId = isRewardProposal ? 'approve_reward_proposal' : 'approve_proposal';
    const rejectId = isRewardProposal ? 'reject_reward_proposal' : 'reject_proposal';

    return res.status(200).json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: {
        embeds: [originalEmbed],
        attachments: [], // Clears the blueprint attachment upon approval/rejection
        components: [
          {
            type: 1,
            components: [
              { type: 2, custom_id: approveId, label: isApproved ? 'Approved' : 'Approve', style: 3, disabled: true },
              { type: 2, custom_id: rejectId, label: !isApproved ? 'Rejected' : 'Reject', style: 4, disabled: true }
            ]
          }
        ]
      }
    });
  }