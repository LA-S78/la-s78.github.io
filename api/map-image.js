// api/map-image.js
import { Resvg } from '@resvg/resvg-js';
import rawSvg from './map_svg.js';
import centroids from './centroids.js';
import fontBase64 from './font_data.js';

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

const fontBuffer = (fontBase64 && fontBase64.length > 100) ? Buffer.from(fontBase64, 'base64') : null;

export default async function handler(req, res) {
  try {
    let svg = rawSvg;
    if (!svg || typeof svg !== 'string') {
      return res.status(500).json({ error: 'map_svg module failed to load.' });
    }

    const mapState = await getLiveMapState();
    const ownership = mapState?.territory_ownership || {};
    const alliances = mapState?.alliances || {};

    const cssRules = [
      'path, polygon, rect, circle { stroke: #000000; stroke-width: 1.5px; stroke-linejoin: round; }'
    ];

    let labelElements = '';

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
        const maxFontSizeByWidth = maxAllowedWidth / (owner.length * 0.52);
        let fontSize = Math.max(12, Math.min(48, maxFontSizeByWidth, maxAllowedHeight));
        if (override.scale) fontSize *= override.scale;

        const safeOwner = owner.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        let textTag = `<text x="${finalX.toFixed(1)}" y="${finalY.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-family="MapFont, sans-serif" font-weight="700" font-size="${fontSize.toFixed(1)}px" fill="#ffffff" stroke="#000000" stroke-width="4px" stroke-linejoin="round" paint-order="stroke fill">${safeOwner}</text>`;

        if (override.rotate) {
          textTag = `<g transform="rotate(${override.rotate}, ${finalX.toFixed(1)}, ${finalY.toFixed(1)})">${textTag}</g>`;
        }

        labelElements += `  ${textTag}\n`;
      }
    });

    svg = svg.replace(/<svg[^>]*>/, `$&<style>\n${cssRules.join('\n')}\n</style>`);
    svg = svg.replace(/<\/svg>/, `<g id="territory-labels" style="pointer-events: none;">\n${labelElements}</g>\n</svg>`);

    const resvgOptions = {
      fitTo: { mode: 'width', value: 1200 },
      background: '#120f0d'
    };

    if (fontBuffer && fontBuffer.length > 0) {
      resvgOptions.font = {
        fontBuffers: [fontBuffer],
        defaultFontFamily: 'MapFont',
        loadSystemFonts: false
      };
    }

    const resvg = new Resvg(svg, resvgOptions);
    const pngBuffer = resvg.render().asPng();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=180, stale-while-revalidate=300');
    return res.status(200).send(pngBuffer);
  } catch (renderErr) {
    console.error('Rendering error:', renderErr);
    return res.status(500).json({ error: renderErr.message });
  }
}