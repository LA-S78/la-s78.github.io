/**
 * js/alliance.js - Dynamic NAP Diplomacy, Standings Ladder & Blacklist Engine
 */

import { submitProposalWithAuth } from './auth-modal.js';

const ALLIANCE_DRAFT_KEY = 'la_alliance_planner_draft';

export let isAlliancePlannerActive = false;
export let originalAlliances = {};
export let originalBlacklist = { players: [], alliances: [] };
export let draftAlliances = {};
export let draftBlacklist = { players: [], alliances: [] };

// ============================================================================
// 1. DATA INITIALIZATION & LIVE SYNC
// ============================================================================

export function initBootstrapData() {
  const mapData = window.MAP_STATE || {};
  const diplomacyData = window.DIPLOMACY_DATA || {};

  const rawAlliances = mapData.alliances || {};
  originalAlliances = {};

  Object.entries(rawAlliances).forEach(([tag, data]) => {
    // Preserve exact original case tag instead of forcing toUpperCase()
    const cleanTag = tag.trim();
    originalAlliances[cleanTag] = {
      tag: cleanTag,
      name: data.name || cleanTag,
      rank: typeof data.rank === 'number' ? data.rank : (parseInt(data.rank, 10) || null),
      type: data.type || (data.parent_tag ? 'academy' : 'main'),
      // Preserve exact case for parent links as well
      parent_tag: data.parent_tag ? data.parent_tag.trim() : null,
      academies: Array.isArray(data.academies) ? data.academies.map(a => a.trim()) : [],
      is_nap: data.is_nap !== undefined ? Boolean(data.is_nap) : true,
      color: data.color || '#b8975a'
    };
  });

  // Reconcile academies from diplomacy.yml
  if (Array.isArray(diplomacyData.nap_academies)) {
    diplomacyData.nap_academies.forEach(acad => {
      const acadTag = (acad.name || '').trim();
      const parentTag = (acad.parent || '').trim();
      if (acadTag && parentTag) {
        if (!originalAlliances[acadTag]) {
          originalAlliances[acadTag] = {
            tag: acadTag,
            name: acad.name,
            rank: null,
            type: 'academy',
            parent_tag: parentTag,
            academies: [],
            is_nap: true,
            color: '#718096'
          };
        } else {
          originalAlliances[acadTag].type = 'academy';
          originalAlliances[acadTag].parent_tag = parentTag;
        }

        if (originalAlliances[parentTag]) {
          if (!originalAlliances[parentTag].academies.includes(acadTag)) {
            originalAlliances[parentTag].academies.push(acadTag);
          }
        }
      }
    });
  }

  originalBlacklist = {
    players: diplomacyData.blacklist_players || [],
    alliances: diplomacyData.blacklist_alliances || []
  };

  draftAlliances = JSON.parse(JSON.stringify(originalAlliances));
  draftBlacklist = JSON.parse(JSON.stringify(originalBlacklist));
}

function saveDraftToStorage() {
  if (!isAlliancePlannerActive) return;
  try {
    const bundle = {
      alliances: draftAlliances,
      blacklist: draftBlacklist
    };
    localStorage.setItem(ALLIANCE_DRAFT_KEY, JSON.stringify(bundle));
  } catch (e) {}
}

export function checkAndRestoreAllianceDraft() {
  let saved = null;
  try {
    saved = localStorage.getItem(ALLIANCE_DRAFT_KEY);
  } catch (e) {}

  if (!saved) return false;

  try {
    const parsed = JSON.parse(saved);
    if (parsed && parsed.alliances) {
      isAlliancePlannerActive = true;
      draftAlliances = parsed.alliances;
      draftBlacklist = parsed.blacklist || { players: [], alliances: [] };

      const btnDraft = document.getElementById('btn-toggle-alliance-planner');
      if (btnDraft) {
        btnDraft.setAttribute('aria-pressed', 'true');
        btnDraft.classList.add('active');
      }

      const container = document.getElementById('alliance-container');
      const addAllianceBox = document.getElementById('planner-add-alliance-container');
      const addPlayerBox = document.getElementById('planner-add-player-box');
      const addBlacklistAllianceBox = document.getElementById('planner-add-blacklist-alliance-box');

      if (container) container.classList.add('planner-active');
      if (addAllianceBox) addAllianceBox.classList.remove('hidden');
      if (addPlayerBox) addPlayerBox.classList.remove('hidden');
      if (addBlacklistAllianceBox) addBlacklistAllianceBox.classList.remove('hidden');

      renderStandingsHierarchy();
      renderBlacklist();
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
      fetch('/api/colors', { cache: 'no-store' })
    ]);

    let liveColors = {};
    if (colorsRes.ok) {
      liveColors = await colorsRes.json();
    }

    if (stateRes.ok) {
      const data = await stateRes.json();
      if (data.alliances && typeof data.alliances === 'object') {
        originalAlliances = data.alliances;
        
        // Merge Discord hex colors
        Object.entries(liveColors).forEach(([tag, color]) => {
          if (originalAlliances[tag]) {
            originalAlliances[tag].color = color;
          }
        });
      }
      if (data.blacklist) {
        originalBlacklist = data.blacklist;
      }

      if (!isAlliancePlannerActive) {
        draftAlliances = JSON.parse(JSON.stringify(originalAlliances));
        draftBlacklist = JSON.parse(JSON.stringify(originalBlacklist));
        renderStandingsHierarchy();
        renderBlacklist();
      }
    }
  } catch (err) {
    console.warn('Could not fetch live alliance state, utilizing defaults:', err);
  }
}

// ============================================================================
// 2. LADDER REORDERING & MUTATION LOGIC
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

  const ladder = getSortedLadder(draftAlliances).filter(a => a.rank !== null);
  const currentIndex = ladder.findIndex(a => a.tag === tag);
  if (currentIndex === -1) return;

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= ladder.length) return;

  // Swap ranks
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
      a => a !== academyTag
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
    a => a.tag !== parentTag && !a.parent_tag && a.type !== 'academy'
  );

  if (availableAcademies.length === 0) {
    alert('No unlinked alliances available to assign as an academy.');
    return;
  }

  const promptOptions = availableAcademies.map(a => `[${a.tag}]`).join(', ');
  const selectedTag = prompt(`Enter alliance tag to link under [${parentTag}]:\nAvailable: ${promptOptions}`);
  if (!selectedTag) return;

  // Preserve exact case (strip only brackets/whitespace)
  const cleanTag = selectedTag.trim().replace(/[@\[\]]/g, '');
  if (!draftAlliances[cleanTag]) {
    alert(`Alliance [${cleanTag}] not found.`);
    return;
  }

  draftAlliances[cleanTag].type = 'academy';
  draftAlliances[cleanTag].parent_tag = parentTag;

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
  // Preserve exact case except for stripping decoration brackets
  const cleanTag = tag.trim().replace(/[@\[\]]/g, '');
  const cleanName = name.trim() || cleanTag;

  if (!cleanTag) return;
  
  // Case-insensitive check to prevent exact duplicate collisions
  const existingKey = Object.keys(draftAlliances).find(k => k.toLowerCase() === cleanTag.toLowerCase());
  if (existingKey) {
    alert(`Alliance [${existingKey}] already exists.`);
    return;
  }

  const ladder = getSortedLadder(draftAlliances).filter(a => a.rank !== null);
  const nextRank = ladder.length > 0 ? ladder[ladder.length - 1].rank + 1 : 1;

  draftAlliances[cleanTag] = {
    tag: cleanTag,
    name: cleanName,
    rank: nextRank,
    type: 'main',
    parent_tag: null,
    academies: [],
    is_nap: true,
    color: '#b8975a'
  };

  saveDraftToStorage();
  renderStandingsHierarchy();
  updateAllianceProposalUI();
}

export function removeContender(tag) {
  if (!isAlliancePlannerActive || !draftAlliances[tag]) return;

  delete draftAlliances[tag];

  // Re-normalize ranks
  const ladder = getSortedLadder(draftAlliances).filter(a => a.rank !== null);
  ladder.forEach((item, index) => {
    item.rank = index + 1;
    draftAlliances[item.tag].rank = item.rank;
  });

  saveDraftToStorage();
  renderStandingsHierarchy();
  updateAllianceProposalUI();
}

// ============================================================================
// 3. BLACKLIST MUTATIONS
// ============================================================================

export function addBlacklistEntry(type, target) {
  if (!isAlliancePlannerActive) return;
  const clean = target.trim();
  if (!clean) return;

  const list = type === 'players' ? draftBlacklist.players : draftBlacklist.alliances;
  if (list.includes(clean)) return;

  list.push(clean);
  saveDraftToStorage();
  renderBlacklist();
  updateAllianceProposalUI();
}

export function removeBlacklistEntry(type, index) {
  if (!isAlliancePlannerActive) return;
  const list = type === 'players' ? draftBlacklist.players : draftBlacklist.alliances;
  if (index >= 0 && index < list.length) {
    list.splice(index, 1);
    saveDraftToStorage();
    renderBlacklist();
    updateAllianceProposalUI();
  }
}

// ============================================================================
// 4. RENDERING & UI UPDATES
// ============================================================================

export function renderStandingsHierarchy() {
  const container = document.getElementById('alliance-hierarchy-list');
  if (!container) return;

  const countBadge = document.getElementById('alliance-total-count');
  const activeAlliances = isAlliancePlannerActive ? draftAlliances : originalAlliances;
  const ladder = getSortedLadder(activeAlliances);

  const totalNap = Object.values(activeAlliances).filter(a => a.is_nap).length;
  if (countBadge) countBadge.textContent = `${totalNap} NAP Alliances`;

  const playerAlliance = (localStorage.getItem('auth-alliance') || '').toUpperCase();

  container.innerHTML = ladder.map((alliance, index) => {
    const isRanked = alliance.rank !== null && alliance.rank !== undefined;
    const isTop3 = isRanked && alliance.rank <= 3;
    const rankTier = isTop3 ? (alliance.rank === 1 ? 'rank-gold' : alliance.rank === 2 ? 'rank-silver' : 'rank-bronze') : '';
    const isSelf = alliance.tag === playerAlliance;

    // Academy Pills
    const academyPills = (alliance.academies || []).map(acadTag => {
      const acadObj = activeAlliances[acadTag];
      return `
        <span class="academy-pill" title="Protected Academy">
          🎓 [${acadTag}]
          ${isAlliancePlannerActive ? `<button class="btn-unlink-acad" data-action="unlink-acad" data-parent="${alliance.tag}" data-acad="${acadTag}">&times;</button>` : ''}
        </span>
      `;
    }).join('');

    return `
      <div class="alliance-ladder-row ${rankTier} ${isSelf ? 'highlight-alliance' : ''}" data-tag="${alliance.tag}">
        <div class="ladder-rank-col">
          <span class="ladder-rank-badge ${rankTier}">
            ${isRanked ? `#${alliance.rank}` : '--'}
          </span>
          ${isAlliancePlannerActive && isRanked ? `
            <div class="ladder-steppers">
              <button class="ladder-step-btn" data-action="rank-up" data-tag="${alliance.tag}" ${index === 0 ? 'disabled' : ''}>▲</button>
              <button class="ladder-step-btn" data-action="rank-down" data-tag="${alliance.tag}">▼</button>
            </div>
          ` : ''}
        </div>

        <div class="ladder-identity-col">
          <div class="ladder-primary-line">
            <span class="alliance-color-indicator" style="background-color: ${alliance.color || '#b8975a'}"></span>
            <strong class="ladder-tag">[${alliance.tag}]</strong>
            <span class="ladder-name">${alliance.name}</span>
            ${alliance.parent_tag ? `<span class="academy-child-badge">Academy of [${alliance.parent_tag}]</span>` : ''}
          </div>

          <div class="ladder-sub-line">
            ${academyPills}
            ${isAlliancePlannerActive && !alliance.parent_tag ? `
              <button class="btn-link-acad-prompt" data-action="link-acad-prompt" data-parent="${alliance.tag}">+ Link Academy</button>
            ` : ''}
          </div>
        </div>

        <div class="ladder-status-col">
          <span class="nap-badge ${alliance.is_nap ? 'nap-active' : 'nap-inactive'}">
            ${alliance.is_nap ? 'NAP Protected' : 'External'}
          </span>
          ${isAlliancePlannerActive ? `
            <button class="btn-nap-toggle" data-action="toggle-nap" data-tag="${alliance.tag}">
              ${alliance.is_nap ? 'Revoke NAP' : 'Grant NAP'}
            </button>
            <button class="btn-ladder-del" data-action="del-alliance" data-tag="${alliance.tag}" title="Remove Alliance">&times;</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

export function renderBlacklist() {
  const playersContainer = document.getElementById('blacklist-players-container');
  const alliancesContainer = document.getElementById('blacklist-alliances-container');
  const playerCountBadge = document.getElementById('blacklist-player-count');
  const allianceCountBadge = document.getElementById('blacklist-alliance-count');

  const activeBlacklist = isAlliancePlannerActive ? draftBlacklist : originalBlacklist;

  if (playerCountBadge) playerCountBadge.textContent = activeBlacklist.players.length;
  if (allianceCountBadge) allianceCountBadge.textContent = activeBlacklist.alliances.length;

  if (playersContainer) {
    if (activeBlacklist.players.length === 0) {
      playersContainer.innerHTML = '<div class="blacklist-empty">No rogue commanders blacklisted.</div>';
    } else {
      playersContainer.innerHTML = activeBlacklist.players.map((player, idx) => `
        <div class="blacklist-item">
          <span class="blacklist-ign">${player}</span>
          ${isAlliancePlannerActive ? `<button class="btn-blacklist-del" data-action="del-blacklist" data-type="players" data-index="${idx}">&times;</button>` : ''}
        </div>
      `).join('');
    }
  }

  if (alliancesContainer) {
    if (activeBlacklist.alliances.length === 0) {
      alliancesContainer.innerHTML = '<div class="blacklist-empty">No hostile alliances blacklisted.</div>';
    } else {
      alliancesContainer.innerHTML = activeBlacklist.alliances.map((ally, idx) => `
        <div class="blacklist-item">
          <span class="blacklist-ign">[${ally}]</span>
          ${isAlliancePlannerActive ? `<button class="btn-blacklist-del" data-action="del-blacklist" data-type="alliances" data-index="${idx}">&times;</button>` : ''}
        </div>
      `).join('');
    }
  }
}

// ============================================================================
// 5. DIFF ENGINE & PROPOSAL SUBMISSION
// ============================================================================

export function calculateAllianceDiff() {
  const diff = [];

  // 1. Detect Rank Shifts & Academy Shifts
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
  });

  // Removals
  Object.keys(originalAlliances).forEach(origTag => {
    if (!draftAlliances[origTag]) {
      diff.push({ type: 'removed', tag: origTag });
    }
  });

  // 2. Detect Blacklist Deltas
  const origPlayers = originalBlacklist.players || [];
  const draftPlayers = draftBlacklist.players || [];
  draftPlayers.forEach(p => {
    if (!origPlayers.includes(p)) diff.push({ type: 'blacklist', action: 'add', target: p, category: 'players' });
  });
  origPlayers.forEach(p => {
    if (!draftPlayers.includes(p)) diff.push({ type: 'blacklist', action: 'remove', target: p, category: 'players' });
  });

  const origAllies = originalBlacklist.alliances || [];
  const draftAllies = draftBlacklist.alliances || [];
  draftAllies.forEach(a => {
    if (!origAllies.includes(a)) diff.push({ type: 'blacklist', action: 'add', target: a, category: 'alliances' });
  });
  origAllies.forEach(a => {
    if (!draftAllies.includes(a)) diff.push({ type: 'blacklist', action: 'remove', target: a, category: 'alliances' });
  });

  return diff;
}

export function updateAllianceProposalUI() {
  const submitBtn = document.getElementById('btn-submit-alliance');
  const badgeEl = document.getElementById('alliance-change-badge');

  if (!isAlliancePlannerActive) {
    if (submitBtn) { submitBtn.classList.add('hidden'); submitBtn.disabled = true; }
    if (badgeEl) badgeEl.textContent = '0';
    return;
  }

  const diff = calculateAllianceDiff();
  const count = diff.length;

  if (badgeEl) badgeEl.textContent = String(count);

  if (submitBtn) {
    submitBtn.classList.remove('hidden');
    submitBtn.disabled = count === 0;
  }
}

export function toggleAlliancePlanner(active) {
  isAlliancePlannerActive = active;

  const btnDraft = document.getElementById('btn-toggle-alliance-planner');
  if (btnDraft) {
    btnDraft.setAttribute('aria-pressed', active ? 'true' : 'false');
    btnDraft.classList.toggle('active', active);
  }

  const container = document.getElementById('alliance-container');
  const addAllianceBox = document.getElementById('planner-add-alliance-container');
  const addPlayerBox = document.getElementById('planner-add-player-box');
  const addBlacklistAllianceBox = document.getElementById('planner-add-blacklist-alliance-box');

  if (container) container.classList.toggle('planner-active', active);
  if (addAllianceBox) addAllianceBox.classList.toggle('hidden', !active);
  if (addPlayerBox) addPlayerBox.classList.toggle('hidden', !active);
  if (addBlacklistAllianceBox) addBlacklistAllianceBox.classList.toggle('hidden', !active);

  if (!active) {
    try {
      localStorage.removeItem(ALLIANCE_DRAFT_KEY);
    } catch (e) {}
    draftAlliances = JSON.parse(JSON.stringify(originalAlliances));
    draftBlacklist = JSON.parse(JSON.stringify(originalBlacklist));
  } else {
    saveDraftToStorage();
  }

  renderStandingsHierarchy();
  renderBlacklist();
  updateAllianceProposalUI();
}

export async function submitAllianceProposal() {
  if (!isAlliancePlannerActive) return;

  const diff = calculateAllianceDiff();
  if (diff.length === 0) {
    alert('No modifications detected in current standings.');
    return;
  }

  const payload = {
    type: 'alliance',
    timestamp: new Date().toISOString(),
    alliances: draftAlliances,
    blacklist: draftBlacklist,
    diff: diff
  };

  const diffHtml = diff.map(d => {
    if (d.type === 'rank') return `<div>• <strong>[${d.tag}]</strong>: Rank <code>#${d.from}</code> ➔ <code>#${d.to}</code></div>`;
    if (d.type === 'academy') return `<div>• <strong>[${d.tag}]</strong>: Assigned as Academy of <strong>[${d.parent}]</strong></div>`;
    if (d.type === 'nap') return `<div>• <strong>[${d.tag}]</strong>: NAP Status <code>${d.status}</code></div>`;
    if (d.type === 'blacklist') return `<div>• ⚠️ <strong>Blacklist ${d.action.toUpperCase()}</strong>: [${d.target}] (${d.category})</div>`;
    if (d.type === 'added') return `<div>• ➕ <strong>Added [${d.tag}]</strong>: Rank #${d.rank} (${d.name})</div>`;
    if (d.type === 'removed') return `<div>• ➖ <strong>Removed [${d.tag}]</strong> from standings</div>`;
    return `<div>• Modified [${d.tag || 'Unknown'}]</div>`;
  }).join('');

  submitProposalWithAuth({
    type: 'alliance',
    title: '👑 Submit NAP Standings & Diplomacy Proposal',
    payload: payload,
    diffSummaryHtml: `<div class="diff-list">${diffHtml}</div>`,
    onSuccess: () => {
      try {
        localStorage.removeItem(ALLIANCE_DRAFT_KEY);
      } catch (e) {}
      originalAlliances = JSON.parse(JSON.stringify(draftAlliances));
      originalBlacklist = JSON.parse(JSON.stringify(draftBlacklist));
      toggleAlliancePlanner(false);
    }
  });
}

// ============================================================================
// 6. EVENT DELEGATION & MOUNT
// ============================================================================

export function bindAllianceControls() {
  initBootstrapData();

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

  // Hierarchy Click Delegation (Rank Steppers, Unlink, NAP Toggle, Delete)
  const hierarchyList = document.getElementById('alliance-hierarchy-list');
  if (hierarchyList && !hierarchyList.dataset.bound) {
    hierarchyList.dataset.bound = 'true';
    hierarchyList.addEventListener('click', (e) => {
      if (!isAlliancePlannerActive) return;

      const upBtn = e.target.closest('[data-action="rank-up"]');
      if (upBtn) { moveAllianceRank(upBtn.dataset.tag, 'up'); return; }

      const downBtn = e.target.closest('[data-action="rank-down"]');
      if (downBtn) { moveAllianceRank(downBtn.dataset.tag, 'down'); return; }

      const unlinkBtn = e.target.closest('[data-action="unlink-acad"]');
      if (unlinkBtn) { unlinkAcademy(unlinkBtn.dataset.parent, unlinkBtn.dataset.acad); return; }

      const linkPromptBtn = e.target.closest('[data-action="link-acad-prompt"]');
      if (linkPromptBtn) { linkAcademyPrompt(linkPromptBtn.dataset.parent); return; }

      const napToggleBtn = e.target.closest('[data-action="toggle-nap"]');
      if (napToggleBtn) { toggleNAPStatus(napToggleBtn.dataset.tag); return; }

      const delAllianceBtn = e.target.closest('[data-action="del-alliance"]');
      if (delAllianceBtn) { removeContender(delAllianceBtn.dataset.tag); return; }
    });
  }

  // Add Contender Form
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

  // Blacklist Add / Del Delegation
  const btnAddPlayer = document.getElementById('btn-add-blacklist-player');
  if (btnAddPlayer && !btnAddPlayer.dataset.bound) {
    btnAddPlayer.dataset.bound = 'true';
    btnAddPlayer.addEventListener('click', () => {
      const input = document.getElementById('input-new-player');
      if (input && input.value.trim()) {
        addBlacklistEntry('players', input.value);
        input.value = '';
      }
    });
  }

  const btnAddBlacklistAlly = document.getElementById('btn-add-blacklist-alliance');
  if (btnAddBlacklistAlly && !btnAddBlacklistAlly.dataset.bound) {
    btnAddBlacklistAlly.dataset.bound = 'true';
    btnAddBlacklistAlly.addEventListener('click', () => {
      const input = document.getElementById('input-new-blacklist-alliance');
      if (input && input.value.trim()) {
        addBlacklistEntry('alliances', input.value);
        input.value = '';
      }
    });
  }

  document.querySelectorAll('.blacklist-card-list').forEach(list => {
    if (list.dataset.bound) return;
    list.dataset.bound = 'true';
    list.addEventListener('click', (e) => {
      if (!isAlliancePlannerActive) return;
      const delBtn = e.target.closest('[data-action="del-blacklist"]');
      if (delBtn) {
        removeBlacklistEntry(delBtn.dataset.type, parseInt(delBtn.dataset.index, 10));
      }
    });
  });

  // Render initial bootstrap state immediately
  renderStandingsHierarchy();
  renderBlacklist();

  // Parallel live sync with Gist state proxy & OAuth draft restoration
  fetchLiveAllianceState().then(() => {
    checkAndRestoreAllianceDraft();
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