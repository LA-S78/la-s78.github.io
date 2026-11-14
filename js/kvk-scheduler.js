/**
 * js/kvk-scheduler.js - Capitol Defense & Automated Rotation Controller
 * Implements Model 1:
 *  - 1st Threat Override: Calendar Swap with Week 3 (0 chest cost to WLO).
 *  - 2nd Threat Override: 2-Installment Wartime Buyout (2 Reg + 2 KW Gold chests).
 */

import { ALLIANCE_COLORS, startingSchedule } from './alliance-defaults.js';
import { submitProposalWithAuth } from './auth-modal.js';

// Escape data before putting it into HTML (see js/escape-html.js).
const esc = (value) => window.escapeHtml(value);
// The page's language (kings_scheduler.* in _data/<lang>/tools.yml, js/i18n.js): text, and
// text around trusted HTML (bold tags, coloured alliance tags).
const t = (key, vars) => window.t(`kings_scheduler.${key}`, vars);
const th = (key, html, vars) => window.th(`kings_scheduler.${key}`, html, vars);
const tag = (name, color) =>
  `<strong${color ? ` class="ally-text" style="--ally: ${esc(color)}"` : ''}>[${esc(name)}]</strong>`;

let cycleState = {
  macro_cycle: 1,
  current_week: 1,
  override_count: 0,
  active_schedule: startingSchedule(),
};

let activeBuyouts = [];
let alliancesData = {};

// Colours for alliances with none of their own: _data/alliances.yml (via js/alliance-defaults.js)
const DEFAULT_ALLIANCE_COLORS = ALLIANCE_COLORS;

function getAllianceColor(tag) {
  const clean = String(tag || '').trim();
  if (alliancesData[clean]?.color) return alliancesData[clean].color;
  return DEFAULT_ALLIANCE_COLORS[clean] || '#b8975a';
}

function getEffectiveActiveWeek() {
  if (typeof window !== 'undefined' && typeof window.__LIVE_CLOCK_WEEK__ === 'number') {
    return window.__LIVE_CLOCK_WEEK__;
  }
  return cycleState.current_week ?? 1;
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
  const currentWeek = getEffectiveActiveWeek();

  const weeks = [
    {
      key: 'downtime',
      label: t('off_week'),
      sub: t('boss_window', { n: 1 }),
      seat: schedule.downtime || startingSchedule().downtime,
      loot: window.tn('kings_scheduler.loot', 1),
    },
    {
      key: 'week_1',
      label: t('week_fri', { n: 1 }),
      sub: t('boss_window', { n: 2 }),
      seat: schedule.week_1 || startingSchedule().week_1,
      loot: window.tn('kings_scheduler.loot', 2),
    },
    {
      key: 'week_2',
      label: t('week_fri', { n: 2 }),
      sub: t('boss_window', { n: 3 }),
      seat: schedule.week_2 || startingSchedule().week_2,
      loot: window.tn('kings_scheduler.loot', 2),
    },
    {
      key: 'week_3',
      label: t('week_fri', { n: 3 }),
      sub: t('kvk_finale'),
      seat: schedule.week_3 || startingSchedule().week_3,
      loot: t('loot_border'),
    },
  ];

  container.innerHTML = weeks
    .map((w) => {
      const isCurrent =
        (w.key === 'downtime' && currentWeek === 0) || w.key === `week_${currentWeek}`;
      const color = getAllianceColor(w.seat);

      return `
      <div class="ops-week-card ${isCurrent ? 'is-active-week' : ''}">
        <div class="ops-week-header">
          <span class="ops-week-num">${esc(w.label)}</span>
          ${isCurrent ? `<span class="badge">${esc(t('active'))}</span>` : ''}
        </div>
        <div class="ops-week-body">
          <span class="ops-week-tag ally-text" style="--ally: ${esc(color)}">[${esc(w.seat)}]</span>
          <span class="ops-week-sub">${esc(w.sub)}</span>
        </div>
        <div class="ops-week-loot">
          <small>${esc(w.loot)}</small>
        </div>
      </div>
    `;
    })
    .join('');
}

/**
 * 3. Render active wartime buyout restitution tickets
 */
function renderActiveBuyouts() {
  const container = document.getElementById('ops-buyouts-container');
  const listEl = document.getElementById('ops-buyout-list');
  const badgeEl = document.getElementById('ops-buyout-count-badge');
  if (!container || !listEl) return;

  const pendingBuyouts = activeBuyouts.filter(
    (b) => b.status === 'active' || b.status === 'pending',
  );

  if (badgeEl) badgeEl.textContent = t('buyouts_count', { n: pendingBuyouts.length });

  if (pendingBuyouts.length === 0) {
    container.style.display = 'none';
    listEl.innerHTML = '';
    return;
  }

  container.style.display = 'block';
  listEl.innerHTML = pendingBuyouts
    .map((buyout) => {
      const color = getAllianceColor(buyout.beneficiary);

      const installmentsHtml = (buyout.installments || [])
        .map(
          (inst) => `
      <div class="ops-installment-item ${inst.status === 'fulfilled' ? 'is-fulfilled' : ''}">
        <span class="ops-installment-week">${esc(t('installment', { week: inst.week }))}</span>
        <span class="ops-installment-chests">
          ${th('payout', { reg: `<strong>${esc(t('reg_gold', { n: inst.payout.regular }))}</strong>`, kw: `<strong>${esc(t('kw_gold', { n: inst.payout.kw }))}</strong>` })}
        </span>
        <span class="badge ${inst.status === 'fulfilled' ? 'badge-success' : 'badge-pending'}">
          ${esc(t(inst.status === 'fulfilled' ? 'paid' : 'pending'))}
        </span>
      </div>
    `,
        )
        .join('');

      return `
      <div class="ops-buyout-card">
        <div class="ops-buyout-card-header">
          <div>
            <strong>${esc(t('beneficiary'))}</strong> <span class="ally-text" style="--ally: ${esc(color)}">[${esc(buyout.beneficiary)}]</span>
            <small class="text-muted">${esc(t('threat', { threat: buyout.threat || t('red_list') }))}</small>
          </div>
          <span class="badge badge-warning">${esc(t('wartime_buyout'))}</span>
        </div>
        <div class="ops-installments-wrap">
          ${installmentsHtml}
        </div>
      </div>
    `;
    })
    .join('');
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
        ⚠️ ${th('already_scheduled', { who: `<strong>${esc(t('already_scheduled_who', { n: targetWeek }))}</strong>` })}
      </div>
    `;
    submitBtn.disabled = true;
    return;
  }

  if (overrideCount === 0) {
    const allyColor = getAllianceColor(currentScheduledAlly);
    previewBox.innerHTML = `
      <div class="preview-stepped-swap">
        <div class="preview-type-badge">${esc(t('step1'))}</div>
        <p>
          ${th('step1_text', { week: `<strong>${esc(t('week_label', { n: targetWeek }))}</strong>`, threat: `<strong>${esc(threatName || t('opponent_placeholder'))}</strong>` })}
        </p>
        <div class="preview-swap-row">
          <span>${esc(t('week_label', { n: targetWeek }))}: ${tag('WLO', ALLIANCE_COLORS.WLO)}</span>
          <span class="swap-arrow">⇄</span>
          <span>${esc(t('week3_finale'))} ${tag(currentScheduledAlly, allyColor)}</span>
        </div>
        <div class="preview-perks">
          🎁 ${th('lose_nothing', { ally: tag(currentScheduledAlly), wlo: tag('WLO') })}
        </div>
      </div>
    `;
  } else {
    const allyColor = getAllianceColor(currentScheduledAlly);
    previewBox.innerHTML = `
      <div class="preview-stepped-buyout">
        <div class="preview-type-badge alert">${esc(t('step2'))}</div>
        <p>
          ${th('step2_text', { second: `<strong>${esc(t('second_override'))}</strong>`, ally: tag(currentScheduledAlly, allyColor) })}
        </p>
        <div class="preview-installment-plan">
          <div class="p-item">• <strong>${esc(t('distribution', { n: targetWeek }))}</strong> ${esc(t('plus_gold', { tag: currentScheduledAlly }))}</div>
          <div class="p-item">• <strong>${esc(t('distribution', { n: 3 }))}</strong> ${esc(t('plus_gold', { tag: currentScheduledAlly }))}</div>
        </div>
        <div class="preview-perks">
          🎁 ${th('buyout_perks', { ally: tag(currentScheduledAlly), wlo: tag('WLO') })}
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
    timestamp: new Date().toISOString(),
  };

  const b = (key, vars) => `<strong>${esc(t(key, vars))}</strong>`;
  const vs = th('sum_vs', { threat: `<code>${esc(threatName)}</code>` }, { n: targetWeek });
  const installment = (i, week) =>
    `<div>• 📦 <em>${esc(t('sum_installment', { i, week }))}</em> ${esc(t('sum_installment_chests'))}</div>`;
  const diffSummaryHtml = isBuyout
    ? `
      <div>• 🚨 ${b('sum_second')}: ${vs}</div>
      <div>• 🛡️ ${b('sum_buyout_issued', { tag: displacedAlly })}: ${esc(t('sum_four_gold'))}</div>
      ${installment(1, targetWeek)}
      ${installment(2, 3)}
    `
    : `
      <div>• ⚔️ ${b('sum_first')}: ${vs}</div>
      <div>• ⇄ ${b('sum_swap')}: ${esc(t('sum_swap_text', { n: targetWeek }))}</div>
      <div>• 👑 ${b('sum_promoted', { tag: displacedAlly })} ${esc(t('sum_promoted_text'))}</div>
      <div>• 💰 ${b('sum_cost')}</div>
    `;

  submitProposalWithAuth({
    type: 'override',
    title: t(isBuyout ? 'proposal_buyout' : 'proposal_swap'),
    payload,
    diffSummaryHtml,
    onSuccess: () => {
      threatInput.value = '';
      fetchOperationsState();
    },
  });
}

/**
 * Master UI Render Routine
 */
export function renderOperationsUI() {
  const counterBadge = document.getElementById('ops-override-counter-badge');

  if (counterBadge) {
    const count = cycleState.override_count || 0;
    counterBadge.textContent = t('overrides', { n: count });
    counterBadge.className = count === 0 ? 'badge' : count === 1 ? 'badge-warning' : 'badge-danger';
  }

  renderScheduleGrid();
  renderActiveBuyouts();
  updateOverridePreview();
}

/**
 * Event Listeners & Binding
 */
const startedPortals = new WeakSet();
export function bindOperationsControls() {
  // Runs on every page's turbo:load; only the calendar has the console. Once per visit:
  // each visit (also the back button's copy of the page) brings a fresh #operations-portal.
  const portal = document.getElementById('operations-portal');
  if (!portal || startedPortals.has(portal)) return;
  startedPortals.add(portal);

  const weekSelect = document.getElementById('ops-input-target-week');
  const threatInput = document.getElementById('ops-input-threat');
  const submitBtn = document.getElementById('btn-submit-override');

  weekSelect?.addEventListener('change', updateOverridePreview);
  threatInput?.addEventListener('input', updateOverridePreview);
  submitBtn?.addEventListener('click', submitOverrideProposal);

  if (typeof window !== 'undefined' && !window.__KVK_CLOCK_LISTENER__) {
    window.__KVK_CLOCK_LISTENER__ = true;
    window.addEventListener('calendar:clock-synced', () => {
      renderScheduleGrid();
    });
  }

  fetchOperationsState();
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bindOperationsControls);
  } else {
    bindOperationsControls();
  }
  // A footer link swaps only the page's main frame: Turbo then fires turbo:frame-render, and
  // on some routes not turbo:load (the tool stayed blank). Start on both, as js/main.js does;
  // the once-per-page guard makes the second call a no-op.
  document.addEventListener('turbo:load', bindOperationsControls);
  document.addEventListener('turbo:frame-render', bindOperationsControls);
}
