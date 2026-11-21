// api/_dashboard_ids.js
// Alliance dashboards by alliance ID (docs/ALLIANCE-IDS-PLAN.md, step 5, 2026-11-22).
//
// Each alliance's dashboard is its own Gist file, named after its tag: `dashboard-<slug>.json`
// (tagSlug: RÂVN → RAVN, RâvN → RavN). The move copies every one to `dashboard-<ID>.json` in a
// single save and switches the site over (alliance-id-moves.json: { dashboards: true }); from
// then on api/_dashboard.js dashboardFile() names the ID file. The tag files are left exactly
// as they were: they are the backup (removed in the tidy-up, step 8). Undo copies the ID files
// back onto the tag files (so edits made since are kept) and switches back.
//
// Needs the alliance list moved first (step 2): the alliance's ID comes from it.

import { tagSlug } from './_alliances.js';

export const MOVES_FILE = 'alliance-id-moves.json';

const parse = (gist, name) => JSON.parse(gist?.files?.[name]?.content || 'null');

/** Is the site reading dashboards by ID? */
export const dashboardsById = (gist) => Boolean(parse(gist, MOVES_FILE)?.dashboards);

/** The alliance list (tag form, with ids once it is stored by ID). */
async function alliancesOf(gist) {
  const { gistJson } = await import('./_gist.js');
  return gistJson(gist, 'map-state.json', { alliances: {} }).alliances || {};
}

/** [{ tag, from: tag file, to: ID file }] for every alliance with an ID. */
function pairs(alliances) {
  const tags = Object.keys(alliances);
  return Object.entries(alliances)
    .filter(([, a]) => a?.id)
    .map(([tag, a]) => ({
      tag,
      from: `dashboard-${tagSlug(tag, tags)}.json`,
      to: `dashboard-${a.id}.json`,
    }));
}

export async function moveDashboardsToIds({ now = new Date(), update } = {}) {
  const { updateGist } = await import('./_gist.js');
  let report = null;
  await (update || updateGist)(async (gist) => {
    if (dashboardsById(gist)) {
      report = { already: true };
      return {};
    }
    const alliances = await alliancesOf(gist);
    const list = pairs(alliances);
    if (!list.length || list.length !== Object.keys(alliances).length) {
      throw new Error('Move the alliance list to IDs first.');
    }
    const files = {};
    for (const p of list) {
      const data = parse(gist, p.from);
      if (data) files[p.to] = data;
    }
    files[MOVES_FILE] = {
      ...(parse(gist, MOVES_FILE) || {}),
      dashboards: true,
      dashboards_at: now.toISOString(),
    };
    report = {
      moved: true,
      store: 'dashboards',
      counts: { dashboards: Object.keys(files).length - 1 },
      backup: 'dashboard-<tag>.json',
    };
    return {
      raw: true,
      files,
      description: `Alliance IDs step 5: ${report.counts.dashboards} dashboards copied to dashboard-<ID>.json (the tag files are kept as the backup)`,
    };
  });
  return report;
}

export async function moveDashboardsToTags({ update } = {}) {
  const { updateGist } = await import('./_gist.js');
  let report = null;
  await (update || updateGist)(async (gist) => {
    if (!dashboardsById(gist)) {
      report = { already: true };
      return {};
    }
    const files = {};
    for (const p of pairs(await alliancesOf(gist))) {
      const data = parse(gist, p.to);
      if (data) files[p.from] = data;
    }
    const moves = { ...(parse(gist, MOVES_FILE) || {}) };
    delete moves.dashboards;
    delete moves.dashboards_at;
    files[MOVES_FILE] = moves;
    report = {
      undone: true,
      store: 'dashboards',
      counts: { dashboards: Object.keys(files).length - 1 },
      backup: 'dashboard-<ID>.json',
    };
    return {
      raw: true,
      files,
      description: `Alliance IDs step 5 undone: ${report.counts.dashboards} dashboards copied back to dashboard-<tag>.json`,
    };
  });
  return report;
}
