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

/**
 * Manual position, rotation, and font sizing overrides for awkward territory shapes.
 * 
 * Available options per city ID:
 * - offsetX: Number (positive moves right, negative moves left)
 * - offsetY: Number (positive moves down, negative moves up)
 * - rotate: Number in degrees (e.g. 90 or -90)
 * - scale: Number multiplier for font size (e.g. 1.2 for 20% larger, 0.8 for 20% smaller)
 */
export const LABEL_OVERRIDES = {
  Sky_Fortress: {
    rotate: 270,
    offsetX: -40
  },
  Royal_Castle: {
    offsetX: -5,
    offsetY: -10,
    scale: 1.5
  },
  Lionheart_Fortress: {
    offsetY: -35
  },
  Cloudtop_Highlands: {
    offsetX: 28
  },
  Stillwater_River: {
    offsetY: -30
  },
  Raven_s_Roost: {
    offsetY: -20
  },
  Bluestone_Slope: {
    offsetY: -20
  },
    Sunspire_City: {
    offsetY: -20
  },
    Emerald_City: {
    offsetY: 20,
    offsetX: 20
  },
    Graywolf_Vale: {
    offsetY: -20
  },
    Rose_Court: {
    offsetY: -20
  },
    Falcon_s_Keep: {
    offsetY: -30,
    offsetX: -10
  },
    Ironwall_City: {
    offsetY: -30,
    offsetX: 20
  },
    Holyspring_City: {
    offsetY: -20
  },
    Temple_of_War: {
    offsetY: -20
  },
    Mithrall_Hall: {
    offsetY: -20,
    offsetX: 30
  },
  Cliffside_Citadel: {
    offsetX: 10
  },
  Stormgate: {
    offsetX: -8
  },
  Goldgrain_Town: {
    offsetY: -20
  },
  Redsoil_Wastes: {
    offsetX: 20
  },
  Opal_Mine: {
    offsetY: -20
  },
  Maple_Town: {
    offsetY: -20
  },
  Irongate_Town: {
    offsetY: -10
  },
  Stagcall_Vale: {
    offsetY: -10
  },
  Beacon_Point: {
    offsetY: -20
  },
  Millstone_Creek: {
    offsetY: -40
  },
  Sandwind_Keep: {
    offsetY: -20
  },
  Lark_Lane: {
    offsetY: -40
  },
  Anvil_Town: {
    offsetY: -10
  },
  Dripping_Cavern: {
    offsetY: -30
  },
  
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
  // Inside renderTerritoryLabels() in map.js:

cities.forEach(city => {
  if (!city.owner || city.owner === 'Unclaimed') return;

  const pathEl = svgRoot.getElementById(city.id);
  if (!pathEl) return;

  try {
    // 1. Get base visual center and bounding box
    const center = getVisualCenter(pathEl);
    const bbox = pathEl.getBBox();
    if (bbox.width === 0 || bbox.height === 0) return;

    // 2. Fetch any manual overrides defined for this city ID
    const override = LABEL_OVERRIDES[city.id] || {};
    const finalX = center.x + (override.offsetX || 0);
    const finalY = center.y + (override.offsetY || 0);

    const ownerTag = String(city.owner);

    // 3. Dynamic Font Sizing (with manual scale multiplier support)
    const maxAllowedWidth = bbox.width * 0.68;
    const maxAllowedHeight = bbox.height * 0.55;
    const maxFontSizeByWidth = maxAllowedWidth / (ownerTag.length * 0.65);
    let fontSize = Math.max(10, Math.min(46, maxFontSizeByWidth, maxAllowedHeight));

    if (override.scale) {
      fontSize *= override.scale;
    }

    // 4. Create Text Element
    const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textEl.setAttribute('x', finalX);
    textEl.setAttribute('y', finalY);
    textEl.setAttribute('dy', '0.35em');

    // Apply rotation around the text's calculated position
    if (override.rotate) {
      textEl.setAttribute('transform', `rotate(${override.rotate}, ${finalX}, ${finalY})`);
    }

    // Alignment and Styling
    textEl.style.textAnchor = 'middle';
    textEl.style.dominantBaseline = 'central';
    textEl.style.fontSize = `${fontSize.toFixed(1)}px`;

    textEl.setAttribute('class', 'territory-label');
    textEl.setAttribute('data-owner', ownerTag);
    textEl.textContent = ownerTag;

    const allianceData = alliances[ownerTag];
    if (allianceData && allianceData.color) {
      textEl.style.fill = allianceData.color;
    }

    labelGroup.appendChild(textEl);
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