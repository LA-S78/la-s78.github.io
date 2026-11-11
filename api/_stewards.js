// api/_stewards.js
// Kingdom Stewards: the Discord users who approve proposals (Discord buttons) and who have no
// daily proposal limit (/api/proposal).

/**
 * True when this Discord user id is a Steward.
 * Supports STEWARD_USER_IDS (comma-separated) and legacy AUTHORIZED_USER_ID in Vercel env vars.
 */
export function isSteward(userId) {
  if (!userId) return false;
  const rawList = [process.env.STEWARD_USER_IDS || '', process.env.AUTHORIZED_USER_ID || ''].join(
    ',',
  );
  const allowedIds = rawList
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return allowedIds.includes(String(userId).trim());
}
