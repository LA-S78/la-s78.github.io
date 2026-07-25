/**
 * map.js - Comprehensive Map Data, Parsing, and Highlighting Utilities
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

// Main Cities Dataset (populated dynamically via SVG parser)
export let cities = [];

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
            owner: "Unclaimed"
          });
        }
      });
    }
  });

  return extractedCities;
}

/**
 * Initialize dataset from a loaded SVG element in the browser
 * @param {Document|Element} svgRoot 
 * @returns {Array}
 */
export function initializeMapData(svgRoot) {
  cities = extractCitiesFromSvg(svgRoot);
  return cities;
}

/**
 * Enables hover/click highlighting and interaction on the SVG map elements
 * @param {Document|Element} svgRoot - The SVG container element
 */
export function enableMapHighlighting(svgRoot) {
  const colorLabels = Object.keys(COLOR_TO_LEVEL_MAP);

  colorLabels.forEach(color => {
    const group = svgRoot.querySelector(`g[inkscape\\:label="${color}"]`);
    if (!group) return;

    const elements = group.querySelectorAll('path, rect, circle, polygon');

    elements.forEach(el => {
      // Keep cursor pointer and click handler in JS
      el.style.cursor = 'pointer';

      el.addEventListener('click', (e) => {
        const cityId = e.target.id;
        const cityData = getCityById(cityId);
        console.log("Clicked City Details:", cityData || { id: cityId, group: color });
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