// api/map-state.js

const FALLBACK_STATE = {
  alliances: {},
  territory_ownership: {},
  lastUpdated: new Date().toISOString(),
  updatedBy: "Fallback"
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GIST_ID = process.env.GIST_ID;
  const GIST_TOKEN = process.env.GIST_TOKEN;

  // Fallback if environment variables aren't set yet
  if (!GIST_ID) {
    return res.status(200).json(FALLBACK_STATE);
  }

  try {
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'WarRoom-Vercel-App' // Required by GitHub API
    };

    if (GIST_TOKEN) {
      headers['Authorization'] = `Bearer ${GIST_TOKEN}`;
    }

    const gistRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers });

    if (!gistRes.ok) {
      throw new Error(`GitHub returned ${gistRes.status}: ${gistRes.statusText}`);
    }

    const gistData = await gistRes.json();
    const mapStateContent = gistData.files['map-state.json']?.content;

    if (mapStateContent) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      return res.status(200).json(JSON.parse(mapStateContent));
    }
  } catch (err) {
    console.error('Error fetching map state from Gist:', err.message);
  }

  return res.status(200).json(FALLBACK_STATE);
}