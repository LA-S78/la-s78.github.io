// api/proposal.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { submittedBy, notes, totalChanges, changes, image } = req.body;

    if (!changes || totalChanges === 0) {
      return res.status(400).json({ error: 'No changes provided.' });
    }

    // Format territory changes list
    const changeList = Object.entries(changes)
      .map(([cityId, shift]) => `• **${cityId.replace(/_/g, ' ')}**: \`${shift.from}\` ➔ \`${shift.to}\``)
      .join('\n');

    // 1. Build the Raw Discord Embed JSON
    const embed = {
      title: '⚔️ New Map Proposal',
      color: 0x3b82f6, // Discord uses integer colors instead of hex strings
      description: notes ? `*"${notes}"*` : '*No additional notes provided.*',
      fields: [
        { name: 'Submitted By', value: `\`${submittedBy}\``, inline: true },
        { name: 'Total Shifts', value: `\`${totalChanges} territories\``, inline: true },
        { name: 'Status', value: '⏳ **Pending Admin Review**', inline: false },
        { 
          name: 'Proposed Shifts', 
          value: changeList.length > 1024 ? changeList.substring(0, 1020) + '...' : changeList 
        }
      ],
      timestamp: new Date().toISOString()
    };

    // 2. Build the Raw Action Buttons JSON
    const components = [
      {
        type: 1, // ActionRow
        components: [
          {
            type: 2, // Button
            custom_id: 'approve_proposal',
            label: 'Approve Map',
            style: 3, // Success (Green)
            emoji: { name: '✅' }
          },
          {
            type: 2, // Button
            custom_id: 'reject_proposal',
            label: 'Reject Map',
            style: 4, // Danger (Red)
            emoji: { name: '❌' }
          }
        ]
      }
    ];

    // 3. Construct the Multipart FormData Payload
    const formData = new FormData();
    
    // Discord expects the JSON payload to be attached as a stringified field named "payload_json"
    formData.append('payload_json', JSON.stringify({
      embeds: [embed],
      components: components
    }));

    // Attach the strategy blueprint as File 0
    const jsonString = JSON.stringify(changes, null, 2);
    const jsonBlob = new Blob([jsonString], { type: 'application/json' });
    formData.append('files[0]', jsonBlob, 'strategy-blueprint.json');

    // Attach the map preview image as File 1
    if (image) {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
      formData.append('files[1]', imageBlob, 'map_preview.jpg');
    }

    // 4. Dispatch via Native Fetch
    const channelId = process.env.WAR_ROOM_CHANNEL_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;

    const discordRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`
        // Note: Do NOT manually set 'Content-Type' for FormData; fetch will automatically generate the multipart boundary.
      },
      body: formData
    });

    if (!discordRes.ok) {
      const errorText = await discordRes.text();
      throw new Error(`Discord API Error: ${discordRes.status} - ${errorText}`);
    }

    return res.status(200).json({ success: true, message: 'Proposal with map preview dispatched!' });
  } catch (error) {
    console.error('Failed to dispatch proposal:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}