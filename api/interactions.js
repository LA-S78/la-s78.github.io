// api/interactions.js
import crypto from 'crypto';
import { verifyKey, InteractionType, InteractionResponseType } from 'discord-interactions';
import { RULES_DATA, SB_DATA, BOT_DATA } from './_generated_translations.js';

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

const FALLBACK_BOT_STRINGS = {
  sb: {
    current_event: "Current Event",
    next_event: "Next Event",
    schedule_title: "Day {day} Schedule (Game Time / UTC+2)",
    footer: "Times are Game Time (UTC+2). Relative countdowns adapt to your local time.",
    button: "View Full Schedule"
  },
  rules: {
    title: "📜 Server Rules",
    description: "Official NAP & Kingdom Rules.",
    not_found_title: "⚠️ Rule Not Found",
    not_found_desc: "Rule {rule} does not exist. Choose between 1 and {max}.",
    button: "Open Rules Page"
  },
  map: {
    title: "🗺️ Last Asylum Territory Map",
    description: "View real-time territory ownership.",
    button: "Open Live Map"
  },
  admin: {
    access_denied: "⛔ **Access Denied:** Only authorized leadership can approve or reject proposals.",
    failed_update: "Failed to apply proposal update:"
  }
};

function getBotStrings(lang) {
  return BOT_DATA?.[lang] || FALLBACK_BOT_STRINGS;
}

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
  enhance_heroes: '🦸',
  build_territory: '🏰',
  train_soldiers: '⚔️',
  tech_research: '🔬',
  enhance_raven: '🦅'
};

function createNominationToken(payload, secret) {
  const dataString = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(dataString)
    .digest('base64url');
  return `${dataString}.${signature}`;
}

// In-Memory Role Cache (15-Minute TTL)
let roleCache = {
  guildId: null,
  map: null,
  timestamp: 0
};

async function getGuildRoleMap(guildId, botToken) {
  const now = Date.now();
  if (roleCache.map && roleCache.guildId === guildId && (now - roleCache.timestamp < 15 * 60 * 1000)) {
    return roleCache.map;
  }

  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${botToken}` },
    signal: AbortSignal.timeout(2200)
  });

  if (!res.ok) throw new Error(`Discord API roles error (${res.status})`);

  const roles = await res.json();
  const map = new Map();
  roles.forEach(r => map.set(r.id, r.name.toLowerCase().trim()));

  roleCache = {
    guildId,
    map,
    timestamp: now
  };

  return map;
}

async function getGistData(gistId, gistToken) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: { Authorization: `Bearer ${gistToken}`, 'User-Agent': 'WarRoom-App' },
    signal: AbortSignal.timeout(2200)
  });

  if (!res.ok) throw new Error(`GitHub Gist error (${res.status})`);
  return res.json();
}

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
    const t = getBotStrings(lang);

    // --- /sb COMMAND ---
    if (name === 'sb') {
      const now = new Date();
      const gameTime = new Date(now.getTime() + (2 * 60 * 60 * 1000));
      const gameHour = gameTime.getUTCHours();

      const rawDay = gameTime.getUTCDay();
      const defaultDay = rawDay === 0 ? 7 : rawDay;
      const selectedDay = options?.find(opt => opt.name === 'day')?.value || defaultDay;
      const isToday = selectedDay === defaultDay;

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
          { name: `🟢 ${t.sb.current_event} (Ends <t:${nextTimestamp}:R>)`, value: `**${currentEventEmoji} ${currentEventText}**`, inline: false },
          { name: `⏳ ${t.sb.next_event} (<t:${nextTimestamp}:t>)`, value: `${nextEventEmoji} ${nextEventText}`, inline: false }
        );
      }
      const scheduleTitleText = t.sb.schedule_title.replace('{day}', selectedDay);
      fields.push({ name: `📋 ${scheduleTitleText}`, value: timeline, inline: false });

      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [{
            title: `🏮 Survival Battle — Day ${selectedDay}`,
            color: 0xb29a20,
            fields: fields,
            footer: { text: t.sb.footer }
          }],
          components: [{
            type: 1,
            components: [{
              type: 2, style: 5, label: t.sb.button,
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

      let title = t.rules.title;
      let fields = [];
      let description;

      if (requestedRule) {
        const ruleIndex = requestedRule - 1;
        const targetRule = rulesData[ruleIndex];

        if (targetRule) {
          title = targetRule.title;
          description = cleanHtmlToMarkdown(targetRule.content);
        } else {
          title = t.rules.not_found_title;
          description = t.rules.not_found_desc.replace('{rule}', requestedRule).replace('{max}', rulesData.length);
        }
      } else {
        description = t.rules.description;
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
              type: 2, style: 5, label: t.rules.button,
              url: `https://${host}/${lang}/rules.html`
            }]
          }]
        }
      });
    }

    // --- /map COMMAND ---
    if (name === 'map') {
      let mapImageUrl = null;

      try {
        const stateRes = await fetch(`https://${host}/api/map-state?t=${Date.now()}`);
        if (stateRes.ok) {
          const liveState = await stateRes.json();
          if (liveState.lastSnapshotUrl) {
            mapImageUrl = liveState.lastSnapshotUrl;
          }
        }
      } catch (err) {}

      const mapEmbed = {
        title: t.map.title,
        description: t.map.description,
        color: 0x0070f3
      };

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
              type: 2, style: 5, label: t.map.button,
              url: `https://${host}/${lang}/map.html`
            }]
          }]
        }
      });
    }

    // --- /nominate COMMAND ---
    if (name === 'nominate') {
      const guildId = interaction.guild_id;
      const member = interaction.member;
      const botToken = process.env.DISCORD_BOT_TOKEN;
      const GIST_ID = process.env.GIST_ID;
      const GIST_TOKEN = process.env.GIST_TOKEN;

      if (!guildId || !member) {
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '⚠️ This command must be executed inside your alliance Discord server.', flags: 64 }
        });
      }

      try {
        // Parallelized fetches with 2200ms timeout ceiling
        const [roleMap, gistData] = await Promise.all([
          getGuildRoleMap(guildId, botToken),
          getGistData(GIST_ID, GIST_TOKEN)
        ]);

        const memberRoleNames = (member.roles || []).map(id => roleMap.get(id)).filter(Boolean);

        // Verify caller holds @r5
        const isR5 = memberRoleNames.some(r => r === 'r5' || r === '@r5');
        if (!isR5) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '⛔ **Access Denied:** Only Alliance Leaders holding the **@r5** role can submit reward nominations.',
              flags: 64
            }
          });
        }

        const mapState = JSON.parse(gistData.files['map-state.json']?.content || '{}');
        const rewardsData = JSON.parse(gistData.files['rewards-data.json']?.content || '{}');

        // Match member's roles against known alliance tags
        const knownAlliances = Object.keys(mapState.alliances || {});
        const matchedAllianceTag = knownAlliances.find(tag => {
          const cleanTag = tag.toLowerCase();
          return memberRoleNames.some(r =>
            r === cleanTag ||
            r === `@${cleanTag}` ||
            r === `[${cleanTag}]`
          );
        });

        if (!matchedAllianceTag) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `⚠️ Could not detect your alliance tag role. Make sure you have your alliance role (e.g. \`@${knownAlliances[0] || 'TAG'}\`) assigned.`,
              flags: 64
            }
          });
        }

        const allianceInfo = mapState.alliances[matchedAllianceTag];
        const rank = parseInt(allianceInfo?.rank, 10);

        if (isNaN(rank)) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: `⚠️ **[${matchedAllianceTag}]** does not have an active rank assigned in the War Room.`, flags: 64 }
          });
        }

        const tiers = rewardsData.distribution_tiers || [];
        const matchedTier = tiers.find(tier => {
          const min = parseInt(tier.min_rank ?? tier.minRank, 10);
          const max = parseInt(tier.max_rank ?? tier.maxRank, 10);
          return !isNaN(min) && !isNaN(max) && rank >= min && rank <= max;
        });

        if (!matchedTier) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: `⚠️ **[${matchedAllianceTag}]** (Rank ${rank}) is not currently eligible for rewards under the active plan.`, flags: 64 }
          });
        }

        const allotment = matchedTier.chests || { commanders_will: 0, loyal_servant: 0, followers_heart: 0 };
        const totalChests = (allotment.commanders_will || 0) + (allotment.loyal_servant || 0) + (allotment.followers_heart || 0);

        if (totalChests === 0) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: `⚠️ **[${matchedAllianceTag}]** has 0 chests allocated under the current distribution.`, flags: 64 }
          });
        }

        const tokenPayload = {
          alliance: matchedAllianceTag,
          rank: rank,
          allotment: allotment,
          exp: Date.now() + (24 * 60 * 60 * 1000)
        };
        const token = createNominationToken(tokenPayload, botToken);
        const nominateUrl = `https://${host}/nominate.html?token=${token}`;

        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [{
              title: `🎁 Reward Nominations — [${matchedAllianceTag}]`,
              color: 0xb8975a,
              description: `You are eligible for **${totalChests} chests** based on your **Rank ${rank}** finish.\nClick the button below to submit your recipient list.`,
              fields: [
                { name: '🟡 Gold (Commander)', value: `×${allotment.commanders_will || 0}`, inline: true },
                { name: '🟣 Purple (Servant)', value: `×${allotment.loyal_servant || 0}`, inline: true },
                { name: '🔵 Blue (Follower)', value: `×${allotment.followers_heart || 0}`, inline: true }
              ],
              footer: { text: 'Link is private and expires in 24 hours.' }
            }],
            components: [{
              type: 1,
              components: [{
                type: 2,
                style: 5,
                label: 'Open Nomination Portal',
                url: nominateUrl
              }]
            }],
            flags: 64
          }
        });
      } catch (err) {
        console.error('Nominate error:', err);
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `⚠️ Connection busy: ${err.message}. Please retry in a few seconds.`, flags: 64 }
        });
      }
    }

    // --- /rewards COMMAND ---
    if (name === 'rewards') {
      const GIST_ID = process.env.GIST_ID;
      const GIST_TOKEN = process.env.GIST_TOKEN;

      try {
        const gistData = await getGistData(GIST_ID, GIST_TOKEN);
        const mapState = JSON.parse(gistData.files['map-state.json']?.content || '{}');
        const rewardsData = JSON.parse(gistData.files['rewards-data.json']?.content || '{}');
        const nominations = JSON.parse(gistData.files['rewards-nominations.json']?.content || '{}');

        const tiers = rewardsData.distribution_tiers || [];
        const alliances = mapState.alliances || {};

        const eligibleRoster = [];

        Object.entries(alliances).forEach(([tag, data]) => {
          const rank = parseInt(data.rank, 10);
          if (isNaN(rank)) return;

          const matchedTier = tiers.find(t => rank >= t.min_rank && rank <= t.max_rank);
          if (!matchedTier) return;

          const allotment = matchedTier.chests || {};
          const totalChests = (allotment.commanders_will || 0) + (allotment.loyal_servant || 0) + (allotment.followers_heart || 0);

          if (totalChests > 0) {
            eligibleRoster.push({
              tag,
              rank,
              quota: totalChests
            });
          }
        });

        eligibleRoster.sort((a, b) => a.rank - b.rank);

        if (eligibleRoster.length === 0) {
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '⚠️ No alliances are currently eligible under the active rewards plan.',
              flags: 64
            }
          });
        }

        let submittedCount = 0;
        const statusLines = eligibleRoster.map(item => {
          const entry = nominations[item.tag];
          if (entry && entry.recipients) {
            submittedCount++;
            const totalNominated =
              (entry.recipients.commanders_will?.length || 0) +
              (entry.recipients.loyal_servant?.length || 0) +
              (entry.recipients.followers_heart?.length || 0);

            const submitUnix = Math.floor(new Date(entry.submittedAt).getTime() / 1000);
            return `✅ **[${item.tag}]** (Rank ${item.rank}) — **${totalNominated}/${item.quota}** nominated (<t:${submitUnix}:R>)`;
          } else {
            return `⏳ **[${item.tag}]** (Rank ${item.rank}) — **Awaiting submission** (${item.quota} chests)`;
          }
        });

        const isComplete = submittedCount === eligibleRoster.length;
        const progressHeader = `**${submittedCount} of ${eligibleRoster.length} Alliances Submitted**`;

        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [{
              title: '📋 Alliance Reward Nomination Status',
              color: isComplete ? 0x22c55e : 0xb8975a,
              description: `${progressHeader}\n\n${statusLines.join('\n')}`,
              footer: { text: 'Last Asylum Capitol Administration' },
              timestamp: new Date().toISOString()
            }],
            components: [{
              type: 1,
              components: [{
                type: 2,
                style: 5,
                label: "Open King's Console",
                url: `https://${host}/distribute.html`
              }]
            }]
          }
        });
      } catch (err) {
        console.error('Rewards status error:', err);
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `⚠️ Connection busy: ${err.message}. Please retry in a few seconds.`, flags: 64 }
        });
      }
    }
  }

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
        attachments: [],
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

  return res.status(400).end();
}