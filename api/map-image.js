// api/map-image.js
import fs from 'fs';
import path from 'path';

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
  // --- PHASE 1: TEST RESVG MODULE IMPORT ---
  let Resvg;
  try {
    const resvgModule = await import('@resvg/resvg-js');
    Resvg = resvgModule.Resvg;
  } catch (importErr) {
    return res.status(500).json({
      phase: '1_LOAD_RESVG_MODULE',
      error: importErr.message,
      stack: importErr.stack,
      hint: 'The native binary for @resvg/resvg-js is missing or not installed in Vercels environment.'
    });
  }

  // --- PHASE 2: LOCATE map.svg ---
  const cwd = process.cwd();
  const candidatePaths = [
    path.join(cwd, '_includes', 'map.svg'),
    path.join(cwd, 'map.svg'),
    path.resolve('_includes/map.svg')
  ];

  const svgPath = candidatePaths.find(p => fs.existsSync(p));
  if (!svgPath) {
    let filesInCwd = [];
    let filesInIncludes = [];
    try { filesInCwd = fs.readdirSync(cwd); } catch (_) {}
    try { filesInIncludes = fs.readdirSync(path.join(cwd, '_includes')); } catch (_) {}

    return res.status(500).json({
      phase: '2_LOCATE_SVG',
      error: 'Could not find map.svg in function container.',
      cwd,
      candidatePaths,
      filesInCwd,
      filesInIncludes,
      hint: 'Vercel tree-shook the SVG file. vercel.json needs includeFiles.'
    });
  }

  // --- PHASE 3: RASTERIZE ---
  try {
    let svg = fs.readFileSync(svgPath, 'utf8');
    const mapState = await getLiveMapState();

    const ownership = mapState?.territory_ownership || {};
    const alliances = mapState?.alliances || {};

    const cssRules = [
      'path, polygon, rect, circle { stroke: #000000; stroke-width: 1.5px; stroke-linejoin: round; }'
    ];

    Object.entries(ownership).forEach(([cityId, data]) => {
      const owner = typeof data === 'string' ? data : (data?.owner || 'Unclaimed');
      if (owner && owner !== 'Unclaimed') {
        const color = getAllianceColor(owner, alliances);
        cssRules.push(
          `#${cityId}, #${cityId} * { fill: ${color} !important; fill-opacity: 0.85 !important; }`
        );
      }
    });

    const styleInjection = `<style>\n${cssRules.join('\n')}\n</style>`;
    svg = svg.replace(/<svg[^>]*>/, `$&${styleInjection}`);

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
    return res.status(500).json({
      phase: '3_RENDER_SVG_TO_PNG',
      error: renderErr.message,
      stack: renderErr.stack
    });
  }
}