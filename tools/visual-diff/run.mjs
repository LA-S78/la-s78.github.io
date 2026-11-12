#!/usr/bin/env node
// Visual diff: renders every page of two builds in every theme, at phone and desktop
// widths and in each interactive state (states.mjs), then compares them pixel by pixel
// AND element by element (the browser's final computed style for every element).
//
//   node tools/visual-diff/run.mjs --base main              compare your working copy against main
//   node tools/visual-diff/run.mjs --base main --head my-branch
//   node tools/visual-diff/run.mjs --base /path/to/_site --head /path/to/other/_site
//
// Options: --pages <regex>  --themes default,sanctuary,miasma  --widths 390,1280
//          --states <regex>  --workers 4  --out tools/visual-diff/output  --quick
//          --save-all  (keep screenshots of every view, not only the ones that differ)
//          --ignore-vars  (leave CSS variables out of the style comparison; see README)
//          --all  (compare every page, even those no changed file can reach)
//          --no-cache  (rebuild a git ref even if a build of that commit is cached)
//
// Speed: only English is built (only /en/ is compared); a build of a commit is kept and
// reused (by commit id); and pages that no changed file can reach are skipped (see
// affectedPages below).
// Exit code 0 = no visible or style difference; 1 = differences (see report.md).

import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { STATES } from './states.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const FIXED_TIME = new Date('2026-11-10T12:00:00Z');

// ---------- options ----------
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--'))
      acc.push([a.slice(2), all[i + 1]?.startsWith('--') ? true : (all[i + 1] ?? true)]);
    return acc;
  }, []),
);
if (!args.base) {
  console.error(
    'Usage: node tools/visual-diff/run.mjs --base <git ref | site dir> [--head <git ref | site dir>]',
  );
  process.exit(2);
}
const opt = {
  themes: String(args.themes || (args.quick ? 'default' : 'default,sanctuary,miasma')).split(','),
  widths: String(args.widths || (args.quick ? '1280' : '390,1280'))
    .split(',')
    .map(Number),
  pages: args.pages ? new RegExp(args.pages) : null,
  states: args.states ? new RegExp(args.states) : null,
  workers: Number(args.workers || Math.max(2, Math.min(6, os.cpus().length))),
  out: path.resolve(args.out || path.join(HERE, 'output')),
  saveAll: Boolean(args['save-all']),
  ignoreVars: Boolean(args['ignore-vars']),
  all: Boolean(args.all),
  cache: !args['no-cache'],
};
const T0 = Date.now();
const took = (t) => `${Math.round((Date.now() - t) / 1000)}s`;

// ---------- getting a built site ----------
const isSiteDir = (p) =>
  fs.existsSync(path.join(p, 'index.html')) && fs.existsSync(path.join(p, 'en'));
const CACHE = path.join(os.tmpdir(), 'la-s78-visual-cache');
const temps = []; // removed at the end

// English only: the comparison only opens /en/ pages, and each language adds a full build.
function build(cwd) {
  execFileSync('bundle', ['exec', 'ruby', '_scripts/build.rb', '--lang=en', '--no-check'], {
    cwd,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, BUNDLE_GEMFILE: path.join(cwd, 'Gemfile') },
  });
}

function siteFor(spec, label) {
  if (spec && spec !== true && isSiteDir(path.resolve(spec))) return path.resolve(spec);
  const t = Date.now();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), `visual-${label}-`));
  temps.push(out);
  if (!spec || spec === true) {
    // The working copy is built from a copy of its files (tracked and new, not ignored), so
    // the build never changes anything in the real folder (it rewrites parts of _data).
    console.log(`Building ${label}: working copy...`);
    const tree = path.join(out, 'tree');
    const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
      cwd: REPO,
      maxBuffer: 64 * 1024 * 1024,
    })
      .toString()
      .split('\0')
      .filter((f) => f && fs.existsSync(path.join(REPO, f)));
    for (const f of files) {
      fs.mkdirSync(path.dirname(path.join(tree, f)), { recursive: true });
      fs.copyFileSync(path.join(REPO, f), path.join(tree, f));
    }
    build(tree);
    fs.cpSync(path.join(tree, '_site'), path.join(out, 'site'), { recursive: true });
    fs.rmSync(tree, { recursive: true, force: true });
    console.log(`  built in ${took(t)}`);
    return path.join(out, 'site');
  }
  // A git ref: a build of the same commit is reused.
  const sha = execFileSync('git', ['rev-parse', `${spec}^{commit}`], { cwd: REPO })
    .toString()
    .trim();
  const cached = path.join(CACHE, `${sha}-en`);
  if (opt.cache && isSiteDir(cached)) {
    console.log(`Using the cached build of ${spec} (${sha.slice(0, 7)}).`);
    return cached;
  }
  console.log(`Building ${label}: ${spec} (${sha.slice(0, 7)})...`);
  const tree = path.join(out, 'tree');
  execFileSync('git', ['worktree', 'add', '--detach', tree, sha], { cwd: REPO, stdio: 'ignore' });
  try {
    build(tree);
    fs.mkdirSync(CACHE, { recursive: true });
    fs.rmSync(cached, { recursive: true, force: true });
    fs.cpSync(path.join(tree, '_site'), cached, { recursive: true });
  } finally {
    execFileSync('git', ['worktree', 'remove', '--force', tree], { cwd: REPO, stdio: 'ignore' });
  }
  // Keep the 4 newest cached builds.
  fs.readdirSync(CACHE)
    .map((d) => ({ d, t: fs.statSync(path.join(CACHE, d)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .slice(4)
    .forEach(({ d }) => fs.rmSync(path.join(CACHE, d), { recursive: true, force: true }));
  console.log(`  built in ${took(t)}`);
  return cached;
}

// ---------- which pages can a change reach? ----------
// A page is compared when its own HTML differs, or when a changed file is reachable from it:
// named in the page, or in a script/stylesheet/data file the page reaches (followed by file
// name). Service workers (sw.js) and api/ are left out: both are replaced in these tests.
// If a changed file isn't named anywhere (a path built in code), every page is compared.
const TEXT = /\.(html|css|js|mjs|json|webmanifest|svg)$/;
function listFiles(root) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(path.relative(root, p).split(path.sep).join('/'));
    }
  };
  walk(root);
  return out;
}
function affectedPages(baseSite, headSite, pages) {
  const read = (root, f) => {
    const p = path.join(root, f);
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  };
  // Left out: service workers (blocked in these tests; they name every file) and api/
  // (server code: the tests answer /api/ with fixtures/).
  const files = [...new Set([...listFiles(baseSite), ...listFiles(headSite)])].filter(
    (f) => !/(^|\/)sw\.js$/.test(f) && !f.startsWith('api/'),
  );
  const changed = files.filter((f) => {
    const a = read(baseSite, f);
    const b = read(headSite, f);
    return !a || !b || !a.equals(b);
  });
  if (!changed.length) return { pages: [], note: 'the two builds are identical' };
  const text = new Map(
    files
      .filter((f) => TEXT.test(f))
      .map((f) => [f, (read(headSite, f) || read(baseSite, f)).toString()]),
  );
  const byName = new Map();
  for (const f of files) {
    const n = path.posix.basename(f);
    byName.set(n, [...(byName.get(n) || []), f]);
  }
  const names = [...byName.keys()];
  const refs = new Map(); // file -> files it names
  const refsOf = (f) => {
    if (!refs.has(f)) {
      const t = text.get(f) || '';
      refs.set(
        f,
        names.filter((n) => t.includes(n)).flatMap((n) => byName.get(n)),
      );
    }
    return refs.get(f);
  };
  const changedAssets = changed.filter((f) => !f.endsWith('.html'));
  const named = new Set([...text.keys()].flatMap(refsOf));
  if (changedAssets.some((f) => !named.has(f)))
    return { pages, note: 'a changed file is not named anywhere, so every page is compared' };
  const out = pages.filter((page) => {
    const self = page.slice(1);
    if (changed.includes(self)) return true;
    const seen = new Set([self]);
    const todo = [self];
    while (todo.length) {
      for (const g of refsOf(todo.pop())) {
        if (seen.has(g)) continue;
        if (changedAssets.includes(g)) return true;
        seen.add(g);
        if (TEXT.test(g) && !g.endsWith('.html')) todo.push(g);
      }
    }
    return false;
  });
  return {
    pages: out,
    note: `${changed.length} changed files reach ${out.length} of ${pages.length} pages`,
  };
}

// ---------- static server with correct content types ----------
const TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
};
function serve(root) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      if (!fs.existsSync(p)) {
        res.writeHead(404, { 'content-type': 'text/html' });
        return res.end(
          fs.existsSync(path.join(root, '404.html'))
            ? fs.readFileSync(path.join(root, '404.html'))
            : '',
        );
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      res.end(fs.readFileSync(p));
    });
    srv.listen(0, '127.0.0.1', () =>
      resolve({ srv, origin: `http://127.0.0.1:${srv.address().port}` }),
    );
  });
}

// ---------- fake API (fixed sample data) ----------
const FIX = Object.fromEntries(
  fs
    .readdirSync(path.join(HERE, 'fixtures'))
    .map((f) => [
      path.basename(f, '.json'),
      fs.readFileSync(path.join(HERE, 'fixtures', f), 'utf8'),
    ]),
);
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
// A state can change the sample data with `api: (fixtureName, data) => void` (states.mjs).
async function routeApi(route, edit) {
  const url = new URL(route.request().url());
  const name = url.pathname.replace(/^\/api\//, '');
  const json = (body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body });
  const fixture = (key) => {
    if (!edit) return FIX[key];
    const data = JSON.parse(FIX[key]);
    edit(key, data);
    return JSON.stringify(data);
  };
  if (name === 'state') {
    const key = `state-${url.searchParams.get('scope') || 'all'}`;
    return json(fixture(FIX[key] ? key : 'state-all'));
  }
  if (name === 'map-image')
    return route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL_PNG });
  if (FIX[name]) return json(fixture(name));
  return json('{"error":"not available in visual tests"}', 404);
}

// ---------- capturing one page state ----------
// Chrome writes colours made with color-mix() as color(srgb 0.72 0.59 0.35 / 0.2), and plain
// ones as rgba(184, 151, 90, 0.2). Same colour, so both are compared in the rgba form (each
// channel rounded to the nearest 1/255, so a one-shade change is still caught).
const COLOUR_FN = `(v) => v.replace(/color\\(srgb ([\\d.e-]+) ([\\d.e-]+) ([\\d.e-]+)(?: \\/ ([\\d.e-]+))?\\)/g,
  (_, r, g, b, a) => {
    const c = [r, g, b].map((x) => Math.round(Number(x) * 255)).join(', ');
    return a === undefined || Number(a) === 1 ? 'rgb(' + c + ')' : 'rgba(' + c + ', ' + Number(a) + ')';
  })`;
const IN_PAGE = {
  // Every element's computed style, hashed (FNV-1a) so the result is small.
  snapshot: ({ raw, ignoreVars, colourFn }) => {
    const normaliseColours = (0, eval)(colourFn);
    const pathOf = (el) => {
      const parts = [];
      for (
        let e = el;
        e && e.nodeType === 1 && e !== document.documentElement;
        e = e.parentElement
      ) {
        let i = 1;
        for (let s = e.previousElementSibling; s; s = s.previousElementSibling)
          if (s.tagName === e.tagName) i++;
        parts.unshift(`${e.tagName.toLowerCase()}:${i}`); // position only: some libraries use random ids
      }
      return parts.join('>');
    };
    // Absolute URLs (background images...) contain the test server's port: strip it.
    // Sorted, because Chrome lists custom properties (--vars) in an unpredictable order.
    const styleText = (cs) => {
      const parts = [];
      for (let i = 0; i < cs.length; i++) {
        if (ignoreVars && cs[i].startsWith('--')) continue;
        parts.push(cs[i] + ':' + normaliseColours(cs.getPropertyValue(cs[i])));
      }
      // Strip the server origin and Mermaid's timestamp-based ids (url(#mermaid-1794...)).
      return parts
        .sort()
        .join(';')
        .split(location.origin)
        .join('')
        .replace(/mermaid-\d+/g, 'mermaid-N');
    };
    const fnv = (s) => {
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
      return (h >>> 0).toString(36);
    };
    const out = {};
    for (const el of [
      document.documentElement,
      ...document.body.querySelectorAll('*'),
      document.body,
    ]) {
      let t = styleText(getComputedStyle(el));
      for (const pseudo of ['::before', '::after']) {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content && ps.content !== 'none') t += pseudo + styleText(ps);
      }
      // Pseudo-elements that exist without `content`, for the elements that have them.
      if (el.tagName === 'DIALOG')
        t += '::backdrop' + styleText(getComputedStyle(el, '::backdrop'));
      if (el.placeholder) t += '::placeholder' + styleText(getComputedStyle(el, '::placeholder'));
      if (el.tagName === 'LI') t += '::marker' + styleText(getComputedStyle(el, '::marker'));
      out[pathOf(el)] = raw ? t : fnv(t);
    }
    return out;
  },
  details: ({ paths, ignoreVars, colourFn }) => {
    const normaliseColours = (0, eval)(colourFn);
    const find = (p) => {
      let el = document.documentElement;
      if (!p) return el;
      for (const part of p.split('>')) {
        const [, tag, nth] = part.match(/^([a-z0-9-]+)(?:#[^:]*)?:(\d+)$/i) || [];
        el = [...(el?.children || [])].filter((c) => c.tagName.toLowerCase() === tag)[
          Number(nth) - 1
        ];
      }
      return el;
    };
    return Object.fromEntries(
      paths.map((p) => {
        const el = find(p);
        if (!el) return [p, null];
        const o = {};
        for (const pseudo of [null, '::before', '::after']) {
          const cs = getComputedStyle(el, pseudo);
          if (pseudo && (!cs.content || cs.content === 'none')) continue;
          for (let i = 0; i < cs.length; i++) {
            if (ignoreVars && cs[i].startsWith('--')) continue;
            o[(pseudo || '') + cs[i]] = normaliseColours(
              cs.getPropertyValue(cs[i]).split(location.origin).join(''),
            );
          }
        }
        return [p, o];
      }),
    );
  },
  // Finish one-off animations/transitions (fade-ins, colour changes); rewind looping ones.
  freeze: () =>
    document.getAnimations().forEach((a) => {
      const t = a.effect?.getComputedTiming?.();
      if (t && Number.isFinite(t.endTime)) a.finish();
      else {
        a.pause();
        a.currentTime = 0;
      }
    }),
  contentHeight: () => {
    let extra = 0;
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) {
        extra = Math.max(extra, el.scrollHeight - el.clientHeight);
      }
    }
    return Math.max(document.documentElement.scrollHeight, window.innerHeight + extra);
  },
};

// Advance the (frozen) page clock and wait until data has loaded and the page stops changing.
async function settle(page, ms) {
  await page.clock.runFor(ms);
  let last = '';
  for (let i = 0; i < 20; i++) {
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.clock.runFor(250);
    const now = await page.evaluate(
      () => `${document.body.innerHTML.length}:${document.documentElement.scrollHeight}`,
    );
    if (now === last) return;
    last = now;
  }
}

async function openState(browser, origin, job) {
  const height = job.width < 600 ? 844 : 900;
  const context = await browser.newContext({
    viewport: { width: job.width, height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  const storage = { 'site-theme': job.theme, ...(job.state.storage || {}) };
  await context.addInitScript((items) => {
    for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
    Math.random = () => 0.42;
    // The only IntersectionObserver (main.js) highlights the "current section" tab, which
    // depends on scroll timing. A no-op observer keeps that highlight identical in both builds.
    // Native fullscreen can only be held by one window at a time (base and head race for
    // it). Refusing it makes the map use its CSS fullscreen fallback, which is what the CSS controls.
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new Error('disabled in visual tests'));
    window.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };
  }, storage);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(origin + '/api/')) return routeApi(route, job.state.api);
    if (url.startsWith(origin)) return route.continue();
    return route.abort(); // nothing outside the site, for repeatable results
  });
  const page = await context.newPage();
  await page.clock.install({ time: FIXED_TIME });
  await page.goto(origin + job.page, { waitUntil: 'load' });
  await settle(page, 3000);
  if (job.state.run) {
    await job.state.run(page, job.dialogId);
    await settle(page, 1500);
  }
  await page.evaluate(IN_PAGE.freeze);
  const styles = await page.evaluate(IN_PAGE.snapshot, {
    raw: !!process.env.VD_DEBUG,
    ignoreVars: opt.ignoreVars,
    colourFn: COLOUR_FN,
  });
  // The site scrolls inside <main>, so grow the window to fit everything, then screenshot.
  const isFullscreen = await page.evaluate(() => !!document.fullscreenElement);
  if (!isFullscreen) {
    const fullHeight = Math.min(16000, await page.evaluate(IN_PAGE.contentHeight));
    // A browser window in fullscreen mode can't be resized; then the screen is all there is.
    const resized = await page.setViewportSize({ width: job.width, height: fullHeight }).then(
      () => true,
      () => false,
    );
    if (resized) await settle(page, 500);
    await page.evaluate(() =>
      document.querySelectorAll('.nav-wrapper').forEach((n) => {
        n.style.scrollBehavior = 'auto';
        n.scrollLeft = 0;
      }),
    );
  }
  await page.evaluate(IN_PAGE.freeze);
  // Masked in screenshots (its styles are still compared): its hover look depends on
  // mouse timing rather than CSS.
  const mask = [page.locator('.lang-trigger')];
  const png = await page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    mask,
    maskColor: '#ff00ff',
  });
  return { context, page, styles, png };
}

// ---------- jobs ----------
function listPages(site) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html'))
        out.push('/' + path.relative(site, p).split(path.sep).join('/'));
    }
  };
  walk(path.join(site, 'en'));
  return out.sort().filter((p) => !opt.pages || opt.pages.test(p));
}

async function discoverStates(browser, origin, page) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await ctx.route('**/*', (r) =>
    r.request().url().startsWith(origin)
      ? r.request().url().includes('/api/')
        ? routeApi(r)
        : r.continue()
      : r.abort(),
  );
  const pg = await ctx.newPage();
  await pg.goto(origin + page, { waitUntil: 'load' });
  await pg.waitForTimeout(300);
  const found = await pg.evaluate(
    (needs) => ({
      present: needs.map((s) => !!document.querySelector(s)),
      dialogs: [...document.querySelectorAll('dialog[id]')].map((d) => d.id),
    }),
    STATES.map((s) => s.needs || 'html'),
  );
  await ctx.close();
  const states = [];
  STATES.forEach((s, i) => {
    if (opt.states && !opt.states.test(s.name)) return;
    if (s.perDialog)
      found.dialogs.forEach((id) =>
        states.push({ state: { ...s, name: `dialog:${id}` }, dialogId: id }),
      );
    else if (found.present[i]) states.push({ state: s });
  });
  return states;
}

// ---------- main ----------
const baseSite = siteFor(args.base, 'base');
const headSite = siteFor(args.head, 'head');
fs.rmSync(opt.out, { recursive: true, force: true });
fs.mkdirSync(opt.out, { recursive: true });

let pages = listPages(baseSite);
let skippedNote = '';
if (!opt.all) {
  const all = pages.length;
  const r = affectedPages(baseSite, headSite, pages);
  pages = r.pages;
  console.log(
    `Pages to compare: ${r.note}${pages.length < all ? ' (--all compares every page)' : ''}.`,
  );
  if (pages.length < all)
    skippedNote = `${all - pages.length} of ${all} pages skipped: no changed file reaches them (${r.note}; \`--all\` compares every page).`;
}

const [A, B] = await Promise.all([serve(baseSite), serve(headSite)]);
const browser = await chromium.launch();
const jobs = [];
const tCompare = Date.now();
for (const page of pages) {
  for (const s of await discoverStates(browser, A.origin, page)) {
    for (const theme of opt.themes)
      for (const width of opt.widths) jobs.push({ page, theme, width, ...s });
  }
}
console.log(
  `Comparing ${jobs.length} page views (${opt.themes.length} themes x ${opt.widths.length} widths, ${opt.workers} at a time)...`,
);

const results = [];
let done = 0;
async function runJob(job) {
  for (let attempt = 1; ; attempt++) {
    const r = await compareOnce(job);
    const pixelOnly = r.pixels > 0 && !r.styleDiffs.length;
    if (!pixelOnly) return finish(r);
    if (attempt === 3) return finish({ ...r, unstable: true });
  }
}
function finish(r) {
  results.push(r);
  if (++done % 25 === 0 || done === jobs.length) console.log(`  ${done}/${jobs.length}`);
}

async function compareOnce(job) {
  const tag = [
    job.page.replace(/^\/en\//, '').replace(/[/.]/g, '_'),
    job.state.name.replace(/[:]/g, '-'),
    job.theme,
    job.width,
  ].join('__');
  const [a, b] = await Promise.all([
    openState(browser, A.origin, job),
    openState(browser, B.origin, job),
  ]);
  const r = {
    page: job.page,
    state: job.state.name,
    theme: job.theme,
    width: job.width,
    pixels: 0,
    styleDiffs: [],
  };
  // Element-by-element comparison of computed styles
  const keys = new Set([...Object.keys(a.styles), ...Object.keys(b.styles)]);
  const changed = [...keys].filter((k) => a.styles[k] !== b.styles[k]);
  if (changed.length && process.env.VD_DEBUG) {
    const split = (t) =>
      Object.fromEntries(
        (t || '').split(';').map((x) => [x.slice(0, x.indexOf(':')), x.slice(x.indexOf(':') + 1)]),
      );
    r.styleDiffCount = changed.length;
    r.styleDiffs = changed.slice(0, 15).map((p) => {
      const sa = a.styles[p] || '',
        sb = b.styles[p] || '';
      let i = 0;
      while (i < sa.length && sa[i] === sb[i]) i++;
      if (process.env.VD_DEBUG === 'raw')
        return {
          element: p,
          props: [
            `@${i}: …${sa.slice(Math.max(0, i - 120), i + 60)}  ||  …${sb.slice(Math.max(0, i - 120), i + 60)}`,
          ],
        };
      const x = split(a.styles[p]),
        y = split(b.styles[p]);
      return {
        element: p,
        props: Object.keys({ ...x, ...y })
          .filter((k) => x[k] !== y[k])
          .slice(0, 8)
          .map((k) => `${k}: ${x[k]} -> ${y[k]}`),
      };
    });
  } else if (changed.length) {
    const sample = changed.slice(0, 15);
    const [da, db] = await Promise.all([
      a.page.evaluate(IN_PAGE.details, {
        paths: sample,
        ignoreVars: opt.ignoreVars,
        colourFn: COLOUR_FN,
      }),
      b.page.evaluate(IN_PAGE.details, {
        paths: sample,
        ignoreVars: opt.ignoreVars,
        colourFn: COLOUR_FN,
      }),
    ]);
    r.styleDiffCount = changed.length;
    r.styleDiffs = sample.map((p) => {
      if (!da[p] || !db[p])
        return { element: p, change: da[p] ? 'missing in head' : 'missing in base' };
      const props = Object.keys({ ...da[p], ...db[p] }).filter((k) => da[p][k] !== db[p][k]);
      return {
        element: p,
        props: props.slice(0, 8).map((k) => `${k}: ${da[p][k]} -> ${db[p][k]}`),
      };
    });
  }
  // Pixel comparison
  const ia = PNG.sync.read(a.png),
    ib = PNG.sync.read(b.png);
  if (ia.width !== ib.width || ia.height !== ib.height) {
    r.pixels = -1;
    r.size = `${ia.width}x${ia.height} -> ${ib.width}x${ib.height}`;
  } else {
    const diff = new PNG({ width: ia.width, height: ia.height });
    r.pixels = pixelmatch(ia.data, ib.data, diff.data, ia.width, ia.height, { threshold: 0 });
    if (r.pixels) fs.writeFileSync(path.join(opt.out, `${tag}__diff.png`), PNG.sync.write(diff));
  }
  if (opt.saveAll || r.pixels || r.styleDiffs.length) {
    fs.writeFileSync(path.join(opt.out, `${tag}__base.png`), a.png);
    fs.writeFileSync(path.join(opt.out, `${tag}__head.png`), b.png);
  }
  await Promise.all([a.context.close(), b.context.close()]);
  return r;
}
const queue = [...jobs];
await Promise.all(
  Array.from({ length: opt.workers }, async () => {
    while (queue.length) {
      const job = queue.shift();
      try {
        await runJob(job);
      } catch (e) {
        results.push({
          page: job.page,
          state: job.state.name,
          theme: job.theme,
          width: job.width,
          error: String(e.message || e).split('\n')[0],
        });
      }
    }
  }),
);
await browser.close();
A.srv.close();
B.srv.close();
for (const d of temps) fs.rmSync(d, { recursive: true, force: true });
console.log(`  compared in ${took(tCompare)} (total ${took(T0)})`);

// ---------- report ----------
// A real CSS change always changes some element's computed style. Pixel-only differences
// that survive retries are GPU rendering wobble (blurs, gradients, scaled images): listed
// separately for a human to glance at, but they don't fail the run.
const bad = results.filter((r) => !r.unstable && (r.pixels || r.styleDiffs?.length || r.error));
const unstable = results.filter((r) => r.unstable);
const lines = [
  '# Visual diff report',
  '',
  `Base: \`${args.base}\` · Head: \`${args.head || 'working copy'}\``,
  `${results.length} page views compared (${opt.themes.join(', ')} × ${opt.widths.join(', ')} px).`,
  ...(skippedNote ? ['', skippedNote] : []),
  '',
  bad.length
    ? `**${bad.length} page views differ.**`
    : '**No differences: every element has identical computed styles in every page view.**',
  '',
];
if (unstable.length) {
  lines.push(
    `### ${unstable.length} pixel-only differences (styles identical; usually blur/gradient rendering wobble)`,
    'Glance at these `__diff.png` files; they do not fail the run.',
    '',
    ...unstable.map(
      (r) => `- ${r.page} · ${r.state} · ${r.theme} · ${r.width}px: ${r.pixels} pixels`,
    ),
    '',
  );
}
for (const r of bad.sort((x, y) => (x.page + x.state).localeCompare(y.page + y.state))) {
  lines.push(`## ${r.page} · ${r.state} · ${r.theme} · ${r.width}px`);
  if (r.error) lines.push(`- Error: ${r.error}`);
  if (r.pixels === -1) lines.push(`- Page size changed: ${r.size}`);
  else if (r.pixels) lines.push(`- ${r.pixels} pixels differ (see the matching \`__diff.png\`)`);
  if (r.styleDiffCount) {
    lines.push(`- ${r.styleDiffCount} elements have different computed styles, e.g.:`);
    for (const d of r.styleDiffs)
      lines.push(
        `  - \`${d.element}\` ${d.change || ''}`,
        ...(d.props || []).map((p) => `    - ${p}`),
      );
  }
  lines.push('');
}
fs.writeFileSync(path.join(opt.out, 'report.md'), lines.join('\n'));
fs.writeFileSync(path.join(opt.out, 'report.json'), JSON.stringify(results, null, 1));
console.log(
  bad.length
    ? `${bad.length} of ${results.length} page views differ. See ${path.join(opt.out, 'report.md')}`
    : `All ${results.length} page views identical${unstable.length ? ` (${unstable.length} pixel-only rendering wobbles listed in the report)` : ''}.`,
);
process.exit(bad.length ? 1 : 0);
