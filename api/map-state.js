// api/map-state.js
import defaultState from '../public/map-state.json';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GIST_ID = process.env.GIST_ID;
  const GIST_TOKEN = process.env.GIST_TOKEN;

  if (!GIST_ID) {
    return res.status(200).json(defaultState);
  }

  try {
    const gistRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: {
        Authorization: `Bearer ${GIST_TOKEN}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    if (!gistRes.ok) throw new Error(`GitHub returned ${gistRes.status}`);

    const gistData = await gistRes.json();
    const mapStateContent = gistData.files['map-state.json']?.content;

    if (mapStateContent) {
      res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate=5');
      return res.status(200).json(JSON.parse(mapStateContent));
    }
  } catch (err) {
    console.warn('Failed to read map state from Gist, serving static fallback:', err.message);
  }

  return res.status(200).json(defaultState);
}