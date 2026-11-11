// api/proposal.js
// Leaders' proposals from the web planners -> the war-room Discord channel, for a Steward
// to approve. Requires a login pass (api/_tokens.js), checks size and shape, and limits
// R4/R5 to a few proposals per day.
import { verifySessionToken } from './_tokens.js';
import { isSteward } from './_stewards.js';
import {
  isGistConfigured,
  readGist,
  gistJson,
  updateGist,
  isTestDeployment,
  TEST_PROPOSAL_FIELD,
} from './_gist.js';

const POOL_LIMITS = {
  commanders_will: 5,
  loyal_servant: 10,
  followers_heart: 20,
};

const CHEST_VALUES = {
  commanders_will: { diamonds: 8800, tickets: 44 },
  loyal_servant: { diamonds: 4400, tickets: 40 },
  followers_heart: { diamonds: 1600, tickets: 36 },
};

// Who may send proposals (owner decision): R4 and R5 leaders, and Stewards.
const PROPOSAL_ROLES = ['R4', 'R5'];
// Anti-spam (owner decision): R4/R5 may send 5 proposals per 24 hours; Stewards have no limit.
const DAILY_LIMIT = 5;
const DAY_MS = 24 * 3600 * 1000;
const LOG_FILE = 'proposal-log.json';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ error: 'Bot token missing from server configuration.' });
  }

  // 1. Who is sending: the signed login pass from /api/verify (never the name the page sends).
  const authHeader = String(req.headers?.authorization || '');
  const session = verifySessionToken(authHeader.replace(/^Bearer\s+/i, ''), botToken);
  if (!session) {
    return res.status(401).json({
      error: 'Please log in with Discord again to send proposals.',
      code: 'login_required',
    });
  }
  const steward = isSteward(session.uid);
  if (!steward && !PROPOSAL_ROLES.includes(session.role)) {
    return res
      .status(403)
      .json({ error: 'Only R4 and R5 leaders can send proposals.', code: 'not_allowed' });
  }

  // 2. Size and shape.
  const payload = req.body || {};
  const problem = validateProposal(payload);
  if (problem) {
    return res.status(problem.status).json({ error: problem.error, code: 'invalid' });
  }

  // 3. Daily limit (Stewards have none). Fails closed: if the log can't be read, nothing is sent.
  let log = null;
  if (!steward) {
    try {
      log = await readProposalLog();
    } catch (err) {
      console.error('Proposal log could not be read:', err.message);
      return res.status(503).json({
        error: 'Could not check the daily proposal limit right now. Please try again in a minute.',
      });
    }
    const mine = log.entries.filter((e) => e.uid === session.uid);
    if (mine.length >= DAILY_LIMIT) {
      const nextAt = Math.floor((Math.min(...mine.map((e) => e.at)) + DAY_MS) / 1000);
      return res.status(429).json({
        error: `Daily limit reached: ${DAILY_LIMIT} proposals per 24 hours. You can send the next one after ${new Date(nextAt * 1000).toUTCString()}.`,
        code: 'daily_limit',
        nextAt,
      });
    }
  }

  // 4. Send it to Discord, with the verified name (and a Discord mention, which doesn't ping
  // inside an embed) as the submitter.
  const submitter = { name: session.name, uid: session.uid };
  const result = await dispatchProposal(payload, botToken, submitter);

  // 5. Count it only once it has actually been sent. If the log can't be saved, the proposal
  // has still gone out; it just isn't counted.
  if (log && result.status === 200) {
    try {
      // Added to the log as stored when saving (updateGist): a proposal from someone else at
      // the same moment must not drop this entry, or the daily limit could be dodged.
      const entry = { uid: session.uid, at: Date.now() };
      await updateGist((gist) => ({
        files: { [LOG_FILE]: { entries: [...recentEntries(gist), entry] } },
        description: `Proposal by ${session.name}`,
      }));
    } catch (err) {
      console.error('Proposal sent, but the proposal log could not be saved:', err.message);
    }
  }
  return res.status(result.status).json(result.json);
}

/** The proposal log, keeping only the last 24 hours. Throws if the Gist can't be read. */
async function readProposalLog() {
  if (!isGistConfigured()) return { entries: [] };
  return { entries: recentEntries(await readGist({ timeoutMs: 4000 })) };
}

/** The proposal log's entries from the last 24 hours. */
function recentEntries(gist) {
  const stored = gistJson(gist, LOG_FILE, { entries: [] });
  const since = Date.now() - DAY_MS;
  return Array.isArray(stored.entries)
    ? stored.entries.filter((e) => e && e.uid && Number(e.at) > since)
    : [];
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const shortText = (v, max) =>
  v === undefined || v === null || (typeof v === 'string' && v.length <= max);
const smallInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/**
 * Rejects proposals that are too big or the wrong shape. Limits are generous: they stop
 * spam and malformed data, not normal use. Returns { status, error } or null.
 */
function validateProposal(payload) {
  if (!isObj(payload)) return { status: 400, error: 'Invalid proposal.' };
  if (Buffer.byteLength(JSON.stringify(payload)) > 3.5 * 1024 * 1024) {
    return { status: 413, error: 'Proposal is too large.' };
  }
  if (!shortText(payload.notes, 500))
    return { status: 400, error: 'Notes are limited to 500 characters.' };

  const type = payload.type || (payload.changes ? 'map' : null);
  const bad = (what) => ({ status: 400, error: `Invalid ${what}.` });
  if (type === 'rewards') {
    const d = payload.distribution;
    if (!Array.isArray(d) || d.length > 50) return bad('reward tiers');
    for (const tier of d) {
      if (!isObj(tier) || !smallInt(tier.min_rank, 1, 1000) || !smallInt(tier.max_rank, 1, 1000)) {
        return bad('reward tier ranks');
      }
      if (!isObj(tier.chests) || !Object.values(tier.chests).every((n) => smallInt(n, 0, 1000))) {
        return bad('reward tier chests');
      }
    }
  } else if (type === 'map') {
    const c = payload.changes;
    if (!isObj(c) || Object.keys(c).length > 1000) return bad('map changes');
    for (const [cityId, change] of Object.entries(c)) {
      if (
        cityId.length > 80 ||
        !isObj(change) ||
        !shortText(change.from, 40) ||
        !shortText(change.to, 40)
      ) {
        return bad('map change');
      }
    }
    if (payload.image !== undefined && payload.image !== null) {
      if (typeof payload.image !== 'string' || !payload.image.startsWith('data:image/'))
        return bad('map image');
      if (payload.image.length > 3 * 1024 * 1024)
        return { status: 413, error: 'Map image is too large.' };
    }
  } else if (type === 'alliance') {
    const a = payload.alliances;
    if (!isObj(a) || Object.keys(a).length > 200) return bad('alliances');
    if (Object.keys(a).some((tag) => tag.length > 20)) return bad('alliance tag');
    const b = payload.blacklist;
    if (b !== undefined && b !== null) {
      if (!isObj(b)) return bad('blacklist');
      for (const list of [b.players, b.alliances]) {
        if (list === undefined) continue;
        if (!Array.isArray(list) || list.length > 1000 || !list.every((x) => shortText(x, 64))) {
          return bad('blacklist');
        }
      }
    }
    if (
      payload.diff !== undefined &&
      (!Array.isArray(payload.diff) || payload.diff.length > 2000)
    ) {
      return bad('change list');
    }
  } else if (type === 'blacklist') {
    const d = payload.diff;
    if (!Array.isArray(d) || d.length === 0 || d.length > 200) return bad('blacklist changes');
    for (const c of d) {
      if (
        !isObj(c) ||
        !['add', 'remove'].includes(c.action) ||
        !['players', 'alliances'].includes(c.category) ||
        typeof c.target !== 'string' ||
        !c.target.trim() ||
        c.target.length > 64
      ) {
        return bad('blacklist change');
      }
    }
  } else if (type === 'override') {
    if (!smallInt(Number(payload.targetWeek), 1, 4) || !shortText(payload.threatName, 64)) {
      return bad('defense override');
    }
    if (!shortText(payload.displacedAlly, 20) || !shortText(payload.action, 20))
      return bad('defense override');
  }
  return null;
}

/** Adds the test marker to a proposal's message on a test deployment (dev.la-s78.app). */
function markTest(embed) {
  if (!isTestDeployment()) return embed;
  return {
    ...embed,
    title: `🧪 TEST · ${embed.title}`,
    fields: [
      ...(embed.fields || []),
      {
        name: TEST_PROPOSAL_FIELD,
        value:
          "Sent from the test site (test data). It can't be approved and changes nothing live.",
        inline: false,
      },
    ],
  };
}

/** Where a proposal posts: the given channel, or TEST_CHANNEL_ID on a test deployment. */
function proposalChannel(liveChannelId) {
  if (!isTestDeployment()) return liveChannelId;
  if (!process.env.TEST_CHANNEL_ID) {
    throw new Error('Test proposals need TEST_CHANNEL_ID (a Discord channel for tests).');
  }
  return process.env.TEST_CHANNEL_ID;
}

/**
 * Posts one proposal to Discord. Returns { status, json } (the endpoint's reply).
 * @param {{name: string, uid: string}} submitter verified sender, from the login pass
 */
const result = (status, json) => ({ status, json });

async function dispatchProposal(payload, botToken, submitter) {
  const nowUnix = Math.floor(Date.now() / 1000);
  const submitterValue = `\`${submitter.name}\` (<@${submitter.uid}>)`;

  // Fallback: If legacy map.js didn't specify type, infer 'map' from 'changes'
  const type = payload.type || (payload.changes ? 'map' : null);

  try {
    switch (type) {
      // ======================================================================
      // 1. REWARDS DISTRIBUTION PROPOSAL
      // ======================================================================
      case 'rewards': {
        const { notes, timestamp, distribution } = payload;

        if (!Array.isArray(distribution) || distribution.length === 0) {
          return result(400, { error: 'Invalid distribution payload.' });
        }

        const totals = { commanders_will: 0, loyal_servant: 0, followers_heart: 0 };
        distribution.forEach((tier) => {
          const count = Math.max(1, tier.max_rank - tier.min_rank + 1);
          totals.commanders_will += (tier.chests?.commanders_will || 0) * count;
          totals.loyal_servant += (tier.chests?.loyal_servant || 0) * count;
          totals.followers_heart += (tier.chests?.followers_heart || 0) * count;
        });

        if (
          totals.commanders_will > POOL_LIMITS.commanders_will ||
          totals.loyal_servant > POOL_LIMITS.loyal_servant ||
          totals.followers_heart > POOL_LIMITS.followers_heart
        ) {
          return result(400, {
            error: `Pool limits exceeded: Gold ${totals.commanders_will}/${POOL_LIMITS.commanders_will}, Purple ${totals.loyal_servant}/${POOL_LIMITS.loyal_servant}, Blue ${totals.followers_heart}/${POOL_LIMITS.followers_heart}`,
          });
        }

        const tierFields = distribution.map((tier) => {
          const isSingle = tier.min_rank === tier.max_rank;
          const rankRange = isSingle
            ? `Rank ${tier.min_rank}`
            : `Rank ${tier.min_rank}–${tier.max_rank}`;
          const count = Math.max(1, tier.max_rank - tier.min_rank + 1);

          const d =
            tier.chests.commanders_will * CHEST_VALUES.commanders_will.diamonds +
            tier.chests.loyal_servant * CHEST_VALUES.loyal_servant.diamonds +
            tier.chests.followers_heart * CHEST_VALUES.followers_heart.diamonds;

          const t =
            tier.chests.commanders_will * CHEST_VALUES.commanders_will.tickets +
            tier.chests.loyal_servant * CHEST_VALUES.loyal_servant.tickets +
            tier.chests.followers_heart * CHEST_VALUES.followers_heart.tickets;

          return {
            name: `🏆 ${rankRange} (${count}${count === 1 ? ' Alliance' : ' Alliances'})`,
            value: `🟡 ×${tier.chests.commanders_will} | 🟣 ×${tier.chests.loyal_servant} | 🔵 ×${tier.chests.followers_heart}\n💎 **${d.toLocaleString()}** Diamonds | 🎫 **${t.toLocaleString()}** Tickets *(base)*`,
            inline: false,
          };
        });

        const poolUsage = `🟡 Gold: **${totals.commanders_will}**/${POOL_LIMITS.commanders_will}  |  🟣 Purple: **${totals.loyal_servant}**/${POOL_LIMITS.loyal_servant}  |  🔵 Blue: **${totals.followers_heart}**/${POOL_LIMITS.followers_heart}`;
        const submitTimestamp = timestamp
          ? Math.floor(new Date(timestamp).getTime() / 1000)
          : nowUnix;

        const embed = {
          title: '👑 Alliance Reward Distribution Proposal',
          color: 0xb8975a,
          description: notes ? `*"${notes}"*` : '*No additional notes provided.*',
          fields: [
            { name: '👤 Submitter', value: submitterValue, inline: true },
            { name: '⏱️ Submitted', value: `<t:${submitTimestamp}:R>`, inline: true },
            { name: '📊 Pool Capacity', value: poolUsage, inline: false },
            ...tierFields,
            { name: '⚖️ Status', value: '⏳ **Pending Leadership Review**', inline: false },
          ],
          footer: { text: 'Last Asylum Rewards Proposal' },
          timestamp: new Date().toISOString(),
        };

        const components = [
          {
            type: 1,
            components: [
              {
                type: 2,
                custom_id: 'approve_reward_proposal',
                label: 'Approve Plan',
                style: 3,
                emoji: { name: '✅' },
              },
              {
                type: 2,
                custom_id: 'reject_reward_proposal',
                label: 'Reject Plan',
                style: 4,
                emoji: { name: '❌' },
              },
            ],
          },
        ];

        const formData = new FormData();
        formData.append('payload_json', JSON.stringify({ embeds: [markTest(embed)], components }));

        const jsonBlob = new Blob([JSON.stringify(distribution)], {
          type: 'application/octet-stream',
        });
        formData.append('files[0]', jsonBlob, 'reward-blueprint.dat');

        const channelId = proposalChannel(
          process.env.REWARDS_CHANNEL_ID || process.env.WAR_ROOM_CHANNEL_ID,
        );
        const discordRes = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages`,
          {
            method: 'POST',
            headers: { Authorization: `Bot ${botToken}` },
            body: formData,
          },
        );

        if (!discordRes.ok) {
          const errorText = await discordRes.text();
          throw new Error(`Discord API Error: ${discordRes.status} - ${errorText}`);
        }

        return result(200, { success: true, message: 'Reward proposal dispatched!' });
      }

      // ======================================================================
      // 2. MAP TERRITORY PROPOSAL
      // ======================================================================
      case 'map': {
        const { notes, totalChanges, changes, image } = payload;

        if (!changes || totalChanges === 0) {
          return result(400, { error: 'No changes provided.' });
        }

        const changeList = Object.entries(changes)
          .map(
            ([cityId, shift]) =>
              `• **${cityId.replace(/_/g, ' ')}**: \`${shift.from}\` ➔ \`${shift.to}\``,
          )
          .join('\n');

        const embed = {
          title: '⚔️ New Map Strategy Proposal',
          color: 0x3b82f6,
          description: notes ? `*"${notes}"*` : '*No additional notes provided.*',
          fields: [
            { name: '👤 Submitter', value: submitterValue, inline: true },
            { name: '⏱️ Submitted', value: `<t:${nowUnix}:R>`, inline: true },
            { name: '🗺️ Total Shifts', value: `\`${totalChanges} territories\``, inline: true },
            { name: '⚖️ Status', value: '⏳ **Pending Leadership Review**', inline: false },
            {
              name: 'Proposed Shifts',
              value: changeList.length > 1024 ? changeList.substring(0, 1020) + '...' : changeList,
            },
          ],
          footer: { text: 'Last Asylum Map Proposal' },
          timestamp: new Date().toISOString(),
        };

        if (image) {
          embed.image = { url: 'attachment://map_preview.jpg' };
        }

        const components = [
          {
            type: 1,
            components: [
              {
                type: 2,
                custom_id: 'approve_proposal',
                label: 'Approve Map',
                style: 3,
                emoji: { name: '✅' },
              },
              {
                type: 2,
                custom_id: 'reject_proposal',
                label: 'Reject Map',
                style: 4,
                emoji: { name: '❌' },
              },
            ],
          },
        ];

        const formData = new FormData();
        formData.append('payload_json', JSON.stringify({ embeds: [markTest(embed)], components }));

        const jsonBlob = new Blob([JSON.stringify(changes)], { type: 'application/octet-stream' });
        formData.append('files[0]', jsonBlob, 'strategy-blueprint.dat');

        if (image) {
          const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
          const imageBuffer = Buffer.from(base64Data, 'base64');
          const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
          formData.append('files[1]', imageBlob, 'map_preview.jpg');
        }

        const channelId = proposalChannel(process.env.WAR_ROOM_CHANNEL_ID);
        const discordRes = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages`,
          {
            method: 'POST',
            headers: { Authorization: `Bot ${botToken}` },
            body: formData,
          },
        );

        if (!discordRes.ok) {
          const errorText = await discordRes.text();
          throw new Error(`Discord API Error: ${discordRes.status} - ${errorText}`);
        }

        return result(200, { success: true, message: 'Map proposal dispatched!' });
      }

      // ======================================================================
      // 3. ALLIANCE & NAP STANDINGS PROPOSAL
      // ======================================================================
      case 'alliance': {
        const { notes, alliances, blacklist, diff } = payload;

        if (!alliances || typeof alliances !== 'object') {
          return result(400, { error: 'Invalid alliance payload.' });
        }

        let shiftSummary = '*No explicit shifts reported.*';
        if (Array.isArray(diff) && diff.length > 0) {
          shiftSummary = diff
            .slice(0, 15)
            .map((d) => {
              if (d.type === 'rank') return `• **[${d.tag}]**: Rank \`#${d.from}\` ➔ \`#${d.to}\``;
              if (d.type === 'academy') return `• **[${d.tag}]**: Academy of **[${d.parent}]**`;
              if (d.type === 'blacklist')
                return `• ⚠️ **Blacklist**: \`${d.action.toUpperCase()}\` [${d.target}] (${d.category})`;
              return `• **[${d.tag || 'Unknown'}]**: Modified`;
            })
            .join('\n');

          if (diff.length > 15) {
            shiftSummary += `\n*...and ${diff.length - 15} more changes*`;
          }
        }

        const totalAlliances = Object.keys(alliances).length;
        // Blacklist changes have their own proposal type now ('blacklist'); older pages may
        // still send the whole blacklist with the standings.
        const totalBlacklist = blacklist
          ? ` | ${(blacklist.players?.length || 0) + (blacklist.alliances?.length || 0)} Blacklisted`
          : '';

        const embed = {
          title: '👑 NAP Roster & Alliance Standings Proposal',
          color: 0xb8975a,
          description: notes ? `*"${notes}"*` : '*No additional notes provided.*',
          fields: [
            { name: '👤 Submitter', value: submitterValue, inline: true },
            { name: '⏱️ Submitted', value: `<t:${nowUnix}:R>`, inline: true },
            {
              name: '📊 Total Registered',
              value: `\`${totalAlliances} Alliances${totalBlacklist}\``,
              inline: false,
            },
            {
              name: '📝 Proposed Modifications',
              value: shiftSummary.substring(0, 1024),
              inline: false,
            },
            { name: '⚖️ Status', value: '⏳ **Pending Leadership Review**', inline: false },
          ],
          footer: { text: 'Last Asylum Diplomacy Engine' },
          timestamp: new Date().toISOString(),
        };

        const components = [
          {
            type: 1,
            components: [
              {
                type: 2,
                custom_id: 'approve_alliance_proposal',
                label: 'Approve Standings',
                style: 3,
                emoji: { name: '✅' },
              },
              {
                type: 2,
                custom_id: 'reject_alliance_proposal',
                label: 'Reject',
                style: 4,
                emoji: { name: '❌' },
              },
            ],
          },
        ];

        const formData = new FormData();
        formData.append('payload_json', JSON.stringify({ embeds: [markTest(embed)], components }));

        // Only include a blacklist if one was sent: an empty one would wipe the live blacklist
        // when the standings are approved.
        const blueprintData = { alliances, ...(blacklist ? { blacklist } : {}) };
        const jsonBlob = new Blob([JSON.stringify(blueprintData)], {
          type: 'application/octet-stream',
        });
        formData.append('files[0]', jsonBlob, 'diplomacy-blueprint.dat');

        const channelId = proposalChannel(process.env.WAR_ROOM_CHANNEL_ID);
        const discordRes = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages`,
          {
            method: 'POST',
            headers: { Authorization: `Bot ${botToken}` },
            body: formData,
          },
        );

        if (!discordRes.ok) {
          const errorText = await discordRes.text();
          throw new Error(`Discord API Error: ${discordRes.status} - ${errorText}`);
        }

        return result(200, { success: true, message: 'Alliance proposal dispatched to Discord!' });
      }

      // ======================================================================
      // 3B. NAP BLACKLIST PROPOSAL (add/remove players and alliances)
      // ======================================================================
      case 'blacklist': {
        const { notes, diff } = payload;
        const lines = diff.map((d) => {
          const target = d.category === 'alliances' ? `[${d.target}]` : d.target;
          const what = d.category === 'alliances' ? 'alliance' : 'player';
          return d.action === 'add'
            ? `• ⚠️ **Add** ${what} \`${target}\``
            : `• ✅ **Remove** ${what} \`${target}\``;
        });
        let changes = lines.slice(0, 20).join('\n');
        if (lines.length > 20) changes += `\n*...and ${lines.length - 20} more changes*`;

        const embed = {
          title: '🚫 NAP Blacklist Proposal',
          color: 0xef4444,
          description: notes ? `*"${notes}"*` : '*No additional notes provided.*',
          fields: [
            { name: '👤 Submitter', value: submitterValue, inline: true },
            { name: '⏱️ Submitted', value: `<t:${nowUnix}:R>`, inline: true },
            { name: '📝 Proposed Changes', value: changes.substring(0, 1024), inline: false },
            { name: '⚖️ Status', value: '⏳ **Pending Leadership Review**', inline: false },
          ],
          footer: { text: 'Last Asylum Diplomacy Engine' },
          timestamp: new Date().toISOString(),
        };

        const components = [
          {
            type: 1,
            components: [
              {
                type: 2,
                custom_id: 'approve_blacklist_proposal',
                label: 'Approve Blacklist',
                style: 3,
                emoji: { name: '✅' },
              },
              {
                type: 2,
                custom_id: 'reject_blacklist_proposal',
                label: 'Reject',
                style: 4,
                emoji: { name: '❌' },
              },
            ],
          },
        ];

        const formData = new FormData();
        formData.append('payload_json', JSON.stringify({ embeds: [markTest(embed)], components }));
        // Only the changes: on approval they are applied to the blacklist as it is then.
        const blueprintData = {
          diff: diff.map(({ action, category, target }) => ({ action, category, target })),
        };
        formData.append(
          'files[0]',
          new Blob([JSON.stringify(blueprintData)], { type: 'application/octet-stream' }),
          'blacklist-blueprint.dat',
        );

        const channelId = proposalChannel(process.env.WAR_ROOM_CHANNEL_ID);
        const discordRes = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages`,
          {
            method: 'POST',
            headers: { Authorization: `Bot ${botToken}` },
            body: formData,
          },
        );

        if (!discordRes.ok) {
          const errorText = await discordRes.text();
          throw new Error(`Discord API Error: ${discordRes.status} - ${errorText}`);
        }

        return result(200, { success: true, message: 'Blacklist proposal dispatched to Discord!' });
      }

      // ======================================================================
      // 4. CAPITOL DEFENSE OVERRIDE PROPOSAL
      // ======================================================================
      case 'override': {
        const { notes, targetWeek, threatName, displacedAlly, action } = payload;

        if (!targetWeek || !threatName) {
          return result(400, { error: 'Target week and threat server are required.' });
        }

        const isBuyout = action === 'buyout';
        const title = isBuyout
          ? '🛡️ Wartime Buyout Declaration (Double Threat)'
          : '⚔️ Matchup Threat Override Declaration';

        const descriptionText = isBuyout
          ? `**Second Threat Override this cycle.** WLO will defend Week ${targetWeek} against **${threatName}**.\n**[${displacedAlly}]** receives a material buyout of **2 Regular Gold + 2 KW Gold** chests across 2 installments.`
          : `WLO will step into **Week ${targetWeek}** for kingdom defense against **${threatName}**.\n**[${displacedAlly}]** is promoted to **Week 3 (Finale Week)** (2 King chests + Buff Item). WLO chest cost: 0.`;

        const embed = {
          title,
          color: isBuyout ? 0xef4444 : 0xb8975a,
          description: notes ? `*"${notes}"*\n\n${descriptionText}` : descriptionText,
          fields: [
            { name: '👤 Declared By', value: submitterValue, inline: true },
            { name: '⏱️ Submitted', value: `<t:${nowUnix}:R>`, inline: true },
            {
              name: '🎯 Defense Target',
              value: `Week ${targetWeek} vs \`${threatName}\``,
              inline: true,
            },
            {
              name: '🛡️ Displaced Holder',
              value: `**[${displacedAlly || 'Ally'}]**`,
              inline: true,
            },
            {
              name: '📦 Settlement Model',
              value: isBuyout ? '💰 2-Installment Buyout' : '⇄ Calendar Swap (0 Chest Cost)',
              inline: true,
            },
            { name: '⚖️ Status', value: '⏳ **Pending Leadership Review**', inline: false },
          ],
          footer: { text: 'Last Asylum NAP Council' },
          timestamp: new Date().toISOString(),
        };

        const components = [
          {
            type: 1,
            components: [
              {
                type: 2,
                custom_id: 'approve_override_proposal',
                label: 'Approve Defense Override',
                style: 3,
                emoji: { name: '✅' },
              },
              {
                type: 2,
                custom_id: 'reject_override_proposal',
                label: 'Reject Override',
                style: 4,
                emoji: { name: '❌' },
              },
            ],
          },
        ];

        const formData = new FormData();
        formData.append('payload_json', JSON.stringify({ embeds: [markTest(embed)], components }));

        // Blueprint file attachment (Read by api/interactions.js upon approval)
        const blueprintData = {
          targetWeek: Number(targetWeek),
          threatName,
          displacedAlly,
          action,
        };
        const jsonBlob = new Blob([JSON.stringify(blueprintData)], {
          type: 'application/octet-stream',
        });
        formData.append('files[0]', jsonBlob, 'override-blueprint.dat');

        const channelId = proposalChannel(process.env.WAR_ROOM_CHANNEL_ID);
        const discordRes = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages`,
          {
            method: 'POST',
            headers: { Authorization: `Bot ${botToken}` },
            body: formData,
          },
        );

        if (!discordRes.ok) {
          const errorText = await discordRes.text();
          throw new Error(`Discord API Error: ${discordRes.status} - ${errorText}`);
        }

        return result(200, { success: true, message: 'Defense override proposal dispatched!' });
      }

      default:
        return result(400, {
          error: `Unsupported proposal type: "${type || 'unknown'}". Supported types: "rewards", "map", "alliance", "blacklist", "override".`,
        });
    }
  } catch (error) {
    console.error('Failed to dispatch proposal:', error);
    return result(500, { error: error.message || 'Internal server error' });
  }
}
