/**
 * map.js - Comprehensive Map Data, Parsing, Highlighting, Label, Planner, and Fullscreen Utilities
 */

export const LABEL_OVERRIDES = {
  Sky_Fortress: { rotate: 270, offsetX: -52 },
  Royal_Castle: { offsetX: -5, offsetY: -20, scale: 1.5 },
  Lionheart_Fortress: { offsetY: -35 },
  Cloudtop_Highlands: { offsetX: 28 },
  Stillwater_River: { offsetY: -30 },
  Raven_s_Roost: { offsetY: -20 },
  Bluestone_Slope: { offsetY: -35 },
  Sunspire_City: { offsetY: -20 },
  Emerald_City: { offsetY: 20, offsetX: 20 },
  Graywolf_Vale: { offsetY: -20 },
  Rose_Court: { offsetY: -20 },
  Falcon_s_Keep: { offsetY: -30, offsetX: -10 },
  Ironwall_City: { offsetY: -30, offsetX: 20 },
  Holyspring_City: { offsetY: -20 },
  Temple_of_War: { offsetY: -20 },
  Mithrall_Hall: { offsetY: -20, offsetX: 30 },
  Cliffside_Citadel: { offsetX: 10 },
  Stormgate: { offsetX: -8 },
  Goldgrain_Town: { offsetY: -20 },
  Redsoil_Wastes: { offsetX: 20 },
  Opal_Mine: { offsetY: -20 },
  Maple_Town: { offsetY: -20 },
  Irongate_Town: { offsetY: -10 },
  Stagcall_Vale: { offsetY: -10 },
  Beacon_Point: { offsetY: -20 },
  Millstone_Creek: { offsetY: -40 },
  Sandwind_Keep: { offsetY: -20 },
  Lark_Lane: { offsetY: -40 },
  Anvil_Town: { offsetY: -10 },
  Dripping_Cavern: { offsetY: -30 },
  Broken_Bridgehead: { offsetY: -25 },
  Wheatsheaf: { offsetY: -15 }
};

export const COLOR_TO_LEVEL_MAP = {
  green: 1, yellow: 2, orange: 3, purple: 4, blue: 5, red: 6, gold: "Capitol"
};

export const LEVEL_COLORS = {
  green: '#25bb00', yellow: '#cece00', orange: '#e68e00', purple: '#a400af',
  blue: '#003fad', red: '#8f0000', gold: '#b29a20'
};

export const AUTO_ALLIANCE_PALETTE = [
  '#e68e00', '#a400af', '#0070f3', '#25bb00', '#e53e3e',
  '#dd6b20', '#319795', '#d69e2e', '#805ad5', '#d53f8c',
  '#38a169', '#00b5d8'
];

export const CITY_LEVEL_MAP = {
  1: { level: 1, label: "Level 1", group: "green" },
  2: { level: 2, label: "Level 2", group: "yellow" },
  3: { level: 3, label: "Level 3", group: "orange" },
  4: { level: 4, label: "Level 4", group: "purple" },
  5: { level: 5, label: "Level 5", group: "blue" },
  6: { level: 6, label: "Level 6", group: "red" },
  "Capitol": { level: "Capitol", label: "Capitol", group: "gold" }
};

export let cities = [];
export let alliances = {};
export let mapState = {};
export let currentColorMode = 'level';
export let isPlannerActive = false;
export let draftState = null;
export let DRAFT_ALLIANCE_TAGS = [];

export const COLOR_FALLBACKS = { unclaimed: '#2d3748', noAllianceColor: '#718096' };

export function setDraftAllianceTags(tags = []) { DRAFT_ALLIANCE_TAGS = tags; }

export function getAllianceColor(tag) {
  if (!tag || tag === 'Unclaimed') return COLOR_FALLBACKS.unclaimed;
  const alliance = alliances[tag];
  if (alliance && alliance.color) return alliance.color;

  const rankedTags = getRankedAllianceTags();
  const rankIndex = rankedTags.indexOf(tag);
  if (rankIndex !== -1) return AUTO_ALLIANCE_PALETTE[rankIndex % AUTO_ALLIANCE_PALETTE.length];

  const allTags = Object.keys(alliances);
  const tagIndex = allTags.indexOf(tag);
  if (tagIndex !== -1) return AUTO_ALLIANCE_PALETTE[tagIndex % AUTO_ALLIANCE_PALETTE.length];

  return COLOR_FALLBACKS.noAllianceColor;
}

export function getRankedAllianceTags() {
  const ranked = Object.entries(alliances)
    .filter(([_, data]) => data && data.rank !== undefined && data.rank !== null && data.rank !== '')
    .sort(([_, a], [__, b]) => Number(a.rank) - Number(b.rank))
    .map(([tag]) => tag);

  if (ranked.length > 0) return ranked;
  if (DRAFT_ALLIANCE_TAGS && DRAFT_ALLIANCE_TAGS.length > 0) return DRAFT_ALLIANCE_TAGS;

  return Object.keys(alliances);
}

export function getSvgRoot() {
  return document.querySelector('.game-map svg') || document.querySelector('#game-map') || document.querySelector('svg');
}

// ==========================================================================
// PLANNER MODE & DISPATCH
// ==========================================================================

export function togglePlannerMode(active, svgRoot = null) {
  isPlannerActive = active;
  const root = svgRoot || getSvgRoot();

  if (isPlannerActive) {
    draftState = JSON.parse(JSON.stringify(mapState));
    if (!draftState.territory_ownership) draftState.territory_ownership = {};
    currentColorMode = 'alliance';
  } else {
    draftState = null;
  }

  if (root) {
    setMapColorMode(currentColorMode, root);
    renderTerritoryLabels(root);
  }

  updateProposalUI();
}

export function getCityOwner(cityId) {
  if (isPlannerActive && draftState && draftState.territory_ownership && draftState.territory_ownership[cityId]) {
    const draftData = draftState.territory_ownership[cityId];
    return typeof draftData === 'string' ? draftData : (draftData.owner || 'Unclaimed');
  }
  const city = getCityById(cityId);
  return city ? (city.owner || 'Unclaimed') : 'Unclaimed';
}

export function setDraftTerritoryOwner(cityId, newOwnerTag, svgRoot = null) {
  if (!isPlannerActive) return;
  const root = svgRoot || getSvgRoot();

  if (!draftState) draftState = JSON.parse(JSON.stringify(mapState));
  if (!draftState.territory_ownership) draftState.territory_ownership = {};

  draftState.territory_ownership[cityId] = { owner: newOwnerTag || 'Unclaimed' };

  if (root) {
    renderTerritoryLabels(root);
    setMapColorMode(currentColorMode, root);
  }
  updateProposalUI();
}

export function promptTerritoryAssignment(cityId, svgRoot = null) {
  const root = svgRoot || getSvgRoot();
  const currentOwner = getCityOwner(cityId);
  const rankedTags = getRankedAllianceTags();
  
  const cycleList = ['Unclaimed', ...rankedTags];

  let currentIndex = cycleList.indexOf(currentOwner);

  if (currentIndex === -1 && currentOwner && currentOwner !== 'Unclaimed') {
    const normCurrent = String(currentOwner).normalize('NFC').trim().toLowerCase();
    currentIndex = cycleList.findIndex(
      tag => String(tag).normalize('NFC').trim().toLowerCase() === normCurrent
    );
  }

  if (currentIndex === -1) currentIndex = 0;

  const nextIndex = (currentIndex + 1) % cycleList.length;
  const newOwner = cycleList[nextIndex];

  setDraftTerritoryOwner(cityId, newOwner, root);
}

export function generateProposalPayload(authorName = 'Anonymous User') {
  if (!isPlannerActive || !draftState) return null;
  const changes = {};

  cities.forEach(city => {
    const draftOwner = getCityOwner(city.id);
    const originalOwner = city.owner || 'Unclaimed';
    if (draftOwner !== originalOwner) {
      changes[city.id] = { from: originalOwner, to: draftOwner };
    }
  });

  return {
    submittedBy: authorName,
    timestamp: new Date().toISOString(),
    totalChanges: Object.keys(changes).length,
    changes: changes
  };
}

/**
 * Dispatches the active draft strategy payload to the Discord War Room API
 */
export async function submitStrategyProposal(apiEndpointUrl = '/api/proposal') {
  if (!isPlannerActive || !draftState) return;

  const payload = generateProposalPayload();
  if (!payload || payload.totalChanges === 0) {
    alert('No changes detected in your draft plan.');
    return;
  }

  const authorInput = prompt('Enter your Discord handle / Commander Name:', 'Commander');
  if (authorInput === null) return; // User canceled

  const notesInput = prompt('Add an optional strategy note for the War Room:', '') || '';

  payload.submittedBy = authorInput.trim() || 'Anonymous Commander';
  payload.notes = notesInput.trim();

  const submitBtn = document.getElementById('btn-submit-proposal') || document.querySelector('.submit-plan-btn');
  const originalText = submitBtn ? submitBtn.textContent : 'Submit Plan';

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Transmitting...';
  }

  try {
    const response = await fetch(apiEndpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    alert('Strategy plan successfully transmitted to Discord War Room!');
    togglePlannerMode(false);
  } catch (err) {
    console.error('Failed to submit strategy proposal:', err);
    alert('Could not send proposal to Discord. Make sure the bot server is online.');
  } finally {
    if (submitBtn) {
      submitBtn.textContent = originalText;
    }
    updateProposalUI();
  }
}

export function updateProposalUI(btnSubmit = null, badge = null) {
  const submitBtn = btnSubmit || document.getElementById('btn-submit-proposal') || document.querySelector('.submit-plan-btn');
  const badgeEl = badge || document.getElementById('change-count-badge') || document.querySelector('.draft-indicator');
  
  if (!isPlannerActive) {
    if (submitBtn) { submitBtn.disabled = true; submitBtn.classList.add('hidden'); submitBtn.style.display = 'none'; }
    if (badgeEl) badgeEl.textContent = '0';
    return;
  }

  const payload = generateProposalPayload();
  const count = payload ? payload.totalChanges : 0;

  if (badgeEl) badgeEl.textContent = String(count);
  if (submitBtn) {
    submitBtn.disabled = count === 0;
    submitBtn.classList.remove('hidden');
    submitBtn.style.display = 'inline-flex';
  }
}

// ==========================================================================
// FULLSCREEN & CONTROLS
// ==========================================================================

export function toggleFullscreen(mapContainer = document.getElementById('map-container')) {
  if (!mapContainer) return;
  const btnFullscreen = document.getElementById('btn-toggle-fullscreen');
  const isNative = !!document.fullscreenElement;
  const isCSSFallback = mapContainer.classList.contains('is-fullscreen');
  const willBeActive = !(isNative || isCSSFallback);

  document.body.classList.toggle('map-fullscreen-active', willBeActive);

  if (willBeActive) {
    mapContainer.classList.add('is-fullscreen');
    syncFullscreenUI(true, btnFullscreen);
    if (mapContainer.requestFullscreen) mapContainer.requestFullscreen().catch(() => {});
  } else {
    mapContainer.classList.remove('is-fullscreen');
    syncFullscreenUI(false, btnFullscreen);
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }
}

export function syncFullscreenUI(isActive, btn = null) {
  if (!btn) btn = document.getElementById('btn-toggle-fullscreen');
  if (!btn) return;
  btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  const label = btn.querySelector('.fullscreen-label');
  if (label) label.textContent = isActive ? 'Exit' : 'Fullscreen';
}

export function bindMapControls(svgRoot = null) {
  const btnLevel = document.getElementById('btn-mode-level');
  const btnAlliance = document.getElementById('btn-mode-alliance');
  const btnDraft = document.getElementById('btn-toggle-draft') || document.querySelector('.draft-btn');
  const btnSubmit = document.getElementById('btn-submit-proposal') || document.querySelector('.submit-plan-btn');
  const badge = document.getElementById('change-count-badge') || document.querySelector('.draft-indicator');
  const mapContainer = document.getElementById('map-container');
  const btnFullscreen = document.getElementById('btn-toggle-fullscreen');

  if (btnLevel && !btnLevel.dataset.bound) {
    btnLevel.dataset.bound = 'true';
    btnLevel.addEventListener('click', () => {
      btnLevel.classList.add('active');
      if (btnAlliance) btnAlliance.classList.remove('active');
      setMapColorMode('level', svgRoot || getSvgRoot());
    });
  }

  if (btnAlliance && !btnAlliance.dataset.bound) {
    btnAlliance.dataset.bound = 'true';
    btnAlliance.addEventListener('click', () => {
      btnAlliance.classList.add('active');
      if (btnLevel) btnLevel.classList.remove('active');
      setMapColorMode('alliance', svgRoot || getSvgRoot());
    });
  }

  if (btnDraft && !btnDraft.dataset.bound) {
    btnDraft.dataset.bound = 'true';
    btnDraft.addEventListener('click', (e) => {
      e.preventDefault();
      const willBeActive = !isPlannerActive;
      btnDraft.setAttribute('aria-pressed', willBeActive ? 'true' : 'false');
      btnDraft.classList.toggle('active', willBeActive);
      togglePlannerMode(willBeActive, svgRoot || getSvgRoot());
      if (willBeActive && btnAlliance && btnLevel) {
        btnAlliance.classList.add('active');
        btnLevel.classList.remove('active');
      }
      updateProposalUI(btnSubmit, badge);
    });
  }

  if (btnSubmit && !btnSubmit.dataset.bound) {
    btnSubmit.dataset.bound = 'true';
    btnSubmit.addEventListener('click', (e) => {
      e.preventDefault();
      // Replace path with your API endpoint URL if hosted on a separate bot port (e.g., 'http://localhost:3000/api/proposal')
      submitStrategyProposal('/api/proposal');
    });
  }

  if (btnFullscreen && mapContainer && !btnFullscreen.dataset.bound) {
    btnFullscreen.dataset.bound = 'true';
    btnFullscreen.addEventListener('click', (e) => {
      e.preventDefault();
      toggleFullscreen(mapContainer);
    });

    if (!document.documentElement.dataset.fullscreenBound) {
      document.documentElement.dataset.fullscreenBound = 'true';
      document.addEventListener('fullscreenchange', () => {
        const isNativeActive = !!document.fullscreenElement;
        if (isNativeActive) {
          mapContainer.classList.add('is-fullscreen');
          document.body.classList.add('map-fullscreen-active');
        } else {
          mapContainer.classList.remove('is-fullscreen');
          document.body.classList.remove('map-fullscreen-active');
        }
        syncFullscreenUI(isNativeActive, btnFullscreen);
      });
    }
  }
}

// ==========================================================================
// GEOMETRY & RENDERING
// ==========================================================================

function getVisualCenter(pathEl) {
  try {
    const totalLength = pathEl.getTotalLength();
    if (!totalLength) throw new Error("Zero length path");
    const samples = 32; let sumX = 0, sumY = 0;
    for (let i = 0; i < samples; i++) {
      const pt = pathEl.getPointAtLength((i / samples) * totalLength);
      sumX += pt.x; sumY += pt.y;
    }
    return { x: sumX / samples, y: sumY / samples };
  } catch (e) {
    const bbox = pathEl.getBBox();
    return { x: bbox.x + (bbox.width / 2), y: bbox.y + (bbox.height / 2) };
  }
}

export function extractCitiesFromSvg(svgRoot) {
  if (!svgRoot) return [];
  const extractedCities = [];

  Object.entries(COLOR_TO_LEVEL_MAP).forEach(([colorLabel, assignedLevel]) => {
    const colorGroup = svgRoot.querySelector(`g[inkscape\\:label="${colorLabel}"]`) 
                    || svgRoot.querySelector(`g[label="${colorLabel}"]`)
                    || svgRoot.querySelector(`g[data-label="${colorLabel}"]`)
                    || svgRoot.querySelector(`g#${colorLabel}`)
                    || svgRoot.querySelector(`g.${colorLabel}`);

    if (!colorGroup) return;

    const children = Array.from(colorGroup.children);
    children.forEach((el, index) => {
      const elementId = el.id || el.getAttribute('inkscape:label');
      const uniqueId = elementId || `${colorLabel}_city_${index + 1}`;
      const cityName = el.getAttribute('inkscape:label') || uniqueId;
      if (!el.id) el.id = uniqueId;
      el.style.fill = LEVEL_COLORS[colorLabel];
      if (!extractedCities.some(c => c.id === uniqueId)) {
        extractedCities.push({
          id: uniqueId, name: cityName, level: assignedLevel,
          group: colorLabel, buff: "Placeholder Buff", owner: "Unclaimed", status: null
        });
      }
    });
  });

  if (extractedCities.length === 0) {
    const layer = svgRoot.querySelector('#layer1') || svgRoot;
    const shapes = layer.querySelectorAll('[id]');
    shapes.forEach(el => {
      const id = el.id;
      if (!id || id === 'layer1' || id.startsWith('defs') || id.includes('label') || id === 'territory-labels') return;
      if (el.parentElement && el.parentElement.id && el.parentElement.id !== 'layer1' && el.parentElement !== svgRoot) return;

      let group = 'green';
      for (const [col] of Object.entries(COLOR_TO_LEVEL_MAP)) {
        if (el.classList.contains(col) || el.getAttribute('fill') === LEVEL_COLORS[col]) { group = col; break; }
      }
      extractedCities.push({
        id: id, name: el.getAttribute('inkscape:label') || id.replace(/_/g, ' '), level: COLOR_TO_LEVEL_MAP[group] || 1,
        group: group, buff: "Placeholder Buff", owner: "Unclaimed", status: null
      });
    });
  }
  return extractedCities;
}

export function setMapColorMode(mode, svgRoot) {
  const root = svgRoot || getSvgRoot();
  if (!root) return;
  currentColorMode = mode;
  if (mode === 'alliance') root.classList.add('mode-alliance');
  else root.classList.remove('mode-alliance');

  cities.forEach(city => {
    const el = root.getElementById(city.id);
    if (!el) return;
    const ownerTag = getCityOwner(city.id);

    if (mode === 'alliance') {
      const targetColor = getAllianceColor(ownerTag);
      if (el.tagName.toLowerCase() === 'g') {
        const shapes = el.querySelectorAll('path, polygon, rect, circle');
        shapes.forEach(s => { s.style.fill = targetColor; s.style.stroke = targetColor; });
      } else { el.style.fill = targetColor; el.style.stroke = targetColor; }
    } else {
      if (el.tagName.toLowerCase() === 'g') {
        const shapes = el.querySelectorAll('path, polygon, rect, circle');
        shapes.forEach(s => { s.style.fill = LEVEL_COLORS[city.group]; s.style.stroke = ''; });
      } else { el.style.fill = LEVEL_COLORS[city.group]; el.style.stroke = ''; }
    }
  });
}

export function renderTerritoryLabels(svgRoot) {
  const root = svgRoot || getSvgRoot();
  if (!root) return;

  let labelGroup = root.querySelector('#territory-labels');
  if (!labelGroup) {
    labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    labelGroup.setAttribute('id', 'territory-labels');
    labelGroup.style.pointerEvents = 'none';
    root.appendChild(labelGroup);
  }
  labelGroup.innerHTML = '';

  cities.forEach(city => {
    const ownerTag = String(getCityOwner(city.id));
    if (!ownerTag || ownerTag === 'Unclaimed') return;

    const pathEl = root.getElementById(city.id);
    if (!pathEl) return;

    try {
      const center = getVisualCenter(pathEl);
      const bbox = pathEl.getBBox();
      if (bbox.width === 0 || bbox.height === 0) return;

      const override = LABEL_OVERRIDES[city.id] || {};
      const finalX = center.x + (override.offsetX || 0);
      const finalY = center.y + (override.offsetY || 0);

      const maxAllowedWidth = bbox.width * 0.68;
      const maxAllowedHeight = bbox.height * 0.55;
      const maxFontSizeByWidth = maxAllowedWidth / (ownerTag.length * 0.65);
      let fontSize = Math.max(10, Math.min(46, maxFontSizeByWidth, maxAllowedHeight));
      if (override.scale) fontSize *= override.scale;

      const wrapperGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      wrapperGroup.setAttribute('class', 'label-wrapper');
      if (override.rotate) wrapperGroup.setAttribute('transform', `rotate(${override.rotate}, ${finalX}, ${finalY})`);

      const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textEl.setAttribute('x', finalX);
      textEl.setAttribute('y', finalY);
      textEl.setAttribute('dy', '0.35em');
      textEl.style.transform = 'translateZ(0)';
      textEl.style.textAnchor = 'middle';
      textEl.style.fontSize = `${fontSize.toFixed(1)}px`;
      textEl.setAttribute('class', 'territory-label');
      textEl.setAttribute('data-owner', ownerTag);
      textEl.textContent = ownerTag;

      const allianceColor = getAllianceColor(ownerTag);
      textEl.style.fill = allianceColor !== COLOR_FALLBACKS.unclaimed ? allianceColor : '#ffffff';

      wrapperGroup.appendChild(textEl);
      labelGroup.appendChild(wrapperGroup);
    } catch (e) {}
  });
}

export function enableMapHighlighting(svgRoot = null) {
  const root = svgRoot || getSvgRoot();
  if (!root) return;

  const card = document.getElementById('territory-info-card');
  const cityNameEl = document.getElementById('city-name');
  const cityLevelEl = document.getElementById('city-level-badge');
  const cityOwnerEl = document.getElementById('city-owner');
  const cityBuffEl = document.getElementById('city-buff');

  function updateInfoCard(cityData) {
    if (!card) return;
    if (!cityData) {
      card.classList.add('idle');
      if (cityNameEl) cityNameEl.textContent = 'Hover over a territory';
      if (cityLevelEl) cityLevelEl.textContent = 'Level --';
      if (cityOwnerEl) cityOwnerEl.textContent = 'Unclaimed';
      if (cityBuffEl) cityBuffEl.textContent = 'None';
      return;
    }
    card.classList.remove('idle');
    if (cityNameEl) cityNameEl.textContent = cityData.name || cityData.id;
    if (cityLevelEl) cityLevelEl.textContent = typeof cityData.level === 'number' ? `Level ${cityData.level}` : cityData.level;
    if (cityOwnerEl) {
      const ownerTag = getCityOwner(cityData.id);
      const alliance = alliances[ownerTag];
      cityOwnerEl.textContent = alliance ? `${alliance.name} [${ownerTag}]` : ownerTag;
    }
    if (cityBuffEl) cityBuffEl.textContent = cityData.buff || 'No active buff';
  }

  const elements = root.querySelectorAll('path, rect, circle, polygon');
  elements.forEach(el => {
    if (el.closest('#territory-labels') || el.closest('defs')) return;

    if (el.dataset.bound) return;
    el.dataset.bound = 'true';

    el.style.cursor = 'pointer';
    const getTargetCity = (e) => {
      let current = e.target;
      while (current && current !== root && current !== document.body) {
        if (current.id && current.id !== 'layer1' && current.id !== 'territory-labels') {
          const city = getCityById(current.id);
          if (city) return city;
        }
        const label = current.getAttribute && current.getAttribute('inkscape:label');
        if (label) {
          const city = cities.find(c => c.name === label || c.id === label);
          if (city) return city;
        }
        current = current.parentElement;
      }
      return null;
    };

    el.addEventListener('mouseenter', (e) => updateInfoCard(getTargetCity(e)));
    el.addEventListener('mouseleave', () => updateInfoCard(null));
    
    el.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const city = getTargetCity(e);
      const cityId = city ? city.id : (el.id || e.target.id);

      if (isPlannerActive && cityId) {
        promptTerritoryAssignment(cityId, root);
        updateInfoCard(getCityById(cityId));
      }
    });
  });
}

// ==========================================================================
// STATE MANAGEMENT & INITIALIZATION
// ==========================================================================

export function applyMapState(state, svgRoot = null) {
  if (!state) return;
  mapState = state;
  if (state.alliances) alliances = state.alliances;

  if (state.territory_ownership) {
    Object.entries(state.territory_ownership).forEach(([cityId, data]) => {
      const city = getCityById(cityId);
      if (city) {
        if (typeof data === 'string') {
          city.owner = data;
        } else if (typeof data === 'object' && data !== null) {
          city.owner = data.owner || 'Unclaimed';
          city.status = data.status || null;
        }
      }
    });
  }

  const root = svgRoot || getSvgRoot();
  if (root) renderTerritoryLabels(root);
}

export function getCityById(id) { return cities.find(city => city.id === id); }

export function initializeMapData(svgRoot) {
  const root = svgRoot || getSvgRoot();
  if (!root) return cities;

  cities = extractCitiesFromSvg(root);
  
  if (typeof window !== 'undefined' && window.MAP_STATE) {
    applyMapState(window.MAP_STATE, root);
  } else {
    renderTerritoryLabels(root);
  }
  
  bindMapControls(root);
  enableMapHighlighting(root);
  
  return cities;
}

export function initMap() {
  const svgRoot = getSvgRoot();
  if (svgRoot) {
    initializeMapData(svgRoot);
  } else {
    bindMapControls();
  }
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initMap);
  } else {
    initMap();
  }
  document.addEventListener('turbo:load', initMap);
}