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

  const payload = req.body || {};
  const nowUnix = Math.floor(Date.now() / 1000);

  // Fallback: If legacy map.js didn't specify type, infer 'map' from 'changes'
  const type = payload.type || (payload.changes ? 'map' : null);

  try {
    switch (type) {
      // ======================================================================
      // 1. REWARDS DISTRIBUTION PROPOSAL
      // ======================================================================
      case 'rewards': {
        const { submittedBy, notes, timestamp, distribution } = payload;

        if (!Array.isArray(distribution) || distribution.length === 0) {
          return res.status(400).json({ error: 'Invalid distribution payload.' });
        }

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
            name: `🏆 ${rankRange} (${count}${count === 1 ? ' Alliance' : ' Alliances'})`,
            value: `🟡 ×${tier.chests.commanders_will} | 🟣 ×${tier.chests.loyal_servant} | 🔵 ×${tier.chests.followers_heart}\n💎 **${d.toLocaleString()}** Diamonds | 🎫 **${t.toLocaleString()}** Tickets *(base)*`,
            inline: false
          };
        });

        const poolUsage = `🟡 Gold: **${totals.commanders_will}**/${POOL_LIMITS.commanders_will}  |  🟣 Purple: **${totals.loyal_servant}**/${POOL_LIMITS.loyal_servant}  |  🔵 Blue: **${totals.followers_heart}**/${POOL_LIMITS.followers_heart}`;
        const submitTimestamp = timestamp ? Math.floor(new Date(timestamp).getTime() / 1000) : nowUnix;

        const embed = {
          title: '👑 Alliance Reward Distribution Proposal',
          color: 0xb8975a,
          description: notes ? `*"${notes}"*` : '*No additional notes provided.*',
          fields: [
            { name: '👤 Submitter', value: `\`${submittedBy || 'Anonymous'}\``, inline: true },
            { name: '⏱️ Submitted', value: `<t:${submitTimestamp}:R>`, inline: true },
            { name: '📊 Pool Capacity', value: poolUsage, inline: false },
            ...tierFields,
            { name: '⚖️ Status', value: '⏳ **Pending Leadership Review**', inline: false }
          ],
          footer: { text: 'Last Asylum Rewards Proposal' },
          timestamp: new Date().toISOString()
        };

        const components = [
          {
            type: 1,
            components: [
              { type: 2, custom_id: 'approve_reward_proposal', label: 'Approve Plan', style: 3, emoji: { name: '✅' } },
              { type: 2, custom_id: 'reject_reward_proposal', label: 'Reject Plan', style: 4, emoji: { name: '❌' } }
            ]
          }
        ];

        const formData = new FormData();
        formData.append('payload_json', JSON.stringify({ embeds: [embed], components }));

        const jsonBlob = new Blob([JSON.stringify(distribution)], { type: 'application/octet-stream' });
        formData.append('files[0]', jsonBlob, 'reward-blueprint.dat');

        const channelId = process.env.REWARDS_CHANNEL_ID || process.env.WAR_ROOM_CHANNEL_ID;
        const discordRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bot ${botToken}` },
          body: formData
        });

        if (!discordRes.ok) {
          const errorText = await discordRes.text();
          throw new Error(`Discord API Error: ${discordRes.status} - ${errorText}`);
        }

        return res.status(200).json({ success: true, message: 'Reward proposal dispatched!' });
      }

      // ======================================================================
      // 2. MAP TERRITORY PROPOSAL
      // ======================================================================
      case 'map': {
        const { submittedBy, notes, totalChanges, changes, image } = payload;

        if (!changes || totalChanges === 0) {
          return res.status(400).json({ error: 'No changes provided.' });
        }

        const changeList = Object.entries(changes)
          .map(([cityId, shift]) => `• **${cityId.replace(/_/g, ' ')}**: \`${shift.from}\` ➔ \`${shift.to}\``)
          .join('\n');

        const embed = {
          title: '⚔️ New Map Strategy Proposal',
          color: 0x3b82f6,
          description: notes ? `*"${notes}"*` : '*No additional notes provided.*',
          fields: [
            { name: '👤 Submitter', value: `\`${submittedBy || 'Anonymous'}\``, inline: true },
            { name: '⏱️ Submitted', value: `<t:${nowUnix}:R>`, inline: true },
            { name: '🗺️ Total Shifts', value: `\`${totalChanges} territories\``, inline: true },
            { name: '⚖️ Status', value: '⏳ **Pending Leadership Review**', inline: false },
            {
              name: 'Proposed Shifts',
              value: changeList.length > 1024 ? changeList.substring(0, 1020) + '...' : changeList
            }
          ],
          footer: { text: 'Last Asylum Map Proposal' },
          timestamp: new Date().toISOString()
        };

        if (image) {
          embed.image = { url: 'attachment://map_preview.jpg' };
        }

        const components = [
          {
            type: 1,
            components: [
              { type: 2, custom_id: 'approve_proposal', label: 'Approve Map', style: 3, emoji: { name: '✅' } },
              { type: 2, custom_id: 'reject_proposal', label: 'Reject Map', style: 4, emoji: { name: '❌' } }
            ]
          }
        ];

        const formData = new FormData();
        formData.append('payload_json', JSON.stringify({ embeds: [embed], components }));

        const jsonBlob = new Blob([JSON.stringify(changes)], { type: 'application/octet-stream' });
        formData.append('files[0]', jsonBlob, 'strategy-blueprint.dat');

        if (image) {
          const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
          const imageBuffer = Buffer.from(base64Data, 'base64');
          const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
          formData.append('files[1]', imageBlob, 'map_preview.jpg');
        }

        const channelId = process.env.WAR_ROOM_CHANNEL_ID;
        const discordRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bot ${botToken}` },
          body: formData
        });

        if (!discordRes.ok) {
          const errorText = await discordRes.text();
          throw new Error(`Discord API Error: ${discordRes.status} - ${errorText}`);
        }

        return res.status(200).json({ success: true, message: 'Map proposal dispatched!' });
      }

      // ======================================================================
      // 3. ALLIANCE & NAP STANDINGS PROPOSAL
      // ======================================================================
      case 'alliance': {
        const { submittedBy, notes, alliances, blacklist, diff } = payload;

        if (!alliances || typeof alliances !== 'object') {
          return res.status(400).json({ error: 'Invalid alliance payload.' });
        }

        let shiftSummary = '*No explicit shifts reported.*';
        if (Array.isArray(diff) && diff.length > 0) {
          shiftSummary = diff
            .slice(0, 15)
            .map(d => {
              if (d.type === 'rank') return `• **[${d.tag}]**: Rank \`#${d.from}\` ➔ \`#${d.to}\``;
              if (d.type === 'academy') return `• **[${d.tag}]**: Academy of **[${d.parent}]**`;
              if (d.type === 'blacklist') return `• ⚠️ **Blacklist**: \`${d.action.toUpperCase()}\` [${d.target}] (${d.category})`;
              return `• **[${d.tag || 'Unknown'}]**: Modified`;
            })
            .join('\n');

          if (diff.length > 15) {
            shiftSummary += `\n*...and ${diff.length - 15} more changes*`;
          }
        }

        const totalAlliances = Object.keys(alliances).length;
        const totalBlacklist = (blacklist?.players?.length || 0) + (blacklist?.alliances?.length || 0);

        const embed = {
          title: '👑 NAP Roster & Alliance Standings Proposal',
          color: 0xb8975a,
          description: notes ? `*"${notes}"*` : '*No additional notes provided.*',
          fields: [
            { name: '👤 Submitter', value: `\`${submittedBy || 'Anonymous'}\``, inline: true },
            { name: '⏱️ Submitted', value: `<t:${nowUnix}:R>`, inline: true },
            { name: '📊 Total Registered', value: `\`${totalAlliances} Alliances | ${totalBlacklist} Blacklisted\``, inline: false },
            { name: '📝 Proposed Modifications', value: shiftSummary.substring(0, 1024), inline: false },
            { name: '⚖️ Status', value: '⏳ **Pending Leadership Review**', inline: false }
          ],
          footer: { text: 'Last Asylum Diplomacy Engine' },
          timestamp: new Date().toISOString()
        };

        const components = [
          {
            type: 1,
            components: [
              { type: 2, custom_id: 'approve_alliance_proposal', label: 'Approve Standings', style: 3, emoji: { name: '✅' } },
              { type: 2, custom_id: 'reject_alliance_proposal', label: 'Reject', style: 4, emoji: { name: '❌' } }
            ]
          }
        ];

        const formData = new FormData();
        formData.append('payload_json', JSON.stringify({ embeds: [embed], components }));

        const blueprintData = { alliances, blacklist: blacklist || { players: [], alliances: [] } };
        const jsonBlob = new Blob([JSON.stringify(blueprintData)], { type: 'application/octet-stream' });
        formData.append('files[0]', jsonBlob, 'diplomacy-blueprint.dat');

        const channelId = process.env.WAR_ROOM_CHANNEL_ID;
        const discordRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bot ${botToken}` },
          body: formData
        });

        if (!discordRes.ok) {
          const errorText = await discordRes.text();
          throw new Error(`Discord API Error: ${discordRes.status} - ${errorText}`);
        }

        return res.status(200).json({ success: true, message: 'Alliance proposal dispatched to Discord!' });
      }

      // ======================================================================
      // 4. CAPITOL DEFENSE OVERRIDE PROPOSAL
      // ======================================================================
      case 'override': {
        const { submittedBy, notes, targetWeek, threatName, displacedAlly, action } = payload;

        if (!targetWeek || !threatName) {
          return res.status(400).json({ error: 'Target week and threat server are required.' });
        }

        const isBuyout = action === 'buyout';
        const title = isBuyout
          ? '🛡️ Wartime Buyout Declaration (Double Threat)'
          : '⚔️ Matchup Threat Override Declaration';

        const descriptionText = isBuyout
          ? `**Second Threat Override this cycle.** WLO will defend Week ${targetWeek} against **${threatName}**.\n**[${displacedAlly}]** receives a material buyout of **2 Regular Gold + 2 KW Gold** chests across 2 installments.`
          : `WLO will step into **Week ${targetWeek}** for kingdom defense against **${threatName}**.\n**[${displacedAlly}]** is promoted to **Week 3 (Finale Week)** (2 King chests + Buff Item). WLO chest cost: 0.`;

        const embed = {
          title,
          color: isBuyout ? 0xef4444 : 0xb8975a,
          description: notes ? `*"${notes}"*\n\n${descriptionText}` : descriptionText,
          fields: [
            { name: '👤 Declared By', value: `\`${submittedBy || 'Anonymous'}\``, inline: true },
            { name: '⏱️ Submitted', value: `<t:${nowUnix}:R>`, inline: true },
            { name: '🎯 Defense Target', value: `Week ${targetWeek} vs \`${threatName}\``, inline: true },
            { name: '🛡️ Displaced Holder', value: `**[${displacedAlly || 'Ally'}]**`, inline: true },
            { name: '📦 Settlement Model', value: isBuyout ? '💰 2-Installment Buyout' : '⇄ Calendar Swap (0 Chest Cost)', inline: true },
            { name: '⚖️ Status', value: '⏳ **Pending Leadership Review**', inline: false }
          ],
          footer: { text: 'Last Asylum NAP Council' },
          timestamp: new Date().toISOString()
        };

        const components = [
          {
            type: 1,
            components: [
              {
                type: 2,
                custom_id: 'approve_override_proposal',
                label: 'Approve Defense Override',
                style: 3,
                emoji: { name: '✅' }
              },
              {
                type: 2,
                custom_id: 'reject_override_proposal',
                label: 'Reject Override',
                style: 4,
                emoji: { name: '❌' }
              }
            ]
          }
        ];

        const formData = new FormData();
        formData.append('payload_json', JSON.stringify({ embeds: [embed], components }));

        // Blueprint file attachment (Read by api/interactions.js upon approval)
        const blueprintData = {
          targetWeek: Number(targetWeek),
          threatName,
          displacedAlly,
          action
        };
        const jsonBlob = new Blob([JSON.stringify(blueprintData)], { type: 'application/octet-stream' });
        formData.append('files[0]', jsonBlob, 'override-blueprint.dat');

        const channelId = process.env.WAR_ROOM_CHANNEL_ID;
        const discordRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bot ${botToken}` },
          body: formData
        });

        if (!discordRes.ok) {
          const errorText = await discordRes.text();
          throw new Error(`Discord API Error: ${discordRes.status} - ${errorText}`);
        }

        return res.status(200).json({ success: true, message: 'Defense override proposal dispatched!' });
      }

      default:
        return res.status(400).json({
          error: `Unsupported proposal type: "${type || 'unknown'}". Supported types: "rewards", "map", "alliance", "override".`
        });
    }
  } catch (error) {
    console.error('Failed to dispatch proposal:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}