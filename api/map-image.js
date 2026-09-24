// api/map-image.js
import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';

const AUTO_ALLIANCE_PALETTE = [
  '#e68e00', '#a400af', '#0070f3', '#25bb00', '#e53e3e',
  '#dd6b20', '#319795', '#d69e2e', '#805ad5', '#d53f8c',
  '#38a169', '#00b5d8'
];

const LABEL_OVERRIDES = {
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

let cachedTerritoryBoxes = null;

// ============================================================================
// GEOMETRY & BOUNDING BOX CALCULATION (DOM-FREE)
// ============================================================================

function parsePathBBox(d) {
  if (!d) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let curX = 0, curY = 0;
  let startX = 0, startY = 0;

  const commandRegex = /([a-df-z])([^a-df-z]*)/gi;
  let match;

  function updateBox(x, y) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  while ((match = commandRegex.exec(d)) !== null) {
    const cmd = match[1];
    const isRel = cmd === cmd.toLowerCase();
    const type = cmd.toUpperCase();
    const numMatches = match[2].match(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g);
    const nums = numMatches ? numMatches.map(Number) : [];

    let i = 0;
    if (type === 'Z') {
      curX = startX;
      curY = startY;
      continue;
    }

    while (i < nums.length) {
      if (type === 'M') {
        curX = isRel ? curX + nums[i] : nums[i];
        curY = isRel ? curY + nums[i + 1] : nums[i + 1];
        startX = curX;
        startY = curY;
        updateBox(curX, curY);
        i += 2;
        while (i < nums.length) {
          curX = isRel ? curX + nums[i] : nums[i];
          curY = isRel ? curY + nums[i + 1] : nums[i + 1];
          updateBox(curX, curY);
          i += 2;
        }
      } else if (type === 'L' || type === 'T') {
        curX = isRel ? curX + nums[i] : nums[i];
        curY = isRel ? curY + nums[i + 1] : nums[i + 1];
        updateBox(curX, curY);
        i += 2;
      } else if (type === 'H') {
        curX = isRel ? curX + nums[i] : nums[i];
        updateBox(curX, curY);
        i += 1;
      } else if (type === 'V') {
        curY = isRel ? curY + nums[i] : nums[i];
        updateBox(curX, curY);
        i += 1;
      } else if (type === 'C') {
        const x1 = isRel ? curX + nums[i] : nums[i];
        const y1 = isRel ? curY + nums[i + 1] : nums[i + 1];
        const x2 = isRel ? curX + nums[i + 2] : nums[i + 2];
        const y2 = isRel ? curY + nums[i + 3] : nums[i + 3];
        curX = isRel ? curX + nums[i + 4] : nums[i + 4];
        curY = isRel ? curY + nums[i + 5] : nums[i + 5];
        updateBox(x1, y1);
        updateBox(x2, y2);
        updateBox(curX, curY);
        i += 6;
      } else if (type === 'S' || type === 'Q') {
        const x1 = isRel ? curX + nums[i] : nums[i];
        const y1 = isRel ? curY + nums[i + 1] : nums[i + 1];
        curX = isRel ? curX + nums[i + 2] : nums[i + 2];
        curY = isRel ? curY + nums[i + 3] : nums[i + 3];
        updateBox(x1, y1);
        updateBox(curX, curY);
        i += 4;
      } else if (type === 'A') {
        curX = isRel ? curX + nums[i + 5] : nums[i + 5];
        curY = isRel ? curY + nums[i + 6] : nums[i + 6];
        updateBox(curX, curY);
        i += 7;
      } else {
        break;
      }
    }
  }

  if (minX === Infinity) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: minX + (maxX - minX) / 2,
    centerY: minY + (maxY - minY) / 2
  };
}

function parsePolygonBBox(pointsStr) {
  const nums = pointsStr.trim().split(/[\s,]+/).map(Number);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < nums.length; i += 2) {
    const x = nums[i], y = nums[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (minX === Infinity) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: minX + (maxX - minX) / 2,
    centerY: minY + (maxY - minY) / 2
  };
}

function extractElementSnippet(svgString, id) {
  const gRegex = new RegExp(`<g[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/g>`, 'i');
  const gMatch = svgString.match(gRegex);
  if (gMatch) return gMatch[1];

  const tagRegex = new RegExp(`<(?:path|polygon|rect|circle)[^>]*\\bid=["']${id}["'][^>]*\\/?>`, 'i');
  const tagMatch = svgString.match(tagRegex);
  return tagMatch ? tagMatch[0] : null;
}

function computeShapeBBox(snippet) {
  if (!snippet) return null;
  let combined = null;

  function merge(box) {
    if (!box) return;
    if (!combined) {
      combined = { ...box };
      return;
    }
    const minX = Math.min(combined.x, box.x);
    const minY = Math.min(combined.y, box.y);
    const maxX = Math.max(combined.x + combined.width, box.x + box.width);
    const maxY = Math.max(combined.y + combined.height, box.y + box.height);
    combined = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: minX + (maxX - minX) / 2,
      centerY: minY + (maxY - minY) / 2
    };
  }

  const pathRegex = /\bd=["']([^"']+)["']/gi;
  let pMatch;
  while ((pMatch = pathRegex.exec(snippet)) !== null) {
    merge(parsePathBBox(pMatch[1]));
  }

  const polyRegex = /\bpoints=["']([^"']+)["']/gi;
  let polyMatch;
  while ((polyMatch = polyRegex.exec(snippet)) !== null) {
    merge(parsePolygonBBox(polyMatch[1]));
  }

  const rectRegex = /<rect[^>]*>/gi;
  let rMatch;
  while ((rMatch = rectRegex.exec(snippet)) !== null) {
    const rTag = rMatch[0];
    const x = parseFloat((rTag.match(/\bx=["']([^"']+)["']/) || [])[1] || 0);
    const y = parseFloat((rTag.match(/\by=["']([^"']+)["']/) || [])[1] || 0);
    const w = parseFloat((rTag.match(/\bwidth=["']([^"']+)["']/) || [])[1] || 0);
    const h = parseFloat((rTag.match(/\bheight=["']([^"']+)["']/) || [])[1] || 0);
    if (w > 0 && h > 0) merge({ x, y, width: w, height: h, centerX: x + w / 2, centerY: y + h / 2 });
  }

  return combined;
}

function getCachedTerritoryBoxes(svgString, ownershipKeys) {
  if (cachedTerritoryBoxes) return cachedTerritoryBoxes;
  const boxes = {};
  for (const cityId of ownershipKeys) {
    const snippet = extractElementSnippet(svgString, cityId);
    const bbox = computeShapeBBox(snippet);
    if (bbox) boxes[cityId] = bbox;
  }
  cachedTerritoryBoxes = boxes;
  return cachedTerritoryBoxes;
}

// ============================================================================
// ALLIANCE COLORS & LIVE STATE
// ============================================================================

function getAllianceColor(tag, alliances = {}) {
  if (!tag || tag === 'Unclaimed') return '#2d3748';

  if (alliances[tag]?.color) {
    return alliances[tag].color;
  }

  const rankedTags = Object.entries(alliances)
    .filter(([_, data]) => data?.rank !== undefined && data.rank !== null && data.rank !== '')
    .sort(([_, a], [__, b]) => Number(a.rank) - Number(b.rank))
    .map(([t]) => t);

  const rankIdx = rankedTags.indexOf(tag);
  if (rankIdx !== -1) {
    return AUTO_ALLIANCE_PALETTE[rankIdx % AUTO_ALLIANCE_PALETTE.length];
  }

  const allTags = Object.keys(alliances);
  const tagIdx = allTags.indexOf(tag);
  if (tagIdx !== -1) {
    return AUTO_ALLIANCE_PALETTE[tagIdx % AUTO_ALLIANCE_PALETTE.length];
  }

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
      signal: AbortSignal.timeout(3000)
    });

    if (!res.ok) return null;
    const gistData = await res.json();
    return JSON.parse(gistData.files?.['map-state.json']?.content || '{}');
  } catch (err) {
    console.error('Failed to fetch map state for rendering:', err);
    return null;
  }
}

// ============================================================================
// SERVERLESS RENDER HANDLER
// ============================================================================

export default async function handler(req, res) {
  try {
    const svgPath = path.join(process.cwd(), '_includes', 'map.svg');
    if (!fs.existsSync(svgPath)) {
      return res.status(500).json({ error: 'map.svg template not found.' });
    }

    let svg = fs.readFileSync(svgPath, 'utf8');
    const mapState = await getLiveMapState();

    const ownership = mapState?.territory_ownership || {};
    const alliances = mapState?.alliances || {};

    const cssRules = [
      'path, polygon, rect, circle { stroke: #000000; stroke-width: 1.5px; stroke-linejoin: round; }',
      'text.territory-label { font-family: system-ui, -apple-system, sans-serif; font-weight: bold; paint-order: stroke fill; stroke: #000000; stroke-width: 3px; fill: #ffffff; }'
    ];

    const ownershipKeys = Object.keys(ownership);
    const territoryBoxes = getCachedTerritoryBoxes(svg, ownershipKeys);

    let labelsMarkup = '<g id="territory-labels">';

    Object.entries(ownership).forEach(([cityId, data]) => {
      const owner = typeof data === 'string' ? data : (data?.owner || 'Unclaimed');
      if (owner && owner !== 'Unclaimed') {
        const color = getAllianceColor(owner, alliances);
        cssRules.push(
          `#${cityId}, #${cityId} * { fill: ${color} !important; fill-opacity: 0.85 !important; }`
        );

        const bbox = territoryBoxes[cityId];
        if (bbox && bbox.width > 0 && bbox.height > 0) {
          const override = LABEL_OVERRIDES[cityId] || {};
          const finalX = bbox.centerX + (override.offsetX || 0);
          const finalY = bbox.centerY + (override.offsetY || 0);

          const maxAllowedWidth = bbox.width * 0.68;
          const maxAllowedHeight = bbox.height * 0.55;
          const maxFontSizeByWidth = maxAllowedWidth / (owner.length * 0.65);
          let fontSize = Math.max(10, Math.min(46, maxFontSizeByWidth, maxAllowedHeight));
          if (override.scale) fontSize *= override.scale;

          const transformAttr = override.rotate
            ? `transform="rotate(${override.rotate}, ${finalX.toFixed(1)}, ${finalY.toFixed(1)})"`
            : '';

          labelsMarkup += `
            <g ${transformAttr}>
              <text
                class="territory-label"
                x="${finalX.toFixed(1)}"
                y="${finalY.toFixed(1)}"
                dy="0.35em"
                text-anchor="middle"
                font-size="${fontSize.toFixed(1)}px"
              >${owner}</text>
            </g>
          `;
        }
      }
    });

    labelsMarkup += '</g>';

    // Inject CSS styles into the SVG header
    const styleInjection = `<style>\n${cssRules.join('\n')}\n</style>`;
    svg = svg.replace(/<svg[^>]*>/, `$&${styleInjection}`);

    // Inject text labels group right before </svg>
    svg = svg.replace(/<\/svg>/i, `${labelsMarkup}</svg>`);

    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
      background: '#120f0d',
      font: {
        loadSystemFonts: true,
        defaultFontFamily: 'sans-serif'
      }
    });

    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).send(pngBuffer);
  } catch (error) {
    console.error('Map image rasterization failed:', error);
    return res.status(500).json({ error: 'Failed to generate map image.' });
  }
}