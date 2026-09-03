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

  const webhookUrl = process.env.DISCORD_PROPOSAL_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(500).json({ error: 'Discord webhook URL is not configured.' });
  }

  const payload = req.body;

  // ========================================================================
  // REWARD DISTRIBUTION PROPOSAL HANDLER
  // ========================================================================
  if (payload.type === 'rewards') {
    const { submittedBy, notes, timestamp, distribution } = payload;

    if (!Array.isArray(distribution) || distribution.length === 0) {
      return res.status(400).json({ error: 'Invalid distribution payload.' });
    }

    // 1. Server-side validation of pool capacities
    const totals = { commanders_will: 0, loyal_servant: 0, followers_heart: 0 };
    distribution.forEach(tier => {
      const count = Math.max(1, (tier.max_rank - tier.min_rank) + 1);
      totals.commanders_will += (tier.chests?.commanders_will || 0) * count;
      totals.loyal_servant += (tier.chests?.loyal_servant || 0) * count;
      totals.followers_heart += (tier.chests?.followers_heart || 0) * count;
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

    // 2. Format tier breakdown for the Discord Embed
    const tierFields = distribution.map(tier => {
      const isSingle = tier.min_rank === tier.max_rank;
      const rankRange = isSingle ? `Rank ${tier.min_rank}` : `Rank ${tier.min_rank}–${tier.max_rank}`;
      const allianceCount = Math.max(1, (tier.max_rank - tier.min_rank) + 1);

      const d = (tier.chests.commanders_will * CHEST_VALUES.commanders_will.diamonds) +
                (tier.chests.loyal_servant * CHEST_VALUES.loyal_servant.diamonds) +
                (tier.chests.followers_heart * CHEST_VALUES.followers_heart.diamonds);

      const t = (tier.chests.commanders_will * CHEST_VALUES.commanders_will.tickets) +
                (tier.chests.loyal_servant * CHEST_VALUES.loyal_servant.tickets) +
                (tier.chests.followers_heart * CHEST_VALUES.followers_heart.tickets);

      return {
        name: `🏆 ${rankRange} (${allianceCount} ${allianceCount === 1 ? 'Alliance' : 'Alliances'})`,
        value: `🟡 ×${tier.chests.commanders_will} | 🟣 ×${tier.chests.loyal_servant} | 🔵 ×${tier.chests.followers_heart}\n💎 **${d.toLocaleString()}** Diamonds | 🎫 **${t.toLocaleString()}** Tickets *(base)*`,
        inline: false
      };
    });

    const poolSummary = `🟡 Gold: **${totals.commanders_will}**/${POOL_LIMITS.commanders_will}  |  🟣 Purple: **${totals.loyal_servant}**/${POOL_LIMITS.loyal_servant}  |  🔵 Blue: **${totals.followers_heart}**/${POOL_LIMITS.followers_heart}`;

    const embed = {
      title: '👑 Alliance Reward Distribution Proposal',
      description: notes ? `> *"${notes}"*` : undefined,
      color: 0xb8975a,
      fields: [
        { name: '👤 Submitter', value: `\`${submittedBy || 'Anonymous'}\``, inline: true },
        { name: '⏱️ Submitted', value: `<t:${Math.floor(new Date(timestamp || Date.now()).getTime() / 1000)}:R>`, inline: true },
        { name: '📊 Pool Capacity Usage', value: poolSummary, inline: false },
        ...tierFields,
        { name: '⚖️ Status', value: '⏳ **Pending Leadership Review**', inline: false }
      ],
      footer: { text: 'Last Asylum Council Dispatch' }
    };

    const components = [
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'approve_reward_proposal', label: 'Approve Distribution', style: 3 },
          { type: 2, custom_id: 'reject_reward_proposal', label: 'Reject', style: 4 }
        ]
      }
    ];

    // 3. Send multipart webhook with blueprint attached
    const formData = new FormData();
    formData.append('payload_json', JSON.stringify({
      embeds: [embed],
      components: components
    }));

    const blueprintBlob = new Blob([JSON.stringify(distribution, null, 2)], { type: 'application/json' });
    formData.append('files[0]', blueprintBlob, 'reward-blueprint.json');

    try {
      const discordRes = await fetch(webhookUrl, {
        method: 'POST',
        body: formData
      });

      if (!discordRes.ok) {
        const errText = await discordRes.text();
        throw new Error(`Discord Webhook failed (${discordRes.status}): ${errText}`);
      }

      return res.status(200).json({ success: true, message: 'Reward proposal dispatched to Discord.' });
    } catch (err) {
      console.error('Proposal dispatch error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ========================================================================
  // FALLBACK: MAP STRATEGY PROPOSALS
  // ========================================================================
  try {
    const forwardRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!forwardRes.ok) throw new Error(`Webhook rejected: ${forwardRes.status}`);
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}