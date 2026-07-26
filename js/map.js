/**
 * map.js - Comprehensive Map Data, Parsing, Highlighting, and Label Utilities
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

export const COLOR_TO_LEVEL_MAP = {
  green: 1,
  yellow: 2,
  orange: 3,
  purple: 4,
  blue: 5,
  red: 6,
  gold: "Capitol"
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

// Datasets (populated dynamically via SVG parser & map_state.yml)
export let cities = [];
export let alliances = {};
export let mapState = {};

/**
 * Calculates the true visual center of an SVG path by sampling perimeter points.
 * Prevents L-shaped or irregular territories from skewing the centroid.
 * 
 * @param {SVGElement} pathEl - The SVG path DOM element
 * @returns {{x: number, y: number}} The visual center coordinate
 */
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
    // Fallback to bounding box if length calculation isn't supported
    const bbox = pathEl.getBBox();
    return { x: bbox.x + (bbox.width / 2), y: bbox.y + (bbox.height / 2) };
  }
}

/**
 * Merges Discord role colors into the alliances dataset and re-renders SVG labels
 * 
 * @param {Object} colorMap - Dictionary of tags and hex colors, e.g., { WLO: "#e88d63" }
 * @param {Document|Element} svgRoot - Optional SVG element to trigger an immediate re-render
 */
export function setAllianceColors(colorMap, svgRoot = null) {
  if (!colorMap || typeof colorMap !== 'object') return;

  Object.entries(colorMap).forEach(([tag, color]) => {
    if (!alliances[tag]) {
      alliances[tag] = { name: tag };
    }
    alliances[tag].color = color;
  });

  // Re-render territory labels with the new colors
  if (svgRoot) {
    renderTerritoryLabels(svgRoot);
  }
}

/**
 * Parses an SVG document or element and extracts cities 
 * strictly based on their parent group's inkscape:label color.
 * 
 * @param {Document|Element} svgRoot - The SVG DOM root element or document
 * @returns {Array} Array of city objects with correctly assigned levels
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

/**
 * Calculates territory centroids and places dynamically-scaled owner text labels
 * constrained strictly within shape dimensions.
 * 
 * @param {Document|Element} svgRoot - The SVG container element
 */
/**
 * Calculates territory centroids, places dynamically-measured owner text labels,
 * and clips text strictly within the territory's exact SVG path boundary.
 * 
 * @param {Document|Element} svgRoot - The SVG container element
 */
export function renderTerritoryLabels(svgRoot) {
  if (!svgRoot) return;

  // 1. Fetch or create top layer for labels
  let labelGroup = svgRoot.querySelector('#territory-labels');
  if (!labelGroup) {
    labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    labelGroup.setAttribute('id', 'territory-labels');
    labelGroup.style.pointerEvents = 'none';
    svgRoot.appendChild(labelGroup);
  }
  labelGroup.innerHTML = '';

  // 2. Fetch or create SVG <defs> container for clip paths
  let defs = svgRoot.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svgRoot.insertBefore(defs, svgRoot.firstChild);
  }

  // 3. Render and clip each label
  cities.forEach(city => {
    if (!city.owner || city.owner === 'Unclaimed') return;

    const pathEl = svgRoot.getElementById(city.id);
    if (!pathEl) return;

    try {
      const center = getVisualCenter(pathEl);
      const bbox = pathEl.getBBox();
      if (bbox.width === 0 || bbox.height === 0) return;

      const ownerTag = String(city.owner);

      // --- HARD CLIP-PATH MASKING ---
      // Reuses or creates a unique clipPath referencing the territory's path element
      const clipId = `clip-label-${city.id}`;
      let clipPath = svgRoot.querySelector(`#${clipId}`);
      if (!clipPath) {
        clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
        clipPath.setAttribute('id', clipId);
        
        const useEl = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        useEl.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${city.id}`);
        useEl.setAttribute('href', `#${city.id}`);
        
        clipPath.appendChild(useEl);
        defs.appendChild(clipPath);
      }

      // --- CREATE TEXT ELEMENT ---
      const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textEl.setAttribute('x', center.x);
      textEl.setAttribute('y', center.y);
      textEl.setAttribute('dy', '0.35em');
      
      // Bind hard clipping mask
      textEl.setAttribute('clip-path', `url(#${clipId})`);

      // Alignment overrides
      textEl.style.textAnchor = 'middle';
      textEl.style.dominantBaseline = 'central';
      
      // Initial sizing starting point based on box height
      let fontSize = Math.min(32, Math.max(12, bbox.height * 0.45));
      textEl.style.fontSize = `${fontSize}px`;

      textEl.setAttribute('class', 'territory-label');
      textEl.setAttribute('data-owner', ownerTag);
      textEl.textContent = ownerTag;

      // Color assignment
      const allianceData = alliances[ownerTag];
      if (allianceData && allianceData.color) {
        textEl.style.fill = allianceData.color;
      }

      // Append to DOM first so getComputedTextLength can accurately measure rendered pixels
      labelGroup.appendChild(textEl);

      // --- EXACT BROWSER DOM MEASUREMENT & AUTOSCALING ---
      const maxAllowedWidth = bbox.width * 0.68;
      const actualWidth = textEl.getComputedTextLength();

      if (actualWidth > maxAllowedWidth && actualWidth > 0) {
        const scaleFactor = maxAllowedWidth / actualWidth;
        fontSize = Math.max(9, fontSize * scaleFactor);
        textEl.style.fontSize = `${fontSize.toFixed(1)}px`;
      }

    } catch (e) {
      console.warn(`Could not calculate label position for city: ${city.id}`, e);
    }
  });
}

/**
 * Applies a parsed map state object (from map_state.yml) to the cities dataset
 * @param {Object} state - Parsed YAML object containing alliances and territory_ownership
 * @param {Document|Element} svgRoot - Optional SVG element to refresh labels immediately
 */
export function applyMapState(state, svgRoot = null) {
  if (!state) return;

  mapState = state;

  if (state.alliances) {
    alliances = state.alliances;
  }

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

  if (svgRoot) {
    renderTerritoryLabels(svgRoot);
  }
}

/**
 * Fetches and parses map_state.yml and updates map ownership data
 * @param {string} yamlUrl - Path to map_state.yml (defaults to 'map_state.yml')
 * @param {Document|Element} svgRoot - The SVG root container
 * @returns {Promise<Object>}
 */
export async function loadMapState(yamlUrl = '/_data/map_state.yml', svgRoot = null) {
  try {
    const response = await fetch(yamlUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const yamlText = await response.text();

    let state = {};

    // Use global jsyaml library if available, otherwise fall back to simple built-in parser
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

/**
 * Initialize dataset from a loaded SVG element in the browser and load map state YAML
 * @param {Document|Element} svgRoot 
 * @returns {Array}
 */
export function initializeMapData(svgRoot) {
  cities = extractCitiesFromSvg(svgRoot);
  
  // Use global window.MAP_STATE if available
  if (typeof window !== 'undefined' && window.MAP_STATE) {
    applyMapState(window.MAP_STATE, svgRoot);
  } else {
    renderTerritoryLabels(svgRoot);
  }
  
  return cities;
}

/**
 * Updates a city's owner and refreshes both the map labels and the data store
 * @param {string} cityId - ID of the territory path
 * @param {string} newOwner - Alliance tag or owner string (e.g. "VAL")
 * @param {Document|Element} svgRoot - The SVG container element
 */
export function updateCityOwner(cityId, newOwner, svgRoot) {
  const city = getCityById(cityId);
  if (city) {
    city.owner = newOwner || 'Unclaimed';
    if (svgRoot) {
      renderTerritoryLabels(svgRoot);
    }
  }
}

/**
 * Enables hover/click highlighting and updates the territory info card
 * @param {Document|Element} svgRoot - The SVG container element
 */
export function enableMapHighlighting(svgRoot) {
  const colorLabels = Object.keys(COLOR_TO_LEVEL_MAP);
  
  // DOM targets for the info card
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
        ? `Level ${cityData.level}` 
        : cityData.level; // Handles "Capitol" string
    }

    // Display Alliance Name if registered in map_state.yml
    if (cityOwnerEl) {
      const ownerTag = cityData.owner || 'Unclaimed';
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

      // Live update on hover
      el.addEventListener('mouseenter', (e) => {
        const cityData = getCityById(e.target.id);
        updateInfoCard(cityData);
      });

      // Reset card when mouse leaves
      el.addEventListener('mouseleave', () => {
        updateInfoCard(null);
      });

      // Handle selection click
      el.addEventListener('click', (e) => {
        const cityId = e.target.id;
        const cityData = getCityById(cityId);
        console.log("Selected City:", cityData);
      });
    });
  });
}

/**
 * Utility function to retrieve city details by ID
 */
export function getCityById(id) {
  return cities.find(city => city.id === id);
}

/**
 * Utility function to filter cities by level
 */
export function getCitiesByLevel(level) {
  return cities.filter(city => city.level === level);
}

/**
 * Utility function to filter cities by color group
 */
export function getCitiesByGroup(groupColor) {
  return cities.filter(city => city.group === groupColor);
}

/**
 * Lightweight fallback YAML parser for map_state.yml structure
 */
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