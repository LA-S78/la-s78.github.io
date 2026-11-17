// api/dashboard.js — the Alliance Dashboard (portal/dashboard.html).
//
// GET  (Authorization: Bearer <login pass>) [?alliance=TAG, Stewards only]
//      The viewer's alliance dashboard, filtered here for their rank, and for leaders the
//      weekly reward and nomination status.
// POST { action: 'nominate-link' [, alliance] } (same pass): a nomination link for R5s and
//      Stewards, as /nominate gives in Discord.
// POST { action: 'save-widget' | 'delete-widget' | 'move-widget', ... [, alliance] }: leaders
//      edit their dashboard's charts and tables (api/_dashboard.js applyDashboardEdit).
// POST { action: 'load-source', source } reads a Google Sheet / Doc for the editor's preview;
//      { action: 'sync-widget', id } refreshes a saved chart from its sheet
//      (api/_google_source.js: Google hosts only).
//
// Rules and storage: api/_dashboard.js and docs/DECISIONS.md ("Alliance Dashboard").

import { gistJson, isGistConfigured, readGist, updateGist } from './_gist.js';
import { createToken, verifySessionToken } from './_tokens.js';
import { isSteward } from './_stewards.js';
import { sanitizeAlliances } from './_alliances.js';
import { memberNames } from './_tracker.js';
import { imageStatus } from './_alliance_images.js';
import { getRoleColors } from './_role_colors.js';
import { DEFAULT_CALENDAR_CONFIG } from './_calendar_helper.js';
import { getRewardPeriod } from './_reward_period.js';
import { fetchSourceTable } from './_google_source.js';
import {
  applyDashboardEdit,
  dashboardFile,
  findAllianceKey,
  readDashboard,
  rewardStatus,
  viewerAccess,
  visibleDashboard,
} from './_dashboard.js';
import { inLanguage, say, utcTime } from './_messages.js';

const calendarConfig = (gist) => ({
  ...DEFAULT_CALENDAR_CONFIG,
  ...gistJson(gist, 'calendar-state.json', {}),
});

export default function handler(req, res) {
  return inLanguage(req, () => respond(req, res));
}

async function respond(req, res) {
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
      error: say('api_dashboard.signed_out'),
      code: 'login',
    });
  }
  const steward = isSteward(session.uid);
  const access = viewerAccess(session, steward);

  let gist;
  try {
    gist = await readGist({ timeoutMs: 5000 });
  } catch (err) {
    return res
      .status(503)
      .json({ error: say('api_dashboard.load_failed', { reason: err.message }) });
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
      error: say('api_dashboard.no_alliance'),
      code: 'no_alliance',
    });
  }

  if (req.method === 'POST') {
    if (req.body?.action === 'nominate-link') {
      return nominateLink(req, res, { gist, mapState, tag, access });
    }
    return editDashboard(req, res, { gist, tag, access, session, alliances });
  }

  const body = {
    viewer: { name: session.name || '', tier: access.tier, canNominate: access.canNominate },
    alliance: {
      tag,
      rank: alliances[tag]?.rank ?? null,
      // The same colour as the Alliance page and /api/state (Discord role colour first).
      color: sanitizeAlliances({ [tag]: alliances[tag] || {} }, await getRoleColors())[tag].color,
    },
    dashboard: visibleDashboard(
      readDashboard(gistJson(gist, dashboardFile(tag, alliances), {}), tag),
      access.leader,
    ),
  };
  if (steward) body.alliances = allianceList(alliances);
  if (access.leader) {
    // The alliance's card pictures (api/_alliance_images.js): R4/R5 send, the R5 or a
    // Steward may take a live one down.
    body.images = {
      ...imageStatus(gist, tag),
      canRemove:
        steward || (session.role === 'R5' && findAllianceKey(alliances, session.alliance) === tag),
    };
    // The alliance's member names from the Last Asylum Tracker, for the Caravan Rotor's name
    // check (js/name-check.js); null without the tracker or when it's slow
    body.members = await memberNames(tag, { timeoutMs: 2500 });
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
async function editDashboard(req, res, { gist, tag, access, session, alliances }) {
  if (!access.leader) {
    return res.status(403).json({ error: say('api_dashboard.leaders_only') });
  }
  const body = req.body || {};
  const file = dashboardFile(tag, alliances);

  // Read a Google Sheet / Doc for the editor's preview (nothing is saved).
  if (body.action === 'load-source') {
    try {
      const data = await fetchSourceTable(body.source || {});
      return res.status(200).json({ data, syncedAt: new Date().toISOString() });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  // Sync a saved chart from its sheet: fetched first, then saved like any other edit.
  let edit = body;
  // A new chart or rotor player gets its id here, once: a save may be worked out again after
  // a clash (updateGist), and must then replace the same item rather than add a second one.
  const newId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  if (body.action === 'save-widget' && !/^w_[a-z0-9]{4,20}$/.test(String(body.widget?.id || ''))) {
    edit = { ...body, widget: { ...(body.widget || {}), id: newId('w') } };
  }
  if (body.action === 'caravan-add') edit = { ...body, id: newId('p') };
  if (body.action === 'sync-widget') {
    const widget = readDashboard(gistJson(gist, file, {}), tag).widgets.find(
      (w) => w.id === body.id,
    );
    if (!widget) return res.status(404).json({ error: say('api_dashboard.chart_removed') });
    if (!['sheet', 'doc'].includes(widget.source?.kind)) {
      return res.status(400).json({ error: say('api_dashboard.not_linked') });
    }
    try {
      edit = { action: 'sync-data', id: body.id, data: await fetchSourceTable(widget.source) };
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  } else if (body.action === 'sync-data') {
    return res.status(400).json({ error: say('api_dashboard.unknown_change') }); // only after a fetch, above
  }

  try {
    const out = await updateGist(
      (fresh) => {
        const stored = readDashboard(gistJson(fresh, file, {}), tag);
        const result = applyDashboardEdit(stored, edit, { actor: session.name || '' });
        if (result.error) return { refused: result };
        return {
          dashboard: result.dashboard,
          files: { [file]: result.dashboard },
          description: `Dashboard [${tag}]: ${edit.action} by ${session.name || 'a leader'}`,
        };
      },
      { gist },
    );
    if (out.refused) return res.status(out.refused.status).json({ error: out.refused.error });
    return res.status(200).json({ dashboard: visibleDashboard(out.dashboard, true) });
  } catch (err) {
    console.error('Dashboard not saved:', err);
    return res
      .status(500)
      .json({ error: say('api_dashboard.save_failed', { reason: err.message }) });
  }
}

/** A nomination link (as /nominate gives in Discord), for R5s and Stewards. */
function nominateLink(req, res, { gist, mapState, tag, access }) {
  if (!access.canNominate) {
    return res.status(403).json({
      error: say('api_dashboard.r5_only_nominate'),
    });
  }
  const period = getRewardPeriod(Date.now(), calendarConfig(gist));
  if (!period.open) {
    return res.status(409).json({
      error: say('api_dashboard.rewards_closed', { when: utcTime(period.nextOpensAt) }),
    });
  }
  const rank = Number(mapState.alliances?.[tag]?.rank);
  if (!Number.isFinite(rank) || rank < 1 || rank > 50) {
    return res.status(409).json({ error: say('api_dashboard.no_rank', { tag }) });
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

/**
 * The alliances a Steward can switch between, in the Alliance page's standings order (owner,
 * 2026-11-17): NAP alliances (`is_nap`, on unless switched off) by rank, then by tag, the
 * academies (RâvN, Ghst) among them; then the alliances outside the NAP, in the same order.
 */
function allianceList(alliances) {
  const rank = (a) => (Number.isFinite(Number(a?.rank)) && a.rank !== null ? Number(a.rank) : null);
  const byRank = (x, y) => (x.rank ?? 999) - (y.rank ?? 999) || x.tag.localeCompare(y.tag);
  const list = Object.entries(alliances)
    .filter(([, a]) => a)
    .map(([tag, a]) => ({ tag, rank: rank(a), nap: a.is_nap !== false }));
  return [...list.filter((x) => x.nap).sort(byRank), ...list.filter((x) => !x.nap).sort(byRank)];
}

function firstByRank(alliances) {
  return allianceList(alliances)[0]?.tag || null;
}
