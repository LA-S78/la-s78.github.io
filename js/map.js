/**
 * map.js - Comprehensive Map Data, Parsing, Highlighting, Label, Planner, Fullscreen, and Image Snapshot Utilities
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

/**
 * Exact-case lookup preserves distinction between main/sub alliances (e.g. RÂVN vs RâvN vs râvn).
 */
export function getAllianceColor(tag) {
  if (!tag || tag === 'Unclaimed') return COLOR_FALLBACKS.unclaimed;

  if (alliances[tag] && alliances[tag].color) {
    return alliances[tag].color;
  }

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
// IMAGE CAPTURE UTILITY
// ==========================================================================

export async function captureMapImage(svgRoot = null) {
  const root = svgRoot || getSvgRoot();
  if (!root) return null;

  try {
    const viewBox = root.viewBox?.baseVal;
    const width = viewBox?.width || root.clientWidth || 1000;
    const height = viewBox?.height || root.clientHeight || 800;

    const clonedSvg = root.cloneNode(true);
    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clonedSvg.setAttribute('width', width);
    clonedSvg.setAttribute('height', height);

    let extractedCSS = '';
    try {
      for (const sheet of document.styleSheets) {
        try {
          if (sheet.href && !sheet.href.startsWith(window.location.origin)) continue;
          
          for (const rule of sheet.cssRules) {
            const cssText = rule.cssText.toLowerCase();
            if (cssText.includes('svg') || cssText.includes('path') || 
                cssText.includes('polygon') || cssText.includes('rect') || 
                cssText.includes('.game-map') || cssText.includes('.mode-alliance') ||
                cssText.includes('text')) {
              extractedCSS += rule.cssText + '\n';
            }
          }
        } catch (err) {}
      }
    } catch (err) {
      console.warn('Could not parse stylesheets for SVG capture', err);
    }

    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.textContent = `
      path, polygon, rect, circle { 
        stroke-linejoin: round; 
        vector-effect: non-scaling-stroke; 
        fill-opacity: 0.75 !important;
        filter: brightness(0.85); 
      }
      text.territory-label {
        font-family: system-ui, -apple-system, sans-serif;
        font-weight: bold;
        paint-order: stroke fill;
        stroke: #000000;
        stroke-width: 3px;
        fill-opacity: 1 !important; 
        opacity: 1 !important;
      }
      ${extractedCSS}
    `;
    clonedSvg.insertBefore(styleEl, clonedSvg.firstChild);

    const svgString = new XMLSerializer().serializeToString(clonedSvg);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(svgBlob);

    return await new Promise((resolve) => {
      const mapImg = new Image();
      
      mapImg.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        const textureImg = new Image();
        textureImg.crossOrigin = 'anonymous';
        textureImg.src = '/images/rust.jpg'; 
        
        textureImg.onload = () => {
          try {
            const pattern = ctx.createPattern(textureImg, 'repeat');
            ctx.fillStyle = pattern;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.drawImage(mapImg, 0, 0);
            URL.revokeObjectURL(blobUrl);
            
            resolve(canvas.toDataURL('image/jpeg', 1));
          } catch (err) {
            console.warn('Texture tainted canvas, falling back to solid background:', err);
            try {
              ctx.fillStyle = '#1a202c';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(mapImg, 0, 0);
              resolve(canvas.toDataURL('image/jpeg', 0.8));
            } catch (fallbackErr) {
              resolve(null);
            }
          }
        };

        textureImg.onerror = () => {
          try {
            console.warn('Could not load rust texture, falling back to solid background.');
            ctx.fillStyle = '#1a202c';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(mapImg, 0, 0);
            URL.revokeObjectURL(blobUrl);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          } catch (err) {
            resolve(null);
          }
        };
      };

      mapImg.onerror = (err) => {
        console.warn('Map image render error:', err);
        URL.revokeObjectURL(blobUrl);
        resolve(null);
      };
      
      mapImg.src = blobUrl;
    });
  } catch (e) {
    console.warn('Failed to capture map snapshot:', e);
    return null;
  }
}

// ==========================================================================
// PLANNER MODE & DISPATCH
// ==========================================================================

export function togglePlannerMode(active, svgRoot = null) {
  isPlannerActive = active;
  const root = svgRoot || getSvgRoot();

  const btnDraft = document.getElementById('btn-toggle-draft') || document.querySelector('.draft-btn');
  if (btnDraft) {
    btnDraft.setAttribute('aria-pressed', active ? 'true' : 'false');
    btnDraft.classList.toggle('active', active);
  }

  if (isPlannerActive) {
    draftState = JSON.parse(JSON.stringify(mapState));
    if (!draftState.territory_ownership) draftState.territory_ownership = {};
    currentColorMode = 'alliance';
  } else {
    draftState = null;
    currentColorMode = 'level';
    
    const btnLevel = document.getElementById('btn-mode-level');
    const btnAlliance = document.getElementById('btn-mode-alliance');
    if (btnLevel && btnAlliance) {
      btnLevel.classList.add('active');
      btnAlliance.classList.remove('active');
    }
  }

  if (root) {
    setMapColorMode(currentColorMode, root);
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

export async function submitStrategyProposal(apiEndpointUrl = '/api/proposal') {
  if (!isPlannerActive || !draftState) return;

  const payload = generateProposalPayload();
  if (!payload || payload.totalChanges === 0) {
    alert('No changes detected in your draft plan.');
    return;
  }

  const authorInput = prompt('Enter your Discord handle / IGN:', 'Doctor');
  if (authorInput === null) return;

  const notesInput = prompt('Add an optional note for the proposal:', '') || '';

  payload.submittedBy = authorInput.trim() || 'Anonymous';
  payload.notes = notesInput.trim();

  const submitBtn = document.getElementById('btn-submit-proposal') || document.querySelector('.submit-plan-btn');
  const originalText = submitBtn ? submitBtn.textContent : 'Submit Plan';

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Generating Preview...';
  }

  try {
    const mapImageData = await captureMapImage();
    if (mapImageData) {
      payload.image = mapImageData;
    }

    if (submitBtn) {
      submitBtn.textContent = 'Transmitting...';
    }

    const response = await fetch(apiEndpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    alert('Map proposal successfully transmitted to Discord!');
    togglePlannerMode(false);
  } catch (err) {
    console.error('Failed to submit map proposal:', err);
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
    if (submitBtn) { 
      submitBtn.disabled = true; 
      submitBtn.classList.add('hidden'); 
      submitBtn.style.display = 'none'; 
    }
    if (badgeEl) {
      badgeEl.textContent = '0';
      badgeEl.classList.add('hidden');
      badgeEl.style.display = 'none';
    }
    return;
  }

  const payload = generateProposalPayload();
  const count = payload ? payload.totalChanges : 0;

  if (badgeEl) {
    badgeEl.textContent = String(count);
    if (count > 0) {
      badgeEl.classList.remove('hidden');
      badgeEl.style.display = 'inline-block';
    } else {
      badgeEl.classList.add('hidden');
      badgeEl.style.display = 'none';
    }
  }

  if (submitBtn) {
    submitBtn.disabled = count === 0;
    if (count > 0) {
      submitBtn.classList.remove('hidden');
      submitBtn.style.display = 'inline-flex';
    } else {
      submitBtn.classList.add('hidden');
      submitBtn.style.display = 'none';
    }
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
      togglePlannerMode(!isPlannerActive, svgRoot || getSvgRoot());
    });
  }

  if (btnSubmit && !btnSubmit.dataset.bound) {
    btnSubmit.dataset.bound = 'true';
    btnSubmit.addEventListener('click', (e) => {
      e.preventDefault();
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

  renderTerritoryLabels(root);
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

      if (currentColorMode === 'alliance') {
        textEl.style.fill = '#ffffff';
        textEl.style.stroke = '#000000';
      } else {
        const allianceColor = getAllianceColor(ownerTag);
        textEl.style.fill = (allianceColor && allianceColor !== COLOR_FALLBACKS.unclaimed) ? allianceColor : '#ffffff';
        textEl.style.stroke = '#000000';
      }

      wrapperGroup.appendChild(textEl);
      labelGroup.appendChild(wrapperGroup);
    } catch (e) {}
  });
}

// ==========================================================================
// TOP-LEVEL OVERLAY HIGHLIGHTING
// ==========================================================================

function getHighlightOverlay(svgRoot) {
  let overlay = svgRoot.querySelector('#highlight-overlay');
  if (!overlay) {
    overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    overlay.setAttribute('id', 'highlight-overlay');
    overlay.style.pointerEvents = 'none';

    const labelGroup = svgRoot.querySelector('#territory-labels');
    if (labelGroup && labelGroup.parentNode === svgRoot) {
      svgRoot.insertBefore(overlay, labelGroup);
    } else {
      svgRoot.appendChild(overlay);
    }
  }
  return overlay;
}

/**
 * Projects a target territory clone into the high-Z overlay layer,
 * bypassing SVG <use> inline style inheritance limits.
 */
export function setHighlightedTerritory(cityId, svgRoot = null) {
  const root = svgRoot || getSvgRoot();
  if (!root) return;

  const overlay = getHighlightOverlay(root);

  if (!cityId) {
    overlay.innerHTML = '';
    return;
  }

  const targetEl = root.getElementById(cityId);
  if (!targetEl) {
    overlay.innerHTML = '';
    return;
  }

  overlay.innerHTML = '';

  // Deep-clone the node to bypass SVG <use> shadow DOM style restrictions
  const clone = targetEl.cloneNode(true);
  clone.removeAttribute('id');

  const computedStyle = window.getComputedStyle(targetEl);
  const activeFill = targetEl.style.fill || computedStyle.fill || '#1a1512';

  const subShapes = clone.querySelectorAll ? clone.querySelectorAll('path, polygon, rect, circle') : [];
  const targets = subShapes.length > 0 ? Array.from(subShapes) : [clone];

  targets.forEach(shape => {
    shape.removeAttribute('id');
    shape.style.fill = activeFill;
    shape.style.stroke = 'rgba(var(--active-theme-vivid, 255, 255, 255), 1)';
    shape.style.strokeWidth = '3px';
    shape.style.paintOrder = 'stroke fill';
    shape.style.vectorEffect = 'non-scaling-stroke';
    shape.style.filter = 'drop-shadow(0 0 4px rgba(var(--active-theme), 1)) drop-shadow(0 0 10px rgba(var(--active-theme), 0.8)) brightness(1.25)';
    shape.style.pointerEvents = 'none';
  });

  overlay.appendChild(clone);
}

export function bringTerritoryToFront(el, svgRoot = null) {
  if (!el || !el.id) return;
  setHighlightedTerritory(el.id, svgRoot);
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
    if (el.closest('#territory-labels') || el.closest('#highlight-overlay') || el.closest('defs')) return;

    if (el.dataset.bound) return;
    el.dataset.bound = 'true';

    el.style.cursor = 'pointer';

    const getTargetCity = (e) => {
      let current = e.target;
      while (current && current !== root && current !== document.body) {
        if (current.id && current.id !== 'layer1' && current.id !== 'territory-labels' && current.id !== 'highlight-overlay') {
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

    el.addEventListener('mouseenter', (e) => {
      const city = getTargetCity(e);
      const cityId = city ? city.id : (el.id || e.target.id);
      
      setHighlightedTerritory(cityId, root);
      updateInfoCard(city);
    });

    el.addEventListener('mouseleave', () => {
      setHighlightedTerritory(null, root);
      updateInfoCard(null);
    });
    
    el.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const city = getTargetCity(e);
      const cityId = city ? city.id : (el.id || e.target.id);

      if (isPlannerActive && cityId) {
        promptTerritoryAssignment(cityId, root);
        setHighlightedTerritory(cityId, root);
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