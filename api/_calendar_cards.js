// api/_calendar_cards.js
// The cards /calendar shows in Discord, drawn as one picture each (owner, 2026-11-28: as the
// calendar page shows them, the tag in its alliance's colour over the banner). Discord can't
// colour text or put text over a picture, so the server draws them: SVG, turned into a PNG
// by resvg (as the map previews, api/map-image.js), with the pictures read by sharp (resvg
// can't read WebP, which alliance banners and event pictures are). api/map-image.js serves
// them (?card=capitol | alliance | kingdom); api/_bot_calendar.js links to them.
// Helpers, not an endpoint.

import fs from 'fs';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import cardFonts from './_card_fonts.js';
import mapFont from './_font_data.js';

const WIDTH = 1000;
const GAP = 16;
const RADIUS = 14;
// The calendar page's dark card (default theme: Plague green)
const CARD_BG = '#0d0c09';
const BORDER = '#33402c';
const LABEL = '#86b874'; // --accent-text
const MUTED = '#a8a19b'; // --text-muted
const TEXT = '#ece6df';

// Inter, written to /tmp once per server (resvg reads fonts from files)
const FONT_FILES = [];
for (const [weight, data] of Object.entries(cardFonts || {})) {
  const file = `/tmp/Inter-${weight}.otf`;
  try {
    if (data && !fs.existsSync(file)) fs.writeFileSync(file, Buffer.from(data, 'base64'));
    if (fs.existsSync(file)) FONT_FILES.push(file);
  } catch (err) {
    console.warn('Card font not written:', err.message);
  }
}

// The map's font (DejaVu Sans Bold) after Inter, for letters Inter doesn't have (●, Cyrillic
// accents, and the like in alliance tags)
try {
  const file = '/tmp/DejaVuSans-Bold.ttf';
  if (mapFont && mapFont.length > 100 && !fs.existsSync(file)) {
    fs.writeFileSync(file, Buffer.from(mapFont, 'base64'));
  }
  if (fs.existsSync(file)) FONT_FILES.push(file);
} catch (err) {
  console.warn('Fallback font not written:', err.message);
}

/** Without emoji (no font here draws them in colour; they'd show as empty boxes). */
const noEmoji = (s) =>
  String(s ?? '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** Shortened to about `width` pixels at `size` (Inter's average letter: about 0.5 em, bold 0.55). */
function fit(text, size, width, bold = false) {
  const s = noEmoji(text);
  const per = size * (bold ? 0.55 : 0.5);
  const max = Math.max(4, Math.floor(width / per));
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** A picture (WebP, PNG or JPEG) as a data URL resvg can read (PNG), at most `width` wide. */
export async function pictureData(url, { width = WIDTH, timeoutMs = 4000 } = {}) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const png = await sharp(buf).resize({ width, withoutEnlargement: true }).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (err) {
    console.warn('Card picture not read:', url, err.message);
    return null;
  }
}

function render(svg) {
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
    background: 'rgba(0,0,0,0)',
    font: { fontFiles: FONT_FILES, defaultFontFamily: 'Inter', loadSystemFonts: false },
  })
    .render()
    .asPng();
}

/** One card's frame: the picture faded into the card colour on the text side, a border. */
// The fades, as the page's CSS: the holder box (darker on the text side: 80%, 55% at 60%,
// 35%) and an event card (solid for the first 22%, then 82%, 55%, 40%)
const FADES = {
  holder: [
    [0, 0.8],
    [0.6, 0.55],
    [1, 0.35],
  ],
  event: [
    [0, 1],
    [0.22, 1],
    [0.45, 0.82],
    [0.75, 0.55],
    [1, 0.4],
  ],
};

function frame(id, y, h, picture, { fade = 'event' } = {}) {
  const stops = FADES[fade]
    .map(([at, o]) => `<stop offset="${at}" stop-color="${CARD_BG}" stop-opacity="${o}"/>`)
    .join('');
  return `
  <clipPath id="clip${id}"><rect x="1" y="${y + 1}" width="${WIDTH - 2}" height="${h - 2}" rx="${RADIUS}"/></clipPath>
  <linearGradient id="fade${id}" x1="0" x2="1" y1="0" y2="0">${stops}</linearGradient>
  <g clip-path="url(#clip${id})">
    <rect x="0" y="${y}" width="${WIDTH}" height="${h}" fill="${CARD_BG}"/>
    ${picture ? `<image href="${picture}" x="0" y="${y}" width="${WIDTH}" height="${h}" preserveAspectRatio="xMidYMid slice"/>` : ''}
    ${picture ? `<rect x="0" y="${y}" width="${WIDTH}" height="${h}" fill="url(#fade${id})"/>` : ''}
  </g>
  <rect x="1" y="${y + 1}" width="${WIDTH - 2}" height="${h - 2}" rx="${RADIUS}" fill="none" stroke="${BORDER}" stroke-width="2"/>`;
}

const SHADOW = `<filter id="shadow" x="-5%" y="-20%" width="110%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.85"/></filter>`;

/**
 * The Capitol cards: [{ label, tag, color, line, picture }] (this week's holder, then next
 * week's), stacked. As the calendar page's holder box: the green label, the tag large in
 * the alliance's colour, the line in grey, over the alliance's banner.
 */
export function capitolCardsPng(cards) {
  const h = 300;
  const total = cards.length * h + (cards.length - 1) * GAP;
  const parts = cards.map((c, i) => {
    const y = i * (h + GAP);
    return `${frame(i, y, h, c.picture, { fade: 'holder' })}
  <g filter="url(#shadow)" font-family="Inter">
    <text x="56" y="${y + 92}" font-size="30" font-weight="700" letter-spacing="1.5" fill="${LABEL}">${esc(fit(String(c.label).toUpperCase(), 30, 860, true))}</text>
    <text x="52" y="${y + 186}" font-size="84" font-weight="700" fill="${esc(c.color || '#fef08a')}">${esc(fit(c.tag, 84, 880, true))}</text>
    <text x="56" y="${y + 248}" font-size="36" font-weight="400" fill="${MUTED}">${esc(fit(c.line, 36, 880))}</text>
  </g>`;
  });
  return render(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${total}" viewBox="0 0 ${WIDTH} ${total}"><defs>${SHADOW}</defs>${parts.join('')}</svg>`,
  );
}

/**
 * Event cards: [{ title, time, text, color, picture }], stacked. As the calendar page's day
 * list: the event's colour down the left edge and in its time, the title, a line of its
 * description, over the type's picture.
 */
export function eventCardsPng(events) {
  const h = 196;
  const total = events.length * h + (events.length - 1) * GAP;
  const parts = events.map((e, i) => {
    const y = i * (h + GAP);
    const color = e.color || LABEL;
    return `${frame(i, y, h, e.picture)}
  <g clip-path="url(#clip${i})"><rect x="0" y="${y}" width="10" height="${h}" fill="${esc(color)}"/></g>
  <g filter="url(#shadow)" font-family="Inter">
    <text x="44" y="${y + 58}" font-size="28" font-weight="700" fill="${esc(color)}">${esc(fit(e.time, 28, 900, true))}</text>
    <text x="42" y="${y + 116}" font-size="46" font-weight="700" fill="${TEXT}">${esc(fit(e.title, 46, 900, true))}</text>
    ${e.text ? `<text x="44" y="${y + 162}" font-size="28" font-weight="400" fill="${MUTED}">${esc(fit(e.text, 28, 900))}</text>` : ''}
  </g>`;
  });
  return render(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${total}" viewBox="0 0 ${WIDTH} ${total}"><defs>${SHADOW}</defs>${parts.join('')}</svg>`,
  );
}

// ---------------------------------------------------------------------------------------
// Serving them (api/map-image.js ?card=capitol | alliance | kingdom)
// ---------------------------------------------------------------------------------------

/**
 * Draws the card picture a /calendar reply links to, from the calendar as it is now (the
 * same data the bot used; the address's `v` only keeps Discord's copies apart). `tag`: the
 * alliance, for its events (they're public on the calendar page too, as ?alliance=).
 */
export async function serveCalendarCard(req, res) {
  const { readGist } = await import('./_gist.js');
  const bot = await import('./_bot_calendar.js');
  const { getCycleState } = await import('./_calendar_helper.js');
  const { sanitizeAlliances } = await import('./_alliances.js');
  const { liveImages } = await import('./_alliance_images.js');
  const { getRoleColors } = await import('./_role_colors.js');
  const card = String(req.query.card || '');
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'la-s78.app';
  const origin = `https://${host}`;
  try {
    const { calConfig, alliances, rewardsState, gist } = await bot.loadCalendar(() =>
      readGist({ timeoutMs: 4000 }),
    );
    const now = new Date();
    const state = getCycleState(now, calConfig);
    const capitol = bot.capitolInfo(state, calConfig, alliances, rewardsState);
    let png;
    if (card === 'capitol') {
      const cards = bot.capitolCardData(state, capitol, {
        alliances,
        coloured: sanitizeAlliances(alliances, await getRoleColors().catch(() => ({}))),
        banners: gist ? liveImages(gist, alliances) : {},
        origin,
      });
      for (const c of cards) c.picture = await pictureData(c.picture);
      png = capitolCardsPng(cards);
    } else if (card === 'alliance' || card === 'kingdom') {
      const tag = card === 'alliance' ? String(req.query.tag || '').trim() : null;
      if (card === 'alliance' && !tag) return res.status(400).json({ error: 'No alliance.' });
      const listing = bot.todaysEvents({ view: card, tag, now, state, calConfig, capitol });
      const shown = bot.eventCardData(listing.today, { origin });
      if (!shown.length) return res.status(404).json({ error: 'No events today.' });
      const pictures = new Map();
      for (const e of shown) {
        if (e.picture && !pictures.has(e.picture))
          pictures.set(e.picture, await pictureData(e.picture));
        e.picture = e.picture ? pictures.get(e.picture) : null;
      }
      png = eventCardsPng(shown);
    } else {
      return res.status(400).json({ error: 'Unknown card.' });
    }
    res.setHeader('Content-Type', 'image/png');
    // Each address shows one state (its `v`); kept a day at the edge, an hour in a browser
    res.setHeader(
      'Cache-Control',
      'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600',
    );
    return res.status(200).send(png);
  } catch (err) {
    console.error('Calendar card failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
