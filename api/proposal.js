import { REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { submittedBy, notes, totalChanges, changes } = req.body;

    if (!changes || totalChanges === 0) {
      return res.status(400).json({ error: 'No changes provided.' });
    }

    // Format territory changes list
    const changeList = Object.entries(changes)
      .map(([cityId, shift]) => `• **${cityId.replace(/_/g, ' ')}**: \`${shift.from}\` ➔ \`${shift.to}\``)
      .join('\n');

    // Build the Discord Embed
    const embed = new EmbedBuilder()
      .setTitle('⚔️ New Map Strategy Proposal')
      .setColor('#3b82f6')
      .setDescription(notes ? `*"${notes}"*` : '*No additional strategy notes provided.*')
      .addFields(
        { name: 'Submitted By', value: `\`${submittedBy}\``, inline: true },
        { name: 'Total Shifts', value: `\`${totalChanges} territories\``, inline: true },
        { name: 'Status', value: '⏳ **Pending High Command Review**', inline: false },
        { name: 'Proposed Shifts', value: changeList.length > 1024 ? changeList.substring(0, 1020) + '...' : changeList }
      )
      .setTimestamp();

    // Build Action Buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('approve_proposal')
        .setLabel('Approve Strategy')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId('reject_proposal')
        .setLabel('Reject Strategy')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

    // Authenticate using your existing DISCORD_BOT_TOKEN
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
    
    // Send to your designated #war-room channel
    await rest.post(Routes.channelMessages(process.env.WAR_ROOM_CHANNEL_ID), {
      body: {
        embeds: [embed.toJSON()],
        components: [row.toJSON()]
      }
    });

    return res.status(200).json({ success: true, message: 'Proposal dispatched!' });
  } catch (error) {
    console.error('Failed to dispatch proposal:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}