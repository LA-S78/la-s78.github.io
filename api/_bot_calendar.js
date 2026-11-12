// api/_bot_calendar.js
// /calendar: the KvK calendar embed and the private calendar management link.
// Split out of api/interactions.js unchanged.

import { InteractionResponseType } from 'discord-interactions';
import { NOT_HANDLED, getGistData, sendEphemeralMessage, weekName } from './_bot_common.js';
import { say } from './_messages.js';
import { resolveMemberAllianceContext } from './_bot_roles.js';
import { DEFAULT_CALENDAR_CONFIG, getCycleState, getScheduleSlot } from './_calendar_helper.js';
import { isGistConfigured } from './_gist.js';
import { isSteward } from './_stewards.js';
import { createToken } from './_tokens.js';

/** --- /calendar COMMAND --- */
export async function handleCalendarCommand(ctx) {
  const { res, name, options, resolvedHost, t, guildId, member, userId, botToken } = ctx;
  const requestedAction = options?.find((opt) => opt.name === 'action')?.value;

  let calConfig = DEFAULT_CALENDAR_CONFIG;
  let alliances = {};
  let rewardsState = {};

  try {
    if (isGistConfigured()) {
      const gistData = await getGistData();
      const calRaw = gistData.files?.['calendar-state.json']?.content;
      const mapRaw = gistData.files?.['map-state.json']?.content;
      const rewardsRaw = gistData.files?.['rewards-data.json']?.content;

      if (calRaw) calConfig = { ...calConfig, ...JSON.parse(calRaw) };
      if (mapRaw) alliances = JSON.parse(mapRaw).alliances || {};
      if (rewardsRaw) rewardsState = JSON.parse(rewardsRaw);
    }
  } catch (err) {
    console.warn('Calendar state fetch failed, using defaults:', err.message);
  }

  const {
    detectedTag: detectedAllianceTag,
    allowedRoles,
    hasDelegatedLeadership,
  } = await resolveMemberAllianceContext({
    guildId,
    member,
    alliances,
    botToken,
  });

  // SUB-ACTION: Manage Global Events (Steward Only)
  if (requestedAction === 'manage_global') {
    if (!isSteward(userId)) {
      return sendEphemeralMessage(res, say('bot_calendar.global_denied'));
    }

    const tokenPayload = {
      scope: 'global',
      action: 'manage_events',
      exp: Date.now() + 4 * 60 * 60 * 1000,
    };
    const token = createToken(tokenPayload, botToken);
    const manageUrl = `https://${resolvedHost}/calendar.html?token=${token}`;

    return res.status(200).json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: say('bot_calendar.global_title'),
            color: 0x10b981,
            description: say('bot_calendar.global_text'),
            footer: { text: say('bot_common.link_expires_4h') },
          },
        ],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: say('bot_calendar.global_button'),
                url: manageUrl,
              },
            ],
          },
        ],
        flags: 64,
      },
    });
  }

  // SUB-ACTION: Manage Alliance Events (R5 / Delegated Officers)
  if (requestedAction === 'manage_alliance') {
    if (!detectedAllianceTag) {
      return sendEphemeralMessage(res, say('bot_calendar.no_alliance'));
    }

    const isAuthorized = isSteward(userId) || hasDelegatedLeadership;

    if (!isAuthorized) {
      return sendEphemeralMessage(
        res,
        say('bot_common.leaders_denied', {
          roles: allowedRoles.map((r) => '@' + r).join(', '),
          tag: detectedAllianceTag,
        }),
      );
    }

    const tokenPayload = {
      scope: detectedAllianceTag,
      alliance: detectedAllianceTag,
      action: 'manage_events',
      exp: Date.now() + 4 * 60 * 60 * 1000,
    };
    const token = createToken(tokenPayload, botToken);
    const manageUrl = `https://${resolvedHost}/calendar.html?token=${token}`;

    return res.status(200).json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: say('bot_calendar.alliance_title', { tag: detectedAllianceTag }),
            color: 0x3b82f6,
            description: say('bot_calendar.alliance_text', { tag: detectedAllianceTag }),
            footer: { text: say('bot_common.link_expires_4h') },
          },
        ],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: say('bot_calendar.alliance_button', { tag: detectedAllianceTag }),
                url: manageUrl,
              },
            ],
          },
        ],
        flags: 64,
      },
    });
  }

  // DEFAULT ACTION: Public Calendar Status & Link (Synced with Override Schedule)
  const now = new Date();
  const state = getCycleState(now, calConfig);
  const activeSchedule = rewardsState.cycle_state?.active_schedule || {};
  const slotKey = state.scheduleSlot;
  const scheduledTag = activeSchedule[slotKey]?.trim();

  const holderEntry = Object.entries(alliances).find(
    ([_, data]) => parseInt(data.rank, 10) === state.capitolRank,
  );
  const holderTag = scheduledTag
    ? `[${scheduledTag}]`
    : holderEntry
      ? `[${holderEntry[0]}]`
      : say('bot_calendar.rank', { rank: state.capitolRank });

  const holderActualRank = scheduledTag
    ? alliances[scheduledTag]?.rank || state.capitolRank
    : state.capitolRank;

  const daysUntilNextWeek = 7 - state.dayOfWeekNumber + 1;
  const nextWeekResetTs = state.nextResetTimestamp + (daysUntilNextWeek - 1) * 86400;
  const nextWeekNum = (state.currentWeekNumber % 4) + 1;
  const nextWeekConfig = calConfig.capitol_rotation.find((w) => w.week === nextWeekNum);
  const nextSlot = getScheduleSlot(nextWeekNum, calConfig);
  const nextScheduledTag = activeSchedule[nextSlot.slotKey]?.trim();

  const nextHolderEntry = Object.entries(alliances).find(
    ([_, data]) => parseInt(data.rank, 10) === nextWeekConfig?.capitol_rank,
  );
  const nextHolderTag = nextScheduledTag
    ? `[${nextScheduledTag}]`
    : nextHolderEntry
      ? `[${nextHolderEntry[0]}]`
      : say('bot_calendar.rank', { rank: nextWeekConfig?.capitol_rank });

  const nextActualRank = nextScheduledTag
    ? alliances[nextScheduledTag]?.rank || nextWeekConfig?.capitol_rank
    : nextWeekConfig?.capitol_rank;

  // Time to the daily reset, written out: Discord's own relative time says "in a day"
  // for anything over ~22 hours, which isn't useful here.
  const minsToReset = Math.max(0, Math.round((state.nextResetTimestamp * 1000 - now) / 60000));

  // The week's alliance captures the Capitol on Friday (see _calendar_helper.js).
  const captureNote = state.capitolCaptured
    ? say('bot_calendar.captured_friday')
    : state.isCaptureDay
      ? say('bot_calendar.captures_today')
      : say('bot_calendar.captures_friday', { when: `<t:${state.captureTimestamp}:R>` });

  const fields = [
    {
      name: say(state.capitolCaptured ? 'bot_calendar.current_holder' : 'bot_calendar.next_holder'),
      value: say('bot_calendar.holder_line', {
        tag: holderTag,
        rank: holderActualRank,
        note: captureNote,
      }),
      inline: true,
    },
    {
      name: say('bot_calendar.next_reset'),
      value: say('bot_calendar.reset_line', {
        time: `<t:${state.nextResetTimestamp}:t>`,
        hours: Math.floor(minsToReset / 60),
        minutes: minsToReset % 60,
      }),
      inline: true,
    },
  ];

  if (state.isKW) {
    fields.push({
      name: say(state.isKWBattleDay ? 'bot_calendar.kw_today' : 'bot_calendar.kw_next'),
      value: state.isKWBattleDay
        ? say('bot_calendar.kw_active')
        : say('bot_calendar.kw_scheduled', {
            relative: `<t:${state.kwBattleTimestamp}:R>`,
            date: `<t:${state.kwBattleTimestamp}:D>`,
          }),
      inline: false,
    });
  }

  fields.push({
    name: say('bot_calendar.next_phase'),
    value: say('bot_calendar.next_phase_line', {
      week: weekName(nextSlot.clockWeek),
      when: `<t:${nextWeekResetTs}:R>`,
      tag: nextHolderTag,
      rank: nextActualRank,
    }),
    inline: false,
  });

  const viewQuery = detectedAllianceTag ? `?alliance=${detectedAllianceTag}` : '';
  const buttonLabel = detectedAllianceTag
    ? say('bot_calendar.open_alliance', { tag: detectedAllianceTag })
    : say('bot_calendar.open_full');

  return res.status(200).json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [
        {
          title: say('bot_calendar.title'),
          color: state.isKW ? 0x8f0000 : 0xb8975a,
          description: `${state.clockWeek === 0 ? '🛡️' : '⚔️'} **${weekName(state.clockWeek)}**`,
          fields,
          footer: { text: 'la-s78.app' },
          timestamp: new Date().toISOString(),
        },
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              label: buttonLabel,
              url: `https://${resolvedHost}/calendar.html${viewQuery}`,
            },
          ],
        },
      ],
    },
  });
  return NOT_HANDLED;
}
