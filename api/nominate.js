// api/nominate.js
// Nominations for the open reward period (api/_reward_period.js). An alliance saves a ranked
// list of players; the chests are worked out from it (api/_nomination_assign.js), here and
// again whenever the Kingdom War result changes what's available.

import { isGistConfigured, readGist, gistJson, updateGist } from './_gist.js';
import { verifySessionToken, verifyToken } from './_tokens.js';
import { isSteward } from './_stewards.js';
import { DEFAULT_CALENDAR_CONFIG } from './_calendar_helper.js';
import { describeRewardPeriod, getRewardPeriod, syncRewardPeriod } from './_reward_period.js';
import { getAllianceNominationQuota, quotaIfWon } from './_rewards_helper.js';
import {
  CHEST_TYPES,
  chestCounts,
  cleanRankedList,
  rankedFromSlots,
} from './_nomination_assign.js';
import {
  buildNomination,
  handedOutFor,
  handedOutKey,
  kingAlliance,
  reassignAllNominations,
} from './_nominations.js';
import { inLanguage, say } from './_messages.js';

export default function handler(req, res) {
  return inLanguage(req, () => respond(req, res));
}

async function respond(req, res) {
  if (!isGistConfigured()) {
    return res.status(500).json({ error: 'Gist configuration is missing.' });
  }

  // GET: the current period and its nominations (King's page), and with ?token= one
  // alliance's own list and chest counts (nomination page)
  if (req.method === 'GET') {
    try {
      const gist = await readGist();
      const rewardsData = gistJson(gist, 'rewards-data.json');
      const mapState = gistJson(gist, 'map-state.json');
      const period = getRewardPeriod(Date.now(), calendarConfig(gist));
      // A new period nobody has used yet: the saved nominations belong to the last one.
      const current = !period.open || !rewardsData.period || rewardsData.period.id === period.id;
      const nominations = current ? gistJson(gist, 'rewards-nominations.json') : {};
      const view = current ? rewardsData : { ...rewardsData, mode: 'standard', period: null };

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const lastReset = current ? rewardsData.lastReset || null : period.id;
      if (lastReset) {
        res.setHeader('X-Cycle-Id', Buffer.from(lastReset).toString('hex').slice(0, 12));
      }

      const body = {
        nominations,
        lastReset,
        mode: view.mode || 'standard',
        period: describeRewardPeriod(period, rewardsData),
        wartime_buyouts: rewardsData.wartime_buyouts || [],
        // The King's checklist: chests ticked as handed out, and whose leaders may tick
        handed_out: current ? rewardsData.period?.handed_out || {} : {},
        king: current ? kingAlliance(rewardsData, period) : null,
      };

      const token = req.query?.token;
      if (token) {
        const payload = verifyToken(String(token), process.env.DISCORD_BOT_TOKEN, {
          action: 'nominate',
        });
        if (!payload) return res.status(403).json({ error: say('api_nominate.link_invalid') });
        const tag = String(payload.alliance || '').trim();
        const now = getAllianceNominationQuota(tag, view, mapState);
        body.alliance = {
          tag,
          rank: now.rank,
          chests: chestCounts(now, now.isKW),
          chestsIfWon: chestCounts(quotaIfWon(tag, view, mapState), true),
          hasBuyoutBonus: now.hasBuyoutBonus,
          isWloDeducted: now.isWloDeducted,
          ranked: nominations[tag]?.ranked || rankedFromSlots(nominations[tag]?.recipients || {}),
          submittedAt: nominations[tag]?.submittedAt || null,
          // Already handed out by the King: locked, kept whatever the list says
          handedOut: current
            ? handedOutFor(rewardsData, tag).map(({ pool, chest, name }) => ({ pool, chest, name }))
            : [],
        };
      }
      return res.status(200).json(body);
    } catch (err) {
      console.error('Failed to read nominations:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.body?.action === 'handout') return handleHandout(req, res);

  const { token } = req.body || {};
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!token || !botToken) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  // Only links made by /nominate: other portal links (e.g. /registerbot or calendar
  // management) are signed the same way and also name an alliance.
  const payload = verifyToken(token, botToken, { action: 'nominate' });
  if (!payload) {
    return res.status(403).json({ error: say('api_nominate.token_invalid') });
  }
  const tag = String(payload.alliance || '').trim();

  // The ranked list, best first. An old page still open may send filled slots instead.
  const raw = Array.isArray(req.body.ranked)
    ? req.body.ranked
    : rankedFromSlots(req.body.nominations || {});
  const { names, error } = cleanRankedList(raw);
  const refuse = (status, message) => ({ refused: { status, error: message } });
  if (error) return res.status(400).json({ error });

  try {
    // Worked out from the stored data and saved; redone on newer data if another save (e.g.
    // another alliance's list, or the Kingdom War result) lands at the same moment.
    const saved = await updateGist((gist) => {
      const rewardsData = gistJson(gist, 'rewards-data.json');
      const mapState = gistJson(gist, 'map-state.json');
      let nominationsStore = gistJson(gist, 'rewards-nominations.json');

      const period = getRewardPeriod(Date.now(), calendarConfig(gist));
      if (!period.open) {
        return refuse(
          409,
          `Rewards are closed until ${new Date(period.nextOpensAt).toUTCString()}.`,
        );
      }
      if (payload.period && payload.period !== period.id) {
        return refuse(409, 'This link is for an earlier week. Run /nominate again for a new one.');
      }
      if (syncRewardPeriod(rewardsData, mapState, period).clearNominations) nominationsStore = {};

      const entry = buildNomination(tag, names, rewardsData, mapState, new Date().toISOString());
      if (entry.rank > 50) return refuse(400, `[${tag}] has no rank in the standings.`);
      const chests = names.length - entry.reserves.length + entry.unfilled;
      if (chests === 0) return refuse(400, `[${tag}] has no chests this week.`);
      nominationsStore[tag] = entry;
      // Every list is sorted again from its names, so all chests match the stored result
      // even if this save had to be merged with a Kingdom War result saved at the same moment.
      nominationsStore = reassignAllNominations(nominationsStore, rewardsData, mapState);

      return {
        entry: nominationsStore[tag],
        files: {
          'rewards-nominations.json': nominationsStore,
          'rewards-data.json': rewardsData,
        },
        description: `Nominations updated: [${tag}] at ${new Date().toISOString()}`,
      };
    });
    if (saved.refused) return res.status(saved.refused.status).json({ error: saved.refused.error });
    const { entry } = saved;

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(200).json({
      success: true,
      alliance: tag,
      recipients: entry.recipients,
      reserves: entry.reserves,
      unfilled: entry.unfilled,
      hasBuyoutBonus: entry.hasBuyoutBonus,
    });
  } catch (error) {
    console.error('Failed to commit nominations:', error);
    return res.status(500).json({ error: error.message });
  }
}

/** The calendar settings (calendar-state.json), over the defaults. */
/** Tags compared without letter case or accents (RÂVN = ravn). */
const sameTag = (a, b) =>
  Boolean(a && b) &&
  String(a)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase() ===
    String(b)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

/**
 * POST { action: 'handout', alliance, pool, chest, name, done } with the login pass
 * (Authorization: Bearer): ticks (done: true) or unticks a chest on the King's checklist.
 * Allowed for the R4/R5 of this period's King's alliance (kingAlliance) and Stewards. A
 * ticked chest is locked: later re-sorts keep it with that player (assignChests).
 */
async function handleHandout(req, res) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const pass = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  const session = verifySessionToken(pass, botToken);
  if (!session) {
    return res.status(401).json({ error: say('api_nominate.signed_out'), code: 'login' });
  }
  const { alliance, pool, chest, name, done } = req.body || {};
  if (
    typeof alliance !== 'string' ||
    !['standard', 'kingdom_war'].includes(pool) ||
    !CHEST_TYPES.includes(chest) ||
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 60
  ) {
    return res.status(400).json({ error: say('api_nominate.invalid_chest') });
  }
  const steward = isSteward(session.uid);

  try {
    const saved = await updateGist((gist) => {
      const rewardsData = gistJson(gist, 'rewards-data.json');
      const period = getRewardPeriod(Date.now(), calendarConfig(gist));
      if (!period.open || rewardsData.period?.id !== period.id) {
        return { refused: { status: 409, error: say('api_nominate.no_period') } };
      }
      const king = kingAlliance(rewardsData, period);
      const leader = ['R4', 'R5'].includes(session.role) && sameTag(session.alliance, king);
      if (!steward && !leader) {
        return {
          refused: {
            status: 403,
            error: king
              ? say('api_nominate.king_only_tag', { king })
              : say('api_nominate.king_only'),
          },
        };
      }

      const handed = { ...(rewardsData.period.handed_out || {}) };
      const key = handedOutKey(alliance, pool, chest, name);
      const nominations = gistJson(gist, 'rewards-nominations.json');
      if (done) {
        // The King ticks what the console showed: that chest is given in the game, so the
        // tick stands even if the list was re-sorted meanwhile (the lock then puts the player
        // back in that chest). Only a player who isn't on the alliance's list is refused.
        const entry = nominations[alliance];
        const listed = [
          ...(entry?.ranked || []),
          ...Object.values(entry?.recipients || {}).flatMap((p) => Object.values(p).flat()),
        ];
        const holder = listed.find((n) => n.toLowerCase() === name.trim().toLowerCase());
        if (!holder && !handed[key]) {
          return {
            refused: {
              status: 409,
              error: say('api_nominate.not_listed', { name, alliance }),
            },
          };
        }
        if (handed[key]) return { handedOut: handed }; // already ticked
        // One chest per player: a tick for another chest (from a page not yet refreshed) is replaced.
        for (const [k, h] of Object.entries(handed)) {
          if (h.alliance === alliance && h.name.toLowerCase() === holder.toLowerCase())
            delete handed[k];
        }
        handed[key] = {
          alliance,
          pool,
          chest,
          name: holder,
          by: session.name || 'Unknown',
          at: new Date().toISOString(),
        };
      } else {
        if (!handed[key]) return { handedOut: handed }; // not ticked
        delete handed[key];
      }
      rewardsData.period.handed_out = handed;
      // The lists sorted again with the lock (or without it), so the saved chests always
      // match the checklist, even if a list was re-sent at the same moment.
      const sorted = reassignAllNominations(
        nominations,
        rewardsData,
        gistJson(gist, 'map-state.json'),
      );
      return {
        handedOut: handed,
        files: { 'rewards-data.json': rewardsData, 'rewards-nominations.json': sorted },
        description: `King's checklist: ${done ? 'handed out' : 'unticked'} ${name} [${alliance}] by ${session.name}`,
      };
    });
    if (saved.refused) {
      return res.status(saved.refused.status).json({ error: saved.refused.error });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, handed_out: saved.handedOut });
  } catch (err) {
    console.error("King's checklist not saved:", err);
    return res
      .status(500)
      .json({ error: say('api_nominate.save_failed', { reason: err.message }) });
  }
}

function calendarConfig(gist) {
  return { ...DEFAULT_CALENDAR_CONFIG, ...gistJson(gist, 'calendar-state.json', {}) };
}
