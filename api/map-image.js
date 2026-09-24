// api/map-image.js
import fs from 'fs';
import { Resvg } from '@resvg/resvg-js';
import rawSvg from './_map_svg.js';
import centroids from './_centroids.js';
import fontBase64 from './_font_data.js';
import rawCitiesData from './_cities_data.js';

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

const AUTO_ALLIANCE_PALETTE = [
  '#e68e00', '#a400af', '#0070f3', '#25bb00', '#e53e3e',
  '#dd6b20', '#319795', '#d69e2e', '#805ad5', '#d53f8c',
  '#38a169', '#00b5d8'
];

const LEVEL_COLORS_BY_NUM = {
  1: '#25bb00', // Lv 1 Green
  2: '#cece00', // Lv 2 Yellow
  3: '#e68e00', // Lv 3 Orange
  4: '#a400af', // Lv 4 Purple
  5: '#003fad', // Lv 5 Blue
  6: '#8f0000', // Lv 6 Red
  7: '#b29a20', // Gold
  8: '#b29a20'  // Capitol Gold
};

const RESOURCE_PALETTE = {
  grain: '#e07a12',
  timber: '#4a2411',
  herbs: '#059669',
  march: '#facc15',
  training: '#dc2626',
  research: '#7c3aed',
  building: '#ea580c'
};

// Normalize city lookup catalog
const CITIES_MAP = {};
if (Array.isArray(rawCitiesData)) {
  rawCitiesData.forEach(c => {
    if (c?.id) {
      CITIES_MAP[c.id] = c;
      CITIES_MAP[c.id.replace(/\s+/g, '_')] = c;
    }
  });
} else if (rawCitiesData && typeof rawCitiesData === 'object') {
  Object.entries(rawCitiesData).forEach(([k, v]) => {
    CITIES_MAP[k] = v;
    CITIES_MAP[k.replace(/\s+/g, '_')] = v;
  });
}

function getAllianceColor(tag, alliances = {}) {
  if (!tag || tag === 'Unclaimed') return '#2d3748';
  if (alliances[tag]?.color) return alliances[tag].color;

  const rankedTags = Object.entries(alliances)
    .filter(([_, data]) => data?.rank !== undefined && data.rank !== null && data.rank !== '')
    .sort(([_, a], [__, b]) => Number(a.rank) - Number(b.rank))
    .map(([t]) => t);

  const rankIdx = rankedTags.indexOf(tag);
  if (rankIdx !== -1) return AUTO_ALLIANCE_PALETTE[rankIdx % AUTO_ALLIANCE_PALETTE.length];

  const allTags = Object.keys(alliances);
  const tagIdx = allTags.indexOf(tag);
  if (tagIdx !== -1) return AUTO_ALLIANCE_PALETTE[tagIdx % AUTO_ALLIANCE_PALETTE.length];

  return '#718096';
}

function getCityLevelFill(cityId, city = {}) {
  if (cityId === 'Royal_Castle') return '#b29a20';
  const lvl = parseInt(city.level, 10);
  if (!isNaN(lvl) && LEVEL_COLORS_BY_NUM[lvl]) {
    return LEVEL_COLORS_BY_NUM[lvl];
  }
  const group = String(city.group || '').toLowerCase();
  const groupMap = {
    green: '#25bb00',
    yellow: '#cece00',
    orange: '#e68e00',
    purple: '#a400af',
    blue: '#003fad',
    red: '#8f0000',
    gold: '#b29a20'
  };
  return groupMap[group] || '#25bb00';
}

function getCityResourceFill(cityId, city = {}) {
  if (cityId === 'Royal_Castle' || city.level === 'Capitol') return RESOURCE_PALETTE.march;

  const buff = String(city.buff || '').toLowerCase();
  const buffType = String(city.buff_type || '').toLowerCase();
  const res = String(city.resource || '').toLowerCase();
  const combined = `${buff} ${buffType} ${res}`;

  // Level 6 / Special Hubs
  if (city.level === 6 || combined.includes('research') || combined.includes('tech')) return RESOURCE_PALETTE.research;
  if (combined.includes('train')) return RESOURCE_PALETTE.training;
  if (combined.includes('construct') || combined.includes('build')) return RESOURCE_PALETTE.building;

  // Core 3 Resources
  let matchedRes = null;
  if (res.includes('grain') || combined.includes('grain') || combined.includes('wheat') || combined.includes('food')) {
    matchedRes = 'grain';
  } else if (res.includes('timber') || combined.includes('timber') || combined.includes('wood') || combined.includes('lumber')) {
    matchedRes = 'timber';
  } else if (res.includes('herb') || combined.includes('herb') || combined.includes('medicine')) {
    matchedRes = 'herbs';
  }

  if (!matchedRes) return '#2d3748';

  // Production uses the diagonal hatch pattern; Gathering uses the solid color
  const isProduction = buffType === 'production' || combined.includes('prod') || combined.includes('output') || combined.includes('yield') || !combined.includes('gather');
  return isProduction ? `url(#pat-${matchedRes})` : RESOURCE_PALETTE[matchedRes];
}

/**
 * Directly rewrites the fill attributes on the SVG element matching cityId.
 * Bypasses Resvg CSS limitations by mutating path/polygon elements directly.
 */
function applyFillToTerritory(svg, cityId, fillColor) {
  const alt1 = cityId;
  const alt2 = cityId.replace(/_/g, ' ');
  const alt3 = cityId.replace(/_s_/g, "'s ").replace(/_/g, ' ');
  const alt4 = cityId.replace(/_s_/g, "&#39;s ").replace(/_/g, ' ');

  const escapeRegex = s => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const idPattern = Array.from(new Set([alt1, alt2, alt3, alt4])).map(escapeRegex).join('|');

  // Case 1: Territory is a group <g ... (id|inkscape:label)="...">(content)</g>
  const groupRegex = new RegExp(`(<g\\b[^>]*?\\b(?:id|inkscape:label)=["'](?:${idPattern})["'][^>]*>)([\\s\\S]*?)(<\\/g>)`, 'i');
  if (groupRegex.test(svg)) {
    return svg.replace(groupRegex, (match, openTag, inner, closeTag) => {
      let updated = inner.replace(/(<(?:path|polygon|rect|circle)\b[^>]*?)\bfill=["'][^"']*["']/gi, `$1fill="${fillColor}"`);
      updated = updated.replace(/(<(?:path|polygon|rect|circle)\b(?:(?!fill=)[^>])*)>/gi, `$1 fill="${fillColor}">`);
      updated = updated.replace(/style=["']([^"']*)["']/gi, (m, st) => {
        const clean = st.replace(/fill\s*:\s*[^;"]+;?/gi, '');
        return `style="${clean};fill:${fillColor}"`;
      });
      return `${openTag}${updated}${closeTag}`;
    });
  }

  // Case 2: Territory is a single tag: <path ... (id|inkscape:label)="..." ...>
  const leafRegex = new RegExp(`(<(?:path|polygon|rect|circle)\\b[^>]*?\\b(?:id|inkscape:label)=["'](?:${idPattern})["'][^>]*?)>`, 'i');
  if (leafRegex.test(svg)) {
    return svg.replace(leafRegex, (match, tagBody) => {
      let updated = tagBody;
      if (/\bfill=["'][^"']*["']/i.test(updated)) {
        updated = updated.replace(/\bfill=["'][^"']*["']/i, `fill="${fillColor}"`);
      } else {
        updated += ` fill="${fillColor}"`;
      }
      if (/style=["'][^"']*["']/i.test(updated)) {
        updated = updated.replace(/style=["']([^"']*)["']/i, (m, st) => {
          const clean = st.replace(/fill\s*:\s*[^;"]+;?/gi, '');
          return `style="${clean};fill:${fillColor}"`;
        });
      }
      return `${updated}>`;
    });
  }

  return svg;
}

async function getLiveMapState() {
  const gistId = process.env.GIST_ID;
  const gistToken = process.env.GIST_TOKEN;
  if (!gistId) return null;

  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        ...(gistToken ? { Authorization: `Bearer ${gistToken}` } : {}),
        'User-Agent': 'WarRoom-MapRenderer'
      },
      signal: AbortSignal.timeout(2000)
    });

    if (!res.ok) return null;
    const gistData = await res.json();
    return JSON.parse(gistData.files?.['map-state.json']?.content || '{}');
  } catch (err) {
    return null;
  }
}

// Stage font in /tmp
const FONT_PATH = '/tmp/DejaVuSans-Bold.ttf';
if (fontBase64 && fontBase64.length > 100 && !fs.existsSync(FONT_PATH)) {
  try {
    fs.writeFileSync(FONT_PATH, Buffer.from(fontBase64, 'base64'));
  } catch (err) {
    console.warn('Could not write font to /tmp:', err);
  }
}

export default async function handler(req, res) {
  try {
    let svg = rawSvg;
    if (!svg || typeof svg !== 'string') {
      return res.status(500).json({ error: 'map_svg module failed to load.' });
    }

    const rawView = String(req.query.view || req.query.mode || 'level').toLowerCase();
    let view = 'level';
    if (rawView.startsWith('alliance')) view = 'alliance';
    if (rawView.startsWith('resource')) view = 'resource';

    const mapState = await getLiveMapState();
    const ownership = mapState?.territory_ownership || {};
    const alliances = mapState?.alliances || {};

    let labelElements = '';
    let modifiedSvg = svg;

    // 1. Recolor each territory directly on the SVG markup
    Object.keys(centroids).forEach((cityId) => {
      const city = CITIES_MAP[cityId] || CITIES_MAP[cityId.replace(/_/g, ' ')] || {};
      const ownerData = ownership[cityId];
      const owner = typeof ownerData === 'string' ? ownerData : (ownerData?.owner || 'Unclaimed');
      const isOwned = owner && owner !== 'Unclaimed';

      let targetFill = '#2d3748';
      if (view === 'alliance') {
        targetFill = isOwned ? getAllianceColor(owner, alliances) : '#2d3748';
      } else if (view === 'resource') {
        targetFill = getCityResourceFill(cityId, city);
      } else {
        targetFill = getCityLevelFill(cityId, city);
      }

      modifiedSvg = applyFillToTerritory(modifiedSvg, cityId, targetFill);

      // 2. Build Text Labels (Alliance Names ONLY on claimed territories across ALL views)
      if (isOwned && centroids[cityId]) {
        const center = centroids[cityId];
        const override = LABEL_OVERRIDES[cityId] || {};
        const finalX = center.x + (override.offsetX || 0);
        const finalY = center.y + (override.offsetY || 0);

        const maxAllowedWidth = center.width * 0.75;
        const maxAllowedHeight = center.height * 0.65;
        const maxFontSizeByWidth = maxAllowedWidth / (owner.length * 0.55);
        let fontSize = Math.max(12, Math.min(48, maxFontSizeByWidth, maxAllowedHeight));
        if (override.scale) fontSize *= override.scale;

        const strokeWidth = Math.max(2, Math.round(fontSize * 0.16));
        const safeOwner = String(owner)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

        let textTag = `<text x="${finalX.toFixed(1)}" y="${finalY.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="${fontSize.toFixed(1)}px" fill="#ffffff" stroke="#000000" stroke-width="${strokeWidth}px" stroke-linejoin="round" paint-order="stroke fill">${safeOwner}</text>`;

        if (override.rotate) {
          textTag = `<g transform="rotate(${override.rotate}, ${finalX.toFixed(1)}, ${finalY.toFixed(1)})">${textTag}</g>`;
        }

        labelElements += `  ${textTag}\n`;
      }
    });

    // Clean, crisp stroke rule on all path elements
    const baseStyle = `
      <style>
        path, polygon, rect, circle { stroke: #000000 !important; stroke-width: 1.5px !important; stroke-linejoin: round !important; }
      </style>
    `;

    // Production diagonal patterns for Grain, Timber, Herbs
    const resourcePatternDefs = `
      <defs>
        <pattern id="pat-grain" width="10" height="10" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill="#e07a12" />
          <line x1="0" y1="0" x2="0" y2="10" stroke="#000000" stroke-width="3.5" stroke-opacity="0.45" />
        </pattern>
        <pattern id="pat-timber" width="10" height="10" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill="#4a2411" />
          <line x1="0" y1="0" x2="0" y2="10" stroke="#000000" stroke-width="3.5" stroke-opacity="0.45" />
        </pattern>
        <pattern id="pat-herbs" width="10" height="10" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill="#059669" />
          <line x1="0" y1="0" x2="0" y2="10" stroke="#000000" stroke-width="3.5" stroke-opacity="0.45" />
        </pattern>
      </defs>
    `;

    // Inject patterns, base stroke styles, and text labels
    modifiedSvg = modifiedSvg.replace(/<svg[^>]*>/, `$&${resourcePatternDefs}${baseStyle}`);
    modifiedSvg = modifiedSvg.replace(/<\/svg>/, `<g id="territory-labels" style="pointer-events: none;">\n${labelElements}</g>\n</svg>`);

    const fontFiles = fs.existsSync(FONT_PATH) ? [FONT_PATH] : [];
    const resvg = new Resvg(modifiedSvg, {
      fitTo: { mode: 'width', value: 1200 },
      background: '#120f0d',
      font: {
        fontFiles: fontFiles,
        defaultFontFamily: 'DejaVu Sans',
        loadSystemFonts: true
      }
    });

    const pngBuffer = resvg.render().asPng();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=180, stale-while-revalidate=300');
    return res.status(200).send(pngBuffer);
  } catch (renderErr) {
    console.error('Rendering error:', renderErr);
    return res.status(500).json({ error: renderErr.message });
  }
}