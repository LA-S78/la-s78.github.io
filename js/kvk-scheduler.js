/**
 * js/kvk-scheduler.js - Capitol Defense & Automated Rotation Controller
 * Implements Model 1:
 *  - 1st Threat Override: Calendar Swap with Week 3 (0 chest cost to WLO).
 *  - 2nd Threat Override: 2-Installment Wartime Buyout (2 Reg + 2 KW Gold chests).
 */

import { submitProposalWithAuth } from './auth-modal.js';

let cycleState = {
  macro_cycle: 1,
  current_week: 1,
  override_count: 0,
  active_schedule: { downtime: 'BOTS', week_1: 'RÂVN', week_2: 'MIA', week_3: 'WLO' }
};

let activeBuyouts = [];
let alliancesData = {};

const DEFAULT_ALLIANCE_COLORS = {
  WLO: '#25bb00',
  'RÂVN': '#cece00',
  RAVN: '#cece00',
  MIA: '#a400af',
  BOTS: '#0070f3',
  SVN: '#e53e3e',
  PHNX: '#dd6b20',
  HMDA: '#d53f8c',
  NAVI: '#319795',
  HeKi: '#d69e2e'
};

function getAllianceColor(tag) {
  const clean = String(tag || '').trim();
  if (alliancesData[clean]?.color) return alliancesData[clean].color;
  return DEFAULT_ALLIANCE_COLORS[clean] || '#b8975a';
}

/**
 * 1. Fetch live state from unified /api/state proxy
 */
export async function fetchOperationsState() {
  try {
    const res = await fetch(`/api/state?scope=all&t=${Date.now()}`);
    if (!res.ok) throw new Error('Failed to load state');
    const data = await res.json();

    if (data.map?.alliances) {
      alliancesData = data.map.alliances;
    }

    if (data.rewards?.cycle_state) {
      cycleState = data.rewards.cycle_state;
    }

    if (Array.isArray(data.rewards?.wartime_buyouts)) {
      activeBuyouts = data.rewards.wartime_buyouts;
    }

    renderOperationsUI();
  } catch (err) {
    console.warn('Could not load live scheduler state:', err);
  }
}

/**
 * 2. Render dynamic 4-week cycle cards
 */
function renderScheduleGrid() {
  const container = document.getElementById('ops-schedule-cards');
  if (!container) return;

  const schedule = cycleState.active_schedule || {};
  const currentWeek = cycleState.current_week ?? 1;

  const weeks = [
    { key: 'downtime', label: 'Downtime', sub: 'Boss 1 (Blind)', seat: schedule.downtime || 'BOTS', loot: '1 King Chest' },
    { key: 'week_1', label: 'Week 1 Fri', sub: 'Boss 2 Window', seat: schedule.week_1 || 'RÂVN', loot: '2 King Chests' },
    { key: 'week_2', label: 'Week 2 Fri', sub: 'Boss 3 Window', seat: schedule.week_2 || 'MIA', loot: '2 King Chests' },
    { key: 'week_3', label: 'Week 3 Fri', sub: 'KvK Finale', seat: schedule.week_3 || 'WLO', loot: '2 King Chests + Buff Item' }
  ];

  container.innerHTML = weeks.map((w) => {
    const isCurrent = (w.key === 'downtime' && currentWeek === 0) || w.key === `week_${currentWeek}`;
    const color = getAllianceColor(w.seat);

    return `
      <div class="ops-week-card ${isCurrent ? 'is-active-week' : ''}">
        <div class="ops-week-header">
          <span class="ops-week-num">${w.label}</span>
          ${isCurrent ? '<span class="badge">ACTIVE</span>' : ''}
        </div>
        <div class="ops-week-body">
          <span class="ops-week-tag" style="color: ${color}">[${w.seat}]</span>
          <span class="ops-week-sub">${w.sub}</span>
        </div>
        <div class="ops-week-loot">
          <small>${w.loot}</small>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * 3. Render active wartime buyout restitution tickets
 */
function renderActiveBuyouts() {
  const container = document.getElementById('ops-buyouts-container');
  const listEl = document.getElementById('ops-buyout-list');
  const badgeEl = document.getElementById('ops-buyout-count-badge');
  if (!container || !listEl) return;

  const pendingBuyouts = activeBuyouts.filter(b => b.status === 'active' || b.status === 'pending');

  if (badgeEl) badgeEl.textContent = `${pendingBuyouts.length} Active`;

  if (pendingBuyouts.length === 0) {
    container.style.display = 'none';
    listEl.innerHTML = '';
    return;
  }

  container.style.display = 'block';
  listEl.innerHTML = pendingBuyouts.map((buyout) => {
    const color = getAllianceColor(buyout.beneficiary);

    const installmentsHtml = (buyout.installments || []).map(inst => `
      <div class="ops-installment-item ${inst.status === 'fulfilled' ? 'is-fulfilled' : ''}">
        <span class="ops-installment-week">Week ${inst.week} Payout:</span>
        <span class="ops-installment-chests">
          <strong>+${inst.payout.regular} Reg Gold</strong> &amp; <strong>+${inst.payout.kw} KW Gold</strong>
        </span>
        <span class="badge ${inst.status === 'fulfilled' ? 'badge-success' : 'badge-pending'}">
          ${inst.status === 'fulfilled' ? 'PAID' : 'PENDING'}
        </span>
      </div>
    `).join('');

    return `
      <div class="ops-buyout-card">
        <div class="ops-buyout-card-header">
          <div>
            <strong>Beneficiary:</strong> <span style="color: ${color}">[${buyout.beneficiary}]</span>
            <small class="text-muted">(Threat: ${buyout.threat || 'Red List'})</small>
          </div>
          <span class="badge badge-warning">Wartime Buyout</span>
        </div>
        <div class="ops-installments-wrap">
          ${installmentsHtml}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * 4. Dynamic Stepped Model Real-Time Simulator
 */
export function updateOverridePreview() {
  const weekSelect = document.getElementById('ops-input-target-week');
  const threatInput = document.getElementById('ops-input-threat');
  const previewBox = document.getElementById('ops-preview-box');
  const submitBtn = document.getElementById('btn-submit-override');
  if (!weekSelect || !previewBox || !submitBtn) return;

  const targetWeek = parseInt(weekSelect.value, 10);
  const threatName = (threatInput?.value || '').trim();
  const schedule = cycleState.active_schedule || {};
  const currentScheduledAlly = schedule[`week_${targetWeek}`];
  const overrideCount = cycleState.override_count || 0;

  submitBtn.disabled = !threatName;

  if (currentScheduledAlly === 'WLO') {
    previewBox.innerHTML = `
      <div class="preview-notice warning">
        ⚠️ <strong>WLO is already scheduled for Week ${targetWeek}.</strong> No defense override required.
      </div>
    `;
    submitBtn.disabled = true;
    return;
  }

  if (overrideCount === 0) {
    // Stepped Model: Step 1 (Calendar Swap)
    const allyColor = getAllianceColor(currentScheduledAlly);
    previewBox.innerHTML = `
      <div class="preview-stepped-swap">
        <div class="preview-type-badge">Step 1: Calendar Swap (0 Chest Cost)</div>
        <p>
          WLO will take <strong>Week ${targetWeek}</strong> for kingdom defense against <strong>${threatName || '[Opponent]'}</strong>.
        </p>
        <div class="preview-swap-row">
          <span>Week ${targetWeek}: <strong style="color: #25bb00">[WLO]</strong></span>
          <span class="swap-arrow">⇄</span>
          <span>Week 3 Finale: <strong style="color: ${allyColor}">[${currentScheduledAlly}]</strong></span>
        </div>
        <div class="preview-perks">
          🎁 <strong>[${currentScheduledAlly}]</strong> receives 2 King Chests, the KvK Finale seat, and the reusable King Buff Item.
          <strong>WLO Alliance Chest Cost: 0.</strong>
        </div>
      </div>
    `;
  } else {
    // Stepped Model: Step 2 (2-Installment Buyout)
    const allyColor = getAllianceColor(currentScheduledAlly);
    previewBox.innerHTML = `
      <div class="preview-stepped-buyout">
        <div class="preview-type-badge alert">Step 2: Wartime Buyout (2-Installment Restitution)</div>
        <p>
          This is the <strong>second defense override</strong> in this cycle. Week 3 was already traded, so
          <strong style="color: ${allyColor}">[${currentScheduledAlly}]</strong> sits out and receives a full material buyout:
        </p>
        <div class="preview-installment-plan">
          <div class="p-item">• <strong>Week ${targetWeek} Distribution:</strong> +1 Regular Gold &amp; +1 KW Gold to [${currentScheduledAlly}]</div>
          <div class="p-item">• <strong>Week 3 Distribution:</strong> +1 Regular Gold &amp; +1 KW Gold to [${currentScheduledAlly}]</div>
        </div>
        <div class="preview-perks">
          💰 <strong>Total Restitution:</strong> 2 Regular Gold + 2 KW Gold chests (~9,400 Diamonds / 44 Tickets equivalent). Zero calendar debt created.
        </div>
      </div>
    `;
  }
}

/**
 * 5. Submit Proposal via Auth Modal
 */
export async function submitOverrideProposal() {
  const weekSelect = document.getElementById('ops-input-target-week');
  const threatInput = document.getElementById('ops-input-threat');
  if (!weekSelect || !threatInput) return;

  const targetWeek = parseInt(weekSelect.value, 10);
  const threatName = threatInput.value.trim();
  if (!threatName) return;

  const schedule = cycleState.active_schedule || {};
  const displacedAlly = schedule[`week_${targetWeek}`];
  const overrideCount = cycleState.override_count || 0;
  const isBuyout = overrideCount > 0;

  const payload = {
    type: 'override',
    targetWeek,
    threatName,
    displacedAlly,
    overrideCount,
    action: isBuyout ? 'buyout' : 'swap',
    timestamp: new Date().toISOString()
  };

  const diffSummaryHtml = isBuyout
    ? `
      <div>• 🚨 <strong>WLO 2nd Defense Override</strong>: Week ${targetWeek} vs <code>${threatName}</code></div>
      <div>• 🛡️ <strong>[${displacedAlly}] Wartime Buyout Issued</strong>: 4 Gold Chests total</div>
      <div>• 📦 <em>Installment 1 (W${targetWeek}):</em> 1 Reg Gold + 1 KW Gold</div>
      <div>• 📦 <em>Installment 2 (W3):</em> 1 Reg Gold + 1 KW Gold</div>
    `
    : `
      <div>• ⚔️ <strong>WLO 1st Defense Override</strong>: Week ${targetWeek} vs <code>${threatName}</code></div>
      <div>• ⇄ <strong>Calendar Swap</strong>: WLO takes W${targetWeek} Friday</div>
      <div>• 👑 <strong>[${displacedAlly}] Promoted to Week 3 Finale</strong> (2 King Chests + Buff Item)</div>
      <div>• 💰 <strong>WLO Alliance Chest Cost: 0</strong></div>
    `;

  submitProposalWithAuth({
    type: 'override',
    title: isBuyout ? '🛡️ Declare Wartime Buyout' : '⚔️ Declare Defense Swap',
    payload,
    diffSummaryHtml,
    onSuccess: () => {
      threatInput.value = '';
      fetchOperationsState();
    }
  });
}

/**
 * Master UI Render Routine
 */
export function renderOperationsUI() {
  const macroBadge = document.getElementById('ops-macro-badge');
  const counterBadge = document.getElementById('ops-override-counter-badge');

  if (macroBadge) macroBadge.textContent = `Macro Cycle ${cycleState.macro_cycle || 1}`;
  if (counterBadge) {
    const count = cycleState.override_count || 0;
    counterBadge.textContent = `Overrides: ${count}/2`;
    counterBadge.className = count === 0 ? 'badge' : count === 1 ? 'badge-warning' : 'badge-danger';
  }

  renderScheduleGrid();
  renderActiveBuyouts();
  updateOverridePreview();
}

/**
 * Event Listeners & Binding
 */
export function bindOperationsControls() {
  const weekSelect = document.getElementById('ops-input-target-week');
  const threatInput = document.getElementById('ops-input-threat');
  const submitBtn = document.getElementById('btn-submit-override');

  if (weekSelect && !weekSelect.dataset.bound) {
    weekSelect.dataset.bound = 'true';
    weekSelect.addEventListener('change', updateOverridePreview);
  }

  if (threatInput && !threatInput.dataset.bound) {
    threatInput.dataset.bound = 'true';
    threatInput.addEventListener('input', updateOverridePreview);
  }

  if (submitBtn && !submitBtn.dataset.bound) {
    submitBtn.dataset.bound = 'true';
    submitBtn.addEventListener('click', submitOverrideProposal);
  }

  fetchOperationsState();
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bindOperationsControls);
  } else {
    bindOperationsControls();
  }
  document.addEventListener('turbo:load', bindOperationsControls);
}