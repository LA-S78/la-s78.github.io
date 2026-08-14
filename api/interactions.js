import { verifyKey, InteractionType, InteractionResponseType } from 'discord-interactions';
import { RULES_DATA, SB_DATA } from './_generated_translations.js';

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

const SUPPORTED_LOCALES = ['en', 'es', 'de', 'fr', 'ru', 'it', 'tr', 'uk'];

// --- BULLETPROOF FALLBACKS ---
const FALLBACK_RULES = [
  { title: "📜 1. Respect & Conduct", content: "**Zero Tolerance:** Bullying, racism, hate speech, harassment, or toxic behavior is prohibited.\n**Community Standard:** Treat all players with respect.\n**Reporting:** You **must** provide screenshots/proof when reporting a violation." },
  { title: "🛡️ 2. NAP Protection Rules", content: "The following actions against **NAP Alliances** and their **Academies** are prohibited:\n> 🚫 No Attacking\n> 🚫 No Scouting" },
  { title: "💎 3. Resource & Map Etiquette", content: "**Tile Safety:** Attacking resource tiles is strictly forbidden. Let players farm in peace." },
  { title: "🚛 4. Caravans & Black Ops", content: "Governed by a **Three-Strike System**:\n**Strike 1 & 2:** Reported by R4s. Offender receives a formal warning.\n**Strike 3:** Results in a **Single Base Hit** penalty.\n**Conflict Resolution:** Victims may waive the strike report if an apology is accepted." },
  { title: "🤝 5. Member Poaching", content: "**Active Recruiting:** Messaging members of other NAP alliances to switch is prohibited.\n**Player Autonomy:** Players are free to leave and join alliances voluntarily.\n**Applications:** 'Walk-in' applicants are allowed, provided no prior solicitation occurred." },
  { title: "📉 6. Other Alliances", content: "**Fair Play:** Attacking smaller alliances because they are outside the NAP is forbidden." },
  { title: "🕊️ 7. Diplomacy & Conflict Resolution", content: "1. **Private Resolution:** Handle disputes privately between Alliance Leads/Diplomats first.\n2. **Escalation:** If unresolved, bring to **NAP Leadership**.\n> ⚠️ Do not bring rule disputes, grievances, or drama into General or World Chat. Keep it to private channels." },
  { title: "🎓 8. Academies", content: "**Designation:** Each NAP alliance may protect **one** academy.\n**Governance:** Academies entering the Top 10 do not receive voting rights while they maintain academy status." },
  { title: "⚠️ 9. General Rule Violations", content: "*(Except #4)*\n**1st Offense:** Official Warning.\n**2nd Offense:** Removal from alliance or **NAP Blacklist**.\n**Blacklist Policy:** Prohibits joining any NAP-protected alliance." }
];

const FALLBACK_SB_SCHEDULE = [
  {
    time: "00:00",
    d1: { text: "Enhance Heroes", key: "enhance_heroes" },
    d2: { text: "Build Territory", key: "build_territory" },
    d3: { text: "Train Soldiers", key: "train_soldiers" },
    d4: { text: "Tech Research", key: "tech_research" },
    d5: { text: "Enhance Raven", key: "enhance_raven" },
    d6: { text: "Enhance Heroes", key: "enhance_heroes" },
    d7: { text: "Build Territory", key: "build_territory" }
  },
  {
    time: "04:00",
    d1: { text: "Build Territory", key: "build_territory" },
    d2: { text: "Train Soldiers", key: "train_soldiers" },
    d3: { text: "Tech Research", key: "tech_research" },
    d4: { text: "Enhance Raven", key: "enhance_raven" },
    d5: { text: "Enhance Heroes", key: "enhance_heroes" },
    d6: { text: "Build Territory", key: "build_territory" },
    d7: { text: "Train Soldiers", key: "train_soldiers" }
  },
  {
    time: "08:00",
    d1: { text: "Train Soldiers", key: "train_soldiers" },
    d2: { text: "Tech Research", key: "tech_research" },
    d3: { text: "Enhance Raven", key: "enhance_raven" },
    d4: { text: "Enhance Heroes", key: "enhance_heroes" },
    d5: { text: "Build Territory", key: "build_territory" },
    d6: { text: "Train Soldiers", key: "train_soldiers" },
    d7: { text: "Tech Research", key: "tech_research" }
  },
  {
    time: "12:00",
    d1: { text: "Tech Research", key: "tech_research" },
    d2: { text: "Enhance Raven", key: "enhance_raven" },
    d3: { text: "Enhance Heroes", key: "enhance_heroes" },
    d4: { text: "Build Territory", key: "build_territory" },
    d5: { text: "Train Soldiers", key: "train_soldiers" },
    d6: { text: "Tech Research", key: "tech_research" },
    d7: { text: "Enhance Raven", key: "enhance_raven" }
  },
  {
    time: "16:00",
    d1: { text: "Enhance Raven", key: "enhance_raven" },
    d2: { text: "Enhance Heroes", key: "enhance_heroes" },
    d3: { text: "Build Territory", key: "build_territory" },
    d4: { text: "Train Soldiers", key: "train_soldiers" },
    d5: { text: "Tech Research", key: "tech_research" },
    d6: { text: "Enhance Raven", key: "enhance_raven" },
    d7: { text: "Enhance Heroes", key: "enhance_heroes" }
  },
  {
    time: "20:00",
    d1: { text: "Enhance Heroes", key: "enhance_heroes" },
    d2: { text: "Build Territory", key: "build_territory" },
    d3: { text: "Train Soldiers", key: "train_soldiers" },
    d4: { text: "Tech Research", key: "tech_research" },
    d5: { text: "Enhance Raven", key: "enhance_raven" },
    d6: { text: "Enhance Heroes", key: "enhance_heroes" },
    d7: { text: "Build Territory", key: "build_territory" }
  }
];

function resolveUserLocale(interaction, overrideLang) {
  if (overrideLang && SUPPORTED_LOCALES.includes(overrideLang)) return overrideLang;
  const userLocale = interaction?.locale || interaction?.guild_locale || 'en';
  const baseCode = userLocale.split('-')[0].toLowerCase();
  return SUPPORTED_LOCALES.includes(baseCode) ? baseCode : 'en';
}

function cleanHtmlToMarkdown(htmlString) {
  if (!htmlString) return '';
  return htmlString
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?strong>/gi, '**')
    .replace(/<\/?em>/gi, '*')
    .replace(/<\/?p>/gi, '')
    .replace(/<div[^>]*>/gi, '\n> ')
    .replace(/<\/div>/gi, '')
    .replace(/<blockquote[^>]*>/gi, '\n> ')
    .replace(/<\/blockquote>/gi, '')
    .trim();
}

const EVENT_EMOJIS = {
  'enhance_heroes': '🦸',
  'build_territory': '🏰',
  'train_soldiers': '⚔️',
  'tech_research': '🔬',
  'enhance_raven': '🦅'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  if (!signature || !timestamp) return res.status(401).send('Missing signature headers');

  const rawBody = await getRawBody(req);
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) return res.status(500).send('Server configuration error');

  const isValid = await verifyKey(rawBody, signature, timestamp, publicKey);
  if (!isValid) return res.status(401).send('Bad request signature');

  const interaction = JSON.parse(rawBody.toString());

  if (interaction.type === InteractionType.PING) {
    return res.status(200).json({ type: InteractionResponseType.PONG });
  }

  // --- SLASH COMMAND HANDLING ---
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = interaction.data;
    const host = req.headers.host || 'la-s78.app';
    const providedLang = options?.find(opt => opt.name === 'lang')?.value;
    const lang = resolveUserLocale(interaction, providedLang);

    // --- /sb COMMAND ---
    if (name === 'sb') {
      const now = new Date();
      const gameTime = new Date(now.getTime() + (2 * 60 * 60 * 1000)); // UTC+2
      const gameHour = gameTime.getUTCHours();
      
      const rawDay = gameTime.getUTCDay();
      const defaultDay = rawDay === 0 ? 7 : rawDay;
      const selectedDay = options?.find(opt => opt.name === 'day')?.value || defaultDay;
      const isToday = selectedDay === defaultDay;

      // Extract translated schedule or fallback
      let sbSchedule = FALLBACK_SB_SCHEDULE;
      if (SB_DATA && SB_DATA[lang] && SB_DATA[lang].length > 0) {
        sbSchedule = SB_DATA[lang];
      } else if (SB_DATA && SB_DATA['en'] && SB_DATA['en'].length > 0) {
        sbSchedule = SB_DATA['en'];
      }

      const slotHours = [0, 4, 8, 12, 16, 20];
      let activeSlotIndex = 0;
      for (let i = slotHours.length - 1; i >= 0; i--) {
        if (gameHour >= slotHours[i]) {
          activeSlotIndex = i;
          break;
        }
      }

      const nextSlotIndex = (activeSlotIndex + 1) % 6;
      const dayKey = `d${selectedDay}`;

      const nextSlotHourGT = (slotHours[activeSlotIndex] + 4) % 24;
      const nextSlotTime = new Date(now);
      const nextSlotUtcHour = (nextSlotHourGT - 2 + 24) % 24;
      nextSlotTime.setUTCHours(nextSlotUtcHour, 0, 0, 0);
      if (nextSlotUtcHour <= now.getUTCHours() && nextSlotHourGT <= gameHour) {
        nextSlotTime.setUTCDate(nextSlotTime.getUTCDate() + 1);
      }
      const nextTimestamp = Math.floor(nextSlotTime.getTime() / 1000);

      let currentEventText = "Event";
      let currentEventEmoji = "▫️";
      let nextEventText = "Event";
      let nextEventEmoji = "▫️";

      const timeline = slotHours.map((hour, idx) => {
        const timeStr = `${String(hour).padStart(2, '0')}:00 GT`;
        const slotData = sbSchedule?.[idx]?.[dayKey];
        const text = slotData?.text || `Event ${idx + 1}`;
        const emoji = EVENT_EMOJIS[slotData?.key] || '▫️';

        if (idx === activeSlotIndex) {
          currentEventText = text;
          currentEventEmoji = emoji;
        }
        if (idx === nextSlotIndex) {
          nextEventText = text;
          nextEventEmoji = emoji;
        }

        if (isToday && idx === activeSlotIndex) {
          return `▶ **${timeStr} — ${emoji} ${text} (ACTIVE)**`;
        }
        return `• \`${timeStr}\` — ${emoji} ${text}`;
      }).join('\n');

      const fields = [];
      if (isToday) {
        fields.push(
          { name: `🟢 Current Event (Ends <t:${nextTimestamp}:R>)`, value: `**${currentEventEmoji} ${currentEventText}**`, inline: false },
          { name: `⏳ Next Event (<t:${nextTimestamp}:t>)`, value: `${nextEventEmoji} ${nextEventText}`, inline: false }
        );
      }
      fields.push({ name: `📋 Day ${selectedDay} Schedule (Game Time / UTC+2)`, value: timeline, inline: false });

      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [{
            title: `🏮 Survival Battle — Day ${selectedDay}`,
            color: 0xb29a20,
            fields: fields,
            footer: { text: "Times are Game Time (UTC+2). Relative countdowns adapt to your local time." }
          }],
          components: [{
            type: 1,
            components: [{
              type: 2, style: 5, label: "View Full Schedule",
              url: `https://${host}/${lang}/guides/survival.html`
            }]
          }]
        }
      });
    }

    // --- /rules COMMAND ---
    if (name === 'rules') {
      const requestedRule = options?.find(opt => opt.name === 'rule')?.value;
      
      let rulesData = FALLBACK_RULES;
      if (RULES_DATA && RULES_DATA[lang] && RULES_DATA[lang].length > 0) {
        rulesData = RULES_DATA[lang];
      } else if (RULES_DATA && RULES_DATA['en'] && RULES_DATA['en'].length > 0) {
        rulesData = RULES_DATA['en'];
      }
      
      let title = "📜 Kingdom War & Alliance Rules";
      let fields = [];
      let description = undefined;

      if (requestedRule) {
        const ruleIndex = requestedRule - 1;
        const targetRule = rulesData[ruleIndex];
        
        if (targetRule) {
          title = targetRule.title;
          description = cleanHtmlToMarkdown(targetRule.content);
        } else {
          title = "⚠️ Rule Not Found";
          description = `Rule ${requestedRule} does not exist. Choose between 1 and ${rulesData.length}.`;
        }
      } else {
        description = "Official NAP & Kingdom Guidelines.";
        fields = rulesData.map(rule => ({
          name: rule.title,
          value: cleanHtmlToMarkdown(rule.content),
          inline: false
        }));
      }

      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [{
            title: title,
            description: description,
            color: 0x8f0000,
            fields: fields
          }],
          components: [{
            type: 1,
            components: [{
              type: 2, style: 5, label: "Open Rules Page",
              url: `https://${host}/${lang}/rules.html`
            }]
          }]
        }
      });
    }

// --- /map COMMAND ---
    if (name === 'map') {
      let mapImageUrl = null;

      // Try to fetch the latest live snapshot
      try {
        const stateRes = await fetch(`https://${host}/api/map-state?t=${Date.now()}`);
        if (stateRes.ok) {
          const liveState = await stateRes.json();
          if (liveState.lastSnapshotUrl) {
            mapImageUrl = liveState.lastSnapshotUrl;
          }
        }
      } catch (err) {}

      // Build the base embed without an image
      const mapEmbed = {
        title: "🗺️ Last Asylum War Room",
        description: "View real-time territory ownership, alliance control, and draft battle proposals.",
        color: 0x0070f3
      };

      // Only attach the image payload if a live snapshot was found
      if (mapImageUrl) {
        mapEmbed.image = { url: mapImageUrl };
      }

      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [mapEmbed],
          components: [{
            type: 1,
            components: [{
              type: 2, style: 5, label: "Open Live War Map",
              url: `https://${host}/${lang}/map.html`
            }]
          }]
        }
      });
    }
  }

  // --- BUTTON INTERACTIONS (Map Proposals) ---
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
        const imageAttachment = interaction.message.attachments?.find(a => a.contentType?.startsWith('image/') || a.filename?.match(/\.(jpg|jpeg|png)$/i));

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
            secretKey: process.env.DISCORD_BOT_TOKEN,
            snapshotUrl: imageAttachment ? imageAttachment.url : null
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
          data: { content: `❌ **Failed to update map:** ${error.message}`, flags: 64 }
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
              { type: 2, custom_id: 'approve_proposal', label: isApproved ? 'Approved' : 'Approve Proposal', style: 3, disabled: true },
              { type: 2, custom_id: 'reject_proposal', label: !isApproved ? 'Rejected' : 'Reject Proposal', style: 4, disabled: true }
            ]
          }
        ]
      }
    });
  }

  return res.status(400).end();
}