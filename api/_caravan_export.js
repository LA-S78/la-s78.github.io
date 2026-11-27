// api/_caravan_export.js
// The Caravan Rotor's picks for the alliance's own Google Sheet (owner request, 2026-11-27):
// the WLO Duel Tools script's "Sync caravans" reads them into its Caravan Log, so the
// sheet's caravan points follow what the leaders picked on the site or in Discord.
//
// Read only, and only with the alliance's key: an R5 (or a Steward) creates it on the
// dashboard and can revoke it there. The key names the alliance by its ID
// ("cvk.<alliance ID>.<random>", so a rename doesn't break it) and only its SHA-256 hash is
// stored (the dashboard's settings.caravanKey). GET /api/state?scope=caravan-export with
// "Authorization: Bearer <key>" (or &key=).

import crypto from 'node:crypto';
import { gistJson } from './_gist.js';
import { readRegister } from './_register.js';
import { currentTagOfId } from './_rename.js';
import { dashboardFile, findAllianceKey, readDashboard } from './_dashboard.js';

const KEY = /^cvk\.(al_[a-z0-9]+)\.([a-f0-9]{32})$/;
export const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');

/** A new key for an alliance ID: { key, record } (the record is what's stored). */
export function newCaravanKey(allianceId, by = '') {
  const key = `cvk.${allianceId}.${crypto.randomBytes(16).toString('hex')}`;
  return {
    key,
    record: {
      hash: hashKey(key),
      at: new Date().toISOString(),
      by: String(by).slice(0, 60),
      end: key.slice(-4),
    },
  };
}

/** The picks for a key, or null when the key is wrong or revoked. */
export function caravanExport(gist, key) {
  const m = KEY.exec(String(key || '').trim());
  if (!m) return null;
  const tag = currentTagOfId(readRegister(gist), m[1]);
  if (!tag) return null;
  const alliances = gistJson(gist, 'map-state.json', { alliances: {} }).alliances || {};
  const k = findAllianceKey(alliances, tag);
  if (!k) return null;
  const raw = gistJson(gist, dashboardFile(k, alliances, gist), {});
  const stored = raw.settings?.caravanKey?.hash;
  if (!stored) return null;
  const a = Buffer.from(stored, 'hex');
  const b = Buffer.from(hashKey(key), 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const c = readDashboard(raw, k).caravan;
  return {
    alliance: k,
    weekStartedAt: c.weekStartedAt,
    picks: (Array.isArray(raw.caravan?.log) ? raw.caravan.log : [])
      .filter((e) => e && e.name && e.at)
      .map(({ name, at, week }) => ({ name, at, week: week || null })),
  };
}
