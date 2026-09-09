// api/_rank_helper.js

const GIST_ID = process.env.GIST_ID;
const GIST_TOKEN = process.env.GIST_TOKEN;

const headers = {
  Authorization: `Bearer ${GIST_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'WarRoom-RankHelper',
  'Content-Type': 'application/json'
};

async function getMapState() {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers,
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`GitHub Gist error: ${res.statusText}`);

  const gistData = await res.json();
  const content = gistData.files['map-state.json']?.content;
  if (!content) throw new Error('map-state.json missing from target Gist');

  return JSON.parse(content);
}

export async function listAllianceRanks() {
  const state = await getMapState();
  const alliances = state.alliances || {};

  return Object.entries(alliances)
    .map(([tag, data]) => ({
      tag: tag.toUpperCase(),
      rank: typeof data.rank === 'number' ? data.rank : 999
    }))
    .sort((a, b) => a.rank - b.rank)
    .map((item) => ({
      tag: item.tag,
      rank: item.rank === 999 ? 'Unranked' : item.rank
    }));
}

export async function setAllianceRank({ tag, rank, updatedBy = 'Discord Bot' }) {
  const cleanTag = tag.trim().toUpperCase();
  const newRank = parseInt(rank, 10);

  if (isNaN(newRank) || newRank < 1) {
    throw new Error('Rank must be a positive number.');
  }

  const state = await getMapState();
  state.alliances = state.alliances || {};

  const matchingKey = Object.keys(state.alliances).find(
    (k) => k.toUpperCase() === cleanTag
  );
  const targetKey = matchingKey || cleanTag;
  const previousRank = state.alliances[targetKey]?.rank ?? 'Unranked';

  if (!state.alliances[targetKey]) {
    state.alliances[targetKey] = { rank: newRank };
  } else {
    state.alliances[targetKey].rank = newRank;
  }

  state.lastUpdated = new Date().toISOString();
  state.updatedBy = updatedBy;

  const patchRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      description: `Rank updated: [${targetKey}] -> #${newRank}`,
      files: {
        'map-state.json': {
          content: JSON.stringify(state, null, 2)
        }
      }
    })
  });

  if (!patchRes.ok) throw new Error(`Failed to commit rank: ${patchRes.statusText}`);

  return { tag: targetKey, previousRank, newRank };
}