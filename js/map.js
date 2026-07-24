/**
 * Color-to-Level Mapping Rules:
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

/**
 * Parses an SVG document (browser DOM or JSDOM) and extracts cities 
 * strictly based on their parent group's inkscape:label color.
 * 
 * @param {Document|Element} svgRoot - The SVG DOM root element or document
 * @returns {Array} Array of city objects with correctly assigned levels
 */
export function extractCitiesFromSvg(svgRoot) {
  const cities = [];

  // Iterate through each color defined in our mapping
  Object.entries(COLOR_TO_LEVEL_MAP).forEach(([colorLabel, assignedLevel]) => {
    // Target the group explicitly by its Inkscape label
    const colorGroup = svgRoot.querySelector(`g[inkscape\\:label="${colorLabel}"]`);

    if (colorGroup) {
      // Find all target nodes (like paths, rects, or nested groups) inside this color group
      const cityElements = colorGroup.querySelectorAll('path, rect, circle, g[id]');

      cityElements.forEach((el, index) => {
        const elementId = el.id;
        const elementLabel = el.getAttribute('inkscape:label');
        
        // Skip generic layer wrappers or empty IDs if necessary
        if (!elementId && !elementLabel) return;

        const uniqueId = elementId || `${colorLabel}_city_${index + 1}`;
        const cityName = elementLabel || uniqueId;

        // Prevent duplicate entries if nested sub-elements are matched
        if (!cities.some(c => c.id === uniqueId)) {
          cities.push({
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

  return cities;
}

// Export a placeholder array that you can populate statically or dynamically
export let cities = [];

/**
 * Initialize dataset from an loaded SVG element in the browser
 * Example usage: 
 *   const svgElement = document.getElementById('my-svg-map');
 *   cities = initializeMapData(svgElement);
 */
export function initializeMapData(svgRoot) {
  cities = extractCitiesFromSvg(svgRoot);
  return cities;
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