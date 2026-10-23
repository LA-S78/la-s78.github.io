/**
 * js/alliance.js - Dynamic NAP Diplomacy, Standings Ladder & Blacklist Engine
 * Preserves exact tag capitalization (e.g., RÂVN vs RâvN vs râvn) without conflict.
 */

import { submitProposalWithAuth } from './auth-modal.js';

const ALLIANCE_DRAFT_KEY = 'la_alliance_planner_draft';

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

const AUTO_PALETTE = [
  '#25bb00', '#cece00', '#a400af', '#0070f3', '#e53e3e',
  '#dd6b20', '#d53f8c', '#319795', '#d69e2e', '#805ad5',
  '#38a169', '#00b5d8'
];

export let isAlliancePlannerActive = false;
export let originalAlliances = {};
export let originalBlacklist = { players: [], alliances: [] };
export let draftAlliances = {};
export let draftBlacklist = { players: [], alliances: [] };
export let liveDiscordColors = {};

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
      (k) => k === k.toUpperCase() && stripDiacritics(k) === normalizedTarget
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

export function initBootstrapData() {
  const mapEl = document.getElementById('map-state-bootstrap');
  const dipEl = document.getElementById('diplomacy-data-bootstrap');

  if (!window.MAP_STATE && mapEl?.textContent?.trim()) {
    try { window.MAP_STATE = JSON.parse(mapEl.textContent); } catch (e) {}
  }
  if (!window.DIPLOMACY_DATA && dipEl?.textContent?.trim()) {
    try { window.DIPLOMACY_DATA = JSON.parse(dipEl.textContent); } catch (e) {}
  }

  const mapData = window.MAP_STATE || {};
  const diplomacyData = window.DIPLOMACY_DATA || {};

  const rawAlliances = mapData.alliances || {};
  originalAlliances = {};

  // Preserve exact tag casing (never force toUpperCase)
  Object.entries(rawAlliances).forEach(([tag, data]) => {
    const cleanTag = tag.trim();
    if (!cleanTag) return;

    const parsedRank =
      typeof data.rank === 'number'
        ? data.rank
        : !isNaN(parseInt(data.rank, 10))
          ? parseInt(data.rank, 10)
          : null;

    originalAlliances[cleanTag] = {
      tag: cleanTag,
      name: data.name || cleanTag,
      rank: parsedRank,
      type: data.type || (data.parent_tag ? 'academy' : 'main'),
      parent_tag: data.parent_tag ? String(data.parent_tag).trim() : null,
      academies: Array.isArray(data.academies) ? data.academies.map(a => String(a).trim()) : [],
      is_nap: data.is_nap !== undefined ? Boolean(data.is_nap) : true,
      color: resolveAllianceColor(cleanTag, data.color, parsedRank)
    };
  });

  // Reconcile academies from diplomacy.yml using exact case first
  if (Array.isArray(diplomacyData.nap_academies)) {
    diplomacyData.nap_academies.forEach(acad => {
      const rawAcadName = (acad.name || '').trim();
      const parentTag = (acad.parent || '').trim();
      if (!rawAcadName || !parentTag) return;

      // Match existing non-parent tag if casing differs slightly in diplomacy.yml (e.g. Râvn -> RâvN)
      let acadTag = rawAcadName;
      if (!originalAlliances[acadTag]) {
        const caseInsensitiveCandidate = Object.keys(originalAlliances).find(
          k => k !== parentTag && k.toLowerCase() === rawAcadName.toLowerCase()
        );
        if (caseInsensitiveCandidate) {
          acadTag = caseInsensitiveCandidate;
        }
      }

      if (!originalAlliances[acadTag]) {
        originalAlliances[acadTag] = {
          tag: acadTag,
          name: rawAcadName,
          rank: null,
          type: 'academy',
          parent_tag: parentTag,
          academies: [],
          is_nap: true,
          color: '#718096'
        };
      } else if (acadTag !== parentTag) {
        originalAlliances[acadTag].type = 'academy';
        originalAlliances[acadTag].parent_tag = parentTag;
      }

      if (originalAlliances[parentTag] && acadTag !== parentTag) {
        if (!originalAlliances[parentTag].academies.includes(acadTag)) {
          originalAlliances[parentTag].academies.push(acadTag);
        }
      }
    });
  }

  originalBlacklist = {
    players: Array.isArray(diplomacyData.blacklist_players) ? [...diplomacyData.blacklist_players] : [],
    alliances: Array.isArray(diplomacyData.blacklist_alliances) ? [...diplomacyData.blacklist_alliances] : []
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
    if (parsed && parsed.alliances && Object.keys(parsed.alliances).length > 0) {
      isAlliancePlannerActive = true;
      draftAlliances = parsed.alliances;
      draftBlacklist = parsed.blacklist || { players: [], alliances: [] };

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

    if (colorsRes.ok) {
      liveDiscordColors = await colorsRes.json();
    }

    if (stateRes.ok) {
      const data = await stateRes.json();
      if (data.alliances && typeof data.alliances === 'object' && Object.keys(data.alliances).length > 0) {
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
              ? allyData.academies.map(a => String(a).trim()).filter(Boolean)
              : [],
            color: resolveAllianceColor(cleanTag, allyData.color, parsedRank)
          };
        });

        originalAlliances = normalizedLive;
      }

      if (data.blacklist && (Array.isArray(data.blacklist.players) || Array.isArray(data.blacklist.alliances))) {
        originalBlacklist = {
          players: data.blacklist.players || [],
          alliances: data.blacklist.alliances || []
        };
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

  const ladder = getSortedLadder(draftAlliances).filter(a => a.rank !== null);
  const currentIndex = ladder.findIndex(a => a.tag === tag);
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
    a => a.tag !== parentTag && !a.parent_tag
  );

  const promptOptions = availableAcademies.map(a => `[${a.tag}]`).join(', ');
  const selectedInput = prompt(
    `Enter exact alliance tag to link as an Academy under [${parentTag}] (case-sensitive, e.g. RâvN or râvn):\n${
      promptOptions ? `Available: ${promptOptions}` : 'Or type a new academy tag to create it:'
    }`
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
      color: '#718096'
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
    alert(`Alliance [${cleanTag}] already exists with that exact capitalization.`);
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
    color: resolveAllianceColor(cleanTag, null, nextRank)
  };

  saveDraftToStorage();
  renderStandingsHierarchy();
  updateAllianceProposalUI();
}

export function removeContender(tag) {
  if (!isAlliancePlannerActive || !draftAlliances[tag]) return;

  // Also clean up any parent's academy references to this tag
  Object.values(draftAlliances).forEach(ally => {
    if (Array.isArray(ally.academies)) {
      ally.academies = ally.academies.filter(a => a !== tag);
    }
    if (ally.parent_tag === tag) {
      ally.parent_tag = null;
      ally.type = 'main';
    }
  });

  delete draftAlliances[tag];

  // Re-normalize sequential ranks for remaining ranked alliances
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
// 4. BLACKLIST MUTATIONS
// ============================================================================

export function addBlacklistEntry(type, target) {
  if (!isAlliancePlannerActive) return;
  const clean = target.trim().replace(/[@\[\]]/g, '');
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
// 5. RENDERING & UI UPDATES
// ============================================================================

export function renderStandingsHierarchy() {
  const container = document.getElementById('alliance-hierarchy-list');
  if (!container) return;

  const countBadge = document.getElementById('alliance-total-count');
  const activeAlliances = isAlliancePlannerActive ? draftAlliances : originalAlliances;
  const ladder = getSortedLadder(activeAlliances);

  const totalNap = Object.values(activeAlliances).filter(a => a.is_nap).length;
  if (countBadge) countBadge.textContent = `${totalNap} NAP Alliances`;

  const playerAlliance = (localStorage.getItem('auth-alliance') || '').trim();

  container.innerHTML = ladder.map((alliance, index) => {
    const isRanked = alliance.rank !== null && alliance.rank !== undefined;
    const isTop3 = isRanked && alliance.rank <= 3;
    const rankTier = isTop3 ? (alliance.rank === 1 ? 'rank-gold' : alliance.rank === 2 ? 'rank-silver' : 'rank-bronze') : '';
    const isSelf = playerAlliance && alliance.tag === playerAlliance;
    const displayColor = resolveAllianceColor(alliance.tag, alliance.color, alliance.rank);

    const academyPills = (alliance.academies || []).map(acadTag => `
      <span class="academy-pill" title="Protected Academy">
        🎓 [${acadTag}]
        ${isAlliancePlannerActive ? `<button type="button" class="btn-unlink-acad" data-action="unlink-acad" data-parent="${alliance.tag}" data-acad="${acadTag}">&times;</button>` : ''}
      </span>
    `).join('');

    return `
      <div class="alliance-ladder-row ${rankTier} ${isSelf ? 'highlight-alliance' : ''}" data-tag="${alliance.tag}">
        <div class="ladder-rank-col">
          <span class="ladder-rank-badge ${rankTier}">
            ${isRanked ? `#${alliance.rank}` : '--'}
          </span>
          ${isAlliancePlannerActive && isRanked ? `
            <div class="ladder-steppers">
              <button type="button" class="ladder-step-btn" data-action="rank-up" data-tag="${alliance.tag}" ${index === 0 ? 'disabled' : ''}>▲</button>
              <button type="button" class="ladder-step-btn" data-action="rank-down" data-tag="${alliance.tag}">▼</button>
            </div>
          ` : ''}
        </div>

        <div class="ladder-identity-col">
          <div class="ladder-primary-line">
            ${isAlliancePlannerActive ? `
              <input
                type="color"
                class="alliance-color-picker"
                data-action="pick-color"
                data-tag="${alliance.tag}"
                value="${displayColor.startsWith('#') ? displayColor : '#b8975a'}"
                title="Change [${alliance.tag}] Color"
              />
            ` : `
              <span class="alliance-color-indicator" style="background-color: ${displayColor}"></span>
            `}
            <strong class="ladder-tag" style="color: ${displayColor}">[${alliance.tag}]</strong>
            <span class="ladder-name">${alliance.name}</span>
            ${alliance.parent_tag ? `<span class="academy-child-badge">Academy of [${alliance.parent_tag}]</span>` : ''}
          </div>

          <div class="ladder-sub-line">
            ${academyPills}
            ${isAlliancePlannerActive && !alliance.parent_tag ? `
              <button type="button" class="btn-link-acad-prompt" data-action="link-acad-prompt" data-parent="${alliance.tag}">+ Link Academy</button>
            ` : ''}
          </div>
        </div>

        <div class="ladder-status-col">
          <span class="nap-badge ${alliance.is_nap ? 'nap-active' : 'nap-inactive'}">
            ${alliance.is_nap ? 'NAP Protected' : 'External'}
          </span>
          ${isAlliancePlannerActive ? `
            <button type="button" class="btn-nap-toggle" data-action="toggle-nap" data-tag="${alliance.tag}">
              ${alliance.is_nap ? 'Revoke NAP' : 'Grant NAP'}
            </button>
            <button type="button" class="btn-ladder-del" data-action="del-alliance" data-tag="${alliance.tag}" title="Remove Alliance">&times;</button>
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
          ${isAlliancePlannerActive ? `<button type="button" class="btn-blacklist-del" data-action="del-blacklist" data-type="players" data-index="${idx}">&times;</button>` : ''}
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
          ${isAlliancePlannerActive ? `<button type="button" class="btn-blacklist-del" data-action="del-blacklist" data-type="alliances" data-index="${idx}">&times;</button>` : ''}
        </div>
      `).join('');
    }
  }
}

// ============================================================================
// 6. DIFF ENGINE & PROPOSAL SUBMISSION
// ============================================================================

export function calculateAllianceDiff() {
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

  Object.keys(originalAlliances).forEach(origTag => {
    if (!draftAlliances[origTag]) {
      diff.push({ type: 'removed', tag: origTag });
    }
  });

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
    if (d.type === 'color') return `<div>• 🎨 <strong>[${d.tag}]</strong>: Color updated to <code>${d.to}</code></div>`;
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
// 7. EVENT DELEGATION & MOUNT
// ============================================================================

export function bindAllianceControls() {
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

  renderStandingsHierarchy();
  renderBlacklist();

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