// api/map-image.js
import { Resvg } from '@resvg/resvg-js';
import rawSvg from './map_svg.js';

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

// ==========================================================================
// GEOMETRY & CENTROID PARSER
// ==========================================================================

function parseSvgPathBBox(d) {
  if (!d) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let curX = 0, curY = 0;

  const commandRegex = /([a-df-z])([^a-df-z]*)/gi;
  let match;

  while ((match = commandRegex.exec(d)) !== null) {
    const cmd = match[1];
    const argsStr = match[2].trim();
    const nums = argsStr.match(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g);
    const args = nums ? nums.map(Number) : [];

    const isRelative = (cmd === cmd.toLowerCase());
    const upperCmd = cmd.toUpperCase();

    const update = (x, y) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };

    if (upperCmd === 'M' || upperCmd === 'L' || upperCmd === 'T') {
      for (let i = 0; i < args.length; i += 2) {
        curX = isRelative ? curX + args[i] : args[i];
        curY = isRelative ? curY + args[i + 1] : args[i + 1];
        update(curX, curY);
      }
    } else if (upperCmd === 'H') {
      for (let i = 0; i < args.length; i++) {
        curX = isRelative ? curX + args[i] : args[i];
        update(curX, curY);
      }
    } else if (upperCmd === 'V') {
      for (let i = 0; i < args.length; i++) {
        curY = isRelative ? curY + args[i] : args[i];
        update(curX, curY);
      }
    } else if (upperCmd === 'C') {
      for (let i = 0; i < args.length; i += 6) {
        curX = isRelative ? curX + args[i + 4] : args[i + 4];
        curY = isRelative ? curY + args[i + 5] : args[i + 5];
        update(curX, curY);
      }
    } else if (upperCmd === 'S' || upperCmd === 'Q') {
      for (let i = 0; i < args.length; i += 4) {
        curX = isRelative ? curX + args[i + 2] : args[i + 2];
        curY = isRelative ? curY + args[i + 3] : args[i + 3];
        update(curX, curY);
      }
    } else if (upperCmd === 'A') {
      for (let i = 0; i < args.length; i += 7) {
        curX = isRelative ? curX + args[i + 5] : args[i + 5];
        curY = isRelative ? curY + args[i + 6] : args[i + 6];
        update(curX, curY);
      }
    }
  }

  if (minX === Infinity || maxX === -Infinity) return null;
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY
  };
}

let CENTROID_CACHE = null;

function getTerritoryCentroids(svgText) {
  if (CENTROID_CACHE) return CENTROID_CACHE;
  CENTROID_CACHE = {};

  const elementRegex = /<([a-z]+)[^>]*\bid=["']([^"']+)["'][^>]*>/gi;
  let elMatch;

  while ((elMatch = elementRegex.exec(svgText)) !== null) {
    const fullTag = elMatch[0];
    const id = elMatch[2];

    if (id === 'layer1' || id.startsWith('defs') || id.includes('label')) continue;

    const dMatch = fullTag.match(/\bd=["']([^"']+)["']/i);
    if (dMatch) {
      const bbox = parseSvgPathBBox(dMatch[1]);
      if (bbox) CENTROID_CACHE[id] = bbox;
    }
  }

  return CENTROID_CACHE;
}

// ==========================================================================
// DATA FETCHING & HANDLER
// ==========================================================================

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
      signal: AbortSignal.timeout(2500)
    });

    if (!res.ok) return null;
    const gistData = await res.json();
    return JSON.parse(gistData.files?.['map-state.json']?.content || '{}');
  } catch (err) {
    console.warn('Gist fetch bypassed:', err.message);
    return null;
  }
}

export default async function handler(req, res) {
  try {
    let svg = rawSvg;
    if (!svg || typeof svg !== 'string') {
      return res.status(500).json({ error: 'map_svg module failed to load.' });
    }

    const mapState = await getLiveMapState();
    const ownership = mapState?.territory_ownership || {};
    const alliances = mapState?.alliances || {};
    const centroids = getTerritoryCentroids(svg);

    // 1. Build CSS rules for territory fills & borders
    const cssRules = [
      'path, polygon, rect, circle { stroke: #000000; stroke-width: 1.5px; stroke-linejoin: round; }',
      'text.territory-label { font-family: system-ui, -apple-system, sans-serif; font-weight: 800; paint-order: stroke fill; stroke: #000000; stroke-width: 3.5px; stroke-linejoin: round; fill: #ffffff; }'
    ];

    // 2. Generate territory labels and color rules
    let labelElements = '';

    Object.entries(ownership).forEach(([cityId, data]) => {
      const owner = typeof data === 'string' ? data : (data?.owner || 'Unclaimed');
      if (!owner || owner === 'Unclaimed') return;

      // Color territory
      const color = getAllianceColor(owner, alliances);
      cssRules.push(
        `#${cityId}, #${cityId} * { fill: ${color} !important; fill-opacity: 0.85 !important; }`
      );

      // Create label element
      const center = centroids[cityId];
      if (center) {
        const override = LABEL_OVERRIDES[cityId] || {};
        const finalX = center.x + (override.offsetX || 0);
        const finalY = center.y + (override.offsetY || 0);

        const maxAllowedWidth = center.width * 0.68;
        const maxAllowedHeight = center.height * 0.55;
        const maxFontSizeByWidth = maxAllowedWidth / (owner.length * 0.65);
        let fontSize = Math.max(10, Math.min(44, maxFontSizeByWidth, maxAllowedHeight));
        if (override.scale) fontSize *= override.scale;

        const safeOwner = owner.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        let textTag = `<text x="${finalX.toFixed(1)}" y="${finalY.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize.toFixed(1)}px" class="territory-label">${safeOwner}</text>`;

        if (override.rotate) {
          textTag = `<g transform="rotate(${override.rotate}, ${finalX.toFixed(1)}, ${finalY.toFixed(1)})">${textTag}</g>`;
        }

        labelElements += `  ${textTag}\n`;
      }
    });

    // 3. Inject CSS styles at top of SVG
    const styleInjection = `<style>\n${cssRules.join('\n')}\n</style>`;
    svg = svg.replace(/<svg[^>]*>/, `$&${styleInjection}`);

    // 4. Inject text labels at bottom of SVG so they render on top of territories
    const labelGroup = `<g id="territory-labels" style="pointer-events: none;">\n${labelElements}</g>`;
    svg = svg.replace(/<\/svg>/, `${labelGroup}\n</svg>`);

    // 5. Render via Resvg
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
      background: '#120f0d'
    });

    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=180, stale-while-revalidate=300');
    return res.status(200).send(pngBuffer);
  } catch (renderErr) {
    console.error('Rendering error:', renderErr);
    return res.status(500).json({
      error: renderErr.message,
      stack: renderErr.stack
    });
  }
}