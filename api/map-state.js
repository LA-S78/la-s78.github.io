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

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const GIST_ID = process.env.GIST_ID;
  const GIST_TOKEN = process.env.GIST_TOKEN;

  if (!GIST_ID) {
    return res.status(200).json(FALLBACK_STATE);
  }

  try {
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'WarRoom-Vercel-App'
    };

    if (GIST_TOKEN) {
      headers['Authorization'] = `Bearer ${GIST_TOKEN}`;
    }

    const gistRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers,
      cache: 'no-store'
    });

    if (!gistRes.ok) {
      throw new Error(`GitHub returned ${gistRes.status}: ${gistRes.statusText}`);
    }

    const gistData = await gistRes.json();
    const mapStateContent = gistData.files['map-state.json']?.content;

    if (mapStateContent) {
      return res.status(200).json(JSON.parse(mapStateContent));
    }
  } catch (err) {
    console.error('Error fetching map state from Gist:', err.message);
  }

  return res.status(200).json(FALLBACK_STATE);
}