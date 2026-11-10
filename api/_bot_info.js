// api/_bot_info.js
// /sb (Survival Battle schedule) and /rules.
// Split out of api/interactions.js unchanged.

import { InteractionResponseType } from 'discord-interactions';
import { NOT_HANDLED } from './_bot_common.js';
import { RULES_DATA, SB_DATA } from './_generated_translations.js';

/** --- /sb COMMAND --- */
export async function handleSbCommand(ctx) {
  const { res, name, options, resolvedHost, lang, t } = ctx;
  const now = new Date();

  // Game Time is UTC-2 (subtract 2 hours from UTC)
  const gameTime = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const gameHour = gameTime.getUTCHours();

  const rawDay = gameTime.getUTCDay();
  const defaultDay = rawDay === 0 ? 7 : rawDay;
  const selectedDay = options?.find((opt) => opt.name === 'day')?.value || defaultDay;
  const isToday = selectedDay === defaultDay;

  let sbSchedule = FALLBACK_SB_SCHEDULE;
  if (SB_DATA?.[lang]?.length > 0) {
    sbSchedule = SB_DATA[lang];
  } else if (SB_DATA?.['en']?.length > 0) {
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
  const nextSlotUtcHour = (nextSlotHourGT + 2) % 24;

  const nextSlotTime = new Date(now);
  nextSlotTime.setUTCHours(nextSlotUtcHour, 0, 0, 0);

  if (nextSlotHourGT <= gameHour) {
    nextSlotTime.setUTCDate(nextSlotTime.getUTCDate() + 1);
  }
  const nextTimestamp = Math.floor(nextSlotTime.getTime() / 1000);

  let currentEventText = 'Event';
  let currentEventEmoji = '▫️';
  let nextEventText = 'Event';
  let nextEventEmoji = '▫️';

  const timeline = slotHours
    .map((hour, idx) => {
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
    })
    .join('\n');

  const fields = [];
  if (isToday) {
    fields.push(
      {
        name: `🟢 ${t.sb.current_event} (Ends <t:${nextTimestamp}:R>)`,
        value: `**${currentEventEmoji} ${currentEventText}**`,
        inline: false,
      },
      {
        name: `⏳ ${t.sb.next_event} (<t:${nextTimestamp}:t>)`,
        value: `${nextEventEmoji} ${nextEventText}`,
        inline: false,
      },
    );
  }
  const scheduleTitleText = t.sb.schedule_title.replace('{day}', selectedDay);
  fields.push({
    name: `📋 ${scheduleTitleText}`,
    value: timeline,
    inline: false,
  });

  return res.status(200).json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [
        {
          title: `🏮 Survival Battle — Day ${selectedDay}`,
          color: 0xb29a20,
          fields,
          footer: { text: t.sb.footer },
        },
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              label: t.sb.button,
              url: `https://${resolvedHost}/${lang}/guides/survival.html`,
            },
          ],
        },
      ],
    },
  });
  return NOT_HANDLED;
}

/** --- /rules COMMAND --- */
export async function handleRulesCommand(ctx) {
  const { res, name, options, resolvedHost, lang, t } = ctx;
  const requestedRule = options?.find((opt) => opt.name === 'rule')?.value;

  let rulesData = FALLBACK_RULES;
  if (RULES_DATA?.[lang]?.length > 0) {
    rulesData = RULES_DATA[lang];
  } else if (RULES_DATA?.['en']?.length > 0) {
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
      description = t.rules.not_found_desc
        .replace('{rule}', requestedRule)
        .replace('{max}', rulesData.length);
    }
  } else {
    description = t.rules.description;
    fields = rulesData.map((rule) => ({
      name: rule.title,
      value: cleanHtmlToMarkdown(rule.content),
      inline: false,
    }));
  }

  return res.status(200).json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [
        {
          title,
          description,
          color: 0x8f0000,
          fields,
          footer: { text: 'Last Asylum Kingdom Compendium' },
        },
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              label: t.rules.button,
              url: `https://${resolvedHost}/${lang}/rules.html`,
            },
          ],
        },
      ],
    },
  });
  return NOT_HANDLED;
}

export const FALLBACK_RULES = [
  {
    title: '📜 1. Respect & Conduct',
    content:
      '**Zero Tolerance:** Bullying, racism, hate speech, harassment, or toxic behavior is prohibited.\n**Community Standard:** Treat all players with respect.\n**Reporting:** You **must** provide screenshots/proof when reporting a violation.',
  },
  {
    title: '🛡️ 2. NAP Protection Rules',
    content:
      'The following actions against **NAP Alliances** and their **Academies** are prohibited:\n> 🚫 No Attacking\n> 🚫 No Scouting',
  },
  {
    title: '💎 3. Resource & Map Etiquette',
    content:
      '**Tile Safety:** Attacking resource tiles is strictly forbidden. Let players farm in peace.',
  },
  {
    title: '🚛 4. Caravans & Black Ops',
    content:
      'Governed by a **Three-Strike System**:\n**Strike 1 & 2:** Reported by R4s. Offender receives a formal warning.\n**Strike 3:** Results in a **Single Base Hit** penalty.\n**Conflict Resolution:** Victims may waive the strike report if an apology is accepted.',
  },
  {
    title: '🤝 5. Member Poaching',
    content:
      "**Active Recruiting:** Messaging members of other NAP alliances to switch is prohibited.\n**Player Autonomy:** Players are free to leave and join alliances voluntarily.\n**Applications:** 'Walk-in' applicants are allowed, provided no prior solicitation occurred.",
  },
  {
    title: '📉 6. Other Alliances',
    content:
      '**Fair Play:** Attacking smaller alliances because they are outside the NAP is forbidden.',
  },
  {
    title: '🕊️ 7. Diplomacy & Conflict Resolution',
    content:
      '1. **Private Resolution:** Handle disputes privately between Alliance Leads/Diplomats first.\n2. **Escalation:** If unresolved, bring to **NAP Leadership**.\n> ⚠️ Do not bring rule disputes, grievances, or drama into General or World Chat. Keep it to private channels.',
  },
  {
    title: '🎓 8. Academies',
    content:
      '**Designation:** Each NAP alliance may protect **one** academy.\n**Governance:** Academies entering the Top 10 do not receive voting rights while they maintain academy status.',
  },
  {
    title: '⚠️ 9. General Rule Violations',
    content:
      '*(Except #4)*\n**1st Offense:** Official Warning.\n**2nd Offense:** Removal from alliance or **NAP Blacklist**.\n**Blacklist Policy:** Prohibits joining any NAP-protected alliance.',
  },
];

export const FALLBACK_SB_SCHEDULE = [
  {
    time: '00:00',
    d1: { text: 'Enhance Heroes', key: 'enhance_heroes' },
    d2: { text: 'Build Territory', key: 'build_territory' },
    d3: { text: 'Train Soldiers', key: 'train_soldiers' },
    d4: { text: 'Tech Research', key: 'tech_research' },
    d5: { text: 'Enhance Raven', key: 'enhance_raven' },
    d6: { text: 'Enhance Heroes', key: 'enhance_heroes' },
    d7: { text: 'Build Territory', key: 'build_territory' },
  },
  {
    time: '04:00',
    d1: { text: 'Build Territory', key: 'build_territory' },
    d2: { text: 'Train Soldiers', key: 'train_soldiers' },
    d3: { text: 'Tech Research', key: 'tech_research' },
    d4: { text: 'Enhance Raven', key: 'enhance_raven' },
    d5: { text: 'Enhance Heroes', key: 'enhance_heroes' },
    d6: { text: 'Build Territory', key: 'build_territory' },
    d7: { text: 'Train Soldiers', key: 'train_soldiers' },
  },
  {
    time: '08:00',
    d1: { text: 'Train Soldiers', key: 'train_soldiers' },
    d2: { text: 'Tech Research', key: 'tech_research' },
    d3: { text: 'Enhance Raven', key: 'enhance_raven' },
    d4: { text: 'Enhance Heroes', key: 'enhance_heroes' },
    d5: { text: 'Build Territory', key: 'build_territory' },
    d6: { text: 'Train Soldiers', key: 'train_soldiers' },
    d7: { text: 'Tech Research', key: 'tech_research' },
  },
  {
    time: '12:00',
    d1: { text: 'Tech Research', key: 'tech_research' },
    d2: { text: 'Enhance Raven', key: 'enhance_raven' },
    d3: { text: 'Enhance Heroes', key: 'enhance_heroes' },
    d4: { text: 'Build Territory', key: 'build_territory' },
    d5: { text: 'Train Soldiers', key: 'train_soldiers' },
    d6: { text: 'Tech Research', key: 'tech_research' },
    d7: { text: 'Enhance Raven', key: 'enhance_raven' },
  },
  {
    time: '16:00',
    d1: { text: 'Enhance Raven', key: 'enhance_raven' },
    d2: { text: 'Enhance Heroes', key: 'enhance_heroes' },
    d3: { text: 'Build Territory', key: 'build_territory' },
    d4: { text: 'Train Soldiers', key: 'train_soldiers' },
    d5: { text: 'Tech Research', key: 'tech_research' },
    d6: { text: 'Enhance Raven', key: 'enhance_raven' },
    d7: { text: 'Enhance Heroes', key: 'enhance_heroes' },
  },
  {
    time: '20:00',
    d1: { text: 'Enhance Heroes', key: 'enhance_heroes' },
    d2: { text: 'Build Territory', key: 'build_territory' },
    d3: { text: 'Train Soldiers', key: 'train_soldiers' },
    d4: { text: 'Tech Research', key: 'tech_research' },
    d5: { text: 'Enhance Raven', key: 'enhance_raven' },
    d6: { text: 'Enhance Heroes', key: 'enhance_heroes' },
    d7: { text: 'Build Territory', key: 'build_territory' },
  },
];

export const EVENT_EMOJIS = {
  enhance_heroes: '🦸',
  build_territory: '🏰',
  train_soldiers: '⚔️',
  tech_research: '🔬',
  enhance_raven: '🦅',
};

export function cleanHtmlToMarkdown(htmlString) {
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
