/**
 * js/rewards.js - Interactive Alliance Reward Distribution, Live Ranking Sync, & Planner Mode
 */

export let isRewardsPlannerActive = false;
export let draftRewardTiers = {};
export let originalRewardTiers = {};

const POOL_LIMITS = {
  commanders_will: 5,
  loyal_servant: 10,
  followers_heart: 20
};

const KINGS_CROWN_BONUS = {
  diamonds: 4800,
  tickets: 24
};

const HOSTING_RANKS = ['rank_1', 'rank_2', 'rank_3', 'rank_4'];

// ==========================================================================
// 1. HOST WEEK CALCULATION & TOGGLE (APPLIES TO TOP 4 RANKS)
// ==========================================================================

export function initHostWeekToggle() {
  const toggle = document.getElementById('toggle-host-week');
  if (!toggle || toggle.dataset.bound) return;
  toggle.dataset.bound = 'true';

  toggle.addEventListener('change', () => {
    updatePayoutTable(toggle.checked);
  });
}

export function updatePayoutTable(isHostWeekActive) {
  const rows = document.querySelectorAll('#payout-table-body tr');
  rows.forEach(row => {
    const baseDiamonds = parseInt(row.dataset.baseDiamonds, 10) || 0;
    const baseTickets = parseInt(row.dataset.baseTickets, 10) || 0;
    const rankKey = row.dataset.rankKey;

    const diamondCell = row.querySelector('.td-diamonds');
    const ticketCell = row.querySelector('.td-tickets');

    const isHostingRank = HOSTING_RANKS.includes(rankKey);

    let displayDiamonds = baseDiamonds;
    let displayTickets = baseTickets;

    if (!isHostWeekActive && isHostingRank) {
      displayDiamonds = Math.max(0, baseDiamonds - KINGS_CROWN_BONUS.diamonds);
      displayTickets = Math.max(0, baseTickets - KINGS_CROWN_BONUS.tickets);
    }

    if (diamondCell) diamondCell.textContent = displayDiamonds.toLocaleString();
    if (ticketCell) ticketCell.textContent = displayTickets.toLocaleString();
  });
}

// ==========================================================================
// 2. LIVE ALLIANCE TAG BINDING
// ==========================================================================

const AUTO_ALLIANCE_PALETTE = [
  '#e68e00', '#a400af', '#0070f3', '#25bb00', '#e53e3e',
  '#dd6b20', '#319795', '#d69e2e', '#805ad5', '#d53f8c',
  '#38a169', '#00b5d8'
];

export async function syncAllianceTagsFromMapState(state = null) {
  let mapData = state || (typeof window !== 'undefined' ? window.MAP_STATE : null);

  // Fetch live state and Discord colors concurrently if either is missing
  const needsState = !mapData || !mapData.alliances;
  const needsColors = !window.DISCORD_COLORS;

  if (needsState || needsColors) {
    try {
      const [stateRes, colorsRes] = await Promise.all([
        needsState ? fetch(`/api/map-state?t=${Date.now()}`) : Promise.resolve(null),
        needsColors ? fetch('/api/colors') : Promise.resolve(null)
      ]);

      if (stateRes && stateRes.ok) {
        mapData = await stateRes.json();
        window.MAP_STATE = mapData;
      }
      if (colorsRes && colorsRes.ok) {
        window.DISCORD_COLORS = await colorsRes.json();
      }
    } catch (err) {
      console.warn('Could not fetch live map state or Discord colors for rewards card:', err);
    }
  }

  if (!mapData || !mapData.alliances) return;

  const liveDiscordColors = window.DISCORD_COLORS || {};

  // Rank alliances 1..N based on map_state data and resolve color hierarchy
  const rankedAlliances = Object.entries(mapData.alliances)
    .filter(([_, data]) => data && data.rank !== undefined && data.rank !== null && data.rank !== '')
    .sort(([_, a], [__, b]) => Number(a.rank) - Number(b.rank))
    .map(([tag, data], index) => {
      const rank = Number(data.rank);
      // Priority: 1. Live Discord Role Color -> 2. YAML Color -> 3. Auto Palette -> 4. Default Accent
      const color = liveDiscordColors[tag] 
                 || data.color 
                 || AUTO_ALLIANCE_PALETTE[index % AUTO_ALLIANCE_PALETTE.length] 
                 || 'var(--accent-color)';
      return { tag, rank, color };
    });

  const tagContainers = document.querySelectorAll('.tier-alliance-tags');
  tagContainers.forEach(container => {
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
// 3. REWARD PLANNER MODE & POOL VALIDATOR
// ==========================================================================

export function snapshotInitialTiers() {
  originalRewardTiers = {};
  const rows = document.querySelectorAll('.rewards-tier-row');
  rows.forEach(row => {
    const tierId = row.dataset.tierId;
    const gold = parseInt(row.querySelector('.chest-item[data-chest-type="commanders_will"] .chest-multiplier')?.textContent.replace('×', ''), 10) || 0;
    const purple = parseInt(row.querySelector('.chest-item[data-chest-type="loyal_servant"] .chest-multiplier')?.textContent.replace('×', ''), 10) || 0;
    const blue = parseInt(row.querySelector('.chest-item[data-chest-type="followers_heart"] .chest-multiplier')?.textContent.replace('×', ''), 10) || 0;

    originalRewardTiers[tierId] = {
      commanders_will: gold,
      loyal_servant: purple,
      followers_heart: blue
    };
  });
  draftRewardTiers = JSON.parse(JSON.stringify(originalRewardTiers));
}

export function toggleRewardsPlanner(active) {
  isRewardsPlannerActive = active;

  const btnDraft = document.getElementById('btn-toggle-rewards-planner');
  if (btnDraft) {
    btnDraft.setAttribute('aria-pressed', active ? 'true' : 'false');
    btnDraft.classList.toggle('active', active);
  }

  const container = document.getElementById('rewards-container');
  if (container) {
    container.classList.toggle('planner-active', active);
  }

  if (isRewardsPlannerActive) {
    snapshotInitialTiers();
  } else {
    draftRewardTiers = JSON.parse(JSON.stringify(originalRewardTiers));
    renderDraftTiers();
  }

  updateRewardsProposalUI();
}

export function adjustChestQuantity(tierId, chestType) {
  if (!isRewardsPlannerActive || !draftRewardTiers[tierId]) return;

  const currentVal = draftRewardTiers[tierId][chestType] || 0;
  // Cycle up to 5, then reset back to 0
  const newVal = currentVal >= 5 ? 0 : currentVal + 1;
  draftRewardTiers[tierId][chestType] = newVal;

  renderDraftTiers();
  updateRewardsProposalUI();
}

function renderDraftTiers() {
  Object.entries(draftRewardTiers).forEach(([tierId, chests]) => {
    const row = document.querySelector(`.rewards-tier-row[data-tier-id="${tierId}"]`);
    if (!row) return;

    ['commanders_will', 'loyal_servant', 'followers_heart'].forEach(chestType => {
      const item = row.querySelector(`.chest-item[data-chest-type="${chestType}"]`);
      if (!item) return;
      const count = chests[chestType] || 0;
      const multi = item.querySelector('.chest-multiplier');
      if (multi) multi.textContent = `×${count}`;
      item.classList.toggle('is-empty', count === 0);
    });
  });
}

function getTierMemberCount(tierId) {
  const row = document.querySelector(`.rewards-tier-row[data-tier-id="${tierId}"]`);
  if (row) {
    const minRank = parseInt(row.dataset.minRank, 10) || 1;
    const maxRank = parseInt(row.dataset.maxRank, 10) || minRank;
    return Math.max(1, maxRank - minRank + 1);
  }
  const fallbackCounts = { rank_1: 1, rank_2_3: 2, rank_4_5: 2, rank_6_8: 3 };
  return fallbackCounts[tierId] || 1;
}

function calculatePoolTotals() {
  const totals = { commanders_will: 0, loyal_servant: 0, followers_heart: 0 };
  Object.entries(draftRewardTiers).forEach(([tierId, tier]) => {
    const memberCount = getTierMemberCount(tierId);
    totals.commanders_will += (tier.commanders_will || 0) * memberCount;
    totals.loyal_servant += (tier.loyal_servant || 0) * memberCount;
    totals.followers_heart += (tier.followers_heart || 0) * memberCount;
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

  let totalChanges = 0;
  Object.keys(draftRewardTiers).forEach(tierId => {
    const orig = originalRewardTiers[tierId] || {};
    const draft = draftRewardTiers[tierId] || {};
    if (
      orig.commanders_will !== draft.commanders_will ||
      orig.loyal_servant !== draft.loyal_servant ||
      orig.followers_heart !== draft.followers_heart
    ) {
      totalChanges++;
    }
  });

  const totals = calculatePoolTotals();
  const isOverPool = totals.commanders_will > POOL_LIMITS.commanders_will ||
                     totals.loyal_servant > POOL_LIMITS.loyal_servant ||
                     totals.followers_heart > POOL_LIMITS.followers_heart;

  if (badgeEl) badgeEl.textContent = String(totalChanges);

  if (submitBtn) {
    submitBtn.classList.remove('hidden');
    submitBtn.disabled = totalChanges === 0 || isOverPool;
    if (isOverPool) {
      submitBtn.title = `Capacity Exceeded! Gold: ${totals.commanders_will}/${POOL_LIMITS.commanders_will}, Purple: ${totals.loyal_servant}/${POOL_LIMITS.loyal_servant}, Blue: ${totals.followers_heart}/${POOL_LIMITS.followers_heart}`;
    } else {
      submitBtn.removeAttribute('title');
    }
  }
}

// ==========================================================================
// 4. SUBMIT STRATEGY PROPOSAL
// ==========================================================================

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
    distribution: draftRewardTiers
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
// 5. INITIALIZATION & CONTROLS BINDING
// ==========================================================================

export function bindRewardsControls() {
  initHostWeekToggle();
  syncAllianceTagsFromMapState();

  const btnPlanner = document.getElementById('btn-toggle-rewards-planner');
  if (btnPlanner && !btnPlanner.dataset.bound) {
    btnPlanner.dataset.bound = 'true';
    btnPlanner.addEventListener('click', () => {
      toggleRewardsPlanner(!isRewardsPlannerActive);
    });
  }

  const btnSubmit = document.getElementById('btn-submit-rewards');
  if (btnSubmit && !btnSubmit.dataset.bound) {
    btnSubmit.dataset.bound = 'true';
    btnSubmit.addEventListener('click', () => {
      submitRewardProposal('/api/proposal');
    });
  }

  const chestItems = document.querySelectorAll('.rewards-tier-row .chest-item');
  chestItems.forEach(item => {
    if (item.dataset.bound) return;
    item.dataset.bound = 'true';

    item.addEventListener('click', (e) => {
      if (!isRewardsPlannerActive) return;
      e.preventDefault();
      
      const row = item.closest('.rewards-tier-row');
      const tierId = row?.dataset.tierId;
      const chestType = item.dataset.chestType;
      if (!tierId || !chestType) return;

      adjustChestQuantity(tierId, chestType);
    });
  });
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bindRewardsControls);
  } else {
    bindRewardsControls();
  }
  document.addEventListener('turbo:load', bindRewardsControls);
}