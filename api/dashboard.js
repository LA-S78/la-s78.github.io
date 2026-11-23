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

import { ID_PATTERN, allianceById, onMap, readRegister, withCurrentAlliance } from './_register.js';
import { gistJson, isGistConfigured, readGist, updateGist } from './_gist.js';
import { createToken, verifySessionToken } from './_tokens.js';
import { isSteward } from './_stewards.js';
import { sanitizeAlliances } from './_alliances.js';
import { fetchAlliance, memberPictures } from './_tracker.js';
import { stewardTools } from './_steward_tools.js';
import { readSkinMap } from './_stats.js';
import { allianceFrame, imageStatus } from './_alliance_images.js';
import { getRoleColors } from './_role_colors.js';
import { DEFAULT_CALENDAR_CONFIG } from './_calendar_helper.js';
import { getRewardPeriod } from './_reward_period.js';
import {
  fetchSourceTable,
  fetchSourceTabs,
  fetchSheetTabs,
  fetchSheetGrid,
} from './_google_source.js';
import {
  applyDashboardEdit,
  countRefresh,
  dashboardFile,
  findAllianceKey,
  readDashboard,
  refreshState,
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
  let session = verifySessionToken(pass, botToken);
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
  // The member's alliance as it is now (its ID in the register; plan step 1)
  session = withCurrentAlliance(session, gist);
  // The register can't vouch for the pass's alliance any more (renamed, or its tag taken by
  // another alliance): sign in again rather than guess. Stewards carry on (they pick any).
  if (session.allianceStale && !steward) {
    return res.status(401).json({ error: say('api_dashboard.alliance_changed'), code: 'login' });
  }
  const mapState = gistJson(gist, 'map-state.json');
  const alliances = mapState.alliances || {};

  // The Steward tools page (portal/steward.html): Stewards only, checked in there
  if (req.method === 'GET' && req.query?.steward) return stewardTools(req, res, { gist, session });

  // Whose dashboard: your own; Stewards may pick any alliance.
  // A link may name the alliance by its ID (?id=al_…, plan step 1) or by its tag (?alliance=).
  // Only the page's address, and only an alliance ID: a save's body has an `id` of its own
  // (the chart being deleted or refreshed), which is never an alliance.
  const askedId =
    req.method === 'GET' && ID_PATTERN.test(String(req.query?.id || '')) ? req.query.id : null;
  const byId = askedId ? allianceById(readRegister(gist), askedId) : null;
  // Only an alliance on the map: an old ID's tag may be another alliance's now
  if (askedId && !onMap(byId)) {
    return res.status(404).json({ error: say('api_dashboard.no_alliance'), code: 'no_alliance' });
  }
  const asked = byId?.tag || (req.method === 'GET' ? req.query?.alliance : req.body?.alliance);
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

  // The territory map's "My members" (owner request, 2026-11-19): where the leader's own
  // alliance members' Sanctuaries are. Leaders only, their own alliance only (Stewards: the
  // alliance asked for); from the roster's lookup, so no extra tracker requests.
  if (req.query?.positions) return memberPositions(res, { gist, tag, alliances, access });

  const body = {
    viewer: { name: session.name || '', tier: access.tier, canNominate: access.canNominate },
    alliance: {
      tag,
      rank: alliances[tag]?.rank ?? null,
      // The same colour as the Alliance page and /api/state (Discord role colour first).
      color: sanitizeAlliances({ [tag]: alliances[tag] || {} }, await getRoleColors())[tag].color,
    },
    dashboard: visibleDashboard(
      readDashboard(gistJson(gist, dashboardFile(tag, alliances, gist), {}), tag),
      access.leader,
    ),
  };
  if (steward) body.alliances = allianceList(alliances);

  // The roster view (owner request, 2026-11-18): the alliance's members from the Last Asylum
  // Tracker, for leaders only (owner, 2026-11-19: the "Members can view" option was removed).
  // One lookup serves the roster and the leaders' name checks; null without the tracker or
  // when it's slow.
  const saved = readDashboard(gistJson(gist, dashboardFile(tag, alliances, gist), {}), tag);
  // The Caravan Rotor shows players' pictures too (step 2), for whoever can see it
  const caravanShown = Boolean(body.dashboard.caravan);
  if (access.leader || caravanShown) {
    // After a leader's refresh, a copy older than it isn't used (the tracker has the new one)
    const refreshedAt = Date.parse(saved.settings.rosterRefresh?.lastAt || '') || 0;
    const live = await fetchAlliance(tag, {
      timeoutMs: 2500,
      newerThan: refreshedAt,
      use: 'alliance',
    });
    // The alliance's own avatar frame, when switched on, replaces members' in-game frames
    const frame = allianceFrame(gist, tag);
    if (access.leader) {
      body.roster = rosterBody(live, frame);
      body.roster.refresh = refreshState(saved.settings);
    }
    if (access.leader) body.members = live ? live.members.map((m) => m.name) : null;
    if (caravanShown) body.pictures = memberPictures(live, frame);
  }

  if (access.leader) {
    // The alliance's card pictures (api/_alliance_images.js): R4/R5 send, the R5 or a
    // Steward may take a live one down.
    body.images = {
      ...imageStatus(gist, tag),
      canRemove:
        steward || (session.role === 'R5' && findAllianceKey(alliances, session.alliance) === tag),
    };
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

async function memberPositions(res, { gist, tag, alliances, access }) {
  if (!access.leader) {
    return res.status(403).json({ error: say('api_dashboard.positions_leaders_only') });
  }
  const settings = readDashboard(
    gistJson(gist, dashboardFile(tag, alliances, gist), {}),
    tag,
  ).settings;
  const refreshedAt = Date.parse(settings.rosterRefresh?.lastAt || '') || 0;
  const live = await fetchAlliance(tag, {
    timeoutMs: 3000,
    newerThan: refreshedAt,
    use: 'alliance',
  });
  if (!live) return res.status(502).json({ error: say('api_dashboard.positions_unavailable') });
  // Sanctuary skins collected so far (api/_skins.js), for the map's game view
  const skins = await readSkinMap().catch(() => ({}));
  return res.status(200).json({
    tag,
    takenAt: new Date(live.at - live.ageSeconds * 1000).toISOString(),
    members: live.members
      .filter((m) => Number.isFinite(m.x) && Number.isFinite(m.y))
      .map(({ uid, name, power, rank, x, y, avatar, kills, level, frame }) => ({
        uid,
        name,
        power,
        rank,
        x,
        y,
        avatar,
        // For the map's game view (its popup: kills, the Sanctuary level, the profile frame)
        kills,
        level,
        frame,
        skin: skins[String(uid)]?.[0] || null,
      })),
  });
}

/** The roster card's data from a tracker lookup (leaders only; null fields when there is none). */
function rosterBody(live, frame = null) {
  return {
    members: live ? (frame ? live.members.map((m) => ({ ...m, frame })) : live.members) : null,
    power: live ? live.power : null,
    ageSeconds: live ? live.ageSeconds : null,
    // When the game sent this copy: daily numbers count from the 00:00 GT reset
    takenAt: live ? new Date(live.at - live.ageSeconds * 1000).toISOString() : null,
  };
}

/**
 * The roster's Refresh button (leaders): a live lookup from the game, within the alliance's
 * daily allowance and cooldown (api/_dashboard.js refreshState). Counted only when it worked.
 */
async function refreshRoster(res, { gist, tag, alliances, session }) {
  const file = dashboardFile(tag, alliances, gist);
  const before = refreshState(readDashboard(gistJson(gist, file, {}), tag).settings);
  if (!before.left) return res.status(429).json({ error: say('api_dashboard.refresh_limit') });
  if (before.waitMinutes) {
    return res
      .status(429)
      .json({ error: say('api_dashboard.refresh_wait', { n: before.waitMinutes }) });
  }
  const live = await fetchAlliance(tag, { fresh: true, timeoutMs: 6000, use: 'alliance' });
  if (!live) return res.status(502).json({ error: say('api_dashboard.refresh_failed') });
  let settings = null;
  try {
    await updateGist(
      (fresh) => {
        const stored = readDashboard(gistJson(fresh, file, {}), tag);
        stored.settings = countRefresh(stored.settings);
        settings = stored.settings;
        return {
          files: { [file]: stored },
          description: `Dashboard [${tag}]: roster refreshed by ${session.name || 'a leader'}`,
        };
      },
      { gist },
    );
  } catch (err) {
    // The lookup worked: the leader still gets it, the count just wasn't saved
    console.warn(`Roster refresh [${tag}] not counted:`, err.message);
  }
  const stored = readDashboard(gistJson(gist, file, {}), tag).settings;
  const roster = rosterBody(live, allianceFrame(gist, tag));
  roster.refresh = refreshState(settings || countRefresh(stored));
  return res.status(200).json({ roster, members: live.members.map((m) => m.name) });
}

/**
 * Leaders' edits to their alliance's dashboard (Stewards: any alliance): save, delete or move
 * a chart or table. Saved with updateGist, so edits made at the same moment are all kept.
 */
/** A chart's table from its sheet or Doc: one range, or the same range across tabs. */
const readSource = (source) =>
  source?.kind === 'sheet' && source.tabs?.pattern
    ? fetchSourceTabs(source)
    : fetchSourceTable(source);

async function editDashboard(req, res, { gist, tag, access, session, alliances }) {
  if (!access.leader) {
    return res.status(403).json({ error: say('api_dashboard.leaders_only') });
  }
  const body = req.body || {};
  const file = dashboardFile(tag, alliances, gist);

  if (body.action === 'roster-refresh') {
    return refreshRoster(res, { gist, tag, alliances, session });
  }

  // The sheet preview (2026-11-23): a sheet's tabs, and one tab's grid (nothing is saved)
  if (body.action === 'sheet-tabs' || body.action === 'sheet-grid') {
    try {
      const out =
        body.action === 'sheet-tabs'
          ? { tabs: await fetchSheetTabs(body.source || {}) }
          : { grid: await fetchSheetGrid(body.source || {}) };
      return res.status(200).json(out);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  // Read a Google Sheet / Doc for the editor's preview (nothing is saved).
  if (body.action === 'load-source') {
    try {
      const data = await readSource(body.source || {});
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
      edit = { action: 'sync-data', id: body.id, data: await readSource(widget.source) };
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
