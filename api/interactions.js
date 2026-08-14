import { verifyKey, InteractionType, InteractionResponseType } from 'discord-interactions';

export const config = {
  api: { bodyParser: false }
};

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// --- LOCALIZATION CONFIGURATION ---
// Add or adjust any site language subfolders here
const SUPPORTED_LOCALES = ['en', 'es', 'de', 'fr', 'ru', 'it', 'tr', 'uk'];

/**
 * Resolves the user's Discord client language to your website's folder structure.
 * Defaults to 'en' if unsupported or missing.
 */
function resolveSiteLocale(interaction) {
  const userLocale = interaction?.locale || interaction?.guild_locale || 'en';
  const baseCode = userLocale.split('-')[0].toLowerCase();
  return SUPPORTED_LOCALES.includes(baseCode) ? baseCode : 'en';
}

// --- SURVIVAL BATTLE SCHEDULE DATA ---
const SB_SCHEDULE = {
  slots: [0, 4, 8, 12, 16, 20], // UTC hours
  grid: {
    1: ['Enhance Heroes', 'Build Territory', 'Train Soldiers', 'Tech Research', 'Enhance Raven', 'Enhance Heroes'],
    2: ['Build Territory', 'Train Soldiers', 'Tech Research', 'Enhance Raven', 'Enhance Heroes', 'Build Territory'],
    3: ['Train Soldiers', 'Tech Research', 'Enhance Raven', 'Enhance Heroes', 'Build Territory', 'Train Soldiers'],
    4: ['Tech Research', 'Enhance Raven', 'Enhance Heroes', 'Build Territory', 'Train Soldiers', 'Tech Research'],
    5: ['Enhance Raven', 'Enhance Heroes', 'Build Territory', 'Train Soldiers', 'Tech Research', 'Enhance Raven'],
    6: ['Enhance Heroes', 'Build Territory', 'Train Soldiers', 'Tech Research', 'Enhance Raven', 'Enhance Heroes'],
    7: ['Build Territory', 'Train Soldiers', 'Tech Research', 'Enhance Raven', 'Enhance Heroes', 'Build Territory']
  }
};

const EVENT_EMOJIS = {
  'Enhance Heroes': '🦸',
  'Build Territory': '🏰',
  'Train Soldiers': '⚔️',
  'Tech Research': '🔬',
  'Enhance Raven': '🦅'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];

  if (!signature || !timestamp) {
    return res.status(401).send('Missing signature headers');
  }

  const rawBody = await getRawBody(req);
  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  if (!publicKey) {
    return res.status(500).send('Server configuration error');
  }

  const isValid = await verifyKey(rawBody, signature, timestamp, publicKey);
  if (!isValid) {
    return res.status(401).send('Bad request signature');
  }

  const interaction = JSON.parse(rawBody.toString());

  // 1. Discord PING Verification
  if (interaction.type === InteractionType.PING) {
    return res.status(200).json({ type: InteractionResponseType.PONG });
  }

  // 2. Handle Slash Commands (/sb, /rules, /map)
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = interaction.data;
    const host = req.headers.host || 'la-s78.app';
    const lang = resolveSiteLocale(interaction);

    // --- /sb COMMAND ---
    if (name === 'sb') {
      const now = new Date();
      const currentUtcHour = now.getUTCHours();

      // Auto-detect Alliance Duel Day based on UTC (Mon = Day 1, Sun = Day 7)
      const rawDay = now.getUTCDay();
      const defaultDay = rawDay === 0 ? 7 : rawDay;

      // Allow manual override (e.g. /sb day:4)
      const selectedDay = options?.find(opt => opt.name === 'day')?.value || defaultDay;
      const isToday = selectedDay === defaultDay;

      // Determine active 4-hour time block index (0 to 5)
      let activeSlotIndex = 0;
      for (let i = SB_SCHEDULE.slots.length - 1; i >= 0; i--) {
        if (currentUtcHour >= SB_SCHEDULE.slots[i]) {
          activeSlotIndex = i;
          break;
        }
      }

      const nextSlotIndex = (activeSlotIndex + 1) % 6;
      const dayEvents = SB_SCHEDULE.grid[selectedDay];
      const currentEvent = dayEvents[activeSlotIndex];
      const nextEvent = dayEvents[nextSlotIndex];

      // Calculate UNIX timestamp when the current slot expires
      const nextSlotHour = (SB_SCHEDULE.slots[activeSlotIndex] + 4) % 24;
      const nextSlotTime = new Date(now);
      nextSlotTime.setUTCHours(nextSlotHour, 0, 0, 0);
      if (nextSlotHour <= SB_SCHEDULE.slots[activeSlotIndex]) {
        nextSlotTime.setUTCDate(nextSlotTime.getUTCDate() + 1);
      }
      const nextTimestamp = Math.floor(nextSlotTime.getTime() / 1000);

      // Build vertical mobile-friendly timeline
      const timeline = dayEvents.map((event, idx) => {
        const timeStr = `${String(SB_SCHEDULE.slots[idx]).padStart(2, '0')}:00 UTC`;
        const emoji = EVENT_EMOJIS[event] || '▫️';
        if (isToday && idx === activeSlotIndex) {
          return `▶ **${timeStr} — ${emoji} ${event} (ACTIVE)**`;
        }
        return `• \`${timeStr}\` — ${emoji} ${event}`;
      }).join('\n');

      const fields = [];
      if (isToday) {
        fields.push(
          {
            name: `🟢 Current Event (Ends <t:${nextTimestamp}:R>)`,
            value: `**${EVENT_EMOJIS[currentEvent]} ${currentEvent}**`,
            inline: false
          },
          {
            name: `⏳ Next Event (<t:${nextTimestamp}:t>)`,
            value: `${EVENT_EMOJIS[nextEvent]} ${nextEvent}`,
            inline: false
          }
        );
      }

      fields.push({
        name: `📋 Day ${selectedDay} Full Schedule`,
        value: timeline,
        inline: false
      });

      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [{
            title: `🏮 Survival Battle Schedule — Day ${selectedDay}${isToday ? ' (Today)' : ''}`,
            color: 0xb29a20,
            fields: fields,
            footer: {
              text: "⚠️ Schedule days follow Alliance Duel calendar, NOT Survival Battle."
            }
          }],
          components: [{
            type: 1,
            components: [{
              type: 2,
              style: 5,
              label: "View Full Weekly Matrix",
              url: `https://${host}/${lang}/guides/survival.html`
            }]
          }]
        }
      });
    }

    // --- /rules COMMAND ---
    if (name === 'rules') {
      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [{
            title: "📜 Kingdom War & Ascension Rules",
            color: 0x8f0000,
            fields: [
              {
                name: "⚔️ Ascension Requirements",
                value: "To claim a Top 3 rank, contenders must surpass a current holder’s Might during Alliance Duel Days 3–5 of Kingdom War Week 1.\n*(Note: Might snapshots are taken 10 mins before daily reset.)*",
                inline: false
              },
              {
                name: "👑 Capitol Ownership",
                value: "During non-Kingdom War weeks, the **#1 Alliance** holds the Capitol.",
                inline: false
              }
            ]
          }],
          components: [{
            type: 1,
            components: [{
              type: 2,
              style: 5,
              label: "Open Rules Page",
              url: `https://${host}/${lang}/rules.html`
            }]
          }]
        }
      });
    }

    // --- /map COMMAND ---
    if (name === 'map') {
      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [{
            title: "🗺️ Last Asylum War Room",
            description: "View real-time territory ownership, alliance control, and draft battle proposals.",
            color: 0x0070f3
          }],
          components: [{
            type: 1,
            components: [{
              type: 2,
              style: 5,
              label: "Open Live War Map",
              url: `https://${host}/${lang}/map.html`
            }]
          }]
        }
      });
    }
  }

  // 3. Handle Map Proposal Approval/Rejection Buttons
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const { custom_id } = interaction.data;
    const userId = interaction.member?.user?.id || interaction.user?.id;
    const username = interaction.member?.user?.username || interaction.user?.username || 'Discord Admin';

    if (userId !== process.env.AUTHORIZED_USER_ID) {
      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '⛔ **Access Denied:** Only authorized leadership can approve or reject map proposals.',
          flags: 64
        }
      });
    }

    const isApproved = custom_id === 'approve_proposal';

    if (isApproved) {
      try {
        const blueprintAttachment = interaction.message.attachments?.find(a => a.filename === 'strategy-blueprint.json');
        if (!blueprintAttachment) throw new Error('Blueprint JSON missing from message.');

        const blueprintRes = await fetch(blueprintAttachment.url);
        if (!blueprintRes.ok) throw new Error('Failed to download blueprint file from Discord.');
        const changes = await blueprintRes.json();

        const acceptRes = await fetch(`https://${req.headers.host}/api/accept-proposal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            changes: changes,
            submittedBy: username,
            secretKey: process.env.DISCORD_BOT_TOKEN
          })
        });

        if (!acceptRes.ok) {
          const errorData = await acceptRes.json().catch(() => ({}));
          throw new Error(errorData.error || `Server responded with ${acceptRes.status}`);
        }
      } catch (error) {
        console.error('Interaction bridge failed:', error);
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ **Failed to update map:** ${error.message}`,
            flags: 64
          }
        });
      }
    }

    const originalEmbed = JSON.parse(JSON.stringify(interaction.message.embeds[0]));
    delete originalEmbed.image;
    delete originalEmbed.thumbnail;

    originalEmbed.color = isApproved ? 0x22c55e : 0xef4444;
    originalEmbed.fields[2] = {
      name: 'Status',
      value: isApproved ? `✅ **Approved by <@${userId}>**` : `❌ **Rejected by <@${userId}>**`,
      inline: false
    };

    return res.status(200).json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: {
        embeds: [originalEmbed],
        attachments: interaction.message.attachments ? interaction.message.attachments.map(a => ({ id: a.id })) : [],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                custom_id: 'approve_proposal',
                label: isApproved ? 'Approved' : 'Approve Proposal',
                style: 3,
                disabled: true
              },
              {
                type: 2,
                custom_id: 'reject_proposal',
                label: !isApproved ? 'Rejected' : 'Reject Proposal',
                style: 4,
                disabled: true
              }
            ]
          }
        ]
      }
    });
  }

  return res.status(400).end();
}