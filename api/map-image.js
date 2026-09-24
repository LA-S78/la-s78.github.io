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

const LEVEL_COLORS = {
  1: '#334155', // Slate Dark
  2: '#15803d', // Forest Green
  3: '#0284c7', // Sky Blue
  4: '#7e22ce', // Epic Purple
  5: '#c2410c', // Fiery Orange
  6: '#b91c1c', // Deep Crimson
  7: '#ca8a04', // Amber
  8: '#eab308'  // Golden Citadel
};

const RESOURCE_COLORS = {
  grain: '#d97706',   // Amber
  timber: '#854d0e',  // Wood Brown
  iron: '#475569',    // Iron Slate
  herbs: '#059669',   // Herb Green
  march: '#eab308',   // Speed Gold
  attack: '#dc2626',  // Attack Red
  might: '#dc2626',
  defense: '#2563eb', // Defense Blue
  training: '#9333ea' // Training Purple
};

// Normalize cities catalog whether exported as an Array or Object
const CITIES_MAP = {};
if (Array.isArray(rawCitiesData)) {
  rawCitiesData.forEach(c => { if (c?.id) CITIES_MAP[c.id] = c; });
} else if (rawCitiesData && typeof rawCitiesData === 'object') {
  Object.assign(CITIES_MAP, rawCitiesData);
}

function getResourceColor(resourceType, buffType) {
  const target = `${resourceType || ''} ${buffType || ''}`.toLowerCase();
  for (const [key, color] of Object.entries(RESOURCE_COLORS)) {
    if (target.includes(key)) return color;
  }
  return '#27272a'; // Zinc neutral
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

    const view = String(req.query.view || req.query.mode || 'alliance').toLowerCase();
    const mapState = await getLiveMapState();
    const ownership = mapState?.territory_ownership || {};
    const alliances = mapState?.alliances || {};

    const cssRules = [
      'path, polygon, rect, circle { stroke: #000000; stroke-width: 1.5px; stroke-linejoin: round; }'
    ];

    let labelElements = '';

    // =========================================================================
    // MODE 1: ALLIANCE VIEW (Default)
    // =========================================================================
    if (view === 'alliance') {
      Object.entries(ownership).forEach(([cityId, data]) => {
        const owner = typeof data === 'string' ? data : (data?.owner || 'Unclaimed');
        if (!owner || owner === 'Unclaimed') return;

        const color = getAllianceColor(owner, alliances);
        cssRules.push(
          `#${cityId}, #${cityId} * { fill: ${color} !important; fill-opacity: 0.85 !important; }`
        );

        const center = centroids[cityId];
        if (center) {
          const override = LABEL_OVERRIDES[cityId] || {};
          const finalX = center.x + (override.offsetX || 0);
          const finalY = center.y + (override.offsetY || 0);

          const maxAllowedWidth = center.width * 0.75;
          const maxAllowedHeight = center.height * 0.65;
          const maxFontSizeByWidth = maxAllowedWidth / (owner.length * 0.55);
          let fontSize = Math.max(12, Math.min(48, maxFontSizeByWidth, maxAllowedHeight));
          if (override.scale) fontSize *= override.scale;

          const strokeWidth = Math.max(2, Math.round(fontSize * 0.16));
          const safeOwner = owner.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

          let textTag = `<text x="${finalX.toFixed(1)}" y="${finalY.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="${fontSize.toFixed(1)}px" fill="#ffffff" stroke="#000000" stroke-width="${strokeWidth}px" stroke-linejoin="round" paint-order="stroke fill">${safeOwner}</text>`;

          if (override.rotate) {
            textTag = `<g transform="rotate(${override.rotate}, ${finalX.toFixed(1)}, ${finalY.toFixed(1)})">${textTag}</g>`;
          }

          labelElements += `  ${textTag}\n`;
        }
      });
    }

    // =========================================================================
    // MODE 2: LEVEL OR RESOURCE VIEW
    // =========================================================================
    else {
      Object.keys(centroids).forEach((cityId) => {
        const city = CITIES_MAP[cityId] || {};
        let fillColor = '#1e293b';
        let labelText = '';

        if (view === 'level') {
          const lvl = city.level || (cityId === 'Royal_Castle' ? 8 : 1);
          fillColor = LEVEL_COLORS[lvl] || '#334155';
          labelText = `Lv.${lvl}`;
        } else if (view === 'resource') {
          fillColor = getResourceColor(city.resource, city.buff_type);
          labelText = city.resource || city.buff_val || (city.buff_type ? city.buff_type.slice(0, 7) : '');
        }

        cssRules.push(
          `#${cityId}, #${cityId} * { fill: ${fillColor} !important; fill-opacity: 0.88 !important; }`
        );

        const center = centroids[cityId];
        if (center && labelText) {
          const override = LABEL_OVERRIDES[cityId] || {};
          const finalX = center.x + (override.offsetX || 0);
          const finalY = center.y + (override.offsetY || 0);

          const maxAllowedWidth = center.width * 0.75;
          const maxAllowedHeight = center.height * 0.65;
          const maxFontSizeByWidth = maxAllowedWidth / (labelText.length * 0.55);
          let fontSize = Math.max(11, Math.min(46, maxFontSizeByWidth, maxAllowedHeight));
          if (override.scale) fontSize *= override.scale;

          const strokeWidth = Math.max(2, Math.round(fontSize * 0.16));
          const safeText = labelText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

          let textTag = `<text x="${finalX.toFixed(1)}" y="${finalY.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="${fontSize.toFixed(1)}px" fill="#ffffff" stroke="#000000" stroke-width="${strokeWidth}px" stroke-linejoin="round" paint-order="stroke fill">${safeText}</text>`;

          if (override.rotate) {
            textTag = `<g transform="rotate(${override.rotate}, ${finalX.toFixed(1)}, ${finalY.toFixed(1)})">${textTag}</g>`;
          }

          labelElements += `  ${textTag}\n`;
        }
      });
    }

    // Inject styles and layers into SVG
    svg = svg.replace(/<svg[^>]*>/, `$&<style>\n${cssRules.join('\n')}\n</style>`);
    svg = svg.replace(/<\/svg>/, `<g id="territory-labels" style="pointer-events: none;">\n${labelElements}</g>\n</svg>`);

    const fontFiles = fs.existsSync(FONT_PATH) ? [FONT_PATH] : [];
    const resvg = new Resvg(svg, {
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