// api/nominate.js
import crypto from 'crypto';

function verifyNominationToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [dataString, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(dataString)
    .digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(dataString, 'base64url').toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

export default async function handler(req, res) {
  const GIST_ID = process.env.GIST_ID;
  const GIST_TOKEN = process.env.GIST_TOKEN;

  if (!GIST_ID || !GIST_TOKEN) {
    return res.status(500).json({ error: 'Gist configuration is missing.' });
  }

  const headers = {
    Authorization: `Bearer ${GIST_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'WarRoom-Nominations'
  };

  // ========================================================================
  // GET: Retrieve All Saved Nominations for Distribution Console
  // ========================================================================
  if (req.method === 'GET') {
    try {
      const gistRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers });
      if (!gistRes.ok) throw new Error(`GitHub Gist error: ${gistRes.status}`);

      const gistData = await gistRes.json();
      const nominations = JSON.parse(gistData.files['rewards-nominations.json']?.content || '{}');
      return res.status(200).json(nominations);
    } catch (err) {
      console.error('Failed to read nominations:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ========================================================================
  // POST: Commit Alliance Nominations via Signed Token
  // ========================================================================
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, nominations } = req.body;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!token || !nominations || !botToken) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  const payload = verifyNominationToken(token, botToken);
  if (!payload) {
    return res.status(403).json({ error: 'Token is invalid or expired. Run /nominate again.' });
  }

  const allotment = payload.allotment || {};
  const gold = (nominations.commanders_will || []).map(s => s.trim()).filter(Boolean);
  const purple = (nominations.loyal_servant || []).map(s => s.trim()).filter(Boolean);
  const blue = (nominations.followers_heart || []).map(s => s.trim()).filter(Boolean);

  if (
    gold.length !== (allotment.commanders_will || 0) ||
    purple.length !== (allotment.loyal_servant || 0) ||
    blue.length !== (allotment.followers_heart || 0)
  ) {
    return res.status(400).json({ error: 'Submitted recipient counts do not match allotted quota.' });
  }

  try {
    let nominationsStore = {};
    const gistGetRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers });

    if (gistGetRes.ok) {
      const gistData = await gistGetRes.json();
      const content = gistData.files['rewards-nominations.json']?.content;
      if (content) nominationsStore = JSON.parse(content);
    }

    nominationsStore[payload.alliance] = {
      alliance: payload.alliance,
      rank: payload.rank,
      submittedAt: new Date().toISOString(),
      recipients: {
        commanders_will: gold,
        loyal_servant: purple,
        followers_heart: blue
      }
    };

    const updateRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: `Nominations updated: [${payload.alliance}] at ${new Date().toISOString()}`,
        files: {
          'rewards-nominations.json': {
            content: JSON.stringify(nominationsStore, null, 2)
          }
        }
      })
    });

    if (!updateRes.ok) throw new Error(`GitHub Gist responded with ${updateRes.status}`);

    return res.status(200).json({ success: true, alliance: payload.alliance });
  } catch (error) {
    console.error('Failed to commit nominations:', error);
    return res.status(500).json({ error: error.message });
  }
}