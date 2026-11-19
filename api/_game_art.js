// api/_game_art.js
// Our own copies of the game's profile frames and default portraits (owner request,
// 2026-11-18), for the roster view and the other pages that show players' pictures, and of
// alliance badges (2026-11-19, the Alliance standings cards).
// The Last Asylum Tracker hosts these files; rather than loading them from its server on
// every page, each one is fetched from it once, kept in our Vercel Blob store
// (game-art/…, private like the alliance pictures), and served from la-s78.app as
// /game-art/frames/frame_5001.png and /game-art/avatars/head_90001.png (a rewrite in
// vercel.json to /api/proposal?game_art=…; no new server function). File names never change
// meaning, so browsers and Vercel keep them for a long time. Players' own pictures are not
// copied: pages show them from the game's image server (api/_tracker.js pictureUrl).

import { get, put } from '@vercel/blob';

const SOURCE = 'https://lastasylumtracker.com/static/';
const PATH = /^(frames\/frame_\d{1,7}|avatars\/head_\d{1,7}|alliance\/badge_\d{1,7})\.png$/;
const MAX_BYTES = 600 * 1024;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const blobToken = () =>
  process.env.ALLIANCE_CARD_IMAGES_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN || '';

const reply = (status, json) => ({ status, json });
const picture = (buf) => ({
  status: 200,
  image: buf,
  contentType: 'image/png',
  // A frame's file always holds the same picture: kept a month by browsers, a week by Vercel
  cache: 'public, max-age=2592000, immutable',
  cdnCache: 'max-age=604800',
});

/** ?game_art=frames/frame_5001.png → the picture, from our copy or fetched once. */
export async function serveGameArt(path, { fetchImpl = fetch } = {}) {
  const file = String(path || '');
  if (!PATH.test(file)) return reply(404, { error: 'Not found' });
  const token = blobToken();
  const key = `game-art/${file}`;

  if (token) {
    try {
      const saved = await get(key, { access: 'private', token });
      if (saved) return picture(Buffer.from(await new Response(saved.stream).arrayBuffer()));
    } catch {
      // Not stored yet (or the store is slow): fetched from the tracker below
    }
  }

  let buf;
  try {
    const res = await fetchImpl(`${SOURCE}${file}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; la-s78.app)', Accept: 'image/png' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return reply(404, { error: 'Not found' });
    buf = Buffer.from(await res.arrayBuffer());
  } catch {
    return reply(502, { error: 'Picture unavailable' });
  }
  // Only a real PNG of a sensible size is kept or passed on
  if (buf.length > MAX_BYTES || !buf.subarray(0, 8).equals(PNG)) {
    return reply(502, { error: 'Picture unavailable' });
  }
  if (token) {
    put(key, buf, {
      access: 'private',
      token,
      contentType: 'image/png',
      addRandomSuffix: false,
      allowOverwrite: true,
    }).catch((err) => console.warn(`Game art: ${file} not stored:`, err.message));
  }
  return picture(buf);
}
