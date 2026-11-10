// api/interactions.js

// Manages interactions between GitHub Gist, Vercel, and Discord
import { verifyKey, InteractionType, InteractionResponseType } from 'discord-interactions';
import { RULES_DATA, SB_DATA, BOT_DATA } from './_generated_translations.js';
import { listAllianceRanks, setAllianceRank } from './_rank_helper.js';
import { isGistConfigured, readGist, writeGist } from './_gist.js';
import { acceptProposal } from './_accept_proposal.js';
import { getWaitUntil } from './_after_response.js';
import { isSteward } from './_stewards.js';
import { leadershipRoles, matchesRoleKeyword } from './_officer_roles.js';
import { createToken } from './_tokens.js';
import {
  getCycleState,
  getScheduleSlot,
  weekLabel,
  DEFAULT_CALENDAR_CONFIG,
} from './_calendar_helper.js';
import { getAllianceNominationQuota, quotaIfWon } from './_rewards_helper.js';
import {
  describeRewardPeriod,
  getRewardPeriod,
  recordKingdomWarResult,
  syncRewardPeriod,
} from './_reward_period.js';
import { chestCounts } from './_nomination_assign.js';
import { reassignAllNominations } from './_nominations.js';

export const config = { api: { bodyParser: false } };

// --- DYNAMIC ALLIANCE COMMAND SCHEMA ---
// Synchronized with api/register-alliance.js; pushed to member servers via /registerbot
const ALLIANCE_COMMANDS_SCHEMA = [
  {
    name: 'calendar',
    description: 'View or manage the Kingdom Event Calendar',
    type: 1,
    options: [
      {
        type: 3,
        name: 'action',
        description: 'Action to perform (leave blank to view calendar)',
        required: false,
        choices: [
          {
            name: 'Manage Alliance Events (R5 by default)',
            value: 'manage_alliance',
          },
          {
            name: 'Manage Global Events (Admin Only)',
            value: 'manage_global',
          },
        ],
      },
    ],
  },
  {
    name: 'suggest',
    description: 'Submit a rule proposal, report an alliance issue, or check your ticket status',
    type: 1,
    options: [
      {
        type: 3,
        name: 'type',
        description: 'Select ticket category or check your active submissions',
        required: true,
        choices: [
          {
            name: '👑 Kingdom / NAP Proposal (Server-Wide Rule or Event Idea)',
            value: 'nap_proposal',
          },
          {
            name: '🛡️ Internal Alliance Issue (Handled Privately by Your R4/R5s)',
            value: 'alliance_issue',
          },
          {
            name: '📋 View My Ticket Status (Active & Recent History)',
            value: 'status',
          },
        ],
      },
    ],
  },
  {
    name: 'nominate',
    description: 'Request an authenticated portal link to submit weekly chest nominations',
    type: 1,
  },
  {
    name: 'rewards',
    description: "This week's rewards: status, and the Kingdom War result (Stewards)",
    type: 1,
    options: [
      {
        type: 3,
        name: 'action',
        description: "Leave blank to see this week's reward status",
        required: false,
        choices: [
          { name: 'Record Kingdom War: Won (Steward)', value: 'won' },
          { name: 'Record Kingdom War: Lost (Steward)', value: 'lost' },
          { name: "Clear this week's nominations (Steward)", value: 'reset' },
        ],
      },
    ],
  },
  {
    name: 'sb',
    description: 'Display the Survival Battle arms race schedule and active events',
    type: 1,
    options: [
      {
        type: 4,
        name: 'day',
        description: 'Day of the cycle (1-7)',
        required: false,
        min_value: 1,
        max_value: 7,
      },
    ],
  },
  {
    name: 'rules',
    description: 'Display server and Kingdom NAP rules',
    type: 1,
    options: [
      {
        type: 4,
        name: 'rule',
        description: 'Specific rule number to view',
        required: false,
        min_value: 1,
      },
    ],
  },
  {
    name: 'map',
    description: 'View live Last Asylum territory map',
    type: 1,
  },
];

// --- PROPOSAL COMPONENT REGISTRY ---
// Maps Discord button custom_ids to their respective blueprint files and accept-proposal types
const PROPOSAL_CONFIGS = {
  approve_proposal: {
    type: 'map',
    isApproved: true,
    filePrefix: 'strategy-blueprint',
    approveId: 'approve_proposal',
    rejectId: 'reject_proposal',
    approveLabel: 'Approve Map',
    rejectLabel: 'Reject Map',
  },
  reject_proposal: {
    type: 'map',
    isApproved: false,
    filePrefix: 'strategy-blueprint',
    approveId: 'approve_proposal',
    rejectId: 'reject_proposal',
    approveLabel: 'Approve Map',
    rejectLabel: 'Reject Map',
  },
  approve_reward_proposal: {
    type: 'rewards',
    isApproved: true,
    filePrefix: 'reward-blueprint',
    approveId: 'approve_reward_proposal',
    rejectId: 'reject_reward_proposal',
    approveLabel: 'Approve Plan',
    rejectLabel: 'Reject Plan',
  },
  reject_reward_proposal: {
    type: 'rewards',
    isApproved: false,
    filePrefix: 'reward-blueprint',
    approveId: 'approve_reward_proposal',
    rejectId: 'reject_reward_proposal',
    approveLabel: 'Approve Plan',
    rejectLabel: 'Reject Plan',
  },
  approve_alliance_proposal: {
    type: 'alliance',
    isApproved: true,
    filePrefix: 'diplomacy-blueprint',
    approveId: 'approve_alliance_proposal',
    rejectId: 'reject_alliance_proposal',
    approveLabel: 'Approve Standings',
    rejectLabel: 'Reject',
  },
  reject_alliance_proposal: {
    type: 'alliance',
    isApproved: false,
    filePrefix: 'diplomacy-blueprint',
    approveId: 'approve_alliance_proposal',
    rejectId: 'reject_alliance_proposal',
    approveLabel: 'Approve Standings',
    rejectLabel: 'Reject',
  },
  approve_blacklist_proposal: {
    type: 'blacklist',
    isApproved: true,
    filePrefix: 'blacklist-blueprint',
    approveId: 'approve_blacklist_proposal',
    rejectId: 'reject_blacklist_proposal',
    approveLabel: 'Approve Blacklist',
    rejectLabel: 'Reject',
  },
  reject_blacklist_proposal: {
    type: 'blacklist',
    isApproved: false,
    filePrefix: 'blacklist-blueprint',
    approveId: 'approve_blacklist_proposal',
    rejectId: 'reject_blacklist_proposal',
    approveLabel: 'Approve Blacklist',
    rejectLabel: 'Reject',
  },
  approve_override_proposal: {
    type: 'override',
    isApproved: true,
    filePrefix: 'override-blueprint',
    approveId: 'approve_override_proposal',
    rejectId: 'reject_override_proposal',
    approveLabel: 'Approve Defense Override',
    rejectLabel: 'Reject Override',
  },
  reject_override_proposal: {
    type: 'override',
    isApproved: false,
    filePrefix: 'override-blueprint',
    approveId: 'approve_override_proposal',
    rejectId: 'reject_override_proposal',
    approveLabel: 'Approve Defense Override',
    rejectLabel: 'Reject Override',
  },
};

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

const SUPPORTED_LOCALES = ['en', 'es', 'de', 'fr', 'ru', 'it', 'tr', 'uk'];

const FALLBACK_RULES = [
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

const FALLBACK_SB_SCHEDULE = [
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

const FALLBACK_BOT_STRINGS = {
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
    footer: 'Click the buttons below to switch perspectives',
    views: {
      alliance: {
        title: '🗺️ Last Asylum: Alliance Territories',
        description: 'Live territorial ownership by alliance.',
      },
      level: {
        title: '🏰 Last Asylum: Territory Levels',
        description: 'Territories categorized by tier (Lv. 1 to Lv. 7).',
      },
      resource: {
        title: '🌾 Last Asylum: Resources & Regional Buffs',
        description: 'Territory yields (Grain, Timber, Herbs)',
      },
    },
  },
  admin: {
    access_denied:
      '⛔ **Access Denied:** Only designated Kingdom Stewards can approve or reject NAP Leadership proposals.',
    failed_update: 'Failed to apply proposal update:',
  },
};

const EVENT_EMOJIS = {
  enhance_heroes: '🦸',
  build_territory: '🏰',
  train_soldiers: '⚔️',
  tech_research: '🔬',
  enhance_raven: '🦅',
};

// --- UNIFIED HELPERS ---

function getBotStrings(lang) {
  return BOT_DATA?.[lang] || FALLBACK_BOT_STRINGS;
}

function resolveUserLocale(interaction, overrideLang) {
  if (overrideLang && SUPPORTED_LOCALES.includes(overrideLang)) return overrideLang;
  const userLocale = interaction?.locale || interaction?.guild_locale || 'en';
  const baseCode = userLocale.split('-')[0].toLowerCase();
  return SUPPORTED_LOCALES.includes(baseCode) ? baseCode : 'en';
}

function resolveActorName(interaction, fallback = 'Leadership') {
  return (
    interaction.member?.nick ||
    interaction.member?.user?.global_name ||
    interaction.member?.user?.username ||
    interaction.user?.global_name ||
    interaction.user?.username ||
    fallback
  );
}

function resolveUserId(interaction) {
  return interaction.member?.user?.id || interaction.user?.id;
}

function sendEphemeralMessage(res, content) {
  return res.status(200).json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: 64 },
  });
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

const roleCacheMap = new Map();

async function getGuildRoleMap(guildId, botToken, memberRoleIds = []) {
  const now = Date.now();
  const cached = roleCacheMap.get(guildId);

  if (cached && now - cached.timestamp < 3 * 60 * 1000) {
    const hasUnknownRole = memberRoleIds.some((id) => !cached.map.has(id));
    if (!hasUnknownRole) {
      return cached.map;
    }
  }

  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${botToken}` },
    signal: AbortSignal.timeout(2200),
  });

  if (!res.ok) throw new Error(`Discord API roles error (${res.status})`);

  const roles = await res.json();
  const map = new Map();
  roles.forEach((r) => map.set(r.id, r.name.toLowerCase().trim()));

  roleCacheMap.set(guildId, {
    map,
    timestamp: now,
  });

  return map;
}

/**
 * Unified resolver for member alliance affiliation & leadership authorization
 * Works across both Dedicated Alliance Servers and the central NAP Server.
 */
async function resolveMemberAllianceContext({ guildId, member, alliances = {}, botToken }) {
  const napGuildId = (
    process.env.DISCORD_GUILD_ID_NAP ||
    process.env.DISCORD_GUILD_ID ||
    ''
  ).trim();
  const wloGuildId = (process.env.DISCORD_GUILD_ID_WLO || process.env.DISCORD_WLO || '').trim();

  const memberRoleIds = member?.roles || [];
  let memberRoleNames = [];

  if (guildId && botToken && memberRoleIds.length > 0) {
    try {
      const roleMap = await getGuildRoleMap(guildId, botToken, memberRoleIds);
      memberRoleNames = memberRoleIds.map((id) => roleMap.get(id)).filter(Boolean);
    } catch (err) {
      console.warn('Role map lookup failed:', err.message);
    }
  }

  let detectedTag = null;
  let allianceData = null;
  let isDedicatedServer = false;

  // 1. Check if executed inside a registered Alliance Discord Server
  const registeredEntry = Object.entries(alliances).find(
    ([_, data]) => data?.guild_id && String(data.guild_id).trim() === guildId,
  );

  if (registeredEntry) {
    detectedTag = registeredEntry[0];
    allianceData = registeredEntry[1];
    isDedicatedServer = true;
  } else if (wloGuildId && guildId === wloGuildId) {
    detectedTag = 'WLO';
    allianceData = alliances['WLO'] || {
      guild_id: wloGuildId,
      delegated_roles: ['hr', 'officer'],
    };
    isDedicatedServer = true;
  }

  // 2. If in the NAP Server (or another shared server), match via Alliance Tag Role
  if (!detectedTag && (!napGuildId || guildId === napGuildId)) {
    const knownTags = Object.keys(alliances);
    detectedTag =
      knownTags.find((tag) => {
        const cleanTag = tag.toLowerCase();
        return memberRoleNames.some(
          (r) => r === cleanTag || r === `@${cleanTag}` || r === `[${cleanTag}]`,
        );
      }) || null;

    if (detectedTag) {
      allianceData = alliances[detectedTag];
    }
  }

  const isR5 = memberRoleNames.some(
    (r) => r === 'r5' || r === '@r5' || matchesRoleKeyword(r, 'r5'),
  );
  const isGuildAdmin = (BigInt(member?.permissions || '0') & 8n) === 8n;
  const allowedRoles = leadershipRoles(allianceData);

  const hasDelegatedLeadership =
    isGuildAdmin ||
    memberRoleNames.some((roleName) => allowedRoles.some((kw) => matchesRoleKeyword(roleName, kw)));

  return {
    detectedTag,
    allianceData,
    isDedicatedServer,
    memberRoleNames,
    isR5,
    isGuildAdmin,
    allowedRoles,
    hasDelegatedLeadership,
  };
}

/** Unix seconds for a Discord timestamp (<t:…>). */
const unix = (ms) => Math.floor(ms / 1000);

/** Total chests in chestCounts() form. */
function countChests(counts) {
  return Object.values(counts).reduce(
    (n, pool) => n + pool.commanders_will + pool.loyal_servant + pool.followers_heart,
    0,
  );
}

/** Won / Lost buttons for a period's Kingdom War result. */
function kingdomWarResultButtons(periodId) {
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
async function postKingdomWarResultPrompt(stored, botToken) {
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
async function saveKingdomWarResult(result, actor, periodId = null) {
  try {
    const gistData = await getGistData();
    const rewardsData = JSON.parse(gistData.files['rewards-data.json']?.content || '{}');
    const mapState = JSON.parse(gistData.files['map-state.json']?.content || '{}');
    let nominations = JSON.parse(gistData.files['rewards-nominations.json']?.content || '{}');
    const calRaw = gistData.files?.['calendar-state.json']?.content;
    const calConfig = calRaw
      ? { ...DEFAULT_CALENDAR_CONFIG, ...JSON.parse(calRaw) }
      : DEFAULT_CALENDAR_CONFIG;

    const period = getRewardPeriod(Date.now(), calConfig);
    if (periodId && periodId !== period.id) {
      return { error: 'This button is for an earlier week; that result can no longer change.' };
    }
    if (syncRewardPeriod(rewardsData, mapState, period).clearNominations) nominations = {};
    const previous = rewardsData.period?.result || null;
    const error = recordKingdomWarResult(rewardsData, period, result, actor);
    if (error) return { error };
    nominations = reassignAllNominations(nominations, rewardsData, mapState);

    await writeGist(
      { 'rewards-nominations.json': nominations, 'rewards-data.json': rewardsData },
      { description: `Kingdom War ${result} (${period.weekName}) recorded by ${actor}` },
    );
    return { period, result, previous, actor, alliances: Object.keys(nominations).length };
  } catch (err) {
    console.error('Kingdom War result not saved:', err);
    return { error: `Could not save the result: ${err.message}` };
  }
}

/** The message after a result is recorded (keeps the buttons, so it can be corrected). */
function kingdomWarResultMessage({ period, result, previous, actor, alliances }) {
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

// Discord drops an interaction after 3 seconds, so Gist reads here give up after 2.2 s.
function getGistData() {
  return readGist({ timeoutMs: 2200 });
}

let mapRevisionCache = {
  revision: 'initial',
  timestamp: 0,
};

async function getLatestMapRevision() {
  const now = Date.now();
  if (mapRevisionCache.revision && now - mapRevisionCache.timestamp < 45 * 1000) {
    return mapRevisionCache.revision;
  }
  try {
    const gistData = await getGistData();
    const content = gistData.files?.['map-state.json']?.content;
    if (content) {
      const state = JSON.parse(content);
      mapRevisionCache.revision = state.revision || state.lastUpdated || 'initial';
      mapRevisionCache.timestamp = now;
    }
  } catch (e) {
    if (!mapRevisionCache.revision || mapRevisionCache.revision === 'initial') {
      mapRevisionCache.revision = Math.floor(now / (5 * 60 * 1000)).toString();
    }
  }
  return mapRevisionCache.revision;
}

function buildMapMessagePayload({ view = 'level', revision = 'initial', resolvedHost, lang, t }) {
  const selectedView = ['level', 'alliance', 'resource'].includes(view) ? view : 'level';

  const titles = {
    level: t?.map?.views?.level?.title || '🏰 Last Asylum: Territory Levels',
    alliance: t?.map?.views?.alliance?.title || '🗺️ Last Asylum: Alliance Territories',
    resource: t?.map?.views?.resource?.title || '🌾 Last Asylum: Resources & Regional Buffs',
  };

  const descriptions = {
    level: t?.map?.views?.level?.description || 'Territories categorized by tier (Lv. 1 to Lv. 8).',
    alliance: t?.map?.views?.alliance?.description || 'Territories colored by alliance ownership.',
    resource:
      t?.map?.views?.resource?.description ||
      'Territories colored by resource yields and regional buffs.',
  };

  const embedColors = {
    level: 0xca8a04,
    alliance: 0x0070f3,
    resource: 0x059669,
  };

  const mapImageUrl = `https://${resolvedHost}/api/map-image?view=${selectedView}&v=${revision}&ext=.png`;

  return {
    embeds: [
      {
        title: titles[selectedView],
        description: descriptions[selectedView],
        color: embedColors[selectedView],
        image: { url: mapImageUrl },
        footer: {
          text: t?.map?.footer || 'Click the buttons below to switch perspectives',
        },
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: selectedView === 'level' ? 1 : 2,
            label: 'Levels',
            custom_id: 'map_view:level',
            disabled: selectedView === 'level',
            emoji: { name: '🏰' },
          },
          {
            type: 2,
            style: selectedView === 'alliance' ? 1 : 2,
            label: 'Alliances',
            custom_id: 'map_view:alliance',
            disabled: selectedView === 'alliance',
            emoji: { name: '🗺️' },
          },
          {
            type: 2,
            style: selectedView === 'resource' ? 1 : 2,
            label: 'Resources',
            custom_id: 'map_view:resource',
            disabled: selectedView === 'resource',
            emoji: { name: '🌾' },
          },
          {
            type: 2,
            style: 5,
            label: t?.map?.button || 'Web Map',
            url: `https://${resolvedHost}/${lang}/map.html`,
          },
        ],
      },
    ],
  };
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

    // --- /calendar COMMAND ---
    if (name === 'calendar') {
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
          name: state.isKWBattleDay
            ? '⚔️ Kingdom War Battle (TODAY)'
            : '⚔️ Next Kingdom War Battle',
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
    }

    // --- /sb COMMAND ---
    if (name === 'sb') {
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
    }

    // --- /rules COMMAND ---
    if (name === 'rules') {
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
    }

    // --- /map COMMAND ---
    if (name === 'map') {
      try {
        let selectedView = 'level';
        const viewOpt = options?.find((opt) => opt.name === 'view');
        if (viewOpt?.value) {
          selectedView = String(viewOpt.value).toLowerCase();
        } else if (viewOpt?.options?.[0]?.value) {
          selectedView = String(viewOpt.options[0].value).toLowerCase();
        }

        const revision = await getLatestMapRevision();
        const payload = buildMapMessagePayload({
          view: selectedView,
          revision,
          resolvedHost,
          lang,
          t,
        });

        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: payload,
        });
      } catch (err) {
        console.error('Error handling /map command:', err);
        return sendEphemeralMessage(res, '⚠️ Could not generate map preview.');
      }
    }

    // --- /registerbot COMMAND (NAP Server Only) ---
    if (name === 'registerbot') {
      const clientId = process.env.DISCORD_CLIENT_ID;
      const napGuildId = (
        process.env.DISCORD_GUILD_ID_NAP ||
        process.env.DISCORD_GUILD_ID ||
        ''
      ).trim();

      const requestedAction = options?.find((opt) => opt.name === 'action')?.value;

      if (!napGuildId || guildId !== napGuildId) {
        return sendEphemeralMessage(
          res,
          '⚠️ This command can only be executed in the official NAP server.',
        );
      }

      // SUB-ACTION: Broad-sync all registered alliance servers (Steward only)
      if (requestedAction === 'sync') {
        if (!isSteward(userId)) {
          return sendEphemeralMessage(
            res,
            '⛔ **Access Denied:** Only designated Kingdom Stewards can broadcast-sync commands.',
          );
        }

        try {
          const gistData = await getGistData();
          const mapState = JSON.parse(gistData.files['map-state.json']?.content || '{}');
          const alliances = mapState.alliances || {};

          const results = [];
          for (const [tag, data] of Object.entries(alliances)) {
            if (!data.guild_id) continue;

            const syncRes = await fetch(
              `https://discord.com/api/v10/applications/${clientId}/guilds/${data.guild_id}/commands`,
              {
                method: 'PUT',
                headers: {
                  Authorization: `Bot ${botToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(ALLIANCE_COMMANDS_SCHEMA),
              },
            );

            results.push(`${syncRes.ok ? '✅' : '❌'} **[${tag}]** (\`${data.guild_id}\`)`);
          }

          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              embeds: [
                {
                  title: '🔄 Alliance Slash Commands Broad-Synced',
                  color: 0x22c55e,
                  description: results.length
                    ? `Pushed latest command schema to:\n\n${results.join('\n')}`
                    : '⚠️ No registered alliance servers found in state.',
                  footer: { text: 'Last Asylum Bot Deployment Manager' },
                  timestamp: new Date().toISOString(),
                },
              ],
              flags: 64,
            },
          });
        } catch (err) {
          return sendEphemeralMessage(res, `❌ Sync failed: ${err.message}`);
        }
      }

      // DEFAULT ACTION: R5 Registration Portal Link
      try {
        const gistData = await getGistData();
        const mapState = JSON.parse(gistData.files['map-state.json']?.content || '{}');
        const alliances = mapState.alliances || {};
        const knownAlliances = Object.keys(alliances);

        const { detectedTag: matchedAllianceTag, isR5 } = await resolveMemberAllianceContext({
          guildId,
          member,
          alliances,
          botToken,
        });

        if (!isR5 && !isSteward(userId)) {
          return sendEphemeralMessage(
            res,
            '⛔ **Access Denied:** Only Alliance Leaders holding the **@R5** role can register alliance servers.',
          );
        }

        if (!matchedAllianceTag) {
          return sendEphemeralMessage(
            res,
            `⚠️ Could not detect your alliance tag role. Ensure you hold your alliance role (e.g. \`@${knownAlliances[0] || 'TAG'}\`) in the NAP server.`,
          );
        }

        const tokenPayload = {
          alliance: matchedAllianceTag,
          action: 'register',
          client_id: clientId,
          exp: Date.now() + 24 * 60 * 60 * 1000,
        };
        const token = createToken(tokenPayload, botToken);
        const registerUrl = `https://${resolvedHost}/register.html?token=${token}`;

        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [
              {
                title: `🤖 Alliance Server Setup — [${matchedAllianceTag}]`,
                color: 0xb8975a,
                description:
                  "Click below to authorize the bot and link your alliance's Discord server to the website.\n\n• Installs commands (`/calendar`, `/suggest`, `/nominate`, `/rewards`, `/map`, `/sb`, `/rules`).\n• Allows configuring delegated roles (e.g. `@HR`).",
                footer: { text: 'Link is private and expires in 24 hours.' },
              },
            ],
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 5,
                    label: 'Open Registration Portal',
                    url: registerUrl,
                  },
                ],
              },
            ],
            flags: 64,
          },
        });
      } catch (err) {
        console.error('Registerbot error:', err);
        return sendEphemeralMessage(
          res,
          `⚠️ Service busy: ${err.message}. Please retry in a few moments.`,
        );
      }
    }

    // --- /nominate COMMAND (DYNAMIC QUOTA & BUYOUT INTERCEPTOR) ---
    if (name === 'nominate') {
      const ownerGuildId = (process.env.DISCORD_GUILD_ID_OWNER || '').trim();

      if (!guildId || !member) {
        return sendEphemeralMessage(
          res,
          '⚠️ This command must be executed inside your alliance Discord server or the NAP server.',
        );
      }

      if (ownerGuildId && guildId === ownerGuildId && !isSteward(userId)) {
        return sendEphemeralMessage(
          res,
          '⛔ **Access Denied:** Reward nominations cannot be submitted from this server. Leaders must submit via the NAP server or their alliance server.',
        );
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
              `⛔ **Access Denied:** Only members holding **@R5** or authorized leadership roles (${allowedRoles.map((r) => '@' + r).join(', ')}) can submit nominations for **[${matchedAllianceTag}]**.`,
            );
          }
        } else {
          if (!isR5 && !isSteward(userId)) {
            return sendEphemeralMessage(
              res,
              '⛔ **Access Denied:** Only Alliance Leaders holding the **@R5** role can submit reward nominations.',
            );
          }
          if (!matchedAllianceTag) {
            return sendEphemeralMessage(
              res,
              `⚠️ Could not detect your alliance tag role. Make sure you have your alliance role (e.g. \`@${knownAlliances[0] || 'TAG'}\`) assigned.`,
            );
          }
        }

        const rewardsData = JSON.parse(gistData.files['rewards-data.json']?.content || '{}');
        const calRaw = gistData.files?.['calendar-state.json']?.content;
        const calConfig = calRaw
          ? { ...DEFAULT_CALENDAR_CONFIG, ...JSON.parse(calRaw) }
          : DEFAULT_CALENDAR_CONFIG;

        // 0. The reward period (api/_reward_period.js): Friday 20:00 GT to Wednesday 00:00 GT
        const period = getRewardPeriod(Date.now(), calConfig);
        if (!period.open) {
          return sendEphemeralMessage(
            res,
            `🔒 **Rewards are closed.** The ${period.weekName} rewards expired <t:${unix(period.closesAt)}:R>.\nThe next rewards open <t:${unix(period.nextOpensAt)}:F>, after Friday's capitol event.`,
          );
        }

        // A new period: move the schedule on and clear last week's nominations. After the
        // battle, ask leadership once for the Kingdom War result.
        const synced = syncRewardPeriod(rewardsData, mapState, period);
        const newPeriod = synced.changed;
        const askForResult =
          period.kwWeek &&
          period.battleOver &&
          rewardsData.period.result === 'pending' &&
          !rewardsData.period.prompted;
        if (askForResult) rewardsData.period.prompted = true;
        if (newPeriod || askForResult) {
          // If this can't be saved, stop: never hand out a nomination link for a period that
          // didn't persist (DECISIONS.md, "Data storage").
          try {
            await writeGist(
              {
                ...(synced.clearNominations ? { 'rewards-nominations.json': {} } : {}),
                'rewards-data.json': rewardsData,
              },
              { description: `Reward period ${period.id} (${period.weekName})` },
            );
          } catch (err) {
            console.error('Reward period could not be saved:', err);
            return sendEphemeralMessage(
              res,
              '⚠️ Service busy: could not open the new reward period. Please retry /nominate in a few seconds.',
            );
          }
        }
        if (askForResult) await postKingdomWarResultPrompt(rewardsData.period, botToken);

        // 1. The alliance's chests now, and after a win
        const quotaData = getAllianceNominationQuota(matchedAllianceTag, rewardsData, mapState);
        const rank = quotaData.rank;

        if (isNaN(rank) || rank > 50) {
          return sendEphemeralMessage(
            res,
            `⚠️ **[${matchedAllianceTag}]** does not have an active rank assigned in the standings.`,
          );
        }

        const chestsNow = chestCounts(quotaData, quotaData.isKW);
        const chestsIfWon = chestCounts(
          quotaIfWon(matchedAllianceTag, rewardsData, mapState),
          true,
        );
        if (countChests(chestsNow) === 0) {
          return sendEphemeralMessage(
            res,
            `⚠️ **[${matchedAllianceTag}]** has 0 chests allocated under the current distribution.`,
          );
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
        const set2Text = !period.kwWeek
          ? 'No Kingdom War this week.'
          : result === 'won'
            ? `⚔️ **Won.** Honor Vanguard ×${set2.commanders_will} · Fearless Hero ×${set2.loyal_servant} · Logistics Support ×${set2.followers_heart}`
            : result === 'lost'
              ? 'Not this week: the Kingdom War was lost.'
              : `⏳ **Waiting for the battle result** (about <t:${unix(period.battleEndsAt)}:t>). If won: Honor Vanguard ×${set2.commanders_will} · Fearless Hero ×${set2.loyal_servant} · Logistics Support ×${set2.followers_heart}`;

        const fields = [
          {
            name: "👑 King's Commendation",
            value: `Commander's Will ×${set1.commanders_will} · Loyal Servant ×${set1.loyal_servant} · Follower's Heart ×${set1.followers_heart}`,
            inline: false,
          },
          { name: '⚔️ King of Battle Reward', value: set2Text, inline: false },
        ];

        if (quotaData.hasBuyoutBonus) {
          fields.push({
            name: '🛡️ Wartime Buyout Restitution Active',
            value: `Includes **+1 Commander's Will** (and **+1 Honor Vanguard** if the war is won), funded by WLO for this week's defense override (Threat: \`${quotaData.buyoutDetails?.threat || 'Red List'}\`).`,
            inline: false,
          });
        } else if (quotaData.isWloDeducted) {
          fields.push({
            name: '⚖️ Wartime Buyout Restitution Funded',
            value: `WLO yields **1 Commander's Will** (and **1 Honor Vanguard** if the war is won) from this week's Rank #1 allotment to fund the displaced alliance's restitution.`,
            inline: false,
          });
        }

        fields.push({
          name: '📝 How it works',
          value:
            'List your players **best first**. Chests go down the list in order of value across both sets; extra names are kept as reserves and move up if more chests open.' +
            (period.kwWeek && result === 'pending'
              ? "\n⏳ The King hands out after the battle result, so nobody's chest changes."
              : ''),
          inline: false,
        });

        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [
              {
                title: `🎁 ${period.weekName} Rewards — [${matchedAllianceTag}]`,
                color: quotaData.hasBuyoutBonus ? 0xef4444 : result === 'won' ? 0x8f0000 : 0xb8975a,
                description: `Rank #${rank} · open until <t:${unix(period.closesAt)}:F> (<t:${unix(period.closesAt)}:R>).`,
                fields,
                footer: { text: 'Link is private and expires in 24 hours.' },
              },
            ],
            components: [
              {
                type: 1,
                components: [
                  { type: 2, style: 5, label: 'Open Nomination Page', url: nominateUrl },
                ],
              },
            ],
            flags: 64,
          },
        });
      } catch (err) {
        console.error('Nominate error:', err);
        return sendEphemeralMessage(
          res,
          `⚠️ Connection busy: ${err.message}. Please retry in a few seconds.`,
        );
      }
    }

    // --- /rewards COMMAND ---
    if (name === 'rewards') {
      const username = resolveActorName(interaction, 'Leadership');
      const action = options?.find((opt) => opt.name === 'action')?.value;

      // Stewards: record the Kingdom War result (re-sorts every alliance's list)
      if (action === 'won' || action === 'lost') {
        if (!isSteward(userId)) {
          return sendEphemeralMessage(
            res,
            '⛔ **Access Denied:** Only designated Kingdom Stewards can record the Kingdom War result.',
          );
        }
        const outcome = await saveKingdomWarResult(action, username);
        if (outcome.error) return sendEphemeralMessage(res, `⚠️ ${outcome.error}`);
        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: kingdomWarResultMessage(outcome),
        });
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
            return sendEphemeralMessage(
              res,
              '⛔ **Access Denied:** Only designated Kingdom Stewards can clear nominations.',
            );
          }
          if (!period.open) {
            return sendEphemeralMessage(
              res,
              '🔒 No reward period is open, so there is nothing to clear.',
            );
          }
          syncRewardPeriod(rewardsData, mapState, period, username);
          rewardsData.lastReset = new Date().toISOString(); // a fresh checklist for the King
          await writeGist(
            { 'rewards-nominations.json': {}, 'rewards-data.json': rewardsData },
            { description: `Nominations cleared (${period.weekName}) by ${username}` },
          );
          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              embeds: [
                {
                  title: `🔄 Nominations Cleared — ${period.weekName}`,
                  color: 0xb8975a,
                  description: `All alliances' lists for this week were cleared by **${username}**.\n\n• Leaders can send new lists with \`/nominate\`.\n• Rewards close <t:${unix(period.closesAt)}:F>.\n• Remind the King to hit **Reset Checklist** on the console.`,
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
          return sendEphemeralMessage(
            res,
            '⚠️ No alliances are currently eligible under the active rewards plan.',
          );
        }

        let submittedCount = 0;
        const statusLines = roster.map((item) => {
          const entry = nominations[item.tag];
          const buyoutTag = item.quota.hasBuyoutBonus
            ? ' 🛡️ [Buyout]'
            : item.quota.isWloDeducted
              ? ' ⚖️ [Funds buyout]'
              : '';
          if (!entry) {
            return `⏳ **[${item.tag}]** (Rank #${item.rank})${buyoutTag} — **Awaiting list** (${item.total} chests)`;
          }
          submittedCount++;
          const named = item.total - Number(entry.unfilled || 0);
          const reserves = entry.reserves?.length ? ` · ${entry.reserves.length} reserve(s)` : '';
          const submitUnix = Math.floor(new Date(entry.submittedAt).getTime() / 1000);
          return `✅ **[${item.tag}]** (Rank #${item.rank})${buyoutTag} — **${named}/${item.total}** named${reserves} (<t:${submitUnix}:R>)`;
        });

        const header = !period.open
          ? `🔒 **Closed.** The next rewards open <t:${unix(period.nextOpensAt)}:F>.`
          : `🎁 **${period.weekName} rewards** · open until <t:${unix(period.closesAt)}:F>`;
        const set2Line = !period.kwWeek
          ? '⚔️ King of Battle Reward: no Kingdom War this week.'
          : result === 'won'
            ? '⚔️ King of Battle Reward: **won**, open.'
            : result === 'lost'
              ? '⚔️ King of Battle Reward: lost, not this week.'
              : `⚔️ King of Battle Reward: ⏳ **waiting for the battle result** (about <t:${unix(period.battleEndsAt)}:t>). The King hands out after it.`;

        const components = [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "Open King's Console",
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
                title: `📋 Alliance Reward Status — ${period.weekName}`,
                color:
                  result === 'won'
                    ? 0x8f0000
                    : submittedCount === roster.length
                      ? 0x22c55e
                      : 0xb8975a,
                description: `${header}\n${set2Line}\n\n**${submittedCount} of ${roster.length} alliances have sent a list**\n\n${statusLines.join('\n')}`,
                footer: { text: 'Last Asylum Capitol Administration' },
                timestamp: new Date().toISOString(),
              },
            ],
            components,
          },
        });
      } catch (err) {
        console.error('Rewards status error:', err);
        return sendEphemeralMessage(
          res,
          `⚠️ Connection busy: ${err.message}. Please retry in a few seconds.`,
        );
      }
    }

    // --- /rank COMMAND ---
    if (name === 'rank') {
      const sub = options?.[0];

      if (sub?.name === 'list') {
        try {
          const ranks = await listAllianceRanks();
          const desc = ranks.length
            ? ranks.map((a) => `**#${a.rank}** — \`[${a.tag}]\``).join('\n')
            : 'No alliances registered in current state.';

          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              embeds: [
                {
                  title: '🛡️ Server NAP Standings',
                  color: 0xb8975a,
                  description: desc,
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
                      label: 'Open Diplomacy & Standings',
                      url: `https://${resolvedHost}/${lang}/alliance.html`,
                    },
                  ],
                },
              ],
            },
          });
        } catch (err) {
          return sendEphemeralMessage(res, `⚠️ Failed to fetch rankings: ${err.message}`);
        }
      }

      if (sub?.name === 'set') {
        if (!isSteward(userId)) {
          return sendEphemeralMessage(
            res,
            '⛔ **Access Denied:** Only designated Kingdom Stewards can update alliance rankings.',
          );
        }

        const tagOption = sub.options?.find((o) => o.name === 'tag');
        const rankOption = sub.options?.find((o) => o.name === 'rank');

        if (!tagOption || !rankOption) {
          return sendEphemeralMessage(res, '⚠️ Missing required arguments: tag and rank.');
        }

        const author = resolveActorName(interaction, 'Leadership');

        try {
          const result = await setAllianceRank({
            tag: tagOption.value,
            rank: rankOption.value,
            updatedBy: author,
          });

          return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              embeds: [
                {
                  title: '👑 NAP Standing Updated',
                  color: 0x22c55e,
                  description: `Alliance \`[${result.tag}]\` has been assigned to **Rank #${result.newRank}** *(previously: ${result.previousRank === 'Unranked' ? 'Unranked' : `#${result.previousRank}`})*.`,
                  footer: { text: `Updated by ${author}` },
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
                      label: 'View Standings',
                      url: `https://${resolvedHost}/${lang}/alliance.html`,
                    },
                  ],
                },
              ],
            },
          });
        } catch (err) {
          return sendEphemeralMessage(res, `⚠️ Failed to update rank: ${err.message}`);
        }
      }
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

    // 1A. PUBLIC MAP VIEW SWITCH BUTTONS
    if (custom_id && custom_id.startsWith('map_view:')) {
      const targetView = custom_id.replace('map_view:', '');
      const revision = await getLatestMapRevision();
      const payload = buildMapMessagePayload({
        view: targetView,
        revision,
        resolvedHost,
        lang,
        t,
      });

      return res.status(200).json({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: payload,
      });
    }

    // 1B. KINGDOM WAR RESULT BUTTONS (Stewards): kw_result:<won|lost>:<period id>
    if (custom_id && custom_id.startsWith('kw_result:')) {
      const userId = resolveUserId(interaction);
      const username = resolveActorName(interaction, 'Steward');
      if (!isSteward(userId)) {
        return sendEphemeralMessage(
          res,
          '⛔ **Access Denied:** Only designated Kingdom Stewards can record the Kingdom War result.',
        );
      }
      // The period id is a timestamp, which has colons of its own
      const [, result, ...rest] = custom_id.split(':');
      const periodId = rest.join(':');
      const outcome = await saveKingdomWarResult(result, username, periodId);
      if (outcome.error) return sendEphemeralMessage(res, `⚠️ ${outcome.error}`);
      return res.status(200).json({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: kingdomWarResultMessage(outcome),
      });
    }

    // Buttons from before reward periods ("Confirm 2x / 1x"): the period now opens by itself.
    if (custom_id && custom_id.startsWith('confirm_kvk_reset:')) {
      return sendEphemeralMessage(
        res,
        "ℹ️ This button is no longer used: rewards now open every Friday at 20:00 GT by themselves. Record the Kingdom War result with `/rewards` (Won or Lost) after Saturday's battle.",
      );
    }

    // 2. STEWARD PROPOSALS & REVIEWS (Map, Rewards, Alliance Standings, Overrides)
    const proposalConfig = PROPOSAL_CONFIGS[custom_id];
    if (!proposalConfig) {
      return sendEphemeralMessage(res, `⚠️ Unrecognized interaction component: \`${custom_id}\`.`);
    }

    const userId = resolveUserId(interaction);
    const username = resolveActorName(interaction, 'Kingdom Steward');

    if (!isSteward(userId)) {
      return sendEphemeralMessage(res, t.admin.access_denied);
    }

    const {
      type: proposalType,
      isApproved,
      filePrefix,
      approveId,
      rejectId,
      approveLabel,
      rejectLabel,
    } = proposalConfig;

    // The reviewed message: status field set, both buttons disabled.
    const buildReviewedMessage = () => {
      const originalEmbed = JSON.parse(JSON.stringify(interaction.message.embeds[0]));
      originalEmbed.color = isApproved ? 0x22c55e : 0xef4444;

      const statusIndex = originalEmbed.fields.findIndex((f) =>
        f.name.toLowerCase().includes('status'),
      );
      const statusField = {
        name: '⚖️ Status',
        value: isApproved ? `✅ **Approved by ${username}**` : `❌ **Rejected by ${username}**`,
        inline: false,
      };

      if (statusIndex !== -1) {
        originalEmbed.fields[statusIndex] = statusField;
      } else {
        originalEmbed.fields.push(statusField);
      }

      return {
        embeds: [originalEmbed],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                custom_id: approveId,
                label: isApproved ? 'Approved' : approveLabel,
                style: 3,
                emoji: { name: '✅' },
                disabled: true,
              },
              {
                type: 2,
                custom_id: rejectId,
                label: !isApproved ? 'Rejected' : rejectLabel,
                style: 4,
                emoji: { name: '❌' },
                disabled: true,
              },
            ],
          },
        ],
      };
    };

    if (!isApproved) {
      // Reject saves nothing, so it answers straight away.
      return res.status(200).json({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: buildReviewedMessage(),
      });
    }

    // Downloads the proposal attached to the Discord message and saves it. Throws on failure.
    const saveApproval = async () => {
      const blueprintAttachment = interaction.message.attachments?.find((a) =>
        a.filename.startsWith(filePrefix),
      );

      if (!blueprintAttachment) {
        throw new Error(`${filePrefix}.dat attachment is missing.`);
      }

      const blueprintRes = await fetch(blueprintAttachment.url);
      if (!blueprintRes.ok) {
        throw new Error('Failed to retrieve blueprint attachment from Discord.');
      }
      const parsedData = await blueprintRes.json();

      // Already checked above: the click came from Discord (signature) and the clicker is a
      // Steward. The proposal is saved directly here; no token is sent anywhere.
      let acceptPayload = {
        type: proposalType,
        submittedBy: username,
      };

      if (proposalType === 'rewards') {
        acceptPayload.distribution = parsedData;
      } else if (proposalType === 'alliance') {
        acceptPayload.alliances = parsedData.alliances;
        acceptPayload.blacklist = parsedData.blacklist; // only in proposals sent before the split
      } else if (proposalType === 'blacklist') {
        acceptPayload.diff = parsedData.diff;
      } else if (proposalType === 'override') {
        acceptPayload.targetWeek = parsedData.targetWeek;
        acceptPayload.threatName = parsedData.threatName;
        acceptPayload.action = parsedData.action;
        acceptPayload.displacedAlly = parsedData.displacedAlly;
      } else {
        acceptPayload.changes = parsedData;
      }

      const { status: acceptStatus, json: acceptJson } = await acceptProposal(acceptPayload, {
        baseUrl: `https://${resolvedHost}`,
      });
      if (acceptStatus < 200 || acceptStatus >= 300) {
        throw new Error(acceptJson.error || `Server responded with ${acceptStatus}`);
      }

      if (acceptJson.revision) {
        mapRevisionCache.revision = acceptJson.revision;
        mapRevisionCache.timestamp = Date.now();
      }
    };
    const failedMessage = (error) => `❌ **${t.admin.failed_update}** ${error.message}`;

    // Finishing after answering needs Vercel's waitUntil and this click's id and token
    // (Discord always sends them). Without them, save first and then answer, as before.
    const waitUntil = interaction.application_id && interaction.token ? getWaitUntil() : null;
    if (!waitUntil) {
      try {
        await saveApproval();
      } catch (error) {
        console.error('Interaction bridge failed:', error);
        return sendEphemeralMessage(res, failedMessage(error));
      }
      return res.status(200).json({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: buildReviewedMessage(),
      });
    }

    // Answer Discord at once (the button shows it is working), so a slow GitHub save can't
    // run past Discord's 3-second limit, then save and edit the message. The edit uses this
    // click's own interaction token (valid 15 minutes), not the bot token.
    const webhook = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`;
    const sendToDiscord = async (url, method, body) => {
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Discord responded with ${r.status}`);
    };
    waitUntil(
      (async () => {
        try {
          await saveApproval();
        } catch (error) {
          console.error('Interaction bridge failed:', error);
          // Same private message as before; the proposal stays open and can be approved again.
          await sendToDiscord(webhook, 'POST', { content: failedMessage(error), flags: 64 }).catch(
            (e) => console.error('Could not report the failed approval:', e),
          );
          return;
        }
        try {
          await sendToDiscord(`${webhook}/messages/@original`, 'PATCH', buildReviewedMessage());
        } catch (error) {
          console.error('Approval saved, but the message could not be updated:', error);
          await sendToDiscord(webhook, 'POST', {
            content: `✅ Approved and saved, but this message couldn't be updated (${error.message}).`,
            flags: 64,
          }).catch(() => {});
        }
      })(),
    );
    return res.status(200).json({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });
  }

  return res.status(400).end();
}
