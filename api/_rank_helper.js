// api/_rank_helper.js
import { readGist, gistJson, writeGist } from './_gist.js';

async function getMapState() {
  const state = gistJson(await readGist(), 'map-state.json', null);
  if (!state) throw new Error('map-state.json missing from target Gist');
  return state;
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

  await writeGist(
    { 'map-state.json': state },
    { description: `Rank updated: [${targetKey}] -> #${newRank}` }
  );

  return { tag: targetKey, previousRank, newRank };
}