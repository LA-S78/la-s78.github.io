// api/_bot_calendar.js
// /calendar: the KvK calendar embed and the private calendar management link.
// Split out of api/interactions.js unchanged.

import { InteractionResponseType } from 'discord-interactions';
import { NOT_HANDLED, getGistData, sendEphemeralMessage } from './_bot_common.js';
import { resolveMemberAllianceContext } from './_bot_roles.js';
import {
  DEFAULT_CALENDAR_CONFIG,
  getCycleState,
  getScheduleSlot,
  weekLabel,
} from './_calendar_helper.js';
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
      return sendEphemeralMessage(
        res,
        '⛔ **Access Denied:** Only designated Kingdom Stewards can manage Kingdom-wide events.',
      );
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
            title: '👑 Kingdom Event Management Portal',
            color: 0x10b981,
            description:
              'Click below to open the calendar in **Global Management Mode**.\n\nYou can schedule kingdom-wide announcements, truce alerts, or delete entries.',
            footer: { text: 'Link is private and expires in 4 hours.' },
          },
        ],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: 'Open Global Management Portal',
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
      return sendEphemeralMessage(
        res,
        '⚠️ Could not detect your alliance. Run this command inside your registered alliance server, or ensure you have your alliance role in the NAP server.',
      );
    }

    const isAuthorized = isSteward(userId) || hasDelegatedLeadership;

    if (!isAuthorized) {
      return sendEphemeralMessage(
        res,
        `⛔ **Access Denied:** Only members holding **@R5** or leadership roles (${allowedRoles.map((r) => '@' + r).join(', ')}) can manage events for **[${detectedAllianceTag}]**.`,
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
            title: `🛡️ Alliance Event Management — [${detectedAllianceTag}]`,
            color: 0x3b82f6,
            description: `Click below to open the calendar in **Alliance Management Mode** for **[${detectedAllianceTag}]**.\n\nYou can schedule internal raids, hive movements, and training drills.`,
            footer: { text: 'Link is private and expires in 4 hours.' },
          },
        ],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: `Open [${detectedAllianceTag}] Management Portal`,
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
      : `Rank #${state.capitolRank}`;

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
      : `Rank #${nextWeekConfig?.capitol_rank}`;

  const nextActualRank = nextScheduledTag
    ? alliances[nextScheduledTag]?.rank || nextWeekConfig?.capitol_rank
    : nextWeekConfig?.capitol_rank;

  // Time to the daily reset, written out: Discord's own relative time says "in a day"
  // for anything over ~22 hours, which isn't useful here.
  const minsToReset = Math.max(0, Math.round((state.nextResetTimestamp * 1000 - now) / 60000));
  const resetIn = `${Math.floor(minsToReset / 60)}h ${minsToReset % 60}m`;

  // The week's alliance captures the Capitol on Friday (see _calendar_helper.js).
  const captureNote = state.capitolCaptured
    ? 'captured Friday'
    : state.isCaptureDay
      ? 'captures today'
      : `captures Friday, <t:${state.captureTimestamp}:R>`;

  const fields = [
    {
      name: state.capitolCaptured ? '👑 Current Capitol Holder' : '👑 Next Capitol Holder',
      value: `**${holderTag}** *(Rank #${holderActualRank})* — ${captureNote}`,
      inline: true,
    },
    {
      name: '⏰ Next Daily Reset (00:00 GT)',
      value: `**<t:${state.nextResetTimestamp}:t>** (in ${resetIn})`,
      inline: true,
    },
  ];

  if (state.isKW) {
    fields.push({
      name: state.isKWBattleDay ? '⚔️ Kingdom War Battle (TODAY)' : '⚔️ Next Kingdom War Battle',
      value: state.isKWBattleDay
        ? '🔥 **Active War Window:** Defend and conquer the Capitol!'
        : `Scheduled for **Saturday** (<t:${state.kwBattleTimestamp}:R> / <t:${state.kwBattleTimestamp}:D>)`,
      inline: false,
    });
  }

  fields.push({
    name: '⏭️ Next Rotation Phase',
    value: `**${weekLabel(nextSlot.clockWeek)}** begins <t:${nextWeekResetTs}:R>.\n**${nextHolderTag}** *(Rank #${nextActualRank})* captures the Capitol that Friday.`,
    inline: false,
  });

  const viewQuery = detectedAllianceTag ? `?alliance=${detectedAllianceTag}` : '';
  const buttonLabel = detectedAllianceTag
    ? `Open Calendar ([${detectedAllianceTag}])`
    : 'Open Full Calendar';

  return res.status(200).json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [
        {
          title: '📅 Kingdom War Calendar',
          color: state.isKW ? 0x8f0000 : 0xb8975a,
          description: `${state.clockWeek === 0 ? '🛡️' : '⚔️'} **${weekLabel(state.clockWeek)}**`,
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
