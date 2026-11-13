// api/_bot_rewards.js
// Rewards: /nominate, /rewards and the Kingdom War Won/Lost buttons (see api/_reward_period.js).
// Split out of api/interactions.js unchanged.

import { InteractionResponseType } from 'discord-interactions';
import {
  NOT_HANDLED,
  getGistData,
  resolveActorName,
  resolveUserId,
  sendEphemeralMessage,
  unix,
  weekName,
} from './_bot_common.js';
import { inLocale, say, sayCount } from './_messages.js';
import { resolveMemberAllianceContext } from './_bot_roles.js';
import { DEFAULT_CALENDAR_CONFIG, weekLabel } from './_calendar_helper.js';
import { updateGist } from './_gist.js';
import { getWaitUntil } from './_after_response.js';
import { chestCounts } from './_nomination_assign.js';
import { resetOverrides } from './_cycle_helper.js';
import { reassignAllNominations } from './_nominations.js';
import {
  describeRewardPeriod,
  getRewardPeriod,
  recordKingdomWarResult,
  syncRewardPeriod,
} from './_reward_period.js';
import { getAllianceNominationQuota, quotaIfWon } from './_rewards_helper.js';
import { isSteward } from './_stewards.js';
import { createToken } from './_tokens.js';

/** --- /nominate COMMAND (DYNAMIC QUOTA & BUYOUT INTERCEPTOR) --- */
export async function handleNominateCommand(ctx) {
  const { res, name, resolvedHost, t, guildId, member, userId, botToken } = ctx;
  const ownerGuildId = (process.env.DISCORD_GUILD_ID_OWNER || '').trim();

  if (!guildId || !member) {
    return sendEphemeralMessage(res, say('bot_nominate.server_only'));
  }

  if (ownerGuildId && guildId === ownerGuildId && !isSteward(userId)) {
    return sendEphemeralMessage(res, say('bot_nominate.owner_server'));
  }

  try {
    const gistData = await getGistData();
    const mapState = JSON.parse(gistData.files['map-state.json']?.content || '{}');
    const alliances = mapState.alliances || {};
    const knownAlliances = Object.keys(alliances);

    const {
      detectedTag: matchedAllianceTag,
      isDedicatedServer,
      isR5,
      allowedRoles,
      hasDelegatedLeadership,
    } = await resolveMemberAllianceContext({
      guildId,
      member,
      alliances,
      botToken,
    });

    // Authorization Check: Dedicated Server vs. Shared NAP Server
    if (isDedicatedServer) {
      if (!hasDelegatedLeadership && !isSteward(userId)) {
        return sendEphemeralMessage(
          res,
          say('bot_nominate.dedicated_denied', {
            roles: allowedRoles.map((r) => '@' + r).join(', '),
            tag: matchedAllianceTag,
          }),
        );
      }
    } else {
      if (!isR5 && !isSteward(userId)) {
        return sendEphemeralMessage(res, say('bot_nominate.r5_only'));
      }
      if (!matchedAllianceTag) {
        return sendEphemeralMessage(
          res,
          say('bot_nominate.no_tag_role', { example: knownAlliances[0] || 'TAG' }),
        );
      }
    }

    const calRaw = gistData.files?.['calendar-state.json']?.content;
    const calConfig = calRaw
      ? { ...DEFAULT_CALENDAR_CONFIG, ...JSON.parse(calRaw) }
      : DEFAULT_CALENDAR_CONFIG;

    // 0. The reward period (api/_reward_period.js): Friday 20:00 GT to Wednesday 00:00 GT
    const period = getRewardPeriod(Date.now(), calConfig);
    if (!period.open) {
      return sendEphemeralMessage(
        res,
        say('bot_nominate.closed', {
          week: weekName(period.week),
          closed: `<t:${unix(period.closesAt)}:R>`,
          opens: `<t:${unix(period.nextOpensAt)}:F>`,
        }),
      );
    }

    // A new period: move the schedule on and clear last week's nominations. After the
    // battle, ask leadership once for the Kingdom War result. Saved safely alongside other
    // saves (updateGist); only a quick second try fits in Discord's 3 seconds.
    let rewardsData;
    let askForResult = false;
    try {
      ({ rewardsData, askForResult } = await updateGist(
        (gist) => {
          const data = JSON.parse(gist.files['rewards-data.json']?.content || '{}');
          const map = JSON.parse(gist.files['map-state.json']?.content || '{}');
          const synced = syncRewardPeriod(data, map, period);
          const ask =
            period.kwWeek &&
            period.battleOver &&
            data.period.result === 'pending' &&
            !data.period.prompted;
          if (ask) data.period.prompted = true;
          if (!synced.changed && !ask) return { rewardsData: data };
          return {
            rewardsData: data,
            askForResult: ask,
            files: {
              ...(synced.clearNominations ? { 'rewards-nominations.json': {} } : {}),
              'rewards-data.json': data,
            },
            description: `Reward period ${period.id} (${period.weekName})`,
          };
        },
        { gist: gistData, deadline: Date.now() + 700 },
      ));
    } catch (err) {
      // If this can't be saved, stop: never hand out a nomination link for a period that
      // didn't persist (DECISIONS.md, "Data storage").
      console.error('Reward period could not be saved:', err);
      return sendEphemeralMessage(res, say('bot_nominate.period_busy'));
    }
    // Posted in the shared leadership channel: in English, whoever ran /nominate.
    if (askForResult)
      await inLocale('en', () => postKingdomWarResultPrompt(rewardsData.period, botToken));

    // 1. The alliance's chests now, and after a win
    const quotaData = getAllianceNominationQuota(matchedAllianceTag, rewardsData, mapState);
    const rank = quotaData.rank;

    if (isNaN(rank) || rank > 50) {
      return sendEphemeralMessage(res, say('bot_nominate.no_rank', { tag: matchedAllianceTag }));
    }

    const chestsNow = chestCounts(quotaData, quotaData.isKW);
    const chestsIfWon = chestCounts(quotaIfWon(matchedAllianceTag, rewardsData, mapState), true);
    if (countChests(chestsNow) === 0) {
      return sendEphemeralMessage(res, say('bot_nominate.no_chests', { tag: matchedAllianceTag }));
    }

    // 2. A private link for this period (the page reads the chests live, so it stays right
    // when the result is recorded)
    const token = createToken(
      {
        action: 'nominate', // /api/nominate only accepts links made for nominating
        alliance: matchedAllianceTag,
        rank,
        period: period.id,
        exp: Math.min(Date.now() + 24 * 60 * 60 * 1000, period.closesAt),
      },
      botToken,
    );
    const nominateUrl = `https://${resolvedHost}/nominate.html?token=${token}`;

    // 3. The message
    const set1 = chestsNow.standard;
    const set2 = chestsIfWon.kingdom_war;
    const result = rewardsData.period?.result;
    const set2Counts = {
      gold: set2.commanders_will,
      purple: set2.loyal_servant,
      blue: set2.followers_heart,
    };
    const set2Text = !period.kwWeek
      ? say('bot_nominate.no_kw')
      : result === 'won'
        ? say('bot_nominate.won', set2Counts)
        : result === 'lost'
          ? say('bot_nominate.lost')
          : say('bot_nominate.waiting', {
              ...set2Counts,
              time: `<t:${unix(period.battleEndsAt)}:t>`,
            });

    const fields = [
      {
        name: say('bot_nominate.commendation'),
        value: say('bot_nominate.commendation_line', {
          gold: set1.commanders_will,
          purple: set1.loyal_servant,
          blue: set1.followers_heart,
        }),
        inline: false,
      },
      { name: say('bot_nominate.battle_reward'), value: set2Text, inline: false },
    ];

    if (quotaData.hasBuyoutBonus) {
      fields.push({
        name: say('bot_nominate.buyout_title'),
        value: say('bot_nominate.buyout_text', {
          threat: quotaData.buyoutDetails?.threat || say('bot_nominate.buyout_default_threat'),
        }),
        inline: false,
      });
    } else if (quotaData.isWloDeducted) {
      fields.push({
        name: say('bot_nominate.funds_title'),
        value: say('bot_nominate.funds_text'),
        inline: false,
      });
    }

    fields.push({
      name: say('bot_nominate.how_title'),
      value:
        say('bot_nominate.how_text') +
        (period.kwWeek && result === 'pending' ? `\n${say('bot_nominate.how_waiting')}` : ''),
      inline: false,
    });

    return res.status(200).json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: say('bot_nominate.title', {
              week: weekName(period.week),
              tag: matchedAllianceTag,
            }),
            color: quotaData.hasBuyoutBonus ? 0xef4444 : result === 'won' ? 0x8f0000 : 0xb8975a,
            description: say('bot_nominate.summary', {
              rank,
              until: `<t:${unix(period.closesAt)}:F>`,
              relative: `<t:${unix(period.closesAt)}:R>`,
            }),
            fields,
            footer: { text: say('bot_common.link_expires_24h') },
          },
        ],
        components: [
          {
            type: 1,
            components: [
              { type: 2, style: 5, label: say('bot_nominate.open_page'), url: nominateUrl },
            ],
          },
        ],
        flags: 64,
      },
    });
  } catch (err) {
    console.error('Nominate error:', err);
    return sendEphemeralMessage(res, say('bot_common.busy', { reason: err.message }));
  }
  return NOT_HANDLED;
}

/** --- /rewards COMMAND --- */
export async function handleRewardsCommand(ctx) {
  const { res, interaction, name, options, resolvedHost, t, userId } = ctx;
  const username = resolveActorName(interaction, 'Leadership');
  const action = options?.find((opt) => opt.name === 'action')?.value;

  // Stewards: record the Kingdom War result (re-sorts every alliance's list)
  if (action === 'won' || action === 'lost') {
    if (!isSteward(userId)) {
      return sendEphemeralMessage(res, say('bot_common.steward_only_kw'));
    }
    return recordResultAndAnswer(ctx, action, username, null, { button: false });
  }

  try {
    const gistData = await getGistData();
    const mapState = JSON.parse(gistData.files['map-state.json']?.content || '{}');
    const rewardsData = JSON.parse(gistData.files['rewards-data.json']?.content || '{}');
    let nominations = JSON.parse(gistData.files['rewards-nominations.json']?.content || '{}');
    const calRaw = gistData.files?.['calendar-state.json']?.content;
    const calConfig = calRaw
      ? { ...DEFAULT_CALENDAR_CONFIG, ...JSON.parse(calRaw) }
      : DEFAULT_CALENDAR_CONFIG;
    const period = getRewardPeriod(Date.now(), calConfig);

    // Stewards: clear this period's nominations (the result stays)
    if (action === 'reset') {
      if (!isSteward(userId)) {
        return sendEphemeralMessage(res, say('bot_rewards.reset_denied'));
      }
      if (!period.open) {
        return sendEphemeralMessage(res, say('bot_rewards.nothing_to_clear'));
      }
      await updateGist(
        (gist) => {
          const data = JSON.parse(gist.files['rewards-data.json']?.content || '{}');
          const map = JSON.parse(gist.files['map-state.json']?.content || '{}');
          syncRewardPeriod(data, map, period, username);
          data.lastReset = new Date().toISOString(); // a fresh checklist for the King
          if (data.period) data.period.handed_out = {}; // ...with no chest ticked or locked
          return {
            files: { 'rewards-nominations.json': {}, 'rewards-data.json': data },
            description: `Nominations cleared (${period.weekName}) by ${username}`,
          };
        },
        { gist: gistData, deadline: Date.now() + 700 },
      );
      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: say('bot_rewards.cleared_title', { week: weekName(period.week) }),
              color: 0xb8975a,
              description: say('bot_rewards.cleared_text', {
                name: username,
                closes: `<t:${unix(period.closesAt)}:F>`,
              }),
              timestamp: new Date().toISOString(),
            },
          ],
        },
      });
    }

    // Stewards: wipe this cycle's Capitol overrides and wartime buyouts (resetOverrides in
    // api/_cycle_helper.js), then re-sort every alliance's list for the corrected chests.
    if (action === 'reset_overrides') {
      if (!isSteward(userId)) {
        return sendEphemeralMessage(res, say('bot_rewards.overrides_denied'));
      }
      const out = await updateGist(
        (gist) => {
          const data = JSON.parse(gist.files['rewards-data.json']?.content || '{}');
          const map = JSON.parse(gist.files['map-state.json']?.content || '{}');
          const lists = JSON.parse(gist.files['rewards-nominations.json']?.content || '{}');
          const reset = resetOverrides(data, map, username);
          if (!reset.changed) return { reset };
          return {
            reset,
            files: {
              'rewards-data.json': data,
              'rewards-nominations.json': reassignAllNominations(lists, data, map),
            },
            description: `Capitol overrides reset by ${username}`,
          };
        },
        { gist: gistData, deadline: Date.now() + 700 },
      );
      const { reset } = out;
      if (!reset.changed) {
        return sendEphemeralMessage(
          res,
          say('bot_rewards.overrides_nothing', { schedule: scheduleLine(reset.after) }),
        );
      }
      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: say('bot_rewards.overrides_title'),
              color: 0xb8975a,
              description: say('bot_rewards.overrides_text', {
                name: username,
                after: scheduleLine(reset.after),
                before: scheduleLine(reset.before),
                overrides: reset.overrides,
                buyouts: reset.cancelled,
              }),
              timestamp: new Date().toISOString(),
            },
          ],
        },
      });
    }

    // Status (read-only: a period nobody has used yet shows as just opened)
    // (no stored period yet: data from before reward periods, still this week's)
    const current = period.open && (!rewardsData.period || rewardsData.period.id === period.id);
    const view = current ? rewardsData : { ...rewardsData, mode: 'standard' };
    if (!current) nominations = {};
    const result = describeRewardPeriod(period, rewardsData).result;

    const roster = Object.entries(mapState.alliances || {})
      .map(([tag, data]) => ({ tag, rank: parseInt(data.rank, 10) }))
      .filter((a) => !isNaN(a.rank))
      .map((a) => {
        const quota = getAllianceNominationQuota(a.tag, view, mapState);
        return { ...a, quota, total: countChests(chestCounts(quota, quota.isKW)) };
      })
      .filter((a) => a.total > 0)
      .sort((a, b) => a.rank - b.rank);

    if (roster.length === 0) {
      return sendEphemeralMessage(res, say('bot_rewards.none_eligible'));
    }

    let submittedCount = 0;
    const statusLines = roster.map((item) => {
      const entry = nominations[item.tag];
      const buyoutTag = item.quota.hasBuyoutBonus
        ? say('bot_rewards.tag_buyout')
        : item.quota.isWloDeducted
          ? say('bot_rewards.tag_funds')
          : '';
      if (!entry) {
        return say('bot_rewards.awaiting', {
          tag: item.tag,
          rank: item.rank,
          buyout: buyoutTag,
          total: item.total,
        });
      }
      submittedCount++;
      const named = item.total - Number(entry.unfilled || 0);
      const reserves = entry.reserves?.length
        ? sayCount('bot_rewards.reserves', entry.reserves.length)
        : '';
      const submitUnix = Math.floor(new Date(entry.submittedAt).getTime() / 1000);
      return say('bot_rewards.sent', {
        tag: item.tag,
        rank: item.rank,
        buyout: buyoutTag,
        named,
        total: item.total,
        reserves,
        when: `<t:${submitUnix}:R>`,
      });
    });

    const header = !period.open
      ? say('bot_rewards.closed', { opens: `<t:${unix(period.nextOpensAt)}:F>` })
      : say('bot_rewards.open', {
          week: weekName(period.week),
          closes: `<t:${unix(period.closesAt)}:F>`,
        });
    const set2Line = !period.kwWeek
      ? say('bot_rewards.battle_no_kw')
      : result === 'won'
        ? say('bot_rewards.battle_won')
        : result === 'lost'
          ? say('bot_rewards.battle_lost')
          : say('bot_rewards.battle_waiting', { time: `<t:${unix(period.battleEndsAt)}:t>` });

    const components = [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: say('bot_rewards.open_console'),
            url: `https://${resolvedHost}/distribute.html`,
          },
        ],
      },
    ];
    if (period.open && period.kwWeek && isSteward(userId)) {
      components.push(...kingdomWarResultButtons(period.id));
    }

    return res.status(200).json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: say('bot_rewards.title', { week: weekName(period.week) }),
            color:
              result === 'won' ? 0x8f0000 : submittedCount === roster.length ? 0x22c55e : 0xb8975a,
            description: `${header}\n${set2Line}\n\n${say('bot_rewards.count_line', { sent: submittedCount, total: roster.length })}\n\n${statusLines.join('\n')}`,
            footer: { text: say('bot_rewards.footer') },
            timestamp: new Date().toISOString(),
          },
        ],
        components,
      },
    });
  } catch (err) {
    console.error('Rewards status error:', err);
    return sendEphemeralMessage(res, say('bot_common.busy', { reason: err.message }));
  }
  return NOT_HANDLED;
}

/** 1B. KINGDOM WAR RESULT BUTTONS (Stewards): kw_result:<won|lost>:<period id> */
export async function handleKingdomWarResultButton(ctx) {
  const { res, interaction, custom_id } = ctx;
  const userId = resolveUserId(interaction);
  const username = resolveActorName(interaction, 'Steward');
  if (!isSteward(userId)) {
    return sendEphemeralMessage(res, say('bot_common.steward_only_kw'));
  }
  // The period id is a timestamp, which has colons of its own
  const [, result, ...rest] = custom_id.split(':');
  const periodId = rest.join(':');
  return recordResultAndAnswer(ctx, result, username, periodId, { button: true });
}

/**
 * Saves a Kingdom War result and answers Discord. The save re-sorts every alliance's list
 * and, when nominations land at the same moment, may need extra rounds (updateGist), which
 * can take longer than Discord's 3 seconds. So, as with Steward approvals, Discord is
 * answered at once and the message is filled in when the save is done (through this
 * interaction's own token, valid 15 minutes). Without Vercel's waitUntil (e.g. in tests)
 * the result is saved first, within the 3 seconds, and then answered as before.
 */
async function recordResultAndAnswer(ctx, result, username, periodId, { button }) {
  const { res, interaction } = ctx;
  const waitUntil = interaction?.application_id && interaction?.token ? getWaitUntil() : null;
  if (!waitUntil) {
    const outcome = await saveKingdomWarResult(result, username, periodId, {
      deadline: Date.now() + 700,
    });
    if (outcome.error) return sendEphemeralMessage(res, `⚠️ ${outcome.error}`);
    return res.status(200).json({
      type: button
        ? InteractionResponseType.UPDATE_MESSAGE
        : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: kingdomWarResultMessage(outcome),
    });
  }

  const webhook = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`;
  const send = (url, method, body) =>
    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }).then((r) => {
      if (!r.ok) throw new Error(`Discord responded with ${r.status}`);
    });
  waitUntil(
    (async () => {
      const outcome = await saveKingdomWarResult(result, username, periodId);
      try {
        if (outcome.error) {
          // Privately, as before. A command's public "thinking…" answer is removed first.
          if (!button) await send(`${webhook}/messages/@original`, 'DELETE').catch(() => {});
          await send(webhook, 'POST', { content: `⚠️ ${outcome.error}`, flags: 64 });
        } else {
          await send(`${webhook}/messages/@original`, 'PATCH', kingdomWarResultMessage(outcome));
        }
      } catch (err) {
        console.error('Kingdom War result: Discord could not be answered:', err.message);
      }
    })(),
  );
  return res.status(200).json({
    type: button
      ? InteractionResponseType.DEFERRED_UPDATE_MESSAGE
      : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
  });
}

/** Buttons from before reward periods ("Confirm 2x / 1x"): the period now opens by itself. */
export async function handleOldOutcomeButton(ctx) {
  const { res } = ctx;
  return sendEphemeralMessage(res, say('bot_rewards.old_button'));
  return NOT_HANDLED;
}

/** "Off-Week [BOTS] · Kingdom War Week 1 [RÂVN] · …" for a reward schedule. */
function scheduleLine(schedule = {}) {
  return ['downtime', 'week_1', 'week_2', 'week_3']
    .map((key, i) => `${weekName(i)} **[${schedule[key] || '?'}]**`)
    .join(' · ');
}

/** Total chests in chestCounts() form. */
export function countChests(counts) {
  return Object.values(counts).reduce(
    (n, pool) => n + pool.commanders_will + pool.loyal_servant + pool.followers_heart,
    0,
  );
}

/** Won / Lost buttons for a period's Kingdom War result. */
export function kingdomWarResultButtons(periodId) {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: 'Won',
          custom_id: `kw_result:won:${periodId}`,
          emoji: { name: '⚔️' },
        },
        {
          type: 2,
          style: 4,
          label: 'Lost',
          custom_id: `kw_result:lost:${periodId}`,
          emoji: { name: '🛡️' },
        },
      ],
    },
  ];
}

/**
 * Asks NAP Leadership for the Kingdom War result (once per period, after the battle). A
 * failure is only logged: a Steward can always record it with /rewards.
 */
export async function postKingdomWarResultPrompt(stored, botToken) {
  const channelId =
    process.env.DISCORD_CHANNEL_ID_NAP_LEADERSHIP || process.env.DISCORD_WEBHOOK_CHANNEL_ID;
  if (!channelId || !botToken) return;
  try {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title: `⚔️ Kingdom War Result — ${weekLabel(stored.week)}`,
            color: 0xf59e0b,
            description:
              "Did we win Kingdom War (invasion rights and the battle)?\n\n• **Won** opens the **King of Battle Reward** chests on top of the King's Commendation.\n• **Lost** keeps this week to the King's Commendation.\n\nA Steward can change it until the rewards close. Alliances' lists are re-sorted automatically.",
          },
        ],
        components: kingdomWarResultButtons(stored.id),
      }),
    });
  } catch (err) {
    console.warn('Kingdom War result prompt not sent:', err.message);
  }
}

/**
 * Records the Kingdom War result for the open period and re-sorts every alliance's list.
 * periodId (from a button) must still be the open period. Returns { error } or the details.
 */
export async function saveKingdomWarResult(result, actor, periodId = null, { deadline } = {}) {
  try {
    // Re-sorts every alliance's list, so it is saved safely alongside a nomination sent at
    // the same moment (updateGist).
    return await updateGist(
      (gistData) => {
        const rewardsData = JSON.parse(gistData.files['rewards-data.json']?.content || '{}');
        const mapState = JSON.parse(gistData.files['map-state.json']?.content || '{}');
        let nominations = JSON.parse(gistData.files['rewards-nominations.json']?.content || '{}');
        const calRaw = gistData.files?.['calendar-state.json']?.content;
        const calConfig = calRaw
          ? { ...DEFAULT_CALENDAR_CONFIG, ...JSON.parse(calRaw) }
          : DEFAULT_CALENDAR_CONFIG;

        const period = getRewardPeriod(Date.now(), calConfig);
        if (periodId && periodId !== period.id) {
          return {
            error: 'This button is for an earlier week; that result can no longer change.',
          };
        }
        if (syncRewardPeriod(rewardsData, mapState, period).clearNominations) nominations = {};
        const previous = rewardsData.period?.result || null;
        const error = recordKingdomWarResult(rewardsData, period, result, actor);
        if (error) return { error };
        nominations = reassignAllNominations(nominations, rewardsData, mapState);

        return {
          period,
          result,
          previous,
          actor,
          alliances: Object.keys(nominations).length,
          files: { 'rewards-nominations.json': nominations, 'rewards-data.json': rewardsData },
          description: `Kingdom War ${result} (${period.weekName}) recorded by ${actor}`,
        };
      },
      // Answering Discord first (recordResultAndAnswer) leaves time for every repair round;
      // otherwise Discord's 3 seconds set the `deadline`.
      { gist: await getGistData(), deadline },
    );
  } catch (err) {
    console.error('Kingdom War result not saved:', err);
    return { error: `Could not save the result: ${err.message}` };
  }
}

/** The message after a result is recorded (keeps the buttons, so it can be corrected). */
export function kingdomWarResultMessage({ period, result, previous, actor, alliances }) {
  const won = result === 'won';
  const changed = previous && previous !== 'pending' && previous !== result;
  return {
    embeds: [
      {
        title: `${won ? '⚔️ Kingdom War Won' : '🛡️ Kingdom War Lost'} — ${period.weekName}`,
        color: won ? 0x22c55e : 0xb8975a,
        description:
          (won
            ? "**King of Battle Reward** chests are open on top of the King's Commendation."
            : "This week stays with the **King's Commendation** chests.") +
          `\n\n• Recorded by **${actor}**${changed ? ` (changed from ${previous})` : ''}.` +
          `\n• ${alliances} alliance list(s) re-sorted: the best players get the best chests.` +
          `\n• Rewards close <t:${unix(period.closesAt)}:F>.` +
          (changed
            ? "\n\n⚠️ **Check with the King:** chests already handed out in the game can't be changed."
            : ''),
        timestamp: new Date().toISOString(),
      },
    ],
    components: kingdomWarResultButtons(period.id),
  };
}
