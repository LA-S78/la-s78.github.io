// api/accept-proposal.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { changes, submittedBy, secretKey } = req.body;

  // Authenticate request using DISCORD_BOT_TOKEN or secret
  const authSecret = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_SECRET;
  if (secretKey !== authSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const GIST_ID = process.env.GIST_ID;
  const GIST_TOKEN = process.env.GIST_TOKEN;

  if (!GIST_ID || !GIST_TOKEN) {
    return res.status(500).json({ error: 'Gist environment variables missing on server' });
  }

  try {
    const headers = {
      'Authorization': `Bearer ${GIST_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'WarRoom-Vercel-App'
    };

    // 1. Fetch current state from Gist
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

    // 2. Apply proposal changes
    Object.entries(changes).forEach(([cityId, change]) => {
      currentState.territory_ownership[cityId] = {
        owner: change.to,
        updatedAt: new Date().toISOString()
      };
    });

    currentState.lastUpdated = new Date().toISOString();
    currentState.updatedBy = submittedBy || 'Discord Admin';

    // 3. Patch Gist with updated state
    const updateRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
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