// api/proposal.js

const POOL_LIMITS = {
  commanders_will: 5,
  loyal_servant: 10,
  followers_heart: 20
};

const CHEST_VALUES = {
  commanders_will: { diamonds: 8800, tickets: 44 },
  loyal_servant: { diamonds: 4400, tickets: 40 },
  followers_heart: { diamonds: 1600, tickets: 36 }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ error: 'Bot token missing from server configuration.' });
  }

  try {
    const payload = req.body;

    // ========================================================================
    // 1. REWARDS DISTRIBUTION PROPOSAL BRANCH
    // ========================================================================
    if (payload.type === 'rewards') {
      const { submittedBy, notes, timestamp, distribution } = payload;

      if (!Array.isArray(distribution) || distribution.length === 0) {
        return res.status(400).json({ error: 'Invalid distribution payload.' });
      }

      // Server-side validation of weekly pool capacity
      const totals = { commanders_will: 0, loyal_servant: 0, followers_heart: 0 };
      distribution.forEach(tier => {
        const memberCount = Math.max(1, (tier.max_rank - tier.min_rank) + 1);
        totals.commanders_will += (tier.chests?.commanders_will || 0) * memberCount;
        totals.loyal_servant += (tier.chests?.loyal_servant || 0) * memberCount;
        totals.followers_heart += (tier.chests?.followers_heart || 0) * memberCount;
      });

      if (
        totals.commanders_will > POOL_LIMITS.commanders_will ||
        totals.loyal_servant > POOL_LIMITS.loyal_servant ||
        totals.followers_heart > POOL_LIMITS.followers_heart
      ) {
        return res.status(400).json({
          error: `Pool limits exceeded: Gold ${totals.commanders_will}/${POOL_LIMITS.commanders_will}, Purple ${totals.loyal_servant}/${POOL_LIMITS.loyal_servant}, Blue ${totals.followers_heart}/${POOL_LIMITS.followers_heart}`
        });
      }

      // Build breakdown fields for each tier bracket
      const tierFields = distribution.map(tier => {
        const isSingle = tier.min_rank === tier.max_rank;
        const rankRange = isSingle ? `Rank ${tier.min_rank}` : `Rank ${tier.min_rank}–${tier.max_rank}`;
        const count = Math.max(1, (tier.max_rank - tier.min_rank) + 1);

        const d = (tier.chests.commanders_will * CHEST_VALUES.commanders_will.diamonds) +
                  (tier.chests.loyal_servant * CHEST_VALUES.loyal_servant.diamonds) +
                  (tier.chests.followers_heart * CHEST_VALUES.followers_heart.diamonds);

        const t = (tier.chests.commanders_will * CHEST_VALUES.commanders_will.tickets) +
                  (tier.chests.loyal_servant * CHEST_VALUES.loyal_servant.tickets) +
                  (tier.chests.followers_heart * CHEST_VALUES.followers_heart.tickets);

        return {
          name: `🏆 ${rankRange} (${count} ${count === 1 ? 'Alliance' : 'Alliances'})`,
          value: `🟡 ×${tier.chests.commanders_will} | 🟣 ×${tier.chests.loyal_servant} | 🔵 ×${tier.chests.followers_heart}\n💎 **${d.toLocaleString()}** Diamonds | 🎫 **${t.toLocaleString()}** Tickets *(base)*`,
          inline: false
        };
      });

      const poolUsage = `🟡 Gold: **${totals.commanders_will}**/${POOL_LIMITS.commanders_will}  |  🟣 Purple: **${totals.loyal_servant}**/${POOL_LIMITS.loyal_servant}  |  🔵 Blue: **${totals.followers_heart}**/${POOL_LIMITS.followers_heart}`;

      const embed = {
        title: '👑 Alliance Reward Distribution Proposal',
        color: 0xb8975a,
        description: notes ? `*"${notes}"*` : '*No additional notes provided.*',
        fields: [
          { name: 'Submitted By', value: `\`${submittedBy || 'Anonymous'}\``, inline: true },
          { name: 'Submitted', value: `<t:${Math.floor(new Date(timestamp || Date.now()).getTime() / 1000)}:R>`, inline: true },
          { name: 'Weekly Pool Capacity', value: poolUsage, inline: false },
          ...tierFields,
          { name: 'Status', value: '⏳ **Pending Leadership Review**', inline: false }
        ],
        timestamp: new Date().toISOString()
      };

      const components = [
        {
          type: 1,
          components: [
            {
              type: 2,
              custom_id: 'approve_reward_proposal',
              label: 'Approve Plan',
              style: 3,
              emoji: { name: '✅' }
            },
            {
              type: 2,
              custom_id: 'reject_reward_proposal',
              label: 'Reject Plan',
              style: 4,
              emoji: { name: '❌' }
            }
          ]
        }
      ];

      const formData = new FormData();
      formData.append('payload_json', JSON.stringify({
        embeds: [embed],
        components: components
      }));

      const jsonBlob = new Blob([JSON.stringify(distribution, null, 2)], { type: 'application/json' });
      formData.append('files[0]', jsonBlob, 'reward-blueprint.json');

      // Use a dedicated rewards channel if set, otherwise fallback to the War Room channel
      const channelId = process.env.REWARDS_CHANNEL_ID || process.env.WAR_ROOM_CHANNEL_ID;

      const discordRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${botToken}`
        },
        body: formData
      });

      if (!discordRes.ok) {
        const errorText = await discordRes.text();
        throw new Error(`Discord API Error: ${discordRes.status} - ${errorText}`);
      }

      return res.status(200).json({ success: true, message: 'Reward proposal dispatched!' });
    }

    // ========================================================================
    // 2. MAP PROPOSAL BRANCH (ORIGINAL WORKING IMPLEMENTATION)
    // ========================================================================
    const { submittedBy, notes, totalChanges, changes, image } = payload;

    if (!changes || totalChanges === 0) {
      return res.status(400).json({ error: 'No changes provided.' });
    }

    // Format territory changes list
    const changeList = Object.entries(changes)
      .map(([cityId, shift]) => `• **${cityId.replace(/_/g, ' ')}**: \`${shift.from}\` ➔ \`${shift.to}\``)
      .join('\n');

    const embed = {
      title: '⚔️ New Map Proposal',
      color: 0x3b82f6,
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

    const components = [
      {
        type: 1,
        components: [
          {
            type: 2,
            custom_id: 'approve_proposal',
            label: 'Approve Map',
            style: 3,
            emoji: { name: '✅' }
          },
          {
            type: 2,
            custom_id: 'reject_proposal',
            label: 'Reject Map',
            style: 4,
            emoji: { name: '❌' }
          }
        ]
      }
    ];

    const formData = new FormData();
    formData.append('payload_json', JSON.stringify({
      embeds: [embed],
      components: components
    }));

    const jsonString = JSON.stringify(changes, null, 2);
    const jsonBlob = new Blob([jsonString], { type: 'application/json' });
    formData.append('files[0]', jsonBlob, 'strategy-blueprint.json');

    if (image) {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
      formData.append('files[1]', imageBlob, 'map_preview.jpg');
    }

    const channelId = process.env.WAR_ROOM_CHANNEL_ID;

    const discordRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`
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
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}