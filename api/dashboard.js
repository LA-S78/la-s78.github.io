// api/dashboard.js — the Alliance Dashboard (portal/dashboard.html).
//
// GET  (Authorization: Bearer <login pass>) [?alliance=TAG, Stewards only]
//      The viewer's alliance dashboard, filtered here for their rank, and for leaders the
//      weekly reward and nomination status.
// POST { action: 'nominate-link' [, alliance] } (same pass): a nomination link for R5s and
//      Stewards, as /nominate gives in Discord.
// POST { action: 'save-widget' | 'delete-widget' | 'move-widget', ... [, alliance] }: leaders
//      edit their dashboard's charts and tables (api/_dashboard.js applyDashboardEdit).
//
// Rules and storage: api/_dashboard.js and docs/DECISIONS.md ("Alliance Dashboard").

import { gistJson, isGistConfigured, readGist, updateGist } from './_gist.js';
import { createToken, verifySessionToken } from './_tokens.js';
import { isSteward } from './_stewards.js';
import { DEFAULT_FALLBACK_COLORS } from './_alliances.js';
import { DEFAULT_CALENDAR_CONFIG } from './_calendar_helper.js';
import { getRewardPeriod } from './_reward_period.js';
import {
  applyDashboardEdit,
  dashboardFile,
  findAllianceKey,
  readDashboard,
  rewardStatus,
  viewerAccess,
  visibleDashboard,
} from './_dashboard.js';

const calendarConfig = (gist) => ({
  ...DEFAULT_CALENDAR_CONFIG,
  ...gistJson(gist, 'calendar-state.json', {}),
});

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken || !isGistConfigured()) {
    return res.status(500).json({ error: 'The server is not configured.' });
  }

  const pass = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  const session = verifySessionToken(pass, botToken);
  if (!session) {
    return res.status(401).json({
      error: 'Sign in with Discord (top right) to see your alliance dashboard.',
      code: 'login',
    });
  }
  const steward = isSteward(session.uid);
  const access = viewerAccess(session, steward);

  let gist;
  try {
    gist = await readGist({ timeoutMs: 5000 });
  } catch (err) {
    return res.status(503).json({ error: `Could not load the dashboard: ${err.message}` });
  }
  const mapState = gistJson(gist, 'map-state.json');
  const alliances = mapState.alliances || {};

  // Whose dashboard: your own; Stewards may pick any alliance.
  const asked = req.method === 'GET' ? req.query?.alliance : req.body?.alliance;
  const tag =
    (steward && asked && findAllianceKey(alliances, asked)) ||
    findAllianceKey(alliances, session.alliance) ||
    (steward ? firstByRank(alliances) : null);
  if (!tag) {
    return res.status(404).json({
      error:
        "We couldn't tell which alliance you're in. The site finds it from your alliance role in the NAP Discord server, or a [TAG] at the start of your server nickname. Fix that in Discord, then use Refresh Access in your account card (top right).",
      code: 'no_alliance',
    });
  }

  if (req.method === 'POST') {
    if (req.body?.action === 'nominate-link') {
      return nominateLink(req, res, { gist, mapState, tag, access });
    }
    return editDashboard(req, res, { gist, tag, access, session });
  }

  const body = {
    viewer: { name: session.name || '', tier: access.tier, canNominate: access.canNominate },
    alliance: {
      tag,
      rank: alliances[tag]?.rank ?? null,
      color: alliances[tag]?.color || DEFAULT_FALLBACK_COLORS[tag] || null,
    },
    dashboard: visibleDashboard(
      readDashboard(gistJson(gist, dashboardFile(tag), {}), tag),
      access.leader,
    ),
  };
  if (steward) body.alliances = allianceList(alliances);
  if (access.leader) {
    body.rewards = rewardStatus({
      tag,
      rewardsData: gistJson(gist, 'rewards-data.json'),
      mapState,
      nominations: gistJson(gist, 'rewards-nominations.json'),
      period: getRewardPeriod(Date.now(), calendarConfig(gist)),
    });
  }
  return res.status(200).json(body);
}

/**
 * Leaders' edits to their alliance's dashboard (Stewards: any alliance): save, delete or move
 * a chart or table. Saved with updateGist, so edits made at the same moment are all kept.
 */
async function editDashboard(req, res, { gist, tag, access, session }) {
  if (!access.leader) {
    return res
      .status(403)
      .json({ error: "Only your alliance's R4s and R5s can change the dashboard." });
  }
  const file = dashboardFile(tag);
  try {
    const out = await updateGist(
      (fresh) => {
        const stored = readDashboard(gistJson(fresh, file, {}), tag);
        const result = applyDashboardEdit(stored, req.body || {}, { actor: session.name || '' });
        if (result.error) return { refused: result };
        return {
          dashboard: result.dashboard,
          files: { [file]: result.dashboard },
          description: `Dashboard [${tag}]: ${req.body?.action} by ${session.name || 'a leader'}`,
        };
      },
      { gist },
    );
    if (out.refused) return res.status(out.refused.status).json({ error: out.refused.error });
    return res.status(200).json({ dashboard: visibleDashboard(out.dashboard, true) });
  } catch (err) {
    console.error('Dashboard not saved:', err);
    return res.status(500).json({ error: `Could not save: ${err.message}` });
  }
}

/** A nomination link (as /nominate gives in Discord), for R5s and Stewards. */
function nominateLink(req, res, { gist, mapState, tag, access }) {
  if (!access.canNominate) {
    return res.status(403).json({
      error: 'Only your R5 can open the nomination page here. Run /nominate in Discord.',
    });
  }
  const period = getRewardPeriod(Date.now(), calendarConfig(gist));
  if (!period.open) {
    return res.status(409).json({
      error: `Rewards are closed until ${new Date(period.nextOpensAt).toUTCString()}.`,
    });
  }
  const rank = Number(mapState.alliances?.[tag]?.rank);
  if (!Number.isFinite(rank) || rank < 1 || rank > 50) {
    return res.status(409).json({ error: `[${tag}] has no rank in the standings.` });
  }
  const token = createToken(
    {
      action: 'nominate', // /api/nominate only accepts links made for nominating
      alliance: tag,
      rank,
      period: period.id,
      exp: Math.min(Date.now() + 24 * 3600 * 1000, period.closesAt),
    },
    process.env.DISCORD_BOT_TOKEN,
  );
  return res.status(200).json({ url: `/nominate.html?token=${token}` });
}

/** The alliances a Steward can switch between, best rank first. */
function allianceList(alliances) {
  return Object.entries(alliances)
    .filter(([, a]) => a && a.type !== 'academy')
    .map(([tag, a]) => ({ tag, rank: Number.isFinite(Number(a.rank)) ? Number(a.rank) : null }))
    .sort((x, y) => (x.rank ?? 999) - (y.rank ?? 999) || x.tag.localeCompare(y.tag));
}

function firstByRank(alliances) {
  return allianceList(alliances)[0]?.tag || null;
}
