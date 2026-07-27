/**
 * map.js - Comprehensive Map Data, Parsing, Highlighting, Label, Planner, and Fullscreen Utilities
 * 
 * City Level Mapping by Group Color:
 * green  -> Level 1
 * yellow -> Level 2
 * orange -> Level 3
 * purple -> Level 4
 * blue   -> Level 5
 * red    -> Level 6
 * gold   -> Capitol (Unique)
 */

/**
 * Manual position, rotation, and font sizing overrides for awkward territory shapes.
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
  green: 1,
  yellow: 2,
  orange: 3,
  purple: 4,
  blue: 5,
  red: 6,
  gold: "Capitol"
};

// Exact hex colors for JS to enforce natively (Bypasses iOS Safari CSS bugs)
export const LEVEL_COLORS = {
  green: '#25bb00',
  yellow: '#cece00',
  orange: '#e68e00',
  purple: '#a400af',
  blue: '#003fad',
  red: '#8f0000',
  gold: '#b29a20'
};

export const CITY_LEVEL_MAP = {
  1: { level: 1, label: "Level 1", group: "green" },
  2: { level: 2, label: "Level 2", group: "yellow" },
  3: { level: 3, label: "Level 3", group: "orange" },
  4: { level: 4, label: "Level 4", group: "purple" },
  5: { level: 5, label: "Level 5", group: "blue" },
  6: { level: 6, label: "Level 6", group: "red" },
  "Capitol": { level: "Capitol", label: "Capitol", group: "gold" }
};

// Datasets & Core State
export let cities = [];
export let alliances = {};
export let mapState = {};
export let currentColorMode = 'level';

// Planner Mode State (Local strategy drafting)
export let isPlannerActive = false;
export let draftState = null;

// Fallback colors for Alliance map mode
export const COLOR_FALLBACKS = {
  unclaimed: '#2d3748',      // Dark neutral slate
  noAllianceColor: '#718096' // Mid-grey for claimed but color-less alliances
};

// ==========================================================================
// PLANNER MODE & STATE RESOLUTION
// ==========================================================================

/**
 * Toggles Planner Mode.
 * Creates a deep clone of mapState for non-destructive client-side editing.
 */
export function togglePlannerMode(active, svgRoot = null) {
  isPlannerActive = active;

  if (isPlannerActive) {
    draftState = JSON.parse(JSON.stringify(mapState));
    if (!draftState.territory_ownership) {
      draftState.territory_ownership = {};
    }
    // Draft changes depend on owner colors, force alliance mode view
    currentColorMode = 'alliance';
  } else {
    draftState = null;
  }

  if (svgRoot) {
    setMapColorMode(currentColorMode, svgRoot);
    renderTerritoryLabels(svgRoot);
  }

  updateProposalUI();
}

/**
 * Resolves the effective owner for a given city ID.
 * Returns draft owner if Planner Mode is active, otherwise returns live mapState owner.
 */
export function getCityOwner(cityId) {
  if (isPlannerActive && draftState && draftState.territory_ownership && draftState.territory_ownership[cityId]) {
    const draftData = draftState.territory_ownership[cityId];
    return typeof draftData === 'string' ? draftData : (draftData.owner || 'Unclaimed');
  }
  
  const city = getCityById(cityId);
  return city ? (city.owner || 'Unclaimed') : 'Unclaimed';
}

/**
 * Reassigns a territory owner inside draft state without touching live data.
 */
export function setDraftTerritoryOwner(cityId, newOwnerTag, svgRoot = null) {
  if (!isPlannerActive || !draftState) return;

  if (!draftState.territory_ownership) {
    draftState.territory_ownership = {};
  }

  draftState.territory_ownership[cityId] = {
    owner: newOwnerTag || 'Unclaimed'
  };

  if (svgRoot) {
    renderTerritoryLabels(svgRoot);
    setMapColorMode(currentColorMode, svgRoot);
  }

  updateProposalUI();
}

/**
 * Prompts or cycles territory assignment during Planner Mode
 */
export function promptTerritoryAssignment(cityId, svgRoot = null) {
  const currentOwner = getCityOwner(cityId);
  const availableTags = Object.keys(alliances);
  let newOwner = 'Unclaimed';

  if (availableTags.length > 0) {
    // Cycle through registered alliance tags
    const currentIndex = availableTags.indexOf(currentOwner);
    if (currentIndex === -1) {
      newOwner = availableTags[0];
    } else if (currentIndex < availableTags.length - 1) {
      newOwner = availableTags[currentIndex + 1];
    } else {
      newOwner = 'Unclaimed';
    }
  } else {
    // Text prompt fallback if no alliance datasets are loaded
    const input = prompt(`Assign owner alliance tag for ${cityId}:`, currentOwner !== 'Unclaimed' ? currentOwner : '');
    if (input === null) return;
    newOwner = input.trim() || 'Unclaimed';
  }

  setDraftTerritoryOwner(cityId, newOwner, svgRoot);
}

/**
 * Compares draft state against live mapState and produces a clean JSON proposal payload.
 */
export function generateProposalPayload(authorName = 'Anonymous User') {
  if (!isPlannerActive || !draftState) return null;

  const changes = {};

  cities.forEach(city => {
    const draftOwner = getCityOwner(city.id);
    const originalOwner = city.owner || 'Unclaimed';

    if (draftOwner !== originalOwner) {
      changes[city.id] = {
        from: originalOwner,
        to: draftOwner
      };
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
 * Updates the change counter badge and enables/disables the submit button
 */
export function updateProposalUI(btnSubmit = null, badge = null) {
  const submitBtn = btnSubmit || document.getElementById('btn-submit-proposal');
  const badgeEl = badge || document.getElementById('change-count-badge');
  
  if (!submitBtn && !badgeEl) return;

  if (!isPlannerActive) {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('hidden');
      submitBtn.style.display = 'none';
    }
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
// FULLSCREEN UTILITIES
// ==========================================================================

/**
 * Toggles Fullscreen Mode using Native API with CSS Fixed Fallback
 */
export function toggleFullscreen(mapContainer = document.getElementById('map-container')) {
  if (!mapContainer) return;

  const btnFullscreen = document.getElementById('btn-toggle-fullscreen');
  const isNative = !!document.fullscreenElement;
  const isCSSFallback = mapContainer.classList.contains('is-fullscreen');
  const isCurrentlyActive = isNative || isCSSFallback;
  const willBeActive = !isCurrentlyActive;

  document.body.classList.toggle('map-fullscreen-active', willBeActive);

  if (willBeActive) {
    mapContainer.classList.add('is-fullscreen');
    syncFullscreenUI(true, btnFullscreen);

    if (mapContainer.requestFullscreen) {
      mapContainer.requestFullscreen().catch(() => {});
    }
  } else {
    mapContainer.classList.remove('is-fullscreen');
    syncFullscreenUI(false, btnFullscreen);

    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }
}

/**
 * Updates button labels and active states
 */
export function syncFullscreenUI(isActive, btn = null) {
  if (!btn) btn = document.getElementById('btn-toggle-fullscreen');
  if (!btn) return;

  btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  const label = btn.querySelector('.fullscreen-label');
  if (label) {
    label.textContent = isActive ? 'Exit' : 'Fullscreen';
  }
}

/**
 * Automatically binds toolbar controls and map interaction listeners
 */
export function bindMapControls(svgRoot) {
  if (!svgRoot) return;

  const btnLevel = document.getElementById('btn-mode-level');
  const btnAlliance = document.getElementById('btn-mode-alliance');
  const btnDraft = document.getElementById('btn-toggle-draft');
  const btnSubmit = document.getElementById('btn-submit-proposal');
  const badge = document.getElementById('change-count-badge');
  const mapContainer = document.getElementById('map-container');
  const btnFullscreen = document.getElementById('btn-toggle-fullscreen');

  if (btnLevel) {
    btnLevel.addEventListener('click', () => {
      btnLevel.classList.add('active');
      if (btnAlliance) btnAlliance.classList.remove('active');
      setMapColorMode('level', svgRoot);
    });
  }

  if (btnAlliance) {
    btnAlliance.addEventListener('click', () => {
      btnAlliance.classList.add('active');
      if (btnLevel) btnLevel.classList.remove('active');
      setMapColorMode('alliance', svgRoot);
    });
  }

  if (btnDraft) {
    btnDraft.addEventListener('click', () => {
      const willBeActive = !isPlannerActive;
      btnDraft.setAttribute('aria-pressed', willBeActive ? 'true' : 'false');
      
      togglePlannerMode(willBeActive, svgRoot);

      if (willBeActive) {
        if (btnAlliance && btnLevel) {
          btnAlliance.classList.add('active');
          btnLevel.classList.remove('active');
        }
      }

      updateProposalUI(btnSubmit, badge);
    });
  }

  if (btnSubmit) {
    btnSubmit.addEventListener('click', () => {
      const payload = generateProposalPayload();
      if (!payload || payload.totalChanges === 0) return;
      console.log('Submitted Strategy Proposal:', payload);
      alert(`Proposal generated with ${payload.totalChanges} changes! Check developer console.`);
    });
  }

  if (btnFullscreen && mapContainer) {
    btnFullscreen.addEventListener('click', () => {
      toggleFullscreen(mapContainer);
    });

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

// ==========================================================================
// GEOMETRY & RENDERING UTILITIES
// ==========================================================================

function getVisualCenter(pathEl) {
  try {
    const totalLength = pathEl.getTotalLength();
    if (!totalLength) throw new Error("Zero length path");

    const samples = 32;
    let sumX = 0;
    let sumY = 0;

    for (let i = 0; i < samples; i++) {
      const pt = pathEl.getPointAtLength((i / samples) * totalLength);
      sumX += pt.x;
      sumY += pt.y;
    }

    return { x: sumX / samples, y: sumY / samples };
  } catch (e) {
    const bbox = pathEl.getBBox();
    return { x: bbox.x + (bbox.width / 2), y: bbox.y + (bbox.height / 2) };
  }
}

export function setAllianceColors(colorMap, svgRoot = null) {
  if (!colorMap || typeof colorMap !== 'object') return;

  Object.entries(colorMap).forEach(([tag, color]) => {
    if (!alliances[tag]) {
      alliances[tag] = { name: tag };
    }
    alliances[tag].color = color;
  });

  if (svgRoot) {
    renderTerritoryLabels(svgRoot);
    if (currentColorMode === 'alliance') {
      setMapColorMode('alliance', svgRoot);
    }
  }
}

/**
 * Parses SVG and extracts cities.
 * Explicitly stamps unique IDs onto SVG elements if they lack one.
 */
export function extractCitiesFromSvg(svgRoot) {
  const extractedCities = [];

  Object.entries(COLOR_TO_LEVEL_MAP).forEach(([colorLabel, assignedLevel]) => {
    const colorGroup = svgRoot.querySelector(`g[inkscape\\:label="${colorLabel}"]`);

    if (colorGroup) {
      const cityElements = colorGroup.querySelectorAll('path, rect, circle, polygon, g[id]');

      cityElements.forEach((el, index) => {
        const elementId = el.id;
        const elementLabel = el.getAttribute('inkscape:label');
        
        if (!elementId && !elementLabel) return;

        const uniqueId = elementId || `${colorLabel}_city_${index + 1}`;
        const cityName = elementLabel || uniqueId;

        // CRITICAL FIX: Stamp ID onto the SVG element so DOM selectors work on click
        if (!el.id) {
          el.id = uniqueId;
        }

        el.style.fill = LEVEL_COLORS[colorLabel];

        if (!extractedCities.some(c => c.id === uniqueId)) {
          extractedCities.push({
            id: uniqueId,
            name: cityName,
            level: assignedLevel,
            group: colorLabel,
            buff: "Placeholder Buff",
            owner: "Unclaimed",
            status: null
          });
        }
      });
    }
  });

  return extractedCities;
}

export function setMapColorMode(mode, svgRoot) {
  if (!svgRoot) return;
  currentColorMode = mode;

  if (mode === 'alliance') {
    svgRoot.classList.add('mode-alliance');
  } else {
    svgRoot.classList.remove('mode-alliance');
  }

  cities.forEach(city => {
    const el = svgRoot.getElementById(city.id);
    if (!el) return;

    const ownerTag = getCityOwner(city.id);

    if (mode === 'alliance') {
      let targetColor = COLOR_FALLBACKS.unclaimed;
      
      if (ownerTag && ownerTag !== 'Unclaimed') {
        const alliance = alliances[ownerTag];
        targetColor = (alliance && alliance.color) ? alliance.color : COLOR_FALLBACKS.noAllianceColor;
      }
      
      el.style.fill = targetColor;
      el.style.stroke = targetColor;
      
    } else {
      el.style.fill = LEVEL_COLORS[city.group];
      el.style.stroke = ''; 
    }
  });
}

export function renderTerritoryLabels(svgRoot) {
  if (!svgRoot) return;

  let labelGroup = svgRoot.querySelector('#territory-labels');
  if (!labelGroup) {
    labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    labelGroup.setAttribute('id', 'territory-labels');
    labelGroup.style.pointerEvents = 'none';
    svgRoot.appendChild(labelGroup);
  }
  labelGroup.innerHTML = '';

  let defs = svgRoot.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svgRoot.insertBefore(defs, svgRoot.firstChild);
  }

  cities.forEach(city => {
    const ownerTag = String(getCityOwner(city.id));
    if (!ownerTag || ownerTag === 'Unclaimed') return;

    const pathEl = svgRoot.getElementById(city.id);
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

      if (override.rotate) {
        wrapperGroup.setAttribute('transform', `rotate(${override.rotate}, ${finalX}, ${finalY})`);
      }

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

      const allianceData = alliances[ownerTag];
      if (allianceData && allianceData.color) {
        textEl.style.fill = allianceData.color;
      }

      wrapperGroup.appendChild(textEl);
      labelGroup.appendChild(wrapperGroup);

    } catch (e) {
      console.warn(`Could not calculate label position for city: ${city.id}`, e);
    }
  });
}

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

  if (svgRoot) renderTerritoryLabels(svgRoot);
}

export async function loadMapState(yamlUrl = '/_data/map_state.yml', svgRoot = null) {
  try {
    const response = await fetch(yamlUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const yamlText = await response.text();

    let state = {};
    if (typeof window !== 'undefined' && window.jsyaml) {
      state = window.jsyaml.load(yamlText);
    } else {
      state = parseSimpleYaml(yamlText);
    }

    applyMapState(state, svgRoot);
    return state;
  } catch (err) {
    console.error('Could not load map state YAML:', err);
    return null;
  }
}

export function initializeMapData(svgRoot) {
  cities = extractCitiesFromSvg(svgRoot);
  
  if (typeof window !== 'undefined' && window.MAP_STATE) {
    applyMapState(window.MAP_STATE, svgRoot);
  } else {
    renderTerritoryLabels(svgRoot);
  }
  
  bindMapControls(svgRoot);
  enableMapHighlighting(svgRoot);
  
  return cities;
}

export function updateCityOwner(cityId, newOwner, svgRoot = null) {
  if (isPlannerActive) {
    setDraftTerritoryOwner(cityId, newOwner, svgRoot);
    return;
  }

  const city = getCityById(cityId);
  if (city) {
    city.owner = newOwner || 'Unclaimed';
    if (svgRoot) {
      renderTerritoryLabels(svgRoot);
      setMapColorMode(currentColorMode, svgRoot);
    }
  }
}

/**
 * Enables hover/click highlighting and updates territory ownership in Draft Mode
 */
export function enableMapHighlighting(svgRoot) {
  const colorLabels = Object.keys(COLOR_TO_LEVEL_MAP);
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
    if (cityLevelEl) {
      cityLevelEl.textContent = typeof cityData.level === 'number' 
        ? `Level ${cityData.level}` : cityData.level;
    }
    if (cityOwnerEl) {
      const ownerTag = getCityOwner(cityData.id);
      const alliance = alliances[ownerTag];
      cityOwnerEl.textContent = alliance ? `${alliance.name} [${ownerTag}]` : ownerTag;
    }
    if (cityBuffEl) cityBuffEl.textContent = cityData.buff || 'No active buff';
  }

  colorLabels.forEach(color => {
    const group = svgRoot.querySelector(`g[inkscape\\:label="${color}"]`);
    if (!group) return;
    const elements = group.querySelectorAll('path, rect, circle, polygon');

    elements.forEach(el => {
      el.style.cursor = 'pointer';
      
      // CRITICAL FIX: Resolve closest element ID safely
      const getTargetCity = (e) => {
        const id = el.id || e.target.id || e.target.closest('[id]')?.id;
        return getCityById(id);
      };

      el.addEventListener('mouseenter', (e) => updateInfoCard(getTargetCity(e)));
      el.addEventListener('mouseleave', () => updateInfoCard(null));
      
      el.addEventListener('click', (e) => {
        const city = getTargetCity(e);
        if (!city) return;

        if (isPlannerActive) {
          promptTerritoryAssignment(city.id, svgRoot);
          updateInfoCard(city);
        } else {
          console.log("Selected City:", city);
        }
      });
    });
  });
}

export function getCityById(id) { return cities.find(city => city.id === id); }
export function getCitiesByLevel(level) { return cities.filter(city => city.level === level); }
export function getCitiesByGroup(groupColor) { return cities.filter(city => city.group === groupColor); }

function parseSimpleYaml(yamlText) {
  const result = { alliances: {}, territory_ownership: {} };
  let currentSection = null;
  let currentKey = null;

  const lines = yamlText.split('\n');
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const indent = line.search(/\S/);
    if (indent === 0 && trimmed.endsWith(':')) {
      currentSection = trimmed.slice(0, -1);
      if (!result[currentSection]) result[currentSection] = {};
    } else if (indent === 2 && currentSection) {
      const [key, ...valParts] = trimmed.split(':');
      const val = valParts.join(':').trim().replace(/^["']|["']$/g, '');
      currentKey = key.trim();
      if (val) {
        result[currentSection][currentKey] = val;
      } else {
        result[currentSection][currentKey] = {};
      }
    } else if (indent === 4 && currentSection && currentKey) {
      const [subKey, ...subValParts] = trimmed.split(':');
      const subVal = subValParts.join(':').trim().replace(/^["']|["']$/g, '');
      if (typeof result[currentSection][currentKey] === 'object') {
        result[currentSection][currentKey][subKey.trim()] = subVal;
      }
    }
  });

  return result;
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const svgRoot = document.querySelector('.game-map svg');
    if (svgRoot && cities.length === 0) {
      initializeMapData(svgRoot);
    }
  });
}