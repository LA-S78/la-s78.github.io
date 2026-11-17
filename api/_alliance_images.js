// api/_alliance_images.js
// Alliance images (owner request, 2026-11-16): R4/R5 send a card picture and a wide banner for
// their alliance's cards; a Steward approves each one before anyone else can see it.
// Reached through api/proposal.js (Vercel's free plan allows 12 server functions):
//   POST type 'alliance_image'         R4/R5 (own alliance) or a Steward sends an image
//   POST type 'alliance_image_review'  a Steward approves or rejects one
//   POST type 'alliance_image_remove'  a Steward, or the alliance's R5, takes one down
//   GET  ?image_review=<id>            the Steward review page: details (JSON)
//   GET  ?image_review=<id>&file=1     ... and the picture itself (Stewards only)
//   GET  ?alliance_image=<file>        an approved picture, for everyone (/alliance-images/…)
// Pictures are kept in a private Vercel Blob store and only ever served through here; the
// list of what is pending and live is in the Gist (alliance-images.json).
import crypto from 'crypto';
import { put, get, copy, del } from '@vercel/blob';
import { verifySessionToken } from './_tokens.js';
import { isSteward } from './_stewards.js';
import { say, utcTime } from './_messages.js';
import { findAllianceKey } from './_dashboard.js';
import { sameTag, tagSlug } from './_alliances.js';
import {
  isGistConfigured,
  readGist,
  gistJson,
  updateGist,
  isTestDeployment,
  TEST_PROPOSAL_FIELD,
} from './_gist.js';

/**
 * The two pictures an alliance can have, and their exact size in pixels. Shaped after the
 * cards they go on (measured 2026-11-16): the Capitol Rotation cards are about 1.4:1 on
 * phones and 1.9:1 on desktops, so 3:2; the NAP Ranks rows about 3.5:1 on phones and much
 * wider on desktops, so 4:1 (the upload form previews what each screen shows).
 */
export const IMAGE_KINDS = Object.freeze({
  card: { width: 600, height: 400, label: 'Card (Capitol Rotation)' },
  wide: { width: 1200, height: 300, label: 'Banner (NAP Ranks)' },
});
/** Largest file accepted. The upload form saves about 150 KB; this leaves room. */
export const MAX_IMAGE_BYTES = 250 * 1024;
/** Images an alliance may send per 24 hours (Stewards: no limit). */
export const DAILY_LIMIT = 3;
/** An image nobody reviewed is deleted after this; decisions are remembered as long. */
export const KEEP_DAYS = 7;
const DAY_MS = 24 * 3600 * 1000;
export const IMAGES_FILE = 'alliance-images.json';
const SENDER_ROLES = ['R4', 'R5'];
const TYPES = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const reply = (status, json) => ({ status, json });
const prefix = () => (isTestDeployment() ? 'test/alliance-images' : 'alliance-images');
const siteOrigin = () => (isTestDeployment() ? 'https://dev.la-s78.app' : 'https://la-s78.app');
/**
 * An alliance's file-safe name: its letters and digits (RÂVN -> RAVN; RavN for RâvN beside
 * RÂVN, so the two never share pictures: tagSlug). `alliances` is map-state.json's list.
 */
export const allianceSlug = (tag, alliances = {}) => tagSlug(tag, Object.keys(alliances || {}));
const mapAlliances = (gist) => gistJson(gist, 'map-state.json', { alliances: {} }).alliances || {};
// The store's key. Connected in Vercel with the prefix ALLIANCE_CARD_IMAGES (owner's
// set-up); Vercel's default name is accepted too.
const blobToken = () =>
  process.env.ALLIANCE_CARD_IMAGES_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN || '';
const blobConfigured = () => Boolean(blobToken());

/** The stored list, filled in with defaults. */
export function readImages(gist) {
  const d = gistJson(gist, IMAGES_FILE, {});
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  return {
    live: obj(d.live),
    pending: obj(d.pending),
    decided: obj(d.decided),
    sent: Array.isArray(d.sent) ? d.sent : [],
    missing: obj(d.missing),
  };
}

/**
 * What an alliance's leaders see in the dashboard's image section: per slot, the live
 * picture (its address), one waiting for review, and the last refusal or expiry of the past
 * 7 days (with the Steward's reason); and how many of today's images are left.
 */
export function imageStatus(gist, tag) {
  const images = readImages(gist);
  const slug = allianceSlug(tag, mapAlliances(gist));
  const now = Date.now();
  const slots = {};
  for (const kind of Object.keys(IMAGE_KINDS)) {
    const live = images.live[slug]?.[kind];
    const pending = Object.values(images.pending)
      .filter((p) => p.slug === slug && p.kind === kind && p.at > now - KEEP_DAYS * DAY_MS)
      .sort((a, b) => b.at - a.at)[0];
    const last = Object.values(images.decided)
      .filter((d) => d.slug === slug && d.kind === kind && d.at > now - KEEP_DAYS * DAY_MS)
      .sort((a, b) => b.at - a.at)[0];
    slots[kind] = {
      width: IMAGE_KINDS[kind].width,
      height: IMAGE_KINDS[kind].height,
      live: live?.file ? { url: `/alliance-images/${live.file}`, at: live.at } : null,
      pending: pending ? { at: pending.at, by: pending.name } : null,
      // Only news the leaders need: a refusal or an expiry newer than what is live now
      last:
        last && ['rejected', 'expired'].includes(last.status) && !(live && live.at > last.at)
          ? { status: last.status, at: last.at, ...(last.reason ? { reason: last.reason } : {}) }
          : null,
    };
  }
  const used = images.sent.filter((x) => x.slug === slug && x.at > now - DAY_MS).length;
  return {
    slots,
    left: Math.max(0, DAILY_LIMIT - used),
    dailyLimit: DAILY_LIMIT,
    ready: blobConfigured(),
  };
}

/**
 * Every alliance's approved pictures, for the public pages (/api/state): { TAG: { card, wide } }
 * with the addresses they are served at, keyed by the tags in `alliances` (map-state.json).
 */
export function liveImages(gist, alliances = {}) {
  const live = readImages(gist).live;
  const out = {};
  for (const tag of Object.keys(alliances)) {
    const entry = live[allianceSlug(tag, alliances)];
    if (!entry) continue;
    const urls = {};
    for (const kind of Object.keys(IMAGE_KINDS)) {
      if (entry[kind]?.file) urls[kind] = `/alliance-images/${entry[kind].file}`;
    }
    if (Object.keys(urls).length) out[tag] = urls;
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Checking the picture itself
// ---------------------------------------------------------------------------------------

/**
 * Reads a picture's type and size from its bytes (never from its name), and whether it
 * carries hidden data such as a phone's GPS position (EXIF/XMP). Returns
 * { type, width, height, metadata } or null when it isn't a WebP, JPEG or PNG.
 */
export function inspectImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 32) return null;
  // PNG
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    if (buf.toString('latin1', 12, 16) !== 'IHDR') return null;
    let metadata = false;
    for (let at = 8; at + 8 <= buf.length; ) {
      const len = buf.readUInt32BE(at);
      const name = buf.toString('latin1', at + 4, at + 8);
      if (['eXIf', 'tEXt', 'iTXt', 'zTXt'].includes(name)) metadata = true;
      if (name === 'IEND') break;
      at += 12 + len;
    }
    return {
      type: 'image/png',
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
      metadata,
    };
  }
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let metadata = false;
    let size = null;
    for (let at = 2; at + 4 <= buf.length; ) {
      if (buf[at] !== 0xff) return null;
      const marker = buf[at + 1];
      if (marker === 0xd9 || marker === 0xda) break; // end, or start of the picture data
      const len = buf.readUInt16BE(at + 2);
      if (marker === 0xe1) metadata = true; // APP1: EXIF or XMP
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        size = { height: buf.readUInt16BE(at + 5), width: buf.readUInt16BE(at + 7) };
      }
      at += 2 + len;
    }
    return size ? { type: 'image/jpeg', ...size, metadata } : null;
  }
  // WebP
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    let size = null;
    let metadata = false;
    for (let at = 12; at + 8 <= buf.length; ) {
      const name = buf.toString('latin1', at, at + 4);
      const len = buf.readUInt32LE(at + 4);
      const d = at + 8;
      if (name === 'EXIF' || name === 'XMP ') metadata = true;
      if (name === 'VP8X' && d + 10 <= buf.length) {
        if (buf[d] & 0x0c) metadata = true; // the EXIF / XMP flags
        size = { width: 1 + buf.readUIntLE(d + 4, 3), height: 1 + buf.readUIntLE(d + 7, 3) };
      } else if (name === 'VP8 ' && !size && d + 10 <= buf.length) {
        size = {
          width: buf.readUInt16LE(d + 6) & 0x3fff,
          height: buf.readUInt16LE(d + 8) & 0x3fff,
        };
      } else if (name === 'VP8L' && !size && d + 5 <= buf.length) {
        const bits = buf.readUInt32LE(d + 1);
        size = { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
      }
      at = d + len + (len % 2);
    }
    return size ? { type: 'image/webp', ...size, metadata } : null;
  }
  return null;
}

/** The picture from a data: URL, checked. Returns { buf, info } or { error }. */
export function readUpload(dataUrl, kind) {
  const spec = IMAGE_KINDS[kind];
  const m =
    typeof dataUrl === 'string' && /^data:image\/[a-z]+;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!spec || !m) return { error: say('api_alliance_images.bad_image') };
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAX_IMAGE_BYTES) {
    return {
      error: say('api_alliance_images.too_big', { kb: Math.round(MAX_IMAGE_BYTES / 1024) }),
    };
  }
  const info = inspectImage(buf);
  if (!info || !TYPES[info.type]) return { error: say('api_alliance_images.bad_image') };
  if (info.width !== spec.width || info.height !== spec.height) {
    return {
      error: say('api_alliance_images.wrong_size', { width: spec.width, height: spec.height }),
    };
  }
  if (info.metadata) return { error: say('api_alliance_images.has_metadata') };
  return { buf, info };
}

// ---------------------------------------------------------------------------------------
// Discord: the review post in the war room (English, like the other proposals)
// ---------------------------------------------------------------------------------------

function reviewChannel() {
  if (!isTestDeployment()) return process.env.WAR_ROOM_CHANNEL_ID;
  if (!process.env.TEST_CHANNEL_ID) {
    throw new Error('Test proposals need TEST_CHANNEL_ID (a Discord channel for tests).');
  }
  return process.env.TEST_CHANNEL_ID;
}

/** The review post. The picture is never in it: only a link to the Steward review page. */
export function reviewMessage(entry, { status = null, colour = 0xb8975a } = {}) {
  const spec = IMAGE_KINDS[entry.kind];
  const fields = [
    { name: '🛡️ Alliance', value: `[${entry.tag}]`, inline: true },
    { name: '🖼️ Image', value: spec?.label || entry.kind, inline: true },
    { name: '👤 Submitter', value: `\`${entry.name}\` (<@${entry.uid}>)`, inline: false },
    { name: '⚖️ Status', value: status || '⏳ **Pending Steward Review**', inline: false },
  ];
  if (isTestDeployment()) {
    fields.push({
      name: TEST_PROPOSAL_FIELD,
      value: 'Sent from the test site (test data). It changes nothing live.',
      inline: false,
    });
  }
  const embed = {
    title: `${isTestDeployment() ? '🧪 TEST · ' : ''}🖼️ Alliance Image Proposal`,
    color: colour,
    description: status
      ? '*Reviewed.*'
      : '*The image is hidden here. Open it to review it: only Stewards signed in on the site can see it.*',
    fields,
    footer: { text: 'Last Asylum Alliance Images' },
    timestamp: new Date(entry.at).toISOString(),
  };
  const components = status
    ? []
    : [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5, // a link
              label: 'Review image',
              emoji: { name: '🔍' },
              url: `${siteOrigin()}/review-image.html?id=${entry.id}`,
            },
          ],
        },
      ];
  return { embeds: [embed], components };
}

async function discord(path, method, body) {
  const r = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Discord API Error: ${r.status} - ${await r.text()}`);
  return r.json();
}

/** Marks a review post as decided (best effort: the decision is saved either way). */
async function closeReviewPost(entry, status, colour) {
  if (!entry?.channelId || !entry?.messageId) return;
  await discord(
    `/channels/${entry.channelId}/messages/${entry.messageId}`,
    'PATCH',
    reviewMessage(entry, { status, colour }),
  ).catch((err) => console.error('Could not update the image review post:', err.message));
}

// ---------------------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------------------

const pendingPath = (entry) => `${prefix()}/pending/${entry.id}.${entry.ext}`;
const livePath = (file) => `${prefix()}/live/${file}`;
const removeBlobs = async (paths) => {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  await del(list, { token: blobToken() }).catch((err) =>
    console.error('Could not delete old images:', err.message),
  );
};

/**
 * Housekeeping, run with every change (no timer needed):
 * - images nobody reviewed within KEEP_DAYS are deleted (and their post marked "Expired");
 * - decisions and the daily count forget entries older than that;
 * - an alliance that left the NAP loses its pictures after KEEP_DAYS (a short absence,
 *   e.g. a renamed tag being fixed, keeps them).
 * Returns the cleaned list and what to delete / mark afterwards.
 */
export function sweep(images, alliances, now = Date.now()) {
  const old = now - KEEP_DAYS * DAY_MS;
  const out = { ...images, pending: {}, decided: {}, missing: {} };
  const deleteBlobs = [];
  const expired = [];
  for (const [id, p] of Object.entries(images.pending)) {
    if (p.at > old) out.pending[id] = p;
    else {
      deleteBlobs.push(pendingPath(p));
      expired.push(p);
      out.decided[id] = { status: 'expired', at: now, slug: p.slug, kind: p.kind };
    }
  }
  for (const [id, d] of Object.entries(images.decided)) {
    if (d.at > old) out.decided[id] = d;
  }
  out.sent = images.sent.filter((s) => s.at > now - DAY_MS);
  if (alliances && Object.keys(alliances).length) {
    const present = new Set(Object.keys(alliances).map((t) => allianceSlug(t, alliances)));
    out.live = {};
    for (const [slug, entry] of Object.entries(images.live)) {
      if (present.has(slug)) {
        out.live[slug] = entry;
        continue;
      }
      const since = images.missing[slug] || now;
      if (since > old) {
        out.live[slug] = entry;
        out.missing[slug] = since;
      } else {
        for (const kind of Object.keys(IMAGE_KINDS)) {
          if (entry[kind]?.file) deleteBlobs.push(livePath(entry[kind].file));
        }
      }
    }
  }
  return { images: out, deleteBlobs, expired };
}

// ---------------------------------------------------------------------------------------
// The requests
// ---------------------------------------------------------------------------------------

function sessionOf(req) {
  const auth = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  return verifySessionToken(auth, process.env.DISCORD_BOT_TOKEN);
}

const loginNeeded = () =>
  reply(401, { error: say('api_proposals.login_required'), code: 'login_required' });

/** Is this a request for alliance images? (api/proposal.js hands it over if so.) */
export function isImageRequest(req) {
  if (req.method === 'GET') {
    return Boolean(req.query?.alliance_image || req.query?.image_review);
  }
  const type = req.body?.type;
  return typeof type === 'string' && type.startsWith('alliance_image');
}

/** Handles it; returns { status, json } or, for a picture, { status, image, contentType }. */
export async function handleImageRequest(req) {
  if (req.method === 'GET') {
    if (req.query.alliance_image) return serveLive(String(req.query.alliance_image));
    return reviewDetails(req, String(req.query.image_review), req.query.file === '1');
  }
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  if (!blobConfigured() || !isGistConfigured()) {
    return reply(503, { error: say('api_alliance_images.not_set_up') });
  }
  const session = sessionOf(req);
  if (!session) return loginNeeded();
  const body = req.body || {};
  if (body.type === 'alliance_image') return submit(session, body);
  if (body.type === 'alliance_image_review') return review(session, body);
  if (body.type === 'alliance_image_remove') return remove(session, body);
  return reply(400, { error: 'Unknown request.' });
}

/** The alliance's key in map-state.json, or null when it isn't in the NAP. */
function allianceIn(gist, tag) {
  const state = gistJson(gist, 'map-state.json', { alliances: {} });
  return { key: findAllianceKey(state.alliances || {}, tag), alliances: state.alliances || {} };
}

async function submit(session, body) {
  const steward = isSteward(session.uid);
  if (!steward && !SENDER_ROLES.includes(session.role)) {
    return reply(403, { error: say('api_alliance_images.leaders_only'), code: 'not_allowed' });
  }
  if (!steward && !sameTag(session.alliance, body.alliance)) {
    return reply(403, { error: say('api_alliance_images.own_alliance_only'), code: 'not_allowed' });
  }
  if (!IMAGE_KINDS[body.kind]) return reply(400, { error: say('api_alliance_images.bad_image') });
  const upload = readUpload(body.image, body.kind);
  if (upload.error) return reply(400, { error: upload.error, code: 'invalid' });

  let gist;
  try {
    gist = await readGist({ timeoutMs: 4000 });
  } catch (err) {
    console.error('Alliance images: Gist could not be read:', err.message);
    return reply(503, { error: say('api_proposals.limit_check_failed') });
  }
  const { key, alliances } = allianceIn(gist, body.alliance);
  if (!key) return reply(400, { error: say('api_alliance_images.unknown_alliance') });
  const slug = allianceSlug(key, alliances);
  const recent = readImages(gist).sent.filter((s) => s.slug === slug && s.at > Date.now() - DAY_MS);
  if (!steward && recent.length >= DAILY_LIMIT) {
    const next = Math.min(...recent.map((s) => s.at)) + DAY_MS;
    return reply(429, {
      error: say('api_alliance_images.daily_limit', { max: DAILY_LIMIT, when: utcTime(next) }),
      code: 'daily_limit',
      nextAt: Math.floor(next / 1000),
    });
  }

  const entry = {
    id: crypto.randomBytes(12).toString('hex'),
    slug,
    tag: key,
    kind: body.kind,
    ext: TYPES[upload.info.type],
    uid: session.uid,
    name: session.name,
    at: Date.now(),
  };
  await put(pendingPath(entry), upload.buf, {
    access: 'private',
    token: blobToken(),
    contentType: upload.info.type,
    addRandomSuffix: false,
    // Deleted by the store itself a day after the review window, even if nothing else runs.
    ttlDays: KEEP_DAYS + 1,
  });

  try {
    const channelId = reviewChannel();
    const msg = await discord(`/channels/${channelId}/messages`, 'POST', reviewMessage(entry));
    entry.channelId = channelId;
    entry.messageId = msg.id;
  } catch (err) {
    console.error('Alliance image: review post failed:', err.message);
    await removeBlobs([pendingPath(entry)]);
    return reply(502, { error: say('api_alliance_images.post_failed') });
  }

  // Saved; an older image waiting for the same slot is replaced (one per slot).
  let replaced = [];
  let cleanup = { deleteBlobs: [], expired: [] };
  await updateGist(
    (g) => {
      const { alliances } = allianceIn(g, key);
      const s = sweep(readImages(g), alliances);
      replaced = Object.values(s.images.pending).filter(
        (p) => p.slug === slug && p.kind === entry.kind && p.id !== entry.id,
      );
      for (const p of replaced) {
        delete s.images.pending[p.id];
        s.images.decided[p.id] = { status: 'replaced', at: Date.now(), slug, kind: p.kind };
      }
      s.images.pending[entry.id] = entry;
      // A Steward helping out doesn't use up the alliance's daily images.
      if (!steward) s.images.sent = [...s.images.sent, { slug, at: entry.at, uid: session.uid }];
      cleanup = s;
      return {
        files: { [IMAGES_FILE]: s.images },
        description: `Alliance image from ${session.name} for [${key}]`,
      };
    },
    { gist },
  );
  await removeBlobs([...replaced.map(pendingPath), ...cleanup.deleteBlobs]);
  await Promise.all([
    ...replaced.map((p) => closeReviewPost(p, '♻️ **Replaced by a newer image**', 0x6b7280)),
    ...cleanup.expired.map((p) =>
      closeReviewPost(p, '⌛ **Expired (not reviewed in time)**', 0x6b7280),
    ),
  ]);
  return reply(200, { success: true, id: entry.id, message: say('api_alliance_images.sent') });
}

async function review(session, body) {
  if (!isSteward(session.uid)) {
    return reply(403, { error: say('api_alliance_images.stewards_only'), code: 'not_allowed' });
  }
  const approve = body.decision === 'approve';
  if (!approve && body.decision !== 'reject') return reply(400, { error: 'Unknown decision.' });
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
  const id = String(body.id || '');

  const gist = await readGist({ timeoutMs: 4000 });
  const entry = readImages(gist).pending[id];
  if (!entry) return reply(404, { error: say('api_alliance_images.already_decided') });

  const file = `${entry.slug}-${entry.kind}-${entry.id}.${entry.ext}`;
  // A copy keeps no expiry date: the approved picture stays until it is replaced or removed.
  if (approve) {
    await copy(pendingPath(entry), livePath(file), {
      access: 'private',
      token: blobToken(),
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' }[entry.ext],
    });
  }

  let previous = null;
  let found = false;
  let cleanup = { deleteBlobs: [], expired: [] };
  await updateGist(
    (g) => {
      const { alliances } = allianceIn(g, entry.tag);
      const s = sweep(readImages(g), alliances);
      found = Boolean(s.images.pending[id]);
      if (!found) return {}; // decided by someone else meanwhile: nothing to save
      delete s.images.pending[id];
      s.images.decided[id] = {
        status: approve ? 'approved' : 'rejected',
        at: Date.now(),
        by: session.name,
        slug: entry.slug,
        kind: entry.kind,
        ...(reason ? { reason } : {}),
      };
      if (approve) {
        const live = { ...(s.images.live[entry.slug] || {}), tag: entry.tag };
        previous = live[entry.kind]?.file || null;
        live[entry.kind] = { file, at: Date.now(), by: entry.name, approvedBy: session.name };
        s.images.live[entry.slug] = live;
      }
      cleanup = s;
      return {
        files: { [IMAGES_FILE]: s.images },
        description: `Alliance image ${approve ? 'approved' : 'rejected'} for [${entry.tag}]`,
      };
    },
    { gist },
  );
  if (!found) {
    if (approve) await removeBlobs([livePath(file)]);
    return reply(404, { error: say('api_alliance_images.already_decided') });
  }
  await removeBlobs([
    pendingPath(entry),
    previous && previous !== file ? livePath(previous) : null,
    ...cleanup.deleteBlobs,
  ]);
  const why = reason ? `\n> ${reason.replace(/\n/g, ' ')}` : '';
  await Promise.all([
    closeReviewPost(
      entry,
      approve ? `✅ **Approved by ${session.name}**` : `❌ **Rejected by ${session.name}**${why}`,
      approve ? 0x22c55e : 0xef4444,
    ),
    ...cleanup.expired.map((p) =>
      closeReviewPost(p, '⌛ **Expired (not reviewed in time)**', 0x6b7280),
    ),
  ]);
  return reply(200, {
    success: true,
    status: approve ? 'approved' : 'rejected',
    message: say(approve ? 'api_alliance_images.approved' : 'api_alliance_images.rejected'),
  });
}

async function remove(session, body) {
  const steward = isSteward(session.uid);
  if (!steward && !(session.role === 'R5' && sameTag(session.alliance, body.alliance))) {
    return reply(403, {
      error: say('api_alliance_images.remove_not_allowed'),
      code: 'not_allowed',
    });
  }
  if (!IMAGE_KINDS[body.kind]) return reply(400, { error: 'Unknown image.' });
  let file = null;
  await updateGist((g) => {
    const alliances = mapAlliances(g);
    const slug = allianceSlug(
      findAllianceKey(alliances, body.alliance) || body.alliance,
      alliances,
    );
    const images = readImages(g);
    const live = images.live[slug];
    file = live?.[body.kind]?.file || null;
    if (!file) return {};
    const rest = { ...live };
    delete rest[body.kind];
    if (Object.keys(IMAGE_KINDS).some((k) => rest[k])) images.live[slug] = rest;
    else delete images.live[slug];
    return {
      files: { [IMAGES_FILE]: images },
      description: `Alliance image removed for [${body.alliance}] by ${session.name}`,
    };
  });
  if (!file) return reply(404, { error: say('api_alliance_images.nothing_to_remove') });
  await removeBlobs([livePath(file)]);
  return reply(200, { success: true, message: say('api_alliance_images.removed') });
}

/** The Steward review page: what is waiting, and the picture itself (Stewards only). */
async function reviewDetails(req, id, wantFile) {
  if (!blobConfigured() || !isGistConfigured()) {
    return reply(503, { error: say('api_alliance_images.not_set_up') });
  }
  const session = sessionOf(req);
  if (!session) return loginNeeded();
  if (!isSteward(session.uid)) {
    return reply(403, { error: say('api_alliance_images.stewards_only'), code: 'not_allowed' });
  }
  if (!/^[a-f0-9]{24}$/.test(id))
    return reply(404, { error: say('api_alliance_images.not_found') });
  const images = readImages(await readGist({ timeoutMs: 4000 }));
  const entry = images.pending[id];
  if (!entry) {
    const done = images.decided[id];
    return reply(done ? 410 : 404, {
      error: say(done ? 'api_alliance_images.already_decided' : 'api_alliance_images.not_found'),
      decided: done || null,
    });
  }
  if (!wantFile) {
    const spec = IMAGE_KINDS[entry.kind];
    return reply(200, {
      id,
      alliance: entry.tag,
      kind: entry.kind,
      width: spec.width,
      height: spec.height,
      submittedBy: entry.name,
      at: entry.at,
      current: images.live[entry.slug]?.[entry.kind] ? true : false,
    });
  }
  const blob = await get(pendingPath(entry), { access: 'private', token: blobToken() });
  if (!blob) return reply(404, { error: say('api_alliance_images.not_found') });
  return {
    status: 200,
    image: Buffer.from(await new Response(blob.stream).arrayBuffer()),
    contentType: blob.blob?.contentType || `image/${entry.ext === 'jpg' ? 'jpeg' : entry.ext}`,
    cache: 'private, no-store',
  };
}

/** An approved picture, for everyone. File names are never reused, so it can be cached. */
async function serveLive(file) {
  if (!/^[A-Z0-9]{1,24}-(wide|card)-[a-f0-9]{24}\.(webp|jpg|png)$/.test(file)) {
    return reply(404, { error: 'Not found' });
  }
  if (!blobConfigured()) return reply(404, { error: 'Not found' });
  const blob = await get(livePath(file), { access: 'private', token: blobToken() });
  if (!blob) return reply(404, { error: 'Not found' });
  const ext = file.split('.').pop();
  return {
    status: 200,
    image: Buffer.from(await new Response(blob.stream).arrayBuffer()),
    contentType: { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' }[ext],
    // A day in browsers; Vercel's own cache keeps it an hour, so a picture a Steward
    // takes down stops being served within the hour (pages stop showing it at once).
    cache: 'public, max-age=86400',
    cdnCache: 'max-age=3600',
  };
}
