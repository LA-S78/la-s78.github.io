/**
 * js/alliance.js - Dynamic NAP Diplomacy, Standings Ladder & Blacklist Engine
 * Preserves exact tag capitalization (e.g., RÂVN vs RâvN vs râvn) without conflict.
 */

import { submitProposalWithAuth } from './auth-modal.js';
import { offlineCopySavedAt, showLiveDataNotice } from './live-data-notice.js';
import { ALLIANCE_COLORS } from './alliance-defaults.js';

// Escape data before putting it into HTML (see js/escape-html.js).
const esc = (value) => window.escapeHtml(value);
// The page's language (alliance_planner.* / blacklist_planner.* in _data/<lang>/tools.yml).
const ta = (key, vars) => window.t(`alliance_planner.${key}`, vars);
const tb = (key, vars) => window.t(`blacklist_planner.${key}`, vars);
const tbh = (key, html, vars) => window.th(`blacklist_planner.${key}`, html, vars);
const bold = (text) => `<strong>${esc(text)}</strong>`;

// Planner Mode (standings, top of the page) and Edit Blacklist (bottom) are separate modes,
// each with its own saved draft, so switching one on or off never touches the other.
const ALLIANCE_DRAFT_KEY = 'la_alliance_planner_draft';
const BLACKLIST_DRAFT_KEY = 'la_blacklist_draft';

// Colours for alliances with none of their own: _data/alliances.yml (via js/alliance-defaults.js)
const DEFAULT_ALLIANCE_COLORS = ALLIANCE_COLORS;

const AUTO_PALETTE = [
  '#25bb00',
  '#cece00',
  '#a400af',
  '#0070f3',
  '#e53e3e',
  '#dd6b20',
  '#d53f8c',
  '#319795',
  '#d69e2e',
  '#805ad5',
  '#38a169',
  '#00b5d8',
];

export let isAlliancePlannerActive = false;
export let isBlacklistEditing = false;
export let originalAlliances = {};
export let originalBlacklist = { players: [], alliances: [] };
export let draftAlliances = {};
export let draftBlacklist = { players: [], alliances: [] };
export let liveDiscordColors = {};
/** 'loading' | 'ok' | 'failed': whether the live standings and blacklist have arrived. */
let liveState = 'loading';

// ============================================================================
// 1. COLOR & CASE-SENSITIVE TAG HELPERS
// ============================================================================

function resolveAllianceColor(tag, explicitColor = null, rank = null) {
  const cleanTag = String(tag || '').trim();

  // 1. Exact match in live Discord colors
  if (liveDiscordColors[cleanTag]) {
    return liveDiscordColors[cleanTag];
  }

  // 2. If tag is all-uppercase (e.g. "RAVN"), check diacritic-normalized match in liveDiscordColors (e.g. "RÂVN")
  if (cleanTag === cleanTag.toUpperCase()) {
    const stripDiacritics = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normalizedTarget = stripDiacritics(cleanTag);
    const matchedDiscordKey = Object.keys(liveDiscordColors).find(
      (k) => k === k.toUpperCase() && stripDiacritics(k) === normalizedTarget,
    );
    if (matchedDiscordKey) {
      return liveDiscordColors[matchedDiscordKey];
    }
  }

  // 3. Explicit custom color (ignore generic gold default if a canonical color exists)
  if (explicitColor && explicitColor !== '#b8975a') {
    return explicitColor;
  }

  // 4. Canonical static fallback color
  if (DEFAULT_ALLIANCE_COLORS[cleanTag]) {
    return DEFAULT_ALLIANCE_COLORS[cleanTag];
  }

  // 5. Rank-based palette fallback
  if (rank !== null && rank !== undefined && !isNaN(rank) && Number(rank) > 0) {
    return AUTO_PALETTE[(Number(rank) - 1) % AUTO_PALETTE.length];
  }

  return explicitColor || '#718096';
}

// ============================================================================
// 2. DATA INITIALIZATION & LIVE SYNC
// ============================================================================

/**
 * Starts the page empty: the standings and blacklist come from the live data only (no
 * built-in snapshot; offline, sw.js answers with the last copy saved on this device).
 * Until it arrives the lists say "Loading…".
 */
export function initBootstrapData() {
  liveState = 'loading';
  originalAlliances = {};
  originalBlacklist = { players: [], alliances: [] };
  draftAlliances = {};
  draftBlacklist = { players: [], alliances: [] };
}

/** Always { players: [...], alliances: [...] } of trimmed, non-empty names, whatever came in
 *  (old saved drafts, live data, page data). A different shape made "+ Add" fail silently. */
function normaliseBlacklist(raw, fallback = { players: [], alliances: [] }) {
  // A list that is missing or not a list keeps the fallback (e.g. the live blacklist), so an
  // old saved draft never quietly proposes emptying it.
  const list = (x, keep) =>
    Array.isArray(x) ? x.map((v) => String(v ?? '').trim()).filter(Boolean) : [...(keep || [])];
  return {
    players: list(raw?.players, fallback.players),
    alliances: list(raw?.alliances, fallback.alliances),
  };
}

function saveDraftToStorage() {
  if (!isAlliancePlannerActive) return;
  try {
    localStorage.setItem(ALLIANCE_DRAFT_KEY, JSON.stringify({ alliances: draftAlliances }));
  } catch (e) {}
}

function saveBlacklistDraft() {
  if (!isBlacklistEditing) return;
  try {
    localStorage.setItem(BLACKLIST_DRAFT_KEY, JSON.stringify(draftBlacklist));
  } catch (e) {}
}

/** Shows or hides the blacklist's add boxes. */
function showBlacklistEditors(active) {
  document.getElementById('planner-add-player-box')?.classList.toggle('hidden', !active);
  document
    .getElementById('planner-add-blacklist-alliance-box')
    ?.classList.toggle('hidden', !active);
}

/**
 * Reopens a blacklist edit left unsent. Drafts saved before the two modes were separated
 * kept the blacklist inside the planner's draft: one with changes is moved over.
 */
function restoreBlacklistDraft(oldBundleBlacklist) {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(BLACKLIST_DRAFT_KEY) || 'null');
  } catch (e) {}
  const fromOldDraft = !saved && !!oldBundleBlacklist;
  if (fromOldDraft) saved = oldBundleBlacklist;
  if (!saved) return false;

  const previous = draftBlacklist;
  draftBlacklist = normaliseBlacklist(saved, originalBlacklist);
  if (fromOldDraft && calculateBlacklistDiff().length === 0) {
    draftBlacklist = previous; // the old draft had no blacklist changes: nothing to reopen
    return false;
  }
  isBlacklistEditing = true;
  saveBlacklistDraft();
  showBlacklistEditors(true);
  renderBlacklist();
  updateAllianceProposalUI();
  return true;
}

export function checkAndRestoreAllianceDraft() {
  let saved = null;
  try {
    saved = localStorage.getItem(ALLIANCE_DRAFT_KEY);
  } catch (e) {}

  let parsed = null;
  try {
    parsed = saved ? JSON.parse(saved) : null;
  } catch (e) {}
  restoreBlacklistDraft(parsed?.blacklist);
  if (!parsed) return false;

  try {
    if (parsed.alliances && Object.keys(parsed.alliances).length > 0) {
      isAlliancePlannerActive = true;
      draftAlliances = parsed.alliances;
      if (parsed.blacklist) saveDraftToStorage(); // re-save without the old blacklist part

      // Ensure colors are resolved on restored drafts
      Object.entries(draftAlliances).forEach(([tag, data]) => {
        data.color = resolveAllianceColor(tag, data.color, data.rank);
      });

      const btnDraft = document.getElementById('btn-toggle-alliance-planner');
      if (btnDraft) {
        btnDraft.setAttribute('aria-pressed', 'true');
        btnDraft.classList.add('active');
      }

      const container = document.getElementById('alliance-container');
      const addAllianceBox = document.getElementById('planner-add-alliance-container');
      if (container) container.classList.add('planner-active');
      if (addAllianceBox) addAllianceBox.classList.remove('hidden');

      renderStandingsHierarchy();
      updateAllianceProposalUI();
      return true;
    }
  } catch (err) {
    console.warn('Could not restore alliance draft from localStorage:', err);
  }
  return false;
}

export async function fetchLiveAllianceState() {
  try {
    const [stateRes, colorsRes] = await Promise.all([
      fetch(`/api/state?scope=alliances&t=${Date.now()}`),
      fetch('/api/colors', { cache: 'no-store' }),
    ]);

    if (colorsRes.ok) {
      liveDiscordColors = await colorsRes.json();
    }

    if (!stateRes.ok) throw new Error(`State API returned HTTP ${stateRes.status}`);
    {
      const data = await stateRes.json();
      liveState = 'ok';
      showLiveDataNotice(document.getElementById('alliance-container'), {
        savedAt: offlineCopySavedAt(stateRes),
      });
      if (
        data.alliances &&
        typeof data.alliances === 'object' &&
        Object.keys(data.alliances).length > 0
      ) {
        const normalizedLive = {};

        Object.entries(data.alliances).forEach(([tag, allyData]) => {
          const cleanTag = tag.trim();
          if (!cleanTag) return;

          const parsedRank =
            allyData.rank !== null && allyData.rank !== undefined && allyData.rank !== ''
              ? Number(allyData.rank)
              : null;

          normalizedLive[cleanTag] = {
            ...allyData,
            tag: cleanTag,
            rank: parsedRank,
            parent_tag: allyData.parent_tag ? String(allyData.parent_tag).trim() : null,
            academies: Array.isArray(allyData.academies)
              ? allyData.academies.map((a) => String(a).trim()).filter(Boolean)
              : [],
            color: resolveAllianceColor(cleanTag, allyData.color, parsedRank),
          };
        });

        originalAlliances = normalizedLive;
      }

      if (
        data.blacklist &&
        (Array.isArray(data.blacklist.players) || Array.isArray(data.blacklist.alliances))
      ) {
        originalBlacklist = normaliseBlacklist(data.blacklist);
      }

      if (!isAlliancePlannerActive) {
        draftAlliances = JSON.parse(JSON.stringify(originalAlliances));
        renderStandingsHierarchy();
      }
      if (!isBlacklistEditing) {
        draftBlacklist = JSON.parse(JSON.stringify(originalBlacklist));
        renderBlacklist();
      }
    }
  } catch (err) {
    console.warn('Could not fetch live alliance state:', err);
    liveState = 'failed';
    showLiveDataNotice(document.getElementById('alliance-container'), { failed: true });
    renderStandingsHierarchy();
    renderBlacklist();
  }
}

// ============================================================================
// 3. LADDER REORDERING & MUTATION LOGIC
// ============================================================================

function getSortedLadder(alliancesObj) {
  return Object.values(alliancesObj).sort((a, b) => {
    const rankA = a.rank !== null && a.rank !== undefined ? Number(a.rank) : 999;
    const rankB = b.rank !== null && b.rank !== undefined ? Number(b.rank) : 999;
    if (rankA !== rankB) return rankA - rankB;
    return a.tag.localeCompare(b.tag);
  });
}

export function moveAllianceRank(tag, direction) {
  if (!isAlliancePlannerActive) return;

  const ladder = getSortedLadder(draftAlliances).filter((a) => a.rank !== null);
  const currentIndex = ladder.findIndex((a) => a.tag === tag);
  if (currentIndex === -1) return;

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= ladder.length) return;

  const currentAlliance = ladder[currentIndex];
  const targetAlliance = ladder[targetIndex];

  const tempRank = currentAlliance.rank;
  currentAlliance.rank = targetAlliance.rank;
  targetAlliance.rank = tempRank;

  draftAlliances[currentAlliance.tag].rank = currentAlliance.rank;
  draftAlliances[targetAlliance.tag].rank = targetAlliance.rank;

  saveDraftToStorage();
  renderStandingsHierarchy();
  updateAllianceProposalUI();
}

export function setAllianceCustomColor(tag, newHexColor) {
  if (!isAlliancePlannerActive || !draftAlliances[tag]) return;
  draftAlliances[tag].color = newHexColor;
  saveDraftToStorage();
  renderStandingsHierarchy();
  updateAllianceProposalUI();
}

export function toggleNAPStatus(tag) {
  if (!isAlliancePlannerActive || !draftAlliances[tag]) return;
  draftAlliances[tag].is_nap = !draftAlliances[tag].is_nap;

  saveDraftToStorage();
  renderStandingsHierarchy();
  updateAllianceProposalUI();
}

export function unlinkAcademy(parentTag, academyTag) {
  if (!isAlliancePlannerActive) return;

  if (draftAlliances[parentTag]) {
    draftAlliances[parentTag].academies = (draftAlliances[parentTag].academies || []).filter(
      (a) => a !== academyTag,
    );
  }

  if (draftAlliances[academyTag]) {
    draftAlliances[academyTag].parent_tag = null;
    draftAlliances[academyTag].type = 'main';
  }

  saveDraftToStorage();
  renderStandingsHierarchy();
  updateAllianceProposalUI();
}

export function linkAcademyPrompt(parentTag) {
  if (!isAlliancePlannerActive) return;

  const availableAcademies = Object.values(draftAlliances).filter(
    (a) => a.tag !== parentTag && !a.parent_tag,
  );

  const promptOptions = availableAcademies.map((a) => `[${a.tag}]`).join(', ');
  const selectedInput = prompt(
    `${ta('academy_prompt', { tag: parentTag })}\n${
      promptOptions ? ta('academy_available', { tags: promptOptions }) : ta('academy_new')
    }`,
  );
  if (!selectedInput) return;

  // Preserve exact case (only strip brackets/@)
  const cleanTag = selectedInput.trim().replace(/[@\[\]]/g, '');
  if (!cleanTag || cleanTag === parentTag) return;

  // If academy tag doesn't exist yet, create it as an unranked academy
  if (!draftAlliances[cleanTag]) {
    draftAlliances[cleanTag] = {
      tag: cleanTag,
      name: cleanTag,
      rank: null,
      type: 'academy',
      parent_tag: parentTag,
      academies: [],
      is_nap: true,
      color: '#718096',
    };
  } else {
    draftAlliances[cleanTag].type = 'academy';
    draftAlliances[cleanTag].parent_tag = parentTag;
  }

  if (!draftAlliances[parentTag].academies) draftAlliances[parentTag].academies = [];
  if (!draftAlliances[parentTag].academies.includes(cleanTag)) {
    draftAlliances[parentTag].academies.push(cleanTag);
  }

  saveDraftToStorage();
  renderStandingsHierarchy();
  updateAllianceProposalUI();
}

export function addContender(tag, name) {
  if (!isAlliancePlannerActive) return;

  // Strictly preserve original case (e.g., RÂVN, RâvN, râvn, HeKi)
  const cleanTag = tag.trim().replace(/[@\[\]]/g, '');
  const cleanName = name.trim() || cleanTag;

  if (!cleanTag) return;

  // Exact case-sensitive check ONLY so RÂVN and RâvN never conflict
  if (draftAlliances[cleanTag]) {
    alert(ta('already_exists', { tag: cleanTag }));
    return;
  }

  const ladder = getSortedLadder(draftAlliances).filter((a) => a.rank !== null);
  const nextRank = ladder.length > 0 ? ladder[ladder.length - 1].rank + 1 : 1;

  draftAlliances[cleanTag] = {
    tag: cleanTag,
    name: cleanName,
    rank: nextRank,
    type: 'main',
    parent_tag: null,
    academies: [],
    is_nap: true,
    color: resolveAllianceColor(cleanTag, null, nextRank),
  };

  saveDraftToStorage();
  renderStandingsHierarchy();
  updateAllianceProposalUI();
}

export function removeContender(tag) {
  if (!isAlliancePlannerActive || !draftAlliances[tag]) return;

  // Also clean up any parent's academy references to this tag
  Object.values(draftAlliances).forEach((ally) => {
    if (Array.isArray(ally.academies)) {
      ally.academies = ally.academies.filter((a) => a !== tag);
    }
    if (ally.parent_tag === tag) {
      ally.parent_tag = null;
      ally.type = 'main';
    }
  });

  delete draftAlliances[tag];

  // Re-normalize sequential ranks for remaining ranked alliances
  const ladder = getSortedLadder(draftAlliances).filter((a) => a.rank !== null);
  ladder.forEach((item, index) => {
    item.rank = index + 1;
    draftAlliances[item.tag].rank = item.rank;
  });

  saveDraftToStorage();
  renderStandingsHierarchy();
  updateAllianceProposalUI();
}

// ============================================================================
// 4. BLACKLIST MUTATIONS
// ============================================================================

/** Adds a name to the draft blacklist. Returns 'added', 'duplicate', 'empty' or 'inactive'. */
export function addBlacklistEntry(type, target) {
  if (!isBlacklistEditing) return 'inactive';
  const clean = String(target)
    .trim()
    .replace(/[@\[\]]/g, '');
  if (!clean) return 'empty';

  draftBlacklist = normaliseBlacklist(draftBlacklist, originalBlacklist);
  const list = type === 'players' ? draftBlacklist.players : draftBlacklist.alliances;
  if (list.some((x) => x.toLowerCase() === clean.toLowerCase())) return 'duplicate';

  list.push(clean);
  saveBlacklistDraft();
  renderBlacklist();
  updateAllianceProposalUI();
  return 'added';
}

/** A message under the blacklist, so adding/removing never happens silently. */
function showBlacklistStatus(html, kind = 'info') {
  const section = document.querySelector('.blacklist-section');
  if (!section) return;
  let el = document.getElementById('blacklist-status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'blacklist-status';
    el.setAttribute('role', 'status');
    section.after(el);
  }
  el.className = `blacklist-status ${kind}`;
  el.innerHTML = `<span>${html}</span>`;
}

/** Runs an add from one of the blacklist boxes and reports the result. */
function addFromInput(type, inputId) {
  const input = document.getElementById(inputId);
  if (!input || !input.value.trim()) return;
  const label =
    type === 'players' ? input.value.trim() : `[${input.value.trim().replace(/[[\]]/g, '')}]`;
  try {
    const result = addBlacklistEntry(type, input.value);
    if (result === 'added') {
      input.value = '';
      showBlacklistStatus(
        tbh('added', { name: bold(label), submit: bold(tb('submit')) }),
        'success',
      );
    } else if (result === 'duplicate') {
      showBlacklistStatus(tbh('duplicate', { name: bold(label) }), 'warning');
    } else if (result === 'inactive') {
      showBlacklistStatus(tbh('press_edit', { edit: bold(tb('edit')) }), 'warning');
    }
  } catch (err) {
    console.error('Blacklist add failed:', err);
    showBlacklistStatus(tbh('add_failed', { name: bold(label) }, { error: err.message }), 'error');
  }
}

export function removeBlacklistEntry(type, index) {
  if (!isBlacklistEditing) return;
  draftBlacklist = normaliseBlacklist(draftBlacklist, originalBlacklist);
  const list = type === 'players' ? draftBlacklist.players : draftBlacklist.alliances;
  if (index >= 0 && index < list.length) {
    const [removed] = list.splice(index, 1);
    saveBlacklistDraft();
    renderBlacklist();
    updateAllianceProposalUI();
    const label = type === 'players' ? removed : `[${removed}]`;
    showBlacklistStatus(
      tbh('removed', { name: bold(label), submit: bold(tb('submit')) }),
      'success',
    );
  }
}

// ============================================================================
// 5. RENDERING & UI UPDATES
// ============================================================================

export function renderStandingsHierarchy() {
  const container = document.getElementById('alliance-hierarchy-list');
  if (!container) return;

  const countBadge = document.getElementById('alliance-total-count');
  if (liveState !== 'ok') {
    container.innerHTML = `<div class="blacklist-empty">${esc(ta(liveState === 'failed' ? 'standings_failed' : 'loading_standings'))}</div>`;
    if (countBadge) countBadge.textContent = '…';
    return;
  }
  const activeAlliances = isAlliancePlannerActive ? draftAlliances : originalAlliances;
  // The ladder lists NAP alliances only; planner mode shows every alliance, so one can be
  // granted NAP (or have it revoked) and still be found in the list.
  const ladder = getSortedLadder(activeAlliances).filter(
    (alliance) => isAlliancePlannerActive || alliance.is_nap,
  );

  const totalNap = Object.values(activeAlliances).filter((a) => a.is_nap).length;
  if (countBadge) countBadge.textContent = ta('nap_alliances', { n: totalNap });

  const playerAlliance = (localStorage.getItem('auth-alliance') || '').trim();

  container.innerHTML = ladder
    .map((alliance, index) => {
      const isRanked = alliance.rank !== null && alliance.rank !== undefined;
      const isTop3 = isRanked && alliance.rank <= 3;
      const rankTier = isTop3
        ? alliance.rank === 1
          ? 'rank-gold'
          : alliance.rank === 2
            ? 'rank-silver'
            : 'rank-bronze'
        : '';
      const isSelf = playerAlliance && alliance.tag === playerAlliance;
      const displayColor = resolveAllianceColor(alliance.tag, alliance.color, alliance.rank);

      const academyPills = (alliance.academies || [])
        .map(
          (acadTag) => `
      <span class="academy-pill" title="${esc(ta('protected_academy'))}">
        🎓 [${esc(acadTag)}]
        ${isAlliancePlannerActive ? `<button type="button" class="btn-unlink-acad" data-action="unlink-acad" data-parent="${esc(alliance.tag)}" data-acad="${esc(acadTag)}">&times;</button>` : ''}
      </span>
    `,
        )
        .join('');

      return `
      <div class="alliance-ladder-row ${rankTier} ${isSelf ? 'highlight-alliance' : ''}" data-tag="${esc(alliance.tag)}">
        <div class="ladder-rank-col">
          <span class="ladder-rank-badge ${rankTier}">
            ${isRanked ? `#${esc(alliance.rank)}` : '--'}
          </span>
          ${
            isAlliancePlannerActive && isRanked
              ? `
            <div class="ladder-steppers">
              <button type="button" class="ladder-step-btn" data-action="rank-up" data-tag="${esc(alliance.tag)}" ${index === 0 ? 'disabled' : ''}>▲</button>
              <button type="button" class="ladder-step-btn" data-action="rank-down" data-tag="${esc(alliance.tag)}">▼</button>
            </div>
          `
              : ''
          }
        </div>

        <div class="ladder-identity-col">
          <div class="ladder-primary-line">
            ${
              isAlliancePlannerActive
                ? `
              <input
                type="color"
                class="alliance-color-picker"
                data-action="pick-color"
                data-tag="${esc(alliance.tag)}"
                value="${esc(displayColor.startsWith('#') ? displayColor : '#b8975a')}"
                title="${esc(ta('change_color', { tag: alliance.tag }))}"
              />
            `
                : `
              <span class="alliance-color-indicator" style="background-color: ${esc(displayColor)}"></span>
            `
            }
            <strong class="ladder-tag" style="color: ${esc(displayColor)}">[${esc(alliance.tag)}]</strong>
            <span class="ladder-name">${esc(alliance.name)}</span>
            ${alliance.parent_tag ? `<span class="academy-child-badge">${esc(ta('academy_of', { tag: alliance.parent_tag }))}</span>` : ''}
          </div>

          <div class="ladder-sub-line">
            ${academyPills}
            ${
              isAlliancePlannerActive && !alliance.parent_tag
                ? `
              <button type="button" class="btn-link-acad-prompt" data-action="link-acad-prompt" data-parent="${esc(alliance.tag)}">${esc(ta('link_academy'))}</button>
            `
                : ''
            }
          </div>
        </div>

        <div class="ladder-status-col">
          <span class="nap-badge ${alliance.is_nap ? 'nap-active' : 'nap-inactive'}">
            ${esc(ta(alliance.is_nap ? 'nap_protected' : 'external'))}
          </span>
          ${
            isAlliancePlannerActive
              ? `
            <button type="button" class="btn-nap-toggle" data-action="toggle-nap" data-tag="${esc(alliance.tag)}">
              ${esc(ta(alliance.is_nap ? 'revoke_nap' : 'grant_nap'))}
            </button>
            <button type="button" class="btn-ladder-del" data-action="del-alliance" data-tag="${esc(alliance.tag)}" title="${esc(ta('remove_alliance'))}">&times;</button>
          `
              : ''
          }
        </div>
      </div>
    `;
    })
    .join('');
}

export function renderBlacklist() {
  const playersContainer = document.getElementById('blacklist-players-container');
  const alliancesContainer = document.getElementById('blacklist-alliances-container');
  const playerCountBadge = document.getElementById('blacklist-player-count');
  const allianceCountBadge = document.getElementById('blacklist-alliance-count');

  const activeBlacklist = isBlacklistEditing ? draftBlacklist : originalBlacklist;

  if (playerCountBadge) playerCountBadge.textContent = activeBlacklist.players.length;
  if (allianceCountBadge) allianceCountBadge.textContent = activeBlacklist.alliances.length;

  if (liveState !== 'ok') {
    const text = esc(tb(liveState === 'failed' ? 'failed' : 'loading'));
    for (const el of [playersContainer, alliancesContainer]) {
      if (el) el.innerHTML = `<div class="blacklist-empty">${text}</div>`;
    }
    for (const el of [playerCountBadge, allianceCountBadge]) {
      if (el) el.textContent = '…';
    }
    return;
  }

  if (playersContainer) {
    if (activeBlacklist.players.length === 0) {
      playersContainer.innerHTML = `<div class="blacklist-empty">${esc(tb('no_players'))}</div>`;
    } else {
      playersContainer.innerHTML = activeBlacklist.players
        .map(
          (player, idx) => `
        <div class="blacklist-item">
          <span class="blacklist-ign">${esc(player)}</span>
          ${isBlacklistEditing ? `<button type="button" class="btn-blacklist-del" data-action="del-blacklist" data-type="players" data-index="${idx}">&times;</button>` : ''}
        </div>
      `,
        )
        .join('');
    }
  }

  if (alliancesContainer) {
    if (activeBlacklist.alliances.length === 0) {
      alliancesContainer.innerHTML = `<div class="blacklist-empty">${esc(tb('no_alliances'))}</div>`;
    } else {
      alliancesContainer.innerHTML = activeBlacklist.alliances
        .map(
          (ally, idx) => `
        <div class="blacklist-item">
          <span class="blacklist-ign">[${esc(ally)}]</span>
          ${isBlacklistEditing ? `<button type="button" class="btn-blacklist-del" data-action="del-blacklist" data-type="alliances" data-index="${idx}">&times;</button>` : ''}
        </div>
      `,
        )
        .join('');
    }
  }
}

// ============================================================================
// 6. DIFF ENGINE & PROPOSAL SUBMISSION
// ============================================================================

/** Changes to the standings (ranks, NAP, academies, colours, added/removed alliances). */
export function calculateStandingsDiff() {
  const diff = [];

  Object.entries(draftAlliances).forEach(([tag, draft]) => {
    const orig = originalAlliances[tag];
    if (!orig) {
      diff.push({ type: 'added', tag, name: draft.name, rank: draft.rank });
      return;
    }

    if (orig.rank !== draft.rank) {
      diff.push({ type: 'rank', tag, from: orig.rank || 'Unranked', to: draft.rank || 'Unranked' });
    }

    if (orig.parent_tag !== draft.parent_tag) {
      diff.push({ type: 'academy', tag, parent: draft.parent_tag || 'Independent' });
    }

    if (orig.is_nap !== draft.is_nap) {
      diff.push({ type: 'nap', tag, status: draft.is_nap ? 'Protected' : 'Revoked' });
    }

    if (orig.color !== draft.color) {
      diff.push({ type: 'color', tag, from: orig.color, to: draft.color });
    }
  });

  Object.keys(originalAlliances).forEach((origTag) => {
    if (!draftAlliances[origTag]) {
      diff.push({ type: 'removed', tag: origTag });
    }
  });

  return diff;
}

/** Changes to the blacklist, as add/remove operations. */
export function calculateBlacklistDiff() {
  const diff = [];
  const origPlayers = originalBlacklist.players || [];
  const draftPlayers = draftBlacklist.players || [];
  draftPlayers.forEach((p) => {
    if (!origPlayers.includes(p))
      diff.push({ type: 'blacklist', action: 'add', target: p, category: 'players' });
  });
  origPlayers.forEach((p) => {
    if (!draftPlayers.includes(p))
      diff.push({ type: 'blacklist', action: 'remove', target: p, category: 'players' });
  });

  const origAllies = originalBlacklist.alliances || [];
  const draftAllies = draftBlacklist.alliances || [];
  draftAllies.forEach((a) => {
    if (!origAllies.includes(a))
      diff.push({ type: 'blacklist', action: 'add', target: a, category: 'alliances' });
  });
  origAllies.forEach((a) => {
    if (!draftAllies.includes(a))
      diff.push({ type: 'blacklist', action: 'remove', target: a, category: 'alliances' });
  });

  return diff;
}

/**
 * The blacklist's own Edit / Submit buttons, next to the blacklist (bottom of the page). Edit
 * Blacklist is its own mode, separate from Planner Mode at the top; Submit sends the blacklist
 * changes as their own "NAP Blacklist Proposal" (the top Submit Plan sends the standings only).
 */
function ensureBlacklistControls() {
  const section = document.querySelector('.blacklist-section');
  if (!section) return;
  // A bar left in Turbo's back-button copy of the page has no listeners: replace it.
  document.getElementById('blacklist-controls')?.remove();
  const bar = document.createElement('div');
  bar.id = 'blacklist-controls';
  bar.className = 'blacklist-controls';
  bar.innerHTML = `
    <button id="btn-edit-blacklist" class="draft-btn" aria-pressed="false" type="button">
      <span class="draft-indicator"></span>
      <span class="draft-text">${esc(tb('edit'))}</span>
    </button>
    <button id="btn-submit-blacklist" class="submit-plan-btn" disabled type="button">
      ${esc(tb('submit'))} <span class="badge">0</span>
    </button>`;
  section.before(bar);
  bar
    .querySelector('#btn-edit-blacklist')
    .addEventListener('click', () => toggleBlacklistEditing(!isBlacklistEditing));
  bar
    .querySelector('#btn-submit-blacklist')
    .addEventListener('click', () => submitBlacklistProposal());
  syncBlacklistControls();
}

function syncBlacklistControls(count = 0) {
  const edit = document.getElementById('btn-edit-blacklist');
  const submit = document.getElementById('btn-submit-blacklist');
  if (edit) {
    edit.setAttribute('aria-pressed', isBlacklistEditing ? 'true' : 'false');
    edit.classList.toggle('active', isBlacklistEditing);
    edit.querySelector('.draft-text').textContent = tb(
      isBlacklistEditing ? 'stop_editing' : 'edit',
    );
  }
  if (submit) {
    submit.disabled = !isBlacklistEditing || count === 0;
    submit.querySelector('.badge').textContent = String(count);
  }
}

export function updateAllianceProposalUI() {
  const submitBtn = document.getElementById('btn-submit-alliance');
  const badgeEl = document.getElementById('alliance-change-badge');
  syncBlacklistControls(isBlacklistEditing ? calculateBlacklistDiff().length : 0);

  // Submit Plan stays in the bar, greyed out until there is something to send
  if (!isAlliancePlannerActive) {
    if (submitBtn) submitBtn.disabled = true;
    if (badgeEl) badgeEl.textContent = '0';
    return;
  }

  // The top Submit Plan sends the standings; the blacklist has its own Submit.
  const count = calculateStandingsDiff().length;

  if (badgeEl) badgeEl.textContent = String(count);

  if (submitBtn) submitBtn.disabled = count === 0;
}

export function toggleAlliancePlanner(active) {
  // Never plan from an empty page: a plan made before the live standings load would
  // propose replacing them with almost nothing.
  if (active && liveState !== 'ok') return;
  isAlliancePlannerActive = active;

  const btnDraft = document.getElementById('btn-toggle-alliance-planner');
  if (btnDraft) {
    btnDraft.setAttribute('aria-pressed', active ? 'true' : 'false');
    btnDraft.classList.toggle('active', active);
  }

  const container = document.getElementById('alliance-container');
  const addAllianceBox = document.getElementById('planner-add-alliance-container');
  if (container) container.classList.toggle('planner-active', active);
  if (addAllianceBox) addAllianceBox.classList.toggle('hidden', !active);

  if (!active) {
    try {
      localStorage.removeItem(ALLIANCE_DRAFT_KEY);
    } catch (e) {}
    draftAlliances = JSON.parse(JSON.stringify(originalAlliances));
  } else {
    saveDraftToStorage();
  }

  renderStandingsHierarchy();
  updateAllianceProposalUI();
}

/** Edit Blacklist on or off. Off drops unsent blacklist changes (like Planner Mode). */
export function toggleBlacklistEditing(active) {
  if (active && liveState !== 'ok') return; // only edit once the live blacklist is loaded
  isBlacklistEditing = active;
  showBlacklistEditors(active);
  if (!active) {
    try {
      localStorage.removeItem(BLACKLIST_DRAFT_KEY);
    } catch (e) {}
    draftBlacklist = JSON.parse(JSON.stringify(originalBlacklist));
  } else {
    saveBlacklistDraft();
  }
  renderBlacklist();
  updateAllianceProposalUI();
}

export async function submitAllianceProposal() {
  if (!isAlliancePlannerActive) return;

  const diff = calculateStandingsDiff();
  if (diff.length === 0) {
    alert(ta('no_changes'));
    return;
  }

  // Standings only: blacklist changes go in their own proposal (submitBlacklistProposal).
  const payload = {
    type: 'alliance',
    timestamp: new Date().toISOString(),
    alliances: draftAlliances,
    diff: diff,
  };

  const diffHtml = diff
    .map((d) => {
      // Text in the page's language; tags, ranks and colours as HTML in their placeholders.
      const tag = `<strong>[${esc(d.tag)}]</strong>`;
      const code = (v) => `<code>${esc(v)}</code>`;
      const line = (key, html, vars) => window.th(`alliance_planner.${key}`, html, vars);
      if (d.type === 'rank')
        return `<div>• ${line('diff_rank', { tag, from: code(`#${d.from}`), to: code(`#${d.to}`) })}</div>`;
      if (d.type === 'academy')
        return `<div>• ${line('diff_academy', { tag, parent: `<strong>[${esc(d.parent)}]</strong>` })}</div>`;
      if (d.type === 'nap')
        return `<div>• ${line('diff_nap', { tag, status: code(ta(d.status === 'Protected' ? 'nap_status_protected' : 'nap_status_revoked')) })}</div>`;
      if (d.type === 'color')
        return `<div>• 🎨 ${line('diff_color', { tag, color: code(d.to) })}</div>`;
      if (d.type === 'blacklist')
        return `<div>• ⚠️ <strong>Blacklist ${esc(d.action.toUpperCase())}</strong>: [${esc(d.target)}] (${esc(d.category)})</div>`;
      if (d.type === 'added')
        return `<div>• ➕ ${line('diff_added', { added: bold(ta('added_tag', { tag: d.tag })) }, { rank: d.rank, name: d.name })}</div>`;
      if (d.type === 'removed')
        return `<div>• ➖ ${line('diff_removed', { removed: bold(ta('removed_tag', { tag: d.tag })) })}</div>`;
      return `<div>• ${esc(ta('diff_modified', { tag: d.tag || ta('unknown') }))}</div>`;
    })
    .join('');

  submitProposalWithAuth({
    type: 'alliance',
    title: ta('proposal_title'),
    payload: payload,
    diffSummaryHtml: `<div class="diff-list">${diffHtml}</div>`,
    onSuccess: () => {
      originalAlliances = JSON.parse(JSON.stringify(draftAlliances));
      toggleAlliancePlanner(false);
    },
  });
}

/** Sends the blacklist changes as their own proposal ("NAP Blacklist Proposal" in Discord). */
export async function submitBlacklistProposal() {
  if (!isBlacklistEditing) return;

  const diff = calculateBlacklistDiff();
  if (diff.length === 0) {
    showBlacklistStatus(esc(tb('no_changes')), 'warning');
    return;
  }

  const diffHtml = diff
    .map((d) => {
      const label = bold(d.category === 'alliances' ? `[${d.target}]` : d.target);
      const what = tb(d.category === 'alliances' ? 'what_alliance' : 'what_player');
      return d.action === 'add'
        ? `<div>• ⚠️ ${tbh('diff_add', { add: bold(tb('add_word')), name: label }, { what })}</div>`
        : `<div>• ✅ ${tbh('diff_remove', { remove: bold(tb('remove_word')), name: label }, { what })}</div>`;
    })
    .join('');

  submitProposalWithAuth({
    type: 'blacklist',
    title: tb('proposal_title'),
    payload: { type: 'blacklist', timestamp: new Date().toISOString(), diff },
    diffSummaryHtml: `<div class="diff-list">${diffHtml}</div>`,
    onSuccess: () => {
      originalBlacklist = JSON.parse(JSON.stringify(draftBlacklist));
      toggleBlacklistEditing(false);
      showBlacklistStatus(esc(tb('sent')), 'success');
    },
  });
}

// ============================================================================
// 7. EVENT DELEGATION & MOUNT
// ============================================================================

// Runs on every page's turbo:load. Sets up the alliance page only where it is shown, once per
// visit: each visit (also the back button's copy of the page) brings a fresh container.
const startedAlliancePages = new WeakSet();
export function bindAllianceControls() {
  const container = document.getElementById('alliance-container');
  if (!container || startedAlliancePages.has(container)) return;
  startedAlliancePages.add(container);
  // A fresh container can be Turbo's back-button copy of the page, which keeps the data-bound
  // marks of the controls wired up last time. Clear them so the controls are wired up again.
  // The blacklist controls are in their own section of the page, outside the container.
  for (const area of [container, document.querySelector('.blacklist-section')]) {
    area?.querySelectorAll('[data-bound]').forEach((el) => el.removeAttribute('data-bound'));
  }
  // A blacklist message left in that copy of the page belongs to the previous visit.
  document.getElementById('blacklist-status')?.remove();
  ensureBlacklistControls();

  initBootstrapData();

  // Strip any lingering inline uppercase transform on #input-new-tag
  const tagInputEl = document.getElementById('input-new-tag');
  if (tagInputEl) {
    tagInputEl.style.textTransform = 'none';
  }

  const btnPlanner = document.getElementById('btn-toggle-alliance-planner');
  if (btnPlanner && !btnPlanner.dataset.bound) {
    btnPlanner.dataset.bound = 'true';
    btnPlanner.addEventListener('click', () => toggleAlliancePlanner(!isAlliancePlannerActive));
  }

  const btnSubmit = document.getElementById('btn-submit-alliance');
  if (btnSubmit && !btnSubmit.dataset.bound) {
    btnSubmit.dataset.bound = 'true';
    btnSubmit.addEventListener('click', () => submitAllianceProposal());
  }

  const hierarchyList = document.getElementById('alliance-hierarchy-list');
  if (hierarchyList && !hierarchyList.dataset.bound) {
    hierarchyList.dataset.bound = 'true';

    hierarchyList.addEventListener('click', (e) => {
      if (!isAlliancePlannerActive) return;

      const upBtn = e.target.closest('[data-action="rank-up"]');
      if (upBtn) {
        moveAllianceRank(upBtn.dataset.tag, 'up');
        return;
      }

      const downBtn = e.target.closest('[data-action="rank-down"]');
      if (downBtn) {
        moveAllianceRank(downBtn.dataset.tag, 'down');
        return;
      }

      const unlinkBtn = e.target.closest('[data-action="unlink-acad"]');
      if (unlinkBtn) {
        unlinkAcademy(unlinkBtn.dataset.parent, unlinkBtn.dataset.acad);
        return;
      }

      const linkPromptBtn = e.target.closest('[data-action="link-acad-prompt"]');
      if (linkPromptBtn) {
        linkAcademyPrompt(linkPromptBtn.dataset.parent);
        return;
      }

      const napToggleBtn = e.target.closest('[data-action="toggle-nap"]');
      if (napToggleBtn) {
        toggleNAPStatus(napToggleBtn.dataset.tag);
        return;
      }

      const delAllianceBtn = e.target.closest('[data-action="del-alliance"]');
      if (delAllianceBtn) {
        removeContender(delAllianceBtn.dataset.tag);
        return;
      }
    });

    hierarchyList.addEventListener('change', (e) => {
      if (!isAlliancePlannerActive) return;
      const colorInput = e.target.closest('[data-action="pick-color"]');
      if (colorInput) {
        setAllianceCustomColor(colorInput.dataset.tag, colorInput.value);
      }
    });
  }

  const btnAddAlliance = document.getElementById('btn-add-alliance');
  if (btnAddAlliance && !btnAddAlliance.dataset.bound) {
    btnAddAlliance.dataset.bound = 'true';
    btnAddAlliance.addEventListener('click', () => {
      const tagInput = document.getElementById('input-new-tag');
      const nameInput = document.getElementById('input-new-name');
      if (tagInput && nameInput) {
        addContender(tagInput.value, nameInput.value);
        tagInput.value = '';
        nameInput.value = '';
      }
    });
  }

  const btnAddPlayer = document.getElementById('btn-add-blacklist-player');
  if (btnAddPlayer && !btnAddPlayer.dataset.bound) {
    btnAddPlayer.dataset.bound = 'true';
    btnAddPlayer.addEventListener('click', () => addFromInput('players', 'input-new-player'));
  }

  const btnAddBlacklistAlly = document.getElementById('btn-add-blacklist-alliance');
  if (btnAddBlacklistAlly && !btnAddBlacklistAlly.dataset.bound) {
    btnAddBlacklistAlly.dataset.bound = 'true';
    btnAddBlacklistAlly.addEventListener('click', () =>
      addFromInput('alliances', 'input-new-blacklist-alliance'),
    );
  }

  // Enter (or "Go" on a phone keyboard) in a blacklist box adds the entry, like "+ Add".
  for (const [inputId, type] of [
    ['input-new-player', 'players'],
    ['input-new-blacklist-alliance', 'alliances'],
  ]) {
    const input = document.getElementById(inputId);
    if (input && !input.dataset.bound) {
      input.dataset.bound = 'true';
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addFromInput(type, inputId);
        }
      });
    }
  }

  document.querySelectorAll('.blacklist-card-list').forEach((list) => {
    if (list.dataset.bound) return;
    list.dataset.bound = 'true';
    list.addEventListener('click', (e) => {
      if (!isBlacklistEditing) return;
      const delBtn = e.target.closest('[data-action="del-blacklist"]');
      if (delBtn) {
        removeBlacklistEntry(delBtn.dataset.type, parseInt(delBtn.dataset.index, 10));
      }
    });
  });

  renderStandingsHierarchy();
  renderBlacklist();

  fetchLiveAllianceState().then(() => {
    // A saved plan only makes sense next to the live data it was made from.
    if (liveState === 'ok') checkAndRestoreAllianceDraft();
  });
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bindAllianceControls);
  } else {
    bindAllianceControls();
  }
  document.addEventListener('turbo:load', bindAllianceControls);
}
