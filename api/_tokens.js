// api/_tokens.js
// Signed, expiring links for the portal pages (/nominate, /calendar, /register).
// A token is "<base64url JSON payload>.<HMAC-SHA256 signature>". The Discord bot
// creates one when a leader runs a command; the portal sends it back with the form,
// and the API checks it was signed by us and hasn't expired or been altered.

import crypto from 'crypto';

// Portal links are signed with their own key, never with the raw Discord bot token, so a
// leaked or brute-forced portal signature can't be used against the bot token itself.
// PORTAL_HMAC_SECRET (Vercel env) takes precedence if set; otherwise a key is derived
// from the secret callers pass in (the bot token), so no new configuration is needed.
// Changing the label below invalidates every outstanding portal link.
const KEY_LABEL = 'la-s78-portal-token-v1';
function signingKey(secret) {
  if (process.env.PORTAL_HMAC_SECRET) return process.env.PORTAL_HMAC_SECRET;
  return crypto.createHmac('sha256', secret).update(KEY_LABEL).digest('hex');
}

function sign(dataString, secret) {
  return crypto.createHmac('sha256', signingKey(secret)).update(dataString).digest('base64url');
}

/**
 * Creates a signed token. Include `exp` (a Date.now()-style timestamp) to make it expire.
 */
export function createToken(payload, secret) {
  const dataString = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${dataString}.${sign(dataString, secret)}`;
}

/**
 * Checks a token and returns its payload, or null if it is missing, malformed,
 * tampered with, expired, or (when `action` is given) issued for a different purpose.
 */
export function verifyToken(token, secret, { action } = {}) {
  if (!token || typeof token !== 'string' || !secret) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [dataString, signature] = parts;

  try {
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(sign(dataString, secret));
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(dataString, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    if (action && payload.action !== action) return null;
    return payload;
  } catch {
    return null;
  }
}
