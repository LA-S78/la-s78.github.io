/**
 * js/rewards.js - Dynamic Alliance Reward Distribution Engine & Interactive Planner
 */

export let isRewardsPlannerActive = false;
export let draftTiers = [];
export let originalTiers = [];

const POOL_LIMITS = {
  commanders_will: 5,
  loyal_servant: 10,
  followers_heart: 20
};

const CHEST_VALUES = {
  commanders_will: { diamonds: 8800, tickets: 44 },
  loyal_servant: { diamonds: 4400, tickets: 40 },
  followers_heart: { diamonds: 1600, tickets: 36 }
};

const KINGS_CROWN = {
  diamonds: 4800,
  tickets: 24,
  max_eligible_rank: 4
};

const AUTO_ALLIANCE_PALETTE = [
  '#e68e00', '#a400af', '#0070f3', '#25bb00', '#e53e3e',
  '#dd6b20', '#319795', '#d69e2e', '#805ad5', '#d53f8c',
  '#38a169', '#00b5d8'
];

// ==========================================================================
// 1. DATA INITIALIZATION & LIVE STATE SYNC
// ==========================================================================

export function initDefaultTiers() {
  if (window.REWARDS_CONFIG && window.REWARDS_CONFIG.distribution_tiers) {
    originalTiers = JSON.parse(JSON.stringify(window.REWARDS_CONFIG.distribution_tiers));
  } else {
    originalTiers = [
      { id: 'tier_1', min_rank: 1, max_rank: 1, chests: { commanders_will: 1, loyal_servant: 3, followers_heart: 1 } },
      { id: 'tier_2', min_rank: 2, max_rank: 3, chests: { commanders_will: 1, loyal_servant: 1, followers_heart: 3 } },
      { id: 'tier_3', min_rank: 4, max_rank: 5, chests: { commanders_will: 1, loyal_servant: 1, followers_heart: 2 } },
      { id: 'tier_4', min_rank: 6, max_rank: 8, chests: { commanders_will: 0, loyal_servant: 1, followers_heart: 3 } }
    ];
  }
  draftTiers = JSON.parse(JSON.stringify(originalTiers));
}

export async function fetchLiveRewardsState() {
  try {
    const res = await fetch(`/api/rewards-state?t=${Date.now()}`);
    if (!res.ok) return;

    const data = await res.json();
    if (data.distribution_tiers && Array.isArray(data.distribution_tiers) && data.distribution_tiers.length > 0) {
      originalTiers = JSON.parse(JSON.stringify(data.distribution_tiers));

      // Only refresh live display if user is not actively editing in planner mode
      if (!isRewardsPlannerActive) {
        draftTiers = JSON.parse(JSON.stringify(originalTiers));
        renderTierList();
        updatePayoutTable();
      }
    }
  } catch (err) {
    console.warn('Could not fetch live rewards state, keeping current configuration:', err);
  }
}

// ==========================================================================
// 2. RANGE CHAINING & MUTATION LOGIC
// ==========================================================================

export function rechainTiers(tiers) {
  let currentStart = 1;
  tiers.forEach((tier) => {
    const span = Math.max(0, tier.max_rank - tier.min_rank);
    tier.min_rank = currentStart;
    tier.max_rank = Math.max(currentStart, currentStart + span);
    currentStart = tier.max_rank + 1;
  });
}

export function adjustTierMaxRank(tierIndex, delta) {
  if (!isRewardsPlannerActive || !draftTiers[tierIndex]) return;

  const tier = draftTiers[tierIndex];
  const newMax = tier.max_rank + delta;

  if (newMax < tier.min_rank) return;

  tier.max_rank = newMax;
  rechainTiers(draftTiers);

  renderTierList();
  updatePayoutTable();
  updateRewardsProposalUI();
}

export function addTier() {
  if (!isRewardsPlannerActive) return;

  const lastTier = draftTiers[draftTiers.length - 1];
  const nextMin = lastTier ? lastTier.max_rank + 1 : 1;

  draftTiers.push({
    id: `tier_${Date.now()}`,
    min_rank: nextMin,
    max_rank: nextMin,
    chests: { commanders_will: 0, loyal_servant: 0, followers_heart: 0 }
  });

  rechainTiers(draftTiers);
  renderTierList();
  updatePayoutTable();
  updateRewardsProposalUI();
}

export function removeTier(tierIndex) {
  if (!isRewardsPlannerActive || draftTiers.length <= 1) return;

  draftTiers.splice(tierIndex, 1);
  rechainTiers(draftTiers);

  renderTierList();
  updatePayoutTable();
  updateRewardsProposalUI();
}

export function adjustChestQuantity(tierIndex, chestType) {
  if (!isRewardsPlannerActive || !draftTiers[tierIndex]) return;

  const currentVal = draftTiers[tierIndex].chests[chestType] || 0;
  draftTiers[tierIndex].chests[chestType] = currentVal >= 5 ? 0 : currentVal + 1;

  renderTierList();
  updatePayoutTable();
  updateRewardsProposalUI();
}

// ==========================================================================
// 3. DYNAMIC RENDERING (TIERS & PAYOUT TABLE)
// ==========================================================================

export function renderTierList() {
  const container = document.getElementById('rewards-tier-list');
  if (!container) return;

  const rankLabel = container.dataset.rankLabel || 'Rank';
  const activeList = isRewardsPlannerActive ? draftTiers : originalTiers;

  container.innerHTML = activeList.map((tier, index) => {
    const isSingle = tier.min_rank === tier.max_rank;
    const rangeText = isSingle ? `${rankLabel} ${tier.min_rank}` : `${rankLabel} ${tier.min_rank}–${tier.max_rank}`;

    return `
      <div class="rewards-tier-row" 
           data-tier-index="${index}"
           data-min-rank="${tier.min_rank}" 
           data-max-rank="${tier.max_rank}">
        <div class="tier-label-group">
          <div class="tier-row-controls">
            ${activeList.length > 1 ? `<button class="btn-tier-del" data-action="del-tier" data-index="${index}" title="Remove Bracket">×</button>` : ''}
            <span class="range-stepper">
              <span class="range-text">${rankLabel} ${tier.min_rank}–<span class="range-val">${tier.max_rank}</span></span>
              <button data-action="dec-range" data-index="${index}" type="button">-</button>
              <button data-action="inc-range" data-index="${index}" type="button">+</button>
            </span>
          </div>

          <span class="tier-name tier-name-static">${rangeText}</span>
          <span class="tier-alliance-tags" data-min-rank="${tier.min_rank}" data-max-rank="${tier.max_rank}"></span>
        </div>

        <div class="tier-chests">
          <div class="chest-item ${tier.chests.commanders_will === 0 ? 'is-empty' : ''}" 
               data-chest-type="commanders_will" 
               data-index="${index}"
               title="Commander's Will">
            <span class="chest-glyph gold"></span>
            <span class="chest-multiplier">×${tier.chests.commanders_will || 0}</span>
          </div>

          <div class="chest-item ${tier.chests.loyal_servant === 0 ? 'is-empty' : ''}" 
               data-chest-type="loyal_servant" 
               data-index="${index}"
               title="Loyal Servant">
            <span class="chest-glyph purple"></span>
            <span class="chest-multiplier">×${tier.chests.loyal_servant || 0}</span>
          </div>

          <div class="chest-item ${tier.chests.followers_heart === 0 ? 'is-empty' : ''}" 
               data-chest-type="followers_heart" 
               data-index="${index}"
               title="Follower's Heart">
            <span class="chest-glyph blue"></span>
            <span class="chest-multiplier">×${tier.chests.followers_heart || 0}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  syncAllianceTagsFromMapState();
}

export function updatePayoutTable() {
  const tbody = document.getElementById('payout-table-body');
  if (!tbody) return;

  const hostToggle = document.getElementById('toggle-host-week');
  const isHostWeek = hostToggle ? hostToggle.checked : true;
  const activeList = isRewardsPlannerActive ? draftTiers : originalTiers;
  const rankLabel = document.getElementById('rewards-tier-list')?.dataset.rankLabel || 'Rank';

  const rowsHtml = [];

  activeList.forEach(tier => {
    const baseDiamonds = (tier.chests.commanders_will * CHEST_VALUES.commanders_will.diamonds) +
                         (tier.chests.loyal_servant * CHEST_VALUES.loyal_servant.diamonds) +
                         (tier.chests.followers_heart * CHEST_VALUES.followers_heart.diamonds);

    const baseTickets = (tier.chests.commanders_will * CHEST_VALUES.commanders_will.tickets) +
                        (tier.chests.loyal_servant * CHEST_VALUES.loyal_servant.tickets) +
                        (tier.chests.followers_heart * CHEST_VALUES.followers_heart.tickets);

    const ranks = [];
    for (let r = tier.min_rank; r <= tier.max_rank; r++) {
      ranks.push(r);
    }

    const hostRanks = ranks.filter(r => r <= KINGS_CROWN.max_eligible_rank);
    const nonHostRanks = ranks.filter(r => r > KINGS_CROWN.max_eligible_rank);

    const generateRow = (groupRanks, hasBonus) => {
      if (groupRanks.length === 0) return '';
      const d = baseDiamonds + (hasBonus ? KINGS_CROWN.diamonds : 0);
      const t = baseTickets + (hasBonus ? KINGS_CROWN.tickets : 0);

      const minR = groupRanks[0];
      const maxR = groupRanks[groupRanks.length - 1];
      const displayLabel = minR === maxR ? `${rankLabel} ${minR}` : `${rankLabel} ${minR}–${maxR}`;

      return `
        <tr>
          <td style="font-weight: bold; font-family: var(--font-headers);">${displayLabel}</td>
          <td class="td-diamonds">${d.toLocaleString()}</td>
          <td class="td-tickets">${t.toLocaleString()}</td>
        </tr>
      `;
    };

    if (isHostWeek) {
      if (hostRanks.length > 0) rowsHtml.push(generateRow(hostRanks, true));
      if (nonHostRanks.length > 0) rowsHtml.push(generateRow(nonHostRanks, false));
    } else {
      rowsHtml.push(generateRow(ranks, false));
    }
  });

  tbody.innerHTML = rowsHtml.join('');
}

// ==========================================================================
// 4. ALLIANCE TAG & COLOR SYNCHRONIZATION
// ==========================================================================

export async function syncAllianceTagsFromMapState() {
  let mapData = typeof window !== 'undefined' ? window.MAP_STATE : null;

  if (!mapData || !mapData.alliances) {
    try {
      const [stateRes, colorsRes] = await Promise.all([
        fetch(`/api/map-state?t=${Date.now()}`),
        fetch('/api/colors')
      ]);
      if (stateRes.ok) window.MAP_STATE = await stateRes.json();
      if (colorsRes.ok) window.DISCORD_COLORS = await colorsRes.json();
      mapData = window.MAP_STATE;
    } catch (err) {}
  }

  if (!mapData || !mapData.alliances) return;

  const liveDiscordColors = window.DISCORD_COLORS || {};

  const rankedAlliances = Object.entries(mapData.alliances)
    .filter(([_, data]) => data && data.rank !== undefined && data.rank !== null && data.rank !== '')
    .sort(([_, a], [__, b]) => Number(a.rank) - Number(b.rank))
    .map(([tag, data], index) => ({
      tag,
      rank: Number(data.rank),
      color: liveDiscordColors[tag] || data.color || AUTO_ALLIANCE_PALETTE[index % AUTO_ALLIANCE_PALETTE.length] || 'var(--accent-color)'
    }));

  document.querySelectorAll('.tier-alliance-tags').forEach(container => {
    const minRank = parseInt(container.dataset.minRank, 10);
    const maxRank = parseInt(container.dataset.maxRank, 10);

    const matching = rankedAlliances.filter(a => a.rank >= minRank && a.rank <= maxRank);
    if (matching.length > 0) {
      container.innerHTML = matching
        .map(a => `<span class="alliance-badge" style="color: ${a.color}; font-weight: bold;">[${a.tag}]</span>`)
        .join(' ');
    } else {
      container.innerHTML = '';
    }
  });
}

// ==========================================================================
// 5. POOL VALIDATION & PROPOSAL SUBMISSION
// ==========================================================================

function calculatePoolTotals() {
  const totals = { commanders_will: 0, loyal_servant: 0, followers_heart: 0 };
  draftTiers.forEach(tier => {
    const memberCount = Math.max(1, tier.max_rank - tier.min_rank + 1);
    totals.commanders_will += (tier.chests.commanders_will || 0) * memberCount;
    totals.loyal_servant += (tier.chests.loyal_servant || 0) * memberCount;
    totals.followers_heart += (tier.chests.followers_heart || 0) * memberCount;
  });
  return totals;
}

export function updateRewardsProposalUI() {
  const submitBtn = document.getElementById('btn-submit-rewards');
  const badgeEl = document.getElementById('reward-change-badge');

  if (!isRewardsPlannerActive) {
    if (submitBtn) { submitBtn.classList.add('hidden'); submitBtn.disabled = true; }
    if (badgeEl) badgeEl.textContent = '0';
    return;
  }

  const hasStructuralChanges = JSON.stringify(draftTiers) !== JSON.stringify(originalTiers);
  const totals = calculatePoolTotals();
  const isOverPool = totals.commanders_will > POOL_LIMITS.commanders_will ||
                     totals.loyal_servant > POOL_LIMITS.loyal_servant ||
                     totals.followers_heart > POOL_LIMITS.followers_heart;

  if (badgeEl) badgeEl.textContent = hasStructuralChanges ? '!' : '0';

  if (submitBtn) {
    submitBtn.classList.remove('hidden');
    submitBtn.disabled = !hasStructuralChanges || isOverPool;
    if (isOverPool) {
      submitBtn.title = `Capacity Exceeded! Gold: ${totals.commanders_will}/${POOL_LIMITS.commanders_will}, Purple: ${totals.loyal_servant}/${POOL_LIMITS.loyal_servant}, Blue: ${totals.followers_heart}/${POOL_LIMITS.followers_heart}`;
    } else {
      submitBtn.removeAttribute('title');
    }
  }
}

export function toggleRewardsPlanner(active) {
  isRewardsPlannerActive = active;

  const btnDraft = document.getElementById('btn-toggle-rewards-planner');
  if (btnDraft) {
    btnDraft.setAttribute('aria-pressed', active ? 'true' : 'false');
    btnDraft.classList.toggle('active', active);
  }

  const container = document.getElementById('rewards-container');
  const addTierBox = document.getElementById('planner-add-tier-container');

  if (container) container.classList.toggle('planner-active', active);
  if (addTierBox) addTierBox.classList.toggle('hidden', !active);

  draftTiers = JSON.parse(JSON.stringify(originalTiers));

  renderTierList();
  updatePayoutTable();
  updateRewardsProposalUI();
}

export async function submitRewardProposal(apiEndpointUrl = '/api/proposal') {
  if (!isRewardsPlannerActive) return;

  const authorInput = prompt('Enter your Discord handle / IGN:', 'Doctor');
  if (authorInput === null) return;

  const notesInput = prompt('Add an optional note for this reward distribution proposal:', '') || '';

  const payload = {
    type: 'rewards',
    submittedBy: authorInput.trim() || 'Anonymous',
    notes: notesInput.trim(),
    timestamp: new Date().toISOString(),
    distribution: draftTiers
  };

  const submitBtn = document.getElementById('btn-submit-rewards');
  const originalText = submitBtn ? submitBtn.textContent : 'Submit Plan';

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Transmitting...';
  }

  try {
    const res = await fetch(apiEndpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);

    alert('Reward distribution proposal successfully transmitted to Discord!');
    originalTiers = JSON.parse(JSON.stringify(draftTiers));
    toggleRewardsPlanner(false);
  } catch (err) {
    console.error('Failed to submit reward proposal:', err);
    alert('Could not send proposal to Discord. Make sure the bot server is online.');
  } finally {
    if (submitBtn) submitBtn.textContent = originalText;
    updateRewardsProposalUI();
  }
}

// ==========================================================================
// 6. INITIALIZATION & EVENT DELEGATION
// ==========================================================================

export function bindRewardsControls() {
  initDefaultTiers();

  const toggleHost = document.getElementById('toggle-host-week');
  if (toggleHost && !toggleHost.dataset.bound) {
    toggleHost.dataset.bound = 'true';
    toggleHost.addEventListener('change', updatePayoutTable);
  }

  const btnPlanner = document.getElementById('btn-toggle-rewards-planner');
  if (btnPlanner && !btnPlanner.dataset.bound) {
    btnPlanner.dataset.bound = 'true';
    btnPlanner.addEventListener('click', () => toggleRewardsPlanner(!isRewardsPlannerActive));
  }

  const btnSubmit = document.getElementById('btn-submit-rewards');
  if (btnSubmit && !btnSubmit.dataset.bound) {
    btnSubmit.dataset.bound = 'true';
    btnSubmit.addEventListener('click', () => submitRewardProposal('/api/proposal'));
  }

  const btnAddTier = document.getElementById('btn-add-tier');
  if (btnAddTier && !btnAddTier.dataset.bound) {
    btnAddTier.dataset.bound = 'true';
    btnAddTier.addEventListener('click', addTier);
  }

  const tierContainer = document.getElementById('rewards-tier-list');
  if (tierContainer && !tierContainer.dataset.bound) {
    tierContainer.dataset.bound = 'true';
    tierContainer.addEventListener('click', (e) => {
      if (!isRewardsPlannerActive) return;

      const delBtn = e.target.closest('[data-action="del-tier"]');
      if (delBtn) {
        removeTier(parseInt(delBtn.dataset.index, 10));
        return;
      }

      const incBtn = e.target.closest('[data-action="inc-range"]');
      if (incBtn) {
        adjustTierMaxRank(parseInt(incBtn.dataset.index, 10), 1);
        return;
      }

      const decBtn = e.target.closest('[data-action="dec-range"]');
      if (decBtn) {
        adjustTierMaxRank(parseInt(decBtn.dataset.index, 10), -1);
        return;
      }

      const chestItem = e.target.closest('.chest-item');
      if (chestItem) {
        const tierIndex = parseInt(chestItem.dataset.index, 10);
        const chestType = chestItem.dataset.chestType;
        if (!isNaN(tierIndex) && chestType) {
          adjustChestQuantity(tierIndex, chestType);
        }
      }
    });
  }

  renderTierList();
  updatePayoutTable();

  // Asynchronously fetch live data from Gist via api/rewards-state
  fetchLiveRewardsState();
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bindRewardsControls);
  } else {
    bindRewardsControls();
  }
  document.addEventListener('turbo:load', bindRewardsControls);
}