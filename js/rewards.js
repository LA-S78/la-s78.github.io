/**
 * js/rewards.js - Dynamic Alliance Reward Distribution Engine & Interactive Planner
 */

import { submitProposalWithAuth } from './auth-modal.js';
import {
  markUpdating,
  offlineCopySavedAt,
  rememberLiveData,
  showLiveDataNotice,
  showSavedWhileLoading,
} from './live-data-notice.js';

// Escape data before putting it into HTML (see js/escape-html.js).
const esc = (value) => window.escapeHtml(value);

export let isRewardsPlannerActive = false;
export let draftTiers = [];
export let originalTiers = [];

const REWARDS_DRAFT_KEY = 'la_rewards_planner_draft';

const POOL_LIMITS = {
  commanders_will: 5,
  loyal_servant: 10,
  followers_heart: 20,
};

const CHEST_VALUES = {
  commanders_will: { diamonds: 8800, tickets: 44 },
  loyal_servant: { diamonds: 4400, tickets: 40 },
  followers_heart: { diamonds: 1600, tickets: 36 },
};

const KINGS_CROWN = {
  diamonds: 4800,
  tickets: 24,
  max_eligible_rank: 4,
};

const AUTO_ALLIANCE_PALETTE = [
  '#e68e00',
  '#a400af',
  '#0070f3',
  '#25bb00',
  '#e53e3e',
  '#dd6b20',
  '#319795',
  '#d69e2e',
  '#805ad5',
  '#d53f8c',
  '#38a169',
  '#00b5d8',
];

// ==========================================================================
// 1. DATA INITIALIZATION & LIVE STATE SYNC
// ==========================================================================

/**
 * Starts the card empty: the tiers come from the live data only (no built-in snapshot or
 * defaults; offline, sw.js answers with the last copy saved on this device).
 */
export function initDefaultTiers() {
  liveState = 'loading';
  originalTiers = [];
  draftTiers = [];
}

/** 'loading' | 'ok' | 'failed': whether the live reward tiers have arrived. */
let liveState = 'loading';

function saveDraftToStorage() {
  if (!isRewardsPlannerActive) return;
  try {
    localStorage.setItem(REWARDS_DRAFT_KEY, JSON.stringify(draftTiers));
  } catch (e) {}
}

export function checkAndRestoreRewardsDraft() {
  let saved = null;
  try {
    saved = localStorage.getItem(REWARDS_DRAFT_KEY);
  } catch (e) {}

  if (!saved) return false;

  try {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed) && parsed.length > 0) {
      isRewardsPlannerActive = true;
      draftTiers = parsed;

      const btnDraft = document.getElementById('btn-toggle-rewards-planner');
      if (btnDraft) {
        btnDraft.setAttribute('aria-pressed', 'true');
        btnDraft.classList.add('active');
      }

      const container = document.getElementById('rewards-container');
      const addTierBox = document.getElementById('planner-add-tier-container');

      if (container) container.classList.add('planner-active');
      if (addTierBox) addTierBox.classList.remove('hidden');

      renderTierList();
      updatePayoutTable();
      updateRewardsProposalUI();
      return true;
    }
  } catch (err) {
    console.warn('Could not restore rewards draft from localStorage:', err);
  }
  return false;
}

// Draws the reward tiers (the fresh answer, or the saved copy shown while it loads)
function applyRewardsData(data) {
  if (
    data.distribution_tiers &&
    Array.isArray(data.distribution_tiers) &&
    data.distribution_tiers.length > 0
  ) {
    originalTiers = JSON.parse(JSON.stringify(data.distribution_tiers));

    if (!isRewardsPlannerActive) {
      draftTiers = JSON.parse(JSON.stringify(originalTiers));
      renderTierList();
      updatePayoutTable();
    }
  }
}

export async function fetchLiveRewardsState() {
  const container = document.getElementById('rewards-container');
  let savedAt = null;
  try {
    const fresh = fetch(`/api/state?scope=rewards&t=${Date.now()}`);
    // Meanwhile, this device's last copy, dimmed with "Updating…". 'saved' draws the tiers
    // but keeps planning off until the fresh data is in.
    savedAt = await showSavedWhileLoading(
      '/api/state?scope=rewards',
      fresh,
      container,
      async (r) => {
        const data = await r.json();
        liveState = 'saved';
        applyRewardsData(data);
        document.getElementById('rewards-tier-list')?.classList.add('rewards-loaded');
        document.getElementById('payout-table-body')?.classList.add('rewards-loaded');
      },
    );
    const res = await fresh;
    if (!res.ok) throw new Error(`State API returned HTTP ${res.status}`);
    const data = await res.json();
    // Kept for next time (shown while the page loads), unless this is already an offline copy
    if (!offlineCopySavedAt(res)) rememberLiveData('/api/state?scope=rewards', data);
    liveState = 'ok';
    showLiveDataNotice(container, { savedAt: offlineCopySavedAt(res) });
    applyRewardsData(data);
  } catch (err) {
    console.warn('Could not fetch live rewards state:', err);
    if (savedAt) {
      // The saved copy stays (planning stays off): say how old it is instead of "failed"
      showLiveDataNotice(container, { savedAt });
    } else {
      liveState = 'failed';
      showLiveDataNotice(container, { failed: true });
    }
  } finally {
    markUpdating(container, false);
  }
}

export async function fetchLiveMapState() {
  try {
    const [stateRes, colorsRes] = await Promise.all([
      fetch(`/api/state?scope=alliances&t=${Date.now()}`),
      fetch('/api/colors', { cache: 'no-store' }),
    ]);

    let hasUpdate = false;
    if (stateRes.ok) {
      const stateData = await stateRes.json();
      window.MAP_STATE = { alliances: stateData.alliances || stateData };
      hasUpdate = true;
    }
    if (colorsRes.ok) {
      window.DISCORD_COLORS = await colorsRes.json();
      hasUpdate = true;
    }

    if (hasUpdate) {
      syncAllianceTagsFromMapState();
    }
  } catch (err) {
    console.warn('Could not fetch live map state:', err);
  }
}

export async function syncAllLiveState() {
  const listEl = document.getElementById('rewards-tier-list');
  const tableEl = document.getElementById('payout-table-body');

  try {
    await Promise.allSettled([fetchLiveRewardsState(), fetchLiveMapState()]);
  } finally {
    // A saved plan only makes sense next to the live tiers it was made from.
    const restored = liveState === 'ok' && checkAndRestoreRewardsDraft();
    if (!restored) {
      renderTierList();
      updatePayoutTable();
    }
    listEl?.classList.add('rewards-loaded');
    tableEl?.classList.add('rewards-loaded');
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
  saveDraftToStorage();

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
    chests: { commanders_will: 0, loyal_servant: 0, followers_heart: 0 },
  });

  rechainTiers(draftTiers);
  saveDraftToStorage();

  renderTierList();
  updatePayoutTable();
  updateRewardsProposalUI();
}

export function removeTier(tierIndex) {
  if (!isRewardsPlannerActive || draftTiers.length <= 1) return;

  draftTiers.splice(tierIndex, 1);
  rechainTiers(draftTiers);
  saveDraftToStorage();

  renderTierList();
  updatePayoutTable();
  updateRewardsProposalUI();
}

export function adjustChestQuantity(tierIndex, chestType) {
  if (!isRewardsPlannerActive || !draftTiers[tierIndex]) return;

  const currentVal = draftTiers[tierIndex].chests[chestType] || 0;
  draftTiers[tierIndex].chests[chestType] = currentVal >= 5 ? 0 : currentVal + 1;
  saveDraftToStorage();

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
  if (liveState !== 'ok' && liveState !== 'saved') {
    container.innerHTML = `<div class="rewards-tier-placeholder">${esc(window.t(liveState === 'failed' ? 'rewards_planner.load_failed' : 'rewards_planner.loading'))}</div>`;
    return;
  }
  const activeList = isRewardsPlannerActive ? draftTiers : originalTiers;

  container.innerHTML = activeList
    .map((tier, index) => {
      const isSingle = tier.min_rank === tier.max_rank;
      const rangeText = isSingle
        ? `${rankLabel} ${tier.min_rank}`
        : `${rankLabel} ${tier.min_rank}–${tier.max_rank}`;

      return `
      <div class="rewards-tier-row" 
           data-tier-index="${index}"
           data-min-rank="${esc(tier.min_rank)}" 
           data-max-rank="${esc(tier.max_rank)}">
        <div class="tier-label-group">
          <div class="tier-row-controls">
            ${activeList.length > 1 ? `<button class="btn-tier-del" data-action="del-tier" data-index="${index}" title="${esc(window.t('rewards_planner.remove_bracket'))}">×</button>` : ''}
            <span class="range-stepper">
              <span class="range-text">${rankLabel} ${esc(tier.min_rank)}–<span class="range-val">${esc(tier.max_rank)}</span></span>
              <button data-action="dec-range" data-index="${index}" type="button">-</button>
              <button data-action="inc-range" data-index="${index}" type="button">+</button>
            </span>
          </div>

          <span class="tier-name tier-name-static">${esc(rangeText)}</span>
          <span class="tier-alliance-tags" data-min-rank="${esc(tier.min_rank)}" data-max-rank="${esc(tier.max_rank)}"></span>
        </div>

        <div class="tier-chests">
          <div class="chest-item ${tier.chests.commanders_will === 0 ? 'is-empty' : ''}" 
               data-chest-type="commanders_will" 
               data-index="${index}"
               title="${esc(window.t('common.chests.commanders_will'))}">
            <span class="chest-glyph gold"></span>
            <span class="chest-multiplier">×${esc(tier.chests.commanders_will || 0)}</span>
          </div>

          <div class="chest-item ${tier.chests.loyal_servant === 0 ? 'is-empty' : ''}" 
               data-chest-type="loyal_servant" 
               data-index="${index}"
               title="${esc(window.t('common.chests.loyal_servant'))}">
            <span class="chest-glyph purple"></span>
            <span class="chest-multiplier">×${esc(tier.chests.loyal_servant || 0)}</span>
          </div>

          <div class="chest-item ${tier.chests.followers_heart === 0 ? 'is-empty' : ''}" 
               data-chest-type="followers_heart" 
               data-index="${index}"
               title="${esc(window.t('common.chests.followers_heart'))}">
            <span class="chest-glyph blue"></span>
            <span class="chest-multiplier">×${esc(tier.chests.followers_heart || 0)}</span>
          </div>
        </div>
      </div>
    `;
    })
    .join('');

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

  activeList.forEach((tier) => {
    const baseDiamonds =
      tier.chests.commanders_will * CHEST_VALUES.commanders_will.diamonds +
      tier.chests.loyal_servant * CHEST_VALUES.loyal_servant.diamonds +
      tier.chests.followers_heart * CHEST_VALUES.followers_heart.diamonds;

    const baseTickets =
      tier.chests.commanders_will * CHEST_VALUES.commanders_will.tickets +
      tier.chests.loyal_servant * CHEST_VALUES.loyal_servant.tickets +
      tier.chests.followers_heart * CHEST_VALUES.followers_heart.tickets;

    const ranks = [];
    for (let r = tier.min_rank; r <= tier.max_rank; r++) {
      ranks.push(r);
    }

    const hostRanks = ranks.filter((r) => r <= KINGS_CROWN.max_eligible_rank);
    const nonHostRanks = ranks.filter((r) => r > KINGS_CROWN.max_eligible_rank);

    const generateRow = (groupRanks, hasBonus) => {
      if (groupRanks.length === 0) return '';
      const d = baseDiamonds + (hasBonus ? KINGS_CROWN.diamonds : 0);
      const t = baseTickets + (hasBonus ? KINGS_CROWN.tickets : 0);

      const minR = groupRanks[0];
      const maxR = groupRanks[groupRanks.length - 1];
      const displayLabel = minR === maxR ? `${rankLabel} ${minR}` : `${rankLabel} ${minR}–${maxR}`;

      return `
        <tr>
          <td style="font-weight: bold; font-family: var(--font-headers);">${esc(displayLabel)}</td>
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

export function syncAllianceTagsFromMapState() {
  const mapData = typeof window !== 'undefined' ? window.MAP_STATE : null;
  if (!mapData || !mapData.alliances) return;

  const liveDiscordColors = window.DISCORD_COLORS || {};

  const rankedAlliances = Object.entries(mapData.alliances)
    .filter(
      ([_, data]) => data && data.rank !== undefined && data.rank !== null && data.rank !== '',
    )
    .sort(([_, a], [__, b]) => Number(a.rank) - Number(b.rank))
    .map(([tag, data], index) => ({
      tag,
      rank: Number(data.rank),
      color:
        liveDiscordColors[tag] ||
        data.color ||
        AUTO_ALLIANCE_PALETTE[index % AUTO_ALLIANCE_PALETTE.length] ||
        'var(--accent-color)',
    }));

  document.querySelectorAll('.tier-alliance-tags').forEach((container) => {
    const minRank = parseInt(container.dataset.minRank, 10);
    const maxRank = parseInt(container.dataset.maxRank, 10);

    const matching = rankedAlliances.filter((a) => a.rank >= minRank && a.rank <= maxRank);
    if (matching.length > 0) {
      container.innerHTML = matching
        .map(
          (a) =>
            `<span class="alliance-badge" style="color: ${esc(a.color)}; font-weight: bold;">[${esc(a.tag)}]</span>`,
        )
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
  draftTiers.forEach((tier) => {
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

  // Submit Plan stays in the bar, greyed out until there is something to send
  if (!isRewardsPlannerActive) {
    if (submitBtn) submitBtn.disabled = true;
    if (badgeEl) badgeEl.textContent = '0';
    return;
  }

  const hasStructuralChanges = JSON.stringify(draftTiers) !== JSON.stringify(originalTiers);
  const totals = calculatePoolTotals();
  const isOverPool =
    totals.commanders_will > POOL_LIMITS.commanders_will ||
    totals.loyal_servant > POOL_LIMITS.loyal_servant ||
    totals.followers_heart > POOL_LIMITS.followers_heart;

  if (badgeEl) badgeEl.textContent = hasStructuralChanges ? '!' : '0';

  if (submitBtn) {
    submitBtn.disabled = !hasStructuralChanges || isOverPool;
    if (isOverPool) {
      submitBtn.title = window.t('rewards_planner.over_capacity', {
        gold: totals.commanders_will,
        gold_max: POOL_LIMITS.commanders_will,
        purple: totals.loyal_servant,
        purple_max: POOL_LIMITS.loyal_servant,
        blue: totals.followers_heart,
        blue_max: POOL_LIMITS.followers_heart,
      });
    } else {
      submitBtn.removeAttribute('title');
    }
  }
}

export function toggleRewardsPlanner(active) {
  // Never plan from an empty card: a plan made before the live tiers load would propose
  // replacing them.
  if (active && liveState !== 'ok') return;
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

  if (!active) {
    try {
      localStorage.removeItem(REWARDS_DRAFT_KEY);
    } catch (e) {}
    draftTiers = JSON.parse(JSON.stringify(originalTiers));
  } else {
    saveDraftToStorage();
  }

  renderTierList();
  updatePayoutTable();
  updateRewardsProposalUI();
}

export async function submitRewardProposal() {
  if (!isRewardsPlannerActive) return;

  const payload = {
    type: 'rewards',
    timestamp: new Date().toISOString(),
    distribution: draftTiers,
  };

  const diffItems = draftTiers
    .map((tier) => {
      const isSingle = tier.min_rank === tier.max_rank;
      const label = isSingle
        ? window.t('rewards_planner.rank_single', { n: tier.min_rank })
        : window.t('rewards_planner.rank_range', { from: tier.min_rank, to: tier.max_rank });
      return `
      <div>
        <strong>${esc(label)}</strong>: 
        🟡 ×${esc(tier.chests.commanders_will || 0)} | 
        🟣 ×${esc(tier.chests.loyal_servant || 0)} | 
        🔵 ×${esc(tier.chests.followers_heart || 0)}
      </div>
    `;
    })
    .join('');

  submitProposalWithAuth({
    type: 'rewards',
    title: window.t('rewards_planner.proposal_title'),
    payload: payload,
    diffSummaryHtml: `<div class="diff-list">${diffItems}</div>`,
    onSuccess: () => {
      try {
        localStorage.removeItem(REWARDS_DRAFT_KEY);
      } catch (e) {}
      originalTiers = JSON.parse(JSON.stringify(draftTiers));
      toggleRewardsPlanner(false);
    },
  });
}

// ==========================================================================
// 6. INITIALIZATION & EVENT DELEGATION
// ==========================================================================

// Runs on every page's turbo:load. Sets up the rewards card only where it is shown, once per
// visit: each visit (also the back button's copy of the page) brings a fresh container.
const startedRewardsCards = new WeakSet();
export function bindRewardsControls() {
  const container = document.getElementById('rewards-container');
  if (!container || startedRewardsCards.has(container)) return;
  startedRewardsCards.add(container);
  // A fresh container can be Turbo's back-button copy of the page, which keeps the data-bound
  // marks of the controls wired up last time. Clear them so the controls are wired up again.
  container.querySelectorAll('[data-bound]').forEach((el) => el.removeAttribute('data-bound'));

  initDefaultTiers();

  const listEl = document.getElementById('rewards-tier-list');
  const tableEl = document.getElementById('payout-table-body');
  listEl?.classList.remove('rewards-loaded');
  tableEl?.classList.remove('rewards-loaded');

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
    btnSubmit.addEventListener('click', () => submitRewardProposal());
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

  syncAllLiveState();
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bindRewardsControls);
  } else {
    bindRewardsControls();
  }
  document.addEventListener('turbo:load', bindRewardsControls);
}
