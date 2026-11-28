// api/_bot_calendar.js
// /calendar (owner request, 2026-11-28): view: the Capitol card (blank), or today's alliance
// or kingdom events as cards; share: only you (blank) or everyone in the channel. Managing
// events is on the website now (signed in with Discord: api/manage-event.js), so the old
// "manage" options are gone; a server whose commands haven't been synced yet still sends
// them, and gets a pointer to the website.

import { InteractionResponseType } from 'discord-interactions';
import { getGistData, sendEphemeralMessage, weekName } from './_bot_common.js';
import { say } from './_messages.js';
import { resolveMemberAllianceContext } from './_bot_roles.js';
import { DEFAULT_CALENDAR_CONFIG, getCycleState, getScheduleSlot } from './_calendar_helper.js';
import { projectEvents, visibleEvents } from './_calendar_events.js';
import EVENT_TYPES from './_event_types.js';
import { getRewardPeriod } from './_reward_period.js';
import { gistJson, isGistConfigured } from './_gist.js';
import { findTag, sanitizeAlliances } from './_alliances.js';
import { liveImages } from './_alliance_images.js';
import { getRoleColors } from './_role_colors.js';

const DAY_MS = 86400000;
const MAX_CARDS = 5; // event cards in one reply (Discord allows 10 embeds; 5 keeps it readable)
const ALLIANCE_COLOR = 0x3b82f6;
const KINGDOM_COLOR = 0xb8975a;
const WAR_COLOR = 0x8f0000;

/** --- /calendar COMMAND --- */
export async function handleCalendarCommand(ctx) {
  const { res, options, resolvedHost, guildId, member, botToken } = ctx;
  const opt = (n) => options?.find((o) => o.name === n)?.value;
  const view = opt('view') || 'capitol';
  const isPublic = opt('share') === 'public';

  let calConfig = DEFAULT_CALENDAR_CONFIG;
  let alliances = {};
  let rewardsState = {};
  let gist = null;
  try {
    if (isGistConfigured()) {
      const gistData = await getGistData();
      gist = gistData;
      // gistJson: the tag form however it's stored (alliance IDs, step 3)
      calConfig = { ...calConfig, ...gistJson(gistData, 'calendar-state.json') };
      // gistJson: the tag-keyed list however it's stored (alliance IDs, step 2)
      alliances = gistJson(gistData, 'map-state.json').alliances || {};
      rewardsState = gistJson(gistData, 'rewards-data.json', rewardsState);
    }
  } catch (err) {
    console.warn('Calendar state fetch failed, using defaults:', err.message);
  }

  const { detectedTag } = await resolveMemberAllianceContext({
    guildId,
    member,
    alliances,
    botToken,
  });
  const calendarUrl = (tag) =>
    `https://${resolvedHost}/calendar.html${tag ? `?alliance=${encodeURIComponent(tag)}` : ''}`;
  const button = (label, url) => ({
    type: 1,
    components: [{ type: 2, style: 5, label, url }],
  });
  const reply = (data) =>
    res.status(200).json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: isPublic ? data : { ...data, flags: 64 },
    });

  // A server still on the old command list: "manage" moved to the website
  if (opt('action')) {
    return res.status(200).json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: say('bot_calendar.manage_moved'),
        components: [button(say('bot_calendar.manage_button'), calendarUrl(detectedTag))],
        flags: 64,
      },
    });
  }

  const now = new Date();
  const state = getCycleState(now, calConfig);
  const capitol = capitolInfo(state, calConfig, alliances, rewardsState);

  if (view === 'alliance' || view === 'kingdom') {
    if (view === 'alliance' && !detectedTag) {
      return sendEphemeralMessage(res, say('bot_calendar.no_alliance'));
    }
    const listing = todaysEvents({ view, tag: detectedTag, now, state, calConfig, capitol });
    const isAlliance = view === 'alliance';
    const lines = [];
    if (listing.today.length) {
      lines.push(
        say('bot_calendar.today_count', {
          count: listing.today.length,
          from: `<t:${Math.floor(listing.dayStart / 1000)}:t>`,
          to: `<t:${Math.floor(listing.dayEnd / 1000)}:t>`,
        }),
      );
    } else {
      lines.push(say('bot_calendar.today_none'));
      lines.push(
        listing.next
          ? say('bot_calendar.next_up', {
              title: cut(listing.next.title, 120),
              when: `<t:${Math.floor(Date.parse(listing.next.start) / 1000)}:F> (<t:${Math.floor(Date.parse(listing.next.start) / 1000)}:R>)`,
            })
          : say('bot_calendar.nothing_soon'),
      );
    }
    const extra = listing.today.length - MAX_CARDS;
    if (extra > 0) lines.push(say('bot_calendar.more_events', { count: extra }));
    const header = {
      title: isAlliance
        ? say('bot_calendar.alliance_today', { tag: detectedTag })
        : say('bot_calendar.kingdom_today'),
      description: lines.join('\n'),
      color: isAlliance ? ALLIANCE_COLOR : state.isKW ? WAR_COLOR : KINGDOM_COLOR,
      footer: { text: `la-s78.app · ${weekName(state.clockWeek)}` },
    };
    const cards = listing.today.slice(0, MAX_CARDS).map((evt) =>
      eventCard(evt, {
        host: resolvedHost,
        now,
        fallback: isAlliance ? ALLIANCE_COLOR : KINGDOM_COLOR,
      }),
    );
    const label = isAlliance
      ? say('bot_calendar.open_alliance', { tag: detectedTag })
      : say('bot_calendar.open_full');
    return reply({
      embeds: [header, ...cards],
      components: [button(label, calendarUrl(isAlliance ? detectedTag : detectedTag || ''))],
    });
  }

  // The Capitol card (the default)
  const label = detectedTag
    ? say('bot_calendar.open_alliance', { tag: detectedTag })
    : say('bot_calendar.open_full');
  return reply({
    embeds: await capitolCards(state, capitol, { alliances, gist, host: resolvedHost }),
    components: [button(label, calendarUrl(detectedTag))],
  });
}

/**
 * Who holds or captures the Capitol this week and next (the override schedule first, then
 * the map's ranks), and the next rotation week.
 */
function capitolInfo(state, calConfig, alliances, rewardsState) {
  const activeSchedule = rewardsState.cycle_state?.active_schedule || {};
  const scheduledTag = activeSchedule[state.scheduleSlot]?.trim();
  const holderEntry = Object.entries(alliances).find(
    ([, data]) => parseInt(data.rank, 10) === state.capitolRank,
  );
  const holderTag = scheduledTag
    ? `[${scheduledTag}]`
    : holderEntry
      ? `[${holderEntry[0]}]`
      : say('bot_calendar.rank', { rank: state.capitolRank });
  const holderRank = scheduledTag
    ? alliances[scheduledTag]?.rank || state.capitolRank
    : state.capitolRank;

  const daysUntilNextWeek = 7 - state.dayOfWeekNumber + 1;
  const nextWeekResetTs = state.nextResetTimestamp + (daysUntilNextWeek - 1) * 86400;
  const nextWeekNum = (state.currentWeekNumber % 4) + 1;
  const nextWeekConfig = calConfig.capitol_rotation.find((w) => w.week === nextWeekNum);
  const nextSlot = getScheduleSlot(nextWeekNum, calConfig);
  const nextScheduledTag = activeSchedule[nextSlot.slotKey]?.trim();
  const nextHolderEntry = Object.entries(alliances).find(
    ([, data]) => parseInt(data.rank, 10) === nextWeekConfig?.capitol_rank,
  );
  const nextHolderTag = nextScheduledTag
    ? `[${nextScheduledTag}]`
    : nextHolderEntry
      ? `[${nextHolderEntry[0]}]`
      : say('bot_calendar.rank', { rank: nextWeekConfig?.capitol_rank });
  const nextRank = nextScheduledTag
    ? alliances[nextScheduledTag]?.rank || nextWeekConfig?.capitol_rank
    : nextWeekConfig?.capitol_rank;
  const holderKey = scheduledTag || holderEntry?.[0] || null;
  const nextKey = nextScheduledTag || nextHolderEntry?.[0] || null;
  return {
    holderTag,
    holderRank,
    nextHolderTag,
    nextRank,
    nextSlot,
    nextWeekResetTs,
    holderKey,
    nextKey,
  };
}

/**
 * The Capitol view (owner, 2026-11-28): two cards, as the calendar page's holder box. This
 * week's holder ("current" once Friday's capture is done), then next week's. Each card is
 * in its alliance's colour (the same colour the site shows: Discord role, then the site's
 * choice) with the alliance's approved banner as its picture. Discord can't colour text
 * or put text over a picture, so the colour is the card's edge and the banner sits under
 * the tag.
 */
export async function capitolCards(state, c, { alliances, gist, host }) {
  // The role colours come from Discord: never let them hold up the reply (3 seconds)
  const roleColors = await Promise.race([
    getRoleColors().catch(() => ({})),
    new Promise((resolve) => setTimeout(() => resolve({}), 1200)),
  ]);
  const coloured = sanitizeAlliances(alliances, roleColors);
  const banners = gist ? liveImages(gist, alliances) : {};
  const tags = Object.keys(alliances);
  const card = (key, shown, label, line) => {
    const tag = key ? findTag(tags, key) : null;
    const out = {
      author: { name: label },
      title: shown,
      description: line,
      color: colorNumber(tag && coloured[tag]?.color) ?? KINGDOM_COLOR,
    };
    const wide = tag && banners[tag]?.wide;
    if (wide) out.image = { url: `https://${host}${wide}` };
    return out;
  };
  const captureTs = state.captureTimestamp;
  const thisWeek = card(
    c.holderKey,
    c.holderTag,
    say(state.capitolCaptured ? 'bot_calendar.card_current' : 'bot_calendar.card_this_week'),
    state.capitolCaptured
      ? say('bot_calendar.card_captured')
      : state.isCaptureDay
        ? say('bot_calendar.card_captures_today')
        : say('bot_calendar.card_captures', { when: `<t:${captureTs}:R>` }),
  );
  const nextWeek = card(
    c.nextKey,
    c.nextHolderTag,
    say('bot_calendar.card_next'),
    say('bot_calendar.card_next_line', {
      week: weekName(c.nextSlot.clockWeek),
      date: `<t:${captureTs + 7 * 86400}:D>`,
    }),
  );
  return [thisWeek, nextWeek];
}

/**
 * Today's events (the Game Time day: 00:00 to 00:00 GT, as the daily reset): an alliance's
 * own, or the server-wide ones with the site's milestones (Capitol capture, Kingdom War
 * battle, rewards opening and closing). Also the next one after today, for an empty day.
 */
export function todaysEvents({ view, tag, now, state, calConfig, capitol }) {
  const dayEnd = state.nextResetTimestamp * 1000;
  const dayStart = dayEnd - DAY_MS;
  const custom = projectEvents(
    visibleEvents(calConfig.custom_events, {
      alliance: tag,
      only: view === 'alliance' ? 'alliance' : 'global',
    }),
    { startMs: dayStart, endMs: dayStart + 15 * DAY_MS },
  );
  const events = [...custom];
  if (view === 'kingdom')
    events.push(...milestones({ now, state, calConfig, capitol, dayStart, dayEnd }));
  const startOf = (e) => Date.parse(e.start);
  const endOf = (e) => Date.parse(e.end || e.start) || startOf(e);
  events.sort((a, b) => startOf(a) - startOf(b));
  const today = events.filter(
    (e) => startOf(e) < dayEnd && Math.max(endOf(e), startOf(e) + 1) > dayStart,
  );
  const next = events.find((e) => startOf(e) >= dayEnd) || null;
  return { today, next, dayStart, dayEnd };
}

/** The site's own milestones that fall today (as api/calendar.js shows them). */
function milestones({ state, calConfig, capitol, dayStart, dayEnd }) {
  const out = [];
  const within = (ms) => ms >= dayStart && ms < dayEnd;
  if (within(state.captureTimestamp * 1000)) {
    out.push({
      title: say('bot_calendar.sys_capture', { who: capitol.holderTag }),
      description: say('bot_calendar.sys_capture_text', { who: capitol.holderTag }),
      start: new Date(state.captureTimestamp * 1000).toISOString(),
      end: new Date(state.captureTimestamp * 1000 + DAY_MS).toISOString(),
      allDay: true,
      event_type: 'capitol_capture',
      color: '#b8975a',
    });
  }
  if (state.isKW) {
    const battle = state.kwBattleTimestamp * 1000 + 12 * 3600000;
    if (within(battle)) {
      out.push({
        title: say('bot_calendar.sys_kw'),
        description: say('bot_calendar.sys_kw_text'),
        start: new Date(battle).toISOString(),
        end: new Date(battle + 2 * 3600000).toISOString(),
        event_type: 'kvk_battle',
        color: '#8f0000',
      });
    }
  }
  // The reward periods around today: one opening Friday evening, one closing at Wednesday 00:00
  for (const k of [-1, 0, 1]) {
    const p = getRewardPeriod(dayStart + k * 7 * DAY_MS, calConfig);
    if (within(p.opensAt)) {
      out.push({
        title: say('bot_calendar.sys_rewards_open'),
        description: say('bot_calendar.sys_rewards_open_text'),
        start: new Date(p.opensAt).toISOString(),
        end: new Date(p.opensAt + 3600000).toISOString(),
        event_type: 'rewards_open',
        color: '#10b981',
      });
    }
    if (within(p.closesAt - 3600000)) {
      out.push({
        title: say('bot_calendar.sys_rewards_close'),
        description: say('bot_calendar.sys_rewards_close_text'),
        start: new Date(p.closesAt - 3600000).toISOString(),
        end: new Date(p.closesAt).toISOString(),
        event_type: 'rewards_close',
        color: '#d97706',
      });
    }
  }
  // Each milestone once (two reward periods can't both open today, but be safe)
  return out.filter(
    (e, i) => out.findIndex((x) => x.event_type === e.event_type && x.start === e.start) === i,
  );
}

/** One event as a card: its colour, time, a short description, and its type's picture. */
function eventCard(evt, { host, now, fallback }) {
  const type = EVENT_TYPES.find((t) => t.id === evt.event_type);
  const startS = Math.floor(Date.parse(evt.start) / 1000);
  const endS = Math.floor(Date.parse(evt.end || evt.start) / 1000);
  const when = evt.allDay
    ? say('bot_calendar.all_day')
    : `${
        startS * 1000 > now.getTime()
          ? say('bot_calendar.starts_in', { time: `<t:${startS}:t>`, relative: `<t:${startS}:R>` })
          : say('bot_calendar.started', { time: `<t:${startS}:t>`, relative: `<t:${startS}:R>` })
      } · ${say('bot_calendar.ends', { time: `<t:${endS}:t>` })}`;
  const text = cut(String(evt.description || '').trim(), 300);
  const card = {
    title: cut(String(evt.title || '').trim() || '—', 240),
    description: [`🕒 ${when}`, text].filter(Boolean).join('\n'),
    color: colorNumber(evt.color) ?? colorNumber(type?.color) ?? fallback,
  };
  if (type?.picture) card.image = { url: `https://${host}/images/events/${type.picture}` };
  return card;
}

const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** "#7946C0" → 0x7946c0 (Discord's embed colour), or null. */
function colorNumber(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return parseInt(h, 16);
}
