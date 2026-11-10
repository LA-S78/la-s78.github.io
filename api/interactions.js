// api/interactions.js
// The Discord bot's endpoint: checks Discord's signature, then hands each slash command and
// button to its module (api/_bot_*.js). The modules hold the code that used to live here.

import { InteractionResponseType, InteractionType, verifyKey } from 'discord-interactions';
import { handleCalendarCommand } from './_bot_calendar.js';
import { NOT_HANDLED, getBotStrings, resolveUserId, resolveUserLocale } from './_bot_common.js';
import { handleRulesCommand, handleSbCommand } from './_bot_info.js';
import { handleMapCommand, handleMapViewButton } from './_bot_map.js';
import { handleProposalButton } from './_bot_proposals.js';
import { handleRankCommand } from './_bot_rank.js';
import { handleRegisterBotCommand } from './_bot_register.js';
import {
  handleKingdomWarResultButton,
  handleNominateCommand,
  handleOldOutcomeButton,
  handleRewardsCommand,
} from './_bot_rewards.js';

export const config = { api: { bodyParser: false } };

/** Slash commands, each in its own module (api/_bot_*.js). */
const COMMANDS = {
  calendar: handleCalendarCommand,
  sb: handleSbCommand,
  rules: handleRulesCommand,
  map: handleMapCommand,
  registerbot: handleRegisterBotCommand,
  nominate: handleNominateCommand,
  rewards: handleRewardsCommand,
  rank: handleRankCommand,
};

/** Buttons by custom_id prefix, checked in this order; anything else is a proposal review. */
const BUTTONS = [
  ['map_view:', handleMapViewButton],
  ['kw_result:', handleKingdomWarResultButton],
  ['confirm_kvk_reset:', handleOldOutcomeButton],
];

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// --- MAIN INTERACTION HANDLER ---

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

  // ==========================================================================
  // 1. SLASH COMMANDS (APPLICATION_COMMAND)
  // ==========================================================================
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = interaction.data;
    const rawHost = req.headers['x-forwarded-host'] || req.headers.host || 'la-s78.app';
    const resolvedHost = rawHost.split(',')[0].trim();
    const providedLang = options?.find((opt) => opt.name === 'lang')?.value;
    const lang = resolveUserLocale(interaction, providedLang);
    const t = getBotStrings(lang);

    const guildId = interaction.guild_id;
    const member = interaction.member;
    const userId = resolveUserId(interaction);
    const botToken = process.env.DISCORD_BOT_TOKEN;

    const ctx = {
      req,
      res,
      interaction,
      name,
      options,
      rawHost,
      resolvedHost,
      providedLang,
      lang,
      t,
      guildId,
      member,
      userId,
      botToken,
    };
    const command = COMMANDS[name];
    if (command) {
      const answered = await command(ctx);
      if (answered !== NOT_HANDLED) return answered;
    }
  }

  // ==========================================================================
  // 2. BUTTON & COMPONENT INTERACTIONS (MESSAGE_COMPONENT)
  // ==========================================================================
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const { custom_id } = interaction.data;
    const rawHost = req.headers['x-forwarded-host'] || req.headers.host || 'la-s78.app';
    const resolvedHost = rawHost.split(',')[0].trim();
    const lang = resolveUserLocale(interaction, null);
    const t = getBotStrings(lang);

    const ctx = { req, res, interaction, custom_id, rawHost, resolvedHost, lang, t };
    for (const [prefix, handle] of BUTTONS) {
      if (custom_id && custom_id.startsWith(prefix)) {
        const answered = await handle(ctx);
        if (answered !== NOT_HANDLED) return answered;
      }
    }
    return handleProposalButton(ctx);
  }

  return res.status(400).end();
}
