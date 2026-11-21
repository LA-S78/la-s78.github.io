// api/_tidy_up.js
// The alliance ID move's tidy-up (docs/ALLIANCE-IDS-PLAN.md, step 8, 2026-11-22): once every
// store is kept by ID, a Steward deletes the backups the moves left: the Gist's
// `backup-*.json` files, the dashboards' old `dashboard-<TAG>.json` files (their contents were
// copied to `dashboard-<ID>.json`), and the Stats files' backup folders in the Blob store.
// The Gist keeps every earlier revision, so even then nothing is gone for good.

import { storeForms } from './_id_stores.js';

const ID_FILE = /^dashboard-al_[a-z0-9]{10}\.json$/;

/** What the tidy-up would delete: { gist: [names], dashboards: [names], stats: [paths] }. */
export async function tidyList(gist) {
  const names = Object.keys(gist?.files || {});
  const dashboardsMoved = storeForms(gist).dashboards === 'id';
  let stats = [];
  try {
    stats = await (await import('./_stats.js')).statsBackups();
  } catch {
    stats = [];
  }
  return {
    gist: names.filter((n) => /^backup-.+\.json$/.test(n)),
    dashboards: dashboardsMoved
      ? names.filter((n) => /^dashboard-.+\.json$/.test(n) && !ID_FILE.test(n))
      : [],
    stats,
  };
}

/** Deletes them. Refused unless every store is kept by ID. Returns the counts. */
export async function tidyUp(gist) {
  const notMoved = Object.entries(storeForms(gist)).filter(([, f]) => f !== 'id');
  if (notMoved.length)
    return { error: 'tidy_not_moved', vars: { stores: notMoved.map(([k]) => k).join(', ') } };
  const list = await tidyList(gist);
  const files = [...list.gist, ...list.dashboards];
  if (files.length) {
    const { writeGist } = await import('./_gist.js');
    await writeGist(Object.fromEntries(files.map((n) => [n, null])), {
      description: `Alliance IDs step 8: ${files.length} backup files deleted (tidy-up)`,
    });
  }
  const stats = list.stats.length
    ? await (await import('./_stats.js')).deleteStatsBackups(list.stats)
    : 0;
  return { gist: list.gist.length, dashboards: list.dashboards.length, stats };
}
