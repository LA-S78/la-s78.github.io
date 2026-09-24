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
  8: '#eab308'  // Golden Capitol
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
  if (!tag || tag === 'Unclaimed') return '#27272a';
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

  return '#52525b';
}

function getResourceFill(cityId, city = {}) {
  if (cityId === 'Royal_Castle') return '#eab308'; // Capitol Gold

  const resType = String(city.resource || '').toLowerCase();
  const buffType = String(city.buff_type || '').toLowerCase();
  const target = `${resType} ${buffType}`;

  // 1. Basic Production Resources (Hatched Patterns)
  if (target.includes('grain') || target.includes('wheat') || target.includes('food')) {
    return 'url(#pat-grain)';
  }
  if (target.includes('timber') || target.includes('wood') || target.includes('lumber')) {
    return 'url(#pat-timber)';
  }
  if (target.includes('iron') || target.includes('steel') || target.includes('metal')) {
    return 'url(#pat-iron)';
  }
  if (target.includes('herb') || target.includes('medicine')) {
    return 'url(#pat-herbs)';
  }

  // 2. Level 6 Development Specializations (Solid Tactical Fills)
  if (target.includes('research') || target.includes('tech')) {
    return '#2563eb'; // Tech Sapphire
  }
  if (target.includes('construct') || target.includes('build')) {
    return '#06b6d4'; // Blueprint Cyan
  }
  if (target.includes('train')) {
    return '#9333ea'; // Barracks Purple
  }

  return '#27272a'; // Neutral zinc for territories without active bonuses
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

    // Default view is 'level'
    let rawView = String(req.query.view || req.query.mode || 'level').toLowerCase();
    let view = 'level';
    if (rawView.startsWith('alliance')) view = 'alliance';
    if (rawView.startsWith('resource')) view = 'resource';

    const mapState = await getLiveMapState();
    const ownership = mapState?.territory_ownership || {};
    const alliances = mapState?.alliances || {};

    const cssRules = [
      'path, polygon, rect, circle { stroke: #000000; stroke-width: 1.5px; stroke-linejoin: round; }'
    ];

    let labelElements = '';

    // Iterate through all mapped territories
    Object.keys(centroids).forEach((cityId) => {
      const city = CITIES_MAP[cityId] || CITIES_MAP[cityId.replace(/_/g, ' ')] || {};
      const ownerData = ownership[cityId];
      const owner = typeof ownerData === 'string' ? ownerData : (ownerData?.owner || 'Unclaimed');
      const isOwned = owner && owner !== 'Unclaimed';

      let fillColor = '#27272a';

      // 1. Determine Territory Color based on View
      if (view === 'level') {
        const lvl = city.level || (cityId === 'Royal_Castle' ? 8 : 1);
        fillColor = LEVEL_COLORS[lvl] || LEVEL_COLORS[1];
      } else if (view === 'alliance') {
        fillColor = isOwned ? getAllianceColor(owner, alliances) : '#27272a';
      } else if (view === 'resource') {
        fillColor = getResourceFill(cityId, city);
      }

      cssRules.push(
        `#${cityId}, #${cityId} * { fill: ${fillColor} !important; fill-opacity: 0.9 !important; }`
      );

      // 2. Render Text Labels (Alliance Names ONLY on claimed territories across ALL views)
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

    // SVG Pattern Definitions for Resource View (Production Diagonal Hatches)
    const resourcePatternDefs = `
    <defs>
      <pattern id="pat-grain" width="16" height="16" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
        <rect width="16" height="16" fill="#e07a12" />
        <line x1="0" y1="0" x2="0" y2="16" stroke="#000000" stroke-width="3.5" stroke-opacity="0.32" />
      </pattern>
      <pattern id="pat-timber" width="16" height="16" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
        <rect width="16" height="16" fill="#4a2411" />
        <line x1="0" y1="0" x2="0" y2="16" stroke="#000000" stroke-width="3.5" stroke-opacity="0.32" />
      </pattern>
      <pattern id="pat-iron" width="16" height="16" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
        <rect width="16" height="16" fill="#475569" />
        <line x1="0" y1="0" x2="0" y2="16" stroke="#000000" stroke-width="3.5" stroke-opacity="0.32" />
      </pattern>
      <pattern id="pat-herbs" width="16" height="16" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
        <rect width="16" height="16" fill="#059669" />
        <line x1="0" y1="0" x2="0" y2="16" stroke="#000000" stroke-width="3.5" stroke-opacity="0.32" />
      </pattern>
    </defs>
    `;

    // Inject styles, patterns, and labels
    svg = svg.replace(/<svg[^>]*>/, `$&${resourcePatternDefs}<style>\n${cssRules.join('\n')}\n</style>`);
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