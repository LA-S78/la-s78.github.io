// api/_bot_common.js
// Shared pieces of the Discord bot (api/interactions.js): language, who clicked, private replies, the Gist read.
// Split out of api/interactions.js unchanged.

import { InteractionResponseType } from 'discord-interactions';
import { BOT_DATA } from './_generated_translations.js';
import { readGist } from './_gist.js';
import { say } from './_messages.js';

export const SUPPORTED_LOCALES = ['en', 'es', 'de', 'fr', 'ru', 'it', 'tr', 'uk'];

export const FALLBACK_BOT_STRINGS = {
  sb: {
    current_event: 'Current Event',
    next_event: 'Next Event',
    schedule_title: 'Day {day} Schedule (Game Time / UTC-2)',
    footer: 'Times are Game Time (UTC-2). Relative countdowns adapt to your local time.',
    button: 'View Full Schedule',
  },
  rules: {
    title: '📜 Server Rules',
    description: 'Official NAP & Kingdom Rules.',
    not_found_title: '⚠️ Rule Not Found',
    not_found_desc: 'Rule {rule} does not exist. Choose between 1 and {max}.',
    button: 'Open Rules Page',
  },
  map: {
    title: '🗺️ Last Asylum Territory Map',
    description: 'View real-time territory ownership.',
    button: 'Web Map',
  },
  admin: {
    access_denied:
      '⛔ **Access Denied:** Only designated Kingdom Stewards can approve or reject NAP Leadership proposals.',
    failed_update: 'Failed to apply proposal update:',
  },
};

export function getBotStrings(lang) {
  return BOT_DATA?.[lang] || FALLBACK_BOT_STRINGS;
}

export function resolveUserLocale(interaction, overrideLang) {
  if (overrideLang && SUPPORTED_LOCALES.includes(overrideLang)) return overrideLang;
  const userLocale = interaction?.locale || interaction?.guild_locale || 'en';
  const baseCode = userLocale.split('-')[0].toLowerCase();
  return SUPPORTED_LOCALES.includes(baseCode) ? baseCode : 'en';
}

export function resolveActorName(interaction, fallback = 'Leadership') {
  return (
    interaction.member?.nick ||
    interaction.member?.user?.global_name ||
    interaction.member?.user?.username ||
    interaction.user?.global_name ||
    interaction.user?.username ||
    fallback
  );
}

export function resolveUserId(interaction) {
  return interaction.member?.user?.id || interaction.user?.id;
}

export function sendEphemeralMessage(res, content) {
  return res.status(200).json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: 64 },
  });
}

/** A week's name in the user's language ('Off-Week', 'Kingdom War Week 2'), as weekLabel(). */
export const weekName = (clockWeek) =>
  Number(clockWeek) === 0
    ? say('bot_common.off_week')
    : say('bot_common.kw_week', { n: clockWeek });

/** Unix seconds for a Discord timestamp (<t:…>). */
export const unix = (ms) => Math.floor(ms / 1000);

// Discord drops an interaction after 3 seconds, so Gist reads here give up after 2.2 s.
export function getGistData() {
  return readGist({ timeoutMs: 2200 });
}

/** Returned by a command or button handler that didn't answer (the request then gets 400). */
export const NOT_HANDLED = Symbol('not handled');
