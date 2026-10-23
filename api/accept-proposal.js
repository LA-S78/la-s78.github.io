// api/accept-proposal.js

const DEFAULT_FALLBACK_COLORS = {
  WLO: '#25bb00',
  'RÂVN': '#cece00',
  RAVN: '#cece00',
  MIA: '#a400af',
  BOTS: '#0070f3',
  SVN: '#e53e3e',
  PHNX: '#dd6b20',
  HMDA: '#d53f8c',
  NAVI: '#319795',
  HeKi: '#d69e2e'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    type,
    distribution,
    changes,
    alliances: newAlliances,
    blacklist: newBlacklist,
    submittedBy,
    secretKey,
    snapshotUrl
  } = req.body || {};

  // Authenticate request using bot secret
  const authSecret = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_SECRET;
  if (!secretKey || secretKey !== authSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const GIST_ID = process.env.GIST_ID;
  const GIST_TOKEN = process.env.GIST_TOKEN;

  if (!GIST_ID || !GIST_TOKEN) {
    return res.status(500).json({ error: 'Gist environment variables missing on server' });
  }

  const headers = {
    Authorization: `Bearer ${GIST_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'WarRoom-Vercel-App'
  };

  // Fallback: If legacy interaction dispatch omitted type, infer 'map' if changes are present
  const resolvedType = type || (changes ? 'map' : null);

  try {
    switch (resolvedType) {
      // ======================================================================
      // 1. REWARD DISTRIBUTION PROPOSAL ACCEPTANCE
      // ======================================================================
      case 'rewards': {
        if (!Array.isArray(distribution)) {
          return res.status(400).json({ error: 'Invalid distribution data provided' });
        }

        const gistGetRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers });
        let existingRewards = {};
        if (gistGetRes.ok) {
          const gistData = await gistGetRes.json();
          const content = gistData.files?.['rewards-data.json']?.content;
          if (content) existingRewards = JSON.parse(content);
        }

        const patchPayload = {
          description: `Rewards updated by ${submittedBy || 'Admin'} at ${new Date().toISOString()}`,
          files: {
            'rewards-data.json': {
              content: JSON.stringify(
                {
                  ...existingRewards,
                  distribution_tiers: distribution,
                  lastUpdated: new Date().toISOString(),
                  updatedBy: submittedBy || 'Discord Admin'
                },
                null,
                2
              )
            }
          }
        };

        const updateRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(patchPayload)
        });

        if (!updateRes.ok) throw new Error(`Failed to update Gist: ${updateRes.status}`);
        return res.status(200).json({ success: true, message: 'Rewards distribution updated in Gist!' });
      }

      // ======================================================================
      // 2. MAP TERRITORY PROPOSAL ACCEPTANCE
      // ======================================================================
      case 'map': {
        if (!changes || typeof changes !== 'object') {
          return res.status(400).json({ error: 'Invalid territory changes payload.' });
        }

        let currentState = { alliances: {}, territory_ownership: {} };
        const gistGetRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers });

        if (gistGetRes.ok) {
          const gistData = await gistGetRes.json();
          const content = gistData.files?.['map-state.json']?.content;
          if (content) currentState = JSON.parse(content);
        }

        if (!currentState.territory_ownership) {
          currentState.territory_ownership = {};
        }

        Object.entries(changes).forEach(([cityId, change]) => {
          currentState.territory_ownership[cityId] = {
            owner: change.to,
            updatedAt: new Date().toISOString()
          };
        });

        if (snapshotUrl) {
          currentState.lastSnapshotUrl = snapshotUrl;
        }

        const revision = Date.now().toString(36);
        currentState.revision = revision;
        currentState.lastUpdated = new Date().toISOString();
        currentState.updatedBy = submittedBy || 'Discord Admin';

        const updateRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: `Map updated by ${submittedBy || 'Admin'} at ${new Date().toISOString()}`,
            files: {
              'map-state.json': {
                content: JSON.stringify(currentState, null, 2)
              }
            }
          })
        });

        if (!updateRes.ok) throw new Error(`Failed to update Gist: ${updateRes.status}`);

        // Pre-warm Edge CDN for all 3 perspectives (capped to 1.8s timeout)
        const rawHost = req.headers['x-forwarded-host'] || req.headers.host || 'la-s78.app';
        const resolvedHost = rawHost.split(',')[0].trim();
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const baseUrl = `${protocol}://${resolvedHost}`;

        await Promise.allSettled(
          ['level', 'alliance', 'resource'].map(view =>
            fetch(`${baseUrl}/api/map-image?view=${view}&v=${revision}&ext=.png`, {
              headers: { 'User-Agent': 'WarRoom-Prewarmer' },
              signal: AbortSignal.timeout(1800)
            })
          )
        ).catch(() => {});

        return res.status(200).json({ success: true, revision, message: 'Live map updated in Gist!' });
      }

      // ======================================================================
      // 3. ALLIANCE & NAP STANDINGS PROPOSAL ACCEPTANCE
      // ======================================================================
      case 'alliance': {
        if (!newAlliances || typeof newAlliances !== 'object') {
          return res.status(400).json({ error: 'Invalid alliance data provided' });
        }

        let currentState = { alliances: {}, territory_ownership: {}, blacklist: {} };
        const gistGetRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers });

        if (gistGetRes.ok) {
          const gistData = await gistGetRes.json();
          const content = gistData.files?.['map-state.json']?.content;
          if (content) currentState = JSON.parse(content);
        }

        const previousAlliances = currentState.alliances || {};
        const mergedAlliances = {};

        // Preserve exact tag casing (RÂVN, RâvN, râvn remain distinct keys)
        Object.entries(newAlliances).forEach(([tag, updatedData]) => {
          const cleanTag = tag.trim();
          if (!cleanTag) return;

          const existing = previousAlliances[cleanTag] || {};
          const incomingColor = updatedData.color;
          const resolvedColor =
            incomingColor && incomingColor !== '#b8975a'
              ? incomingColor
              : existing.color && existing.color !== '#b8975a'
                ? existing.color
                : DEFAULT_FALLBACK_COLORS[cleanTag] || incomingColor || existing.color;

          mergedAlliances[cleanTag] = {
            ...existing,
            ...updatedData,
            tag: cleanTag,
            color: resolvedColor,
            // Strictly preserve private Discord server bindings
            guild_id: existing.guild_id || updatedData.guild_id,
            alert_channel_id: existing.alert_channel_id || updatedData.alert_channel_id,
            alert_role_id: existing.alert_role_id || updatedData.alert_role_id,
            officer_channel_id: existing.officer_channel_id || updatedData.officer_channel_id,
            delegated_roles: existing.delegated_roles || updatedData.delegated_roles
          };
        });

        currentState.alliances = mergedAlliances;

        if (newBlacklist) {
          currentState.blacklist = newBlacklist;
        }

        const revision = Date.now().toString(36);
        currentState.revision = revision;
        currentState.lastUpdated = new Date().toISOString();
        currentState.updatedBy = submittedBy || 'Discord Admin';

        const updateRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: `Alliances & NAP updated by ${submittedBy || 'Admin'} at ${new Date().toISOString()}`,
            files: {
              'map-state.json': {
                content: JSON.stringify(currentState, null, 2)
              }
            }
          })
        });

        if (!updateRes.ok) throw new Error(`Failed to update Gist: ${updateRes.status}`);

        return res.status(200).json({ success: true, revision, message: 'Alliance standings updated in Gist!' });
      }

      default:
        return res.status(400).json({
          error: `Unsupported proposal acceptance type: "${resolvedType || 'unknown'}". Supported types: "rewards", "map", "alliance".`
        });
    }
  } catch (error) {
    console.error('Accept proposal error:', error);
    return res.status(500).json({ error: error.message });
  }
}