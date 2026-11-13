// api/_rank_helper.js
import { readGist, gistJson, updateGist } from './_gist.js';

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
      rank: typeof data.rank === 'number' ? data.rank : 999,
    }))
    .sort((a, b) => a.rank - b.rank)
    .map((item) => ({
      tag: item.tag,
      rank: item.rank === 999 ? 'Unranked' : item.rank,
    }));
}

export async function setAllianceRank({ tag, rank, updatedBy = 'Discord Bot' }) {
  const cleanTag = tag.trim().toUpperCase();
  const newRank = parseInt(rank, 10);

  if (isNaN(newRank) || newRank < 1) {
    throw new Error('Rank must be a positive number.');
  }

  // Saved safely alongside other saves at the same moment (updateGist).
  const { targetKey, previousRank } = await updateGist((gist) => {
    const state = gistJson(gist, 'map-state.json', null);
    if (!state) throw new Error('map-state.json missing from target Gist');
    state.alliances = state.alliances || {};

    const matchingKey = Object.keys(state.alliances).find((k) => k.toUpperCase() === cleanTag);
    const key = matchingKey || cleanTag;
    const before = state.alliances[key]?.rank ?? 'Unranked';

    if (!state.alliances[key]) {
      state.alliances[key] = { rank: newRank };
    } else {
      state.alliances[key].rank = newRank;
    }

    state.lastUpdated = new Date().toISOString();
    state.updatedBy = updatedBy;

    return {
      targetKey: key,
      previousRank: before,
      files: { 'map-state.json': state },
      description: `Rank updated: [${key}] -> #${newRank}`,
    };
  });

  return { tag: targetKey, previousRank, newRank };
}
