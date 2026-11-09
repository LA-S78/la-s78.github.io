# Visual diff

Checks that a change didn't alter how the site looks. It renders **every page** of two
builds in **every theme** (default, Sanctuary, Miasma), at **phone and desktop widths**
(390 px, 1280 px), and in each **interactive state** (planners open, map modes,
fullscreen, dialogs, the proposal pop-up logged in / as a guest / with an error, the
calendar's Capitol Defense previews, logged-in leader view...). Then it compares:

1. **Every element's computed style.** This is the browser's final answer for each
   property after all CSS rules are applied. Any real CSS change shows up here, and the
   report names the exact property (e.g. `height: 130px -> 131px`).
2. **Screenshots, pixel by pixel**, as a second line of defence.

Use it for any CSS or layout refactor that should change *nothing* visible, such as
removing unused CSS, reorganising files or reducing `!important`.

## Running it

Needs Node.js and Ruby (for the site build). First time only:

```bash
cd tools/visual-diff
npm install
npx playwright install chromium
```

Then, from the repository root:

```bash
node tools/visual-diff/run.mjs --base main            # your working copy vs main (~10 min)
node tools/visual-diff/run.mjs --base main --quick    # default theme, desktop only (~2 min)
```

The result is in `tools/visual-diff/output/report.md`. For each difference, the report
gives the page, state, theme and width, the elements whose styles changed, and
`__base.png` / `__head.png` / `__diff.png` images (changed pixels shown in red).

Other options: `--head <branch or site folder>`, `--pages <regex>`,
`--states <regex>`, `--themes default,miasma`, `--widths 390`, `--workers 4`,
`--out <folder>`, `--save-all` (keep the screenshots of every view, not only the ones that
differ: useful to look at a new state). `--base`/`--head` accept a git branch/commit (built automatically in a
temporary copy) or an already built `_site` folder.

## What keeps it repeatable

Every run uses the same conditions:
- **Fixed clock and randomness:** a fixed date and time, and fixed `Math.random`.
- **Fixed data:** sample API data from `fixtures/`, and no network outside the site.
- **No moving parts:** looping animations are rewound, and one-off animations and transitions are finished.
- **Normalised comparisons:** computed styles are compared with the property order sorted, and with the test server address and Mermaid's timestamp IDs removed.
- **Behaviour that depends on timing is pinned:**
  - Native fullscreen is refused, so the map uses its CSS fullscreen fallback.
  - The scroll-based "current section" tab highlight is switched off.
  - The language button is masked in screenshots, because its hover look depends on mouse timing. Its styles are still compared.
- **Retried wobble:** pixel-only differences are retried twice. If they persist while every style is identical, they're listed as *rendering wobble* (blur and gradient drawing on the GPU) and don't fail the run.

It was validated with control runs (two identical builds: 552 of 552 page views
identical) and with deliberate one-pixel and 1/255-colour changes (each caught, only
where it applies).

## Limits

- **Chrome only.** CSS that only applies in Safari (`@supports (-webkit-touch-callout: none)`)
  or in the installed app (`@media (display-mode: standalone)`) is not exercised.
- **Only listed interactions.** Hover and focus looks, and states not listed in
  `states.mjs`, aren't covered. Add a state there when a feature gains a new view.
- **English pages only.** CSS applies the same way in every language, but very long
  translated words could wrap differently.

## Adding a state

Each entry in `states.mjs` can have:
- `needs`: a selector; the state runs on every page where it exists.
- `storage`: localStorage values, e.g. `LEADER` for the logged-in leader view.
- `run(page)`: what to click or type before the capture.
- `api(fixture, data)`: changes the sample data for this state only (e.g. no holder colour,
  or a different reward schedule). `fixture` is the file name in `fixtures/` without `.json`.

Check a new state with `--states <name> --save-all`, then open its `__head.png`.
