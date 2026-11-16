/**
 * The screenshots on the browser's "Install app" screen (site.webmanifest `screenshots`):
 * photographs the live site on a phone and a desktop, saves them as WebP in images/ and
 * lists them in the manifest, replacing the previous set.
 *
 * Run by hand from GitHub (Actions → "Update install screenshots", which opens a pull
 * request with the result) or locally:
 *   node tools/install-screenshots/shoot.mjs [--site https://la-s78.app] [--theme default]
 *
 * Signed out, English, the chosen theme (default = Lantern). Chrome's rules for these:
 * each side 320–3840px, the long side at most 2.3× the short one, up to 8 per form factor
 * ("narrow" for phones, "wide" for desktops).
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const SITE = arg('site', 'https://la-s78.app').replace(/\/$/, '');
const THEME = arg('theme', 'default');
const OUT = path.join(ROOT, 'images');
const MANIFEST = path.join(ROOT, 'site.webmanifest');

// What's photographed. `ready`: shown once the page has its live data. `then`: buttons
// clicked before the photo (the map's Alliances view, then fullscreen so the whole map
// fits). `prepare`: a step in the page (PREPARE below). `scroll`: a part of the page brought
// to the top, just under the site's header (the calendar's events).
const PHONE = { viewport: { width: 412, height: 892 }, scale: 3, form: 'narrow' }; // 1236x2676
const DESKTOP = { viewport: { width: 1280, height: 720 }, scale: 2, form: 'wide' }; // 2560x1440
const SHOTS = [
  {
    file: 'screenshot-phone-1-home',
    device: PHONE,
    url: '/en/index.html',
    ready: '.pinned-card',
    label: 'Home: guides, rules and tools',
  },
  {
    file: 'screenshot-phone-2-calendar',
    device: PHONE,
    url: '/en/calendar.html',
    ready: '.cal-view .ag-day',
    prepare: 'busyDay',
    scroll: '.cal-section',
    label: 'Event calendar',
  },
  {
    file: 'screenshot-phone-3-map',
    device: PHONE,
    url: '/en/map/',
    ready: '.game-map svg',
    then: ['#btn-mode-alliance', '#btn-toggle-fullscreen'],
    label: 'Kingdom map',
  },
  {
    file: 'screenshot-phone-4-rules',
    device: PHONE,
    url: '/en/rules.html',
    ready: '.content-pane',
    label: 'Server rules and Capitol rewards',
  },
  {
    file: 'screenshot-desktop-1-home',
    device: DESKTOP,
    url: '/en/index.html',
    ready: '.pinned-card',
    label: 'Home: guides, rules and tools',
  },
  {
    file: 'screenshot-desktop-2-map',
    device: DESKTOP,
    url: '/en/map/',
    ready: '.game-map svg',
    then: ['#btn-mode-alliance', '#btn-toggle-fullscreen'],
    label: 'Kingdom map',
  },
  {
    file: 'screenshot-desktop-3-calendar',
    device: DESKTOP,
    url: '/en/calendar.html',
    ready: '.cal-view .ag-day',
    prepare: 'busyDay',
    scroll: '.cal-section',
    label: 'Event calendar',
  },
];

// Steps run in the page before the photo
const PREPARE = {
  // The calendar lists one day: if today has nothing planned, the next day of the week
  // that has events (the strip's days show a dot for each kind), so the picture has cards
  busyDay: () => {
    if (!document.querySelector('.cal-view .ag-empty')) return;
    const days = [...document.querySelectorAll('.wk-day')];
    const today = days.findIndex((d) => d.classList.contains('is-today'));
    const next = days.slice(today + 1).find((d) => d.querySelector('.cal-dot'));
    next?.click();
  },
};

// Nothing that comes and goes: the "new version" toast, a stale-data notice, moving effects
const STILL = `
  #pwa-update-toast, .live-data-notice { display: none !important; }
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
`;

function toWebp(png, webp) {
  try {
    execFileSync('cwebp', ['-quiet', '-q', '80', '-m', '6', png, '-o', webp]);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    // No cwebp (a local run): Pillow
    execFileSync('python3', [
      '-c',
      'import sys;from PIL import Image;Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2],"WEBP",quality=80,method=6)',
      png,
      webp,
    ]);
  }
}

const browser = await chromium.launch();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'install-shots-'));
const made = [];
try {
  for (const shot of SHOTS) {
    const { viewport, scale, form } = shot.device;
    const ctx = await browser.newContext({
      viewport,
      deviceScaleFactor: scale,
      isMobile: form === 'narrow',
      hasTouch: form === 'narrow',
      serviceWorkers: 'block',
      locale: 'en-GB',
      timezoneId: 'Europe/London',
      colorScheme: 'dark',
    });
    await ctx.addInitScript((theme) => {
      try {
        localStorage.setItem('site-theme', theme);
      } catch {
        /* storage blocked: the default theme */
      }
    }, THEME);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(SITE + shot.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.addStyleTag({ content: STILL });
    await page.waitForSelector(shot.ready, { timeout: 30000 });
    for (const button of shot.then || []) {
      await page.click(button);
      await page.waitForTimeout(500);
    }
    if (shot.prepare) {
      await page.evaluate(PREPARE[shot.prepare]);
      await page.waitForTimeout(300);
    }
    if (shot.scroll)
      await page.$eval(shot.scroll, (e) => {
        const main = document.querySelector('main');
        const header = document.querySelector('header')?.getBoundingClientRect().bottom || 0;
        main.scrollTop += e.getBoundingClientRect().top - header - 12;
      });
    await page.waitForTimeout(1500); // fonts, pictures, the last data
    const png = path.join(tmp, `${shot.file}.png`);
    await page.screenshot({ path: png });
    const webp = path.join(OUT, `${shot.file}.webp`);
    toWebp(png, webp);
    const sizes = `${viewport.width * scale}x${viewport.height * scale}`;
    made.push({
      src: `/images/${shot.file}.webp`,
      sizes,
      type: 'image/webp',
      form_factor: form,
      label: shot.label,
    });
    console.log(
      `${shot.file}.webp  ${sizes}  ${Math.round(fs.statSync(webp).size / 1024)} KB${errors.length ? `  (page errors: ${errors.join('; ')})` : ''}`,
    );
    await ctx.close();
  }
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

// The manifest lists exactly this set; pictures from an older set are removed
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const keep = new Set(made.map((s) => s.src));
for (const old of manifest.screenshots || []) {
  const file = path.join(ROOT, old.src);
  if (!keep.has(old.src) && old.src.startsWith('/images/screenshot-') && fs.existsSync(file)) {
    fs.rmSync(file);
    console.log(`removed ${old.src}`);
  }
}
manifest.screenshots = made;
fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`site.webmanifest: ${made.length} screenshots`);
