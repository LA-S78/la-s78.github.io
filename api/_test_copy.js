// api/_test_copy.js
// /devupdate's second half (plan for alliance IDs, 2026-11-20): copies the live site's private
// Blob files the test site needs to rehearse on (Stats and alliance pictures) into the `test/`
// folders the test site reads. Runs on the live site (it has the store's token); it only reads
// live files and never writes anywhere but `test/` (checked for every write, fail closed).
//
//   stats/<file>.json            → test/stats/<file>.json   (summary, Top players, lookup
//                                   index, series, positions, skins, tracker numbers)
//   stats/days/<day>.json        → test/stats/days/<day>.json   (the last DAYS_COPIED days)
//   alliance-images/live/<file>  → test/alliance-images/live/<file>   (approved pictures in use)

import * as blobApi from '@vercel/blob';
import { isTestDeployment, readGist } from './_gist.js';
import { readImages } from './_alliance_images.js';

const DAYS_COPIED = 30;
const STATS_FILES = [
  'summary.json',
  'top.json',
  'player-series.json',
  'player-index.json',
  'positions.json',
  'skins.json',
  'alliance-ids.json',
];
const blobToken = () =>
  process.env.ALLIANCE_CARD_IMAGES_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN || '';

/** Copies one private Blob file to `to`, which must be under test/ (else it throws). */
async function copyFile(from, to, token, { get, put }) {
  if (!to.startsWith('test/')) throw new Error(`Refused: ${to} is not a test path.`);
  if (from.startsWith('test/')) throw new Error(`Refused: ${from} is already a test path.`);
  const blob = await get(from, { access: 'private', token });
  if (!blob) return false;
  const body = Buffer.from(await new Response(blob.stream).arrayBuffer());
  await put(to, body, {
    access: 'private',
    token,
    contentType: blob.blob?.contentType || blob.contentType || 'application/octet-stream',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return true;
}

/** A few at a time, so a slow store doesn't run out the clock all at once. */
async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

/**
 * Copies the Stats files and the alliance pictures in use into test/. Returns
 * { stats, days, pictures, failed } (counts; failed: paths not copied).
 */
export async function copyLiveBlobsToTest({ now = Date.now(), blob = blobApi, gist = null } = {}) {
  if (isTestDeployment()) throw new Error('This runs on the live site only.');
  const token = blobToken();
  if (!token) throw new Error('No Blob store on this deployment.');
  const failed = [];
  const tryCopy = async ([from, to]) => {
    try {
      return await copyFile(from, to, token, blob);
    } catch (err) {
      failed.push(from);
      console.warn(`Test copy: ${from} not copied:`, err.message);
      return false;
    }
  };

  // Stats: the summary files, and the last DAYS_COPIED days
  const stats = await inBatches(
    STATS_FILES.map((f) => [`stats/${f}`, `test/stats/${f}`]),
    6,
    tryCopy,
  );
  const since = new Date(now - DAYS_COPIED * 86400000).toISOString().slice(0, 10);
  const dayFiles = [];
  let cursor;
  do {
    const page = await blob.list({ prefix: 'stats/days/', cursor, token, limit: 1000 });
    for (const b of page.blobs) {
      const day = b.pathname.slice('stats/days/'.length, -'.json'.length);
      if (day >= since) dayFiles.push([b.pathname, `test/${b.pathname}`]);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const days = await inBatches(dayFiles, 6, tryCopy);

  // Alliance pictures in use (from the live index the Gist copy just copied)
  const images = readImages(gist || (await readGist({ timeoutMs: 6000 })));
  const files = [];
  for (const entry of Object.values(images.live)) {
    for (const kind of Object.values(entry || {})) {
      if (kind?.file)
        files.push([`alliance-images/live/${kind.file}`, `test/alliance-images/live/${kind.file}`]);
    }
  }
  const pictures = await inBatches(files, 6, tryCopy);

  const count = (list_) => list_.filter(Boolean).length;
  return { stats: count(stats), days: count(days), pictures: count(pictures), failed };
}
