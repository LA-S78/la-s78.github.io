// api/rewards-state.js

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GIST_ID = process.env.GIST_ID;
  const GIST_TOKEN = process.env.GIST_TOKEN;

  if (!GIST_ID || !GIST_TOKEN) {
    return res.status(500).json({ error: 'Gist configuration missing' });
  }

  try {
    const gistRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: {
        Authorization: `Bearer ${GIST_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'WarRoom-App'
      }
    });

    if (!gistRes.ok) throw new Error(`GitHub API returned ${gistRes.status}`);

    const gistData = await gistRes.json();
    const rawContent = gistData.files['rewards-data.json']?.content;

    if (!rawContent) {
      return res.status(200).json({ distribution_tiers: [] });
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json(JSON.parse(rawContent));
  } catch (err) {
    console.error('Failed to read rewards state:', err);
    return res.status(500).json({ error: err.message });
  }
}