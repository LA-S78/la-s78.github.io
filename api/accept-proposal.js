// api/accept-proposal.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, distribution, changes, submittedBy, secretKey, snapshotUrl } = req.body;

  // Authenticate request using bot secret
  const authSecret = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_SECRET;
  if (secretKey !== authSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const GIST_ID = process.env.GIST_ID;
  const GIST_TOKEN = process.env.GIST_TOKEN;

  if (!GIST_ID || !GIST_TOKEN) {
    return res.status(500).json({ error: 'Gist environment variables missing on server' });
  }

  const headers = {
    'Authorization': `Bearer ${GIST_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'WarRoom-Vercel-App'
  };

  try {
    // ======================================================================
    // 1. REWARD DISTRIBUTION PROPOSAL ACCEPTANCE
    // ======================================================================
    if (type === 'rewards') {
      if (!Array.isArray(distribution)) {
        return res.status(400).json({ error: 'Invalid distribution data provided' });
      }

      const patchPayload = {
        description: `Rewards updated by ${submittedBy || 'Admin'} at ${new Date().toISOString()}`,
        files: {
          'rewards-data.json': {
            content: JSON.stringify({
              distribution_tiers: distribution,
              lastUpdated: new Date().toISOString(),
              updatedBy: submittedBy || 'Discord Admin'
            }, null, 2)
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
    let currentState = { alliances: {}, territory_ownership: {} };
    const gistGetRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers });

    if (gistGetRes.ok) {
      const gistData = await gistGetRes.json();
      const content = gistData.files['map-state.json']?.content;
      if (content) currentState = JSON.parse(content);
    }

    if (!currentState.territory_ownership) {
      currentState.territory_ownership = {};
    }

    if (changes && typeof changes === 'object') {
      Object.entries(changes).forEach(([cityId, change]) => {
        currentState.territory_ownership[cityId] = {
          owner: change.to,
          updatedAt: new Date().toISOString()
        };
      });
    }

    if (snapshotUrl) {
      currentState.lastSnapshotUrl = snapshotUrl;
    }

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
    return res.status(200).json({ success: true, message: 'Live map updated in Gist!' });
  } catch (error) {
    console.error('Accept proposal error:', error);
    return res.status(500).json({ error: error.message });
  }
}