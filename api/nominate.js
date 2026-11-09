// api/nominate.js
// Handles /nominate token verification, dynamic quota validation, and buyout fulfillment.

import { isGistConfigured, readGist, gistJson, writeGist } from './_gist.js';
import { verifyToken } from './_tokens.js';

export default async function handler(req, res) {
  if (!isGistConfigured()) {
    return res.status(500).json({ error: 'Gist configuration is missing.' });
  }

  // GET: Read current nominations for portals/consoles
  if (req.method === 'GET') {
    try {
      const gist = await readGist();
      const nominations = gistJson(gist, 'rewards-nominations.json');
      const rewardsData = gistJson(gist, 'rewards-data.json');

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const lastReset = rewardsData.lastReset || null;
      if (lastReset) {
        res.setHeader('X-Cycle-Id', Buffer.from(lastReset).toString('hex').slice(0, 12));
      }

      return res.status(200).json({
        nominations,
        lastReset,
        mode: rewardsData.mode || 'standard',
        wartime_buyouts: rewardsData.wartime_buyouts || []
      });
    } catch (err) {
      console.error('Failed to read nominations:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, nominations } = req.body;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!token || !nominations || !botToken) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  const payload = verifyToken(token, botToken);
  if (!payload) {
    return res.status(403).json({ error: 'Token is invalid or expired. Run /nominate again.' });
  }

  const cleanTag = String(payload.alliance || '').trim();
  const allotment = payload.allotment || {};
  const isKW = payload.mode === 'kw';
  const buyoutMeta = payload.buyout || null; // Injected if this alliance holds an active buyout

  // Validation function enforcing exact slot counts
  const validatePool = (pool, poolName) => {
    if (!pool) return `Missing ${poolName} pool payload.`;
    const g = (pool.commanders_will || []).map(s => s.trim()).filter(Boolean);
    const p = (pool.loyal_servant || []).map(s => s.trim()).filter(Boolean);
    const b = (pool.followers_heart || []).map(s => s.trim()).filter(Boolean);

    const expectedG = Number(allotment.commanders_will || 0);
    const expectedP = Number(allotment.loyal_servant || 0);
    const expectedB = Number(allotment.followers_heart || 0);

    if (g.length !== expectedG) {
      return `${poolName}: Expected ${expectedG} Commander's Will, received ${g.length}.`;
    }
    if (p.length !== expectedP) {
      return `${poolName}: Expected ${expectedP} Loyal Servant, received ${p.length}.`;
    }
    if (b.length !== expectedB) {
      return `${poolName}: Expected ${expectedB} Follower's Heart, received ${b.length}.`;
    }
    return null;
  };

  const stdPool = nominations.standard || nominations;
  const stdError = validatePool(stdPool, 'Standard');
  if (stdError) {
    return res.status(400).json({ error: stdError });
  }

  if (isKW) {
    const kwError = validatePool(nominations.kingdom_war, 'Kingdom War');
    if (kwError) {
      return res.status(400).json({ error: kwError });
    }
  }

  try {
    const gist = await readGist();
    let nominationsStore = gistJson(gist, 'rewards-nominations.json');
    let rewardsState = gistJson(gist, 'rewards-data.json');

    const cleanList = (arr) => (arr || []).map(s => s.trim()).filter(Boolean);

    const regGoldList = cleanList(stdPool.commanders_will);
    const kwGoldList = isKW ? cleanList(nominations.kingdom_war.commanders_will) : [];

    // 1. Commit to rewards-nominations.json
    nominationsStore[cleanTag] = {
      alliance: cleanTag,
      rank: payload.rank,
      mode: payload.mode || 'standard',
      hasBuyoutBonus: Boolean(buyoutMeta?.hasBonus),
      isWloDeducted: Boolean(buyoutMeta?.isDeducted),
      submittedAt: new Date().toISOString(),
      recipients: {
        standard: {
          commanders_will: regGoldList,
          loyal_servant: cleanList(stdPool.loyal_servant),
          followers_heart: cleanList(stdPool.followers_heart)
        },
        ...(isKW ? {
          kingdom_war: {
            commanders_will: kwGoldList,
            loyal_servant: cleanList(nominations.kingdom_war.loyal_servant),
            followers_heart: cleanList(nominations.kingdom_war.followers_heart)
          }
        } : {})
      }
    };

    // 2. If this alliance has an active buyout installment, record the nominees
    if (buyoutMeta?.ticketId && Array.isArray(rewardsState.wartime_buyouts)) {
      const ticket = rewardsState.wartime_buyouts.find(b => b.id === buyoutMeta.ticketId);
      if (ticket && Array.isArray(ticket.installments)) {
        const inst = ticket.installments.find(i => Number(i.week) === Number(buyoutMeta.week));
        if (inst) {
          // The last nominated slot in the list represents the buyout bonus chest
          inst.nominated_players = {
            regular: regGoldList.slice(-1),
            kw: kwGoldList.slice(-1)
          };
          inst.status = 'nominated';
        }
      }
    }

    // 3. Atomically update both Gist files in a single PATCH
    await writeGist(
      {
        'rewards-nominations.json': nominationsStore,
        'rewards-data.json': rewardsState
      },
      { description: `Nominations updated: [${cleanTag}] at ${new Date().toISOString()}` }
    );

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(200).json({ 
      success: true, 
      alliance: cleanTag,
      hasBuyoutBonus: Boolean(buyoutMeta?.hasBonus)
    });
  } catch (error) {
    console.error('Failed to commit nominations:', error);
    return res.status(500).json({ error: error.message });
  }
}