# How to…

Step-by-step recipes for common changes. For background on *why* things work this
way, see [`DECISIONS.md`](DECISIONS.md). For setup, see the [README](../README.md).

**The golden rule:** edit the *source* files listed here, never the generated ones
(`guides/`, `collections/`, `_site/`…). Generated files are rebuilt every time and
your edits would vanish. Git ignores them, so they never show up as changes.

- [Preview your changes](#preview-your-changes)
- [Fix text in one language](#fix-text-in-one-language)
- [Change English text that is already translated](#change-english-text-that-is-already-translated)
- [Add a new guide](#add-a-new-guide)
- [Add a UI label](#add-a-ui-label)
- [Change styles (CSS) safely](#change-styles-css-safely)
- [Add or change an alliance](#add-or-change-an-alliance)
- [Add a Discord command](#add-a-discord-command)
- [Get a change onto the live site](#get-a-change-onto-the-live-site)
- [When the build check fails](#when-the-build-check-fails)

---

## Preview your changes

```bash
bundle exec ruby _scripts/build.rb --lang=en --serve   # quick: one language, ~2 seconds
bundle exec ruby _scripts/build.rb --serve             # everything + the same checks as GitHub
```

Open the address it prints (http://localhost:4000/en/), stop with **Ctrl+C**, and run
it again after each edit. Live data (map colours, rewards, calendar) comes from the
`/api/` server functions, which only run on Vercel, so those parts show errors locally.

---

## Fix text in one language

**Guide text** lives in `_source/<guide>.md`. Each file holds every language, split
into blocks that start with a marker line:

```
=== guide--de--strategy--sanctuary ===               ← the German guide's settings
=== pane--de--strategy--sanctuary--01--strategy ===  ← German section 1
=== pane--de--strategy--sanctuary--02--prereqs ===   ← German section 2
```

Find the block with the right language code (`de`, `en`, `es`, `fr`, `it`, `ru`,
`tr`, `uk`), edit the text below its `---` settings, and leave the marker lines and
settings alone.

| Text you want to fix                         | File                                   |
|----------------------------------------------|----------------------------------------|
| Guide or page content                        | `_source/<name>.md`                    |
| Menu labels, page titles, search placeholder | `_data/<lang>/ui.yml`                  |
| Home page and alliance page wording          | `_data/<lang>/content.yml`             |
| Server rules                                 | `_data/<lang>/rules.yml`               |
| Survival Battle schedule                     | `_data/<lang>/survival_battle.yml`     |
| Discord bot messages                         | `_source/bot.md` (the `<data lang="…">` block) |
| Reward chest names                           | `_source/rewards.md`                   |

---

## Change English text that is already translated

The Gemini translation only runs once, when a guide is first added. After that,
editing the English block does **not** update the other 7 languages.

For now, either:
- edit each language's block yourself (ask Claude or Gemini to translate the
  changed sentence), or
- for a big rewrite, re-create the whole guide as a draft (see the next recipe),
  which re-translates every language from scratch.

A better way is an open question in `DECISIONS.md`.

---

## Add a new guide

**1. Write the English draft** as `_source/<id>_en.md`, where `<id>` is a short
lowercase name with no spaces (e.g. `farming`). Copy this template:

```
=== guide--en--strategy--farming ===
---
layout: guides
title: "Farming Guide"
subtitle: "Resource Farming"
active_nav: guides
guide_id: "farming"
nav_links:
  - name_key: "farming_basics"
    url: "#basics"
  - name_key: "farming_routes"
    url: "#routes"
---

=== pane--en--strategy--farming--01--basics ===
---
title: "The Basics"
nav_id: "basics"
parent_guide: "farming"
lang: "en"
order: 1
---

Your text here, in Markdown. **Bold**, lists, > quotes and images all work:

![Alt text](/images/guides/farming-map.jpg)

=== pane--en--strategy--farming--02--routes ===
---
title: "Best Routes"
nav_id: "routes"
parent_guide: "farming"
lang: "en"
order: 2
---

More text here.
```

What to change:
- `strategy` in every marker is the category: `strategy`, `events` or `shops`.
- `farming` everywhere is your `<id>`. It must be the same in the markers,
  `guide_id` and every `parent_guide`.
- Each pane (section) needs its own marker, `nav_id`, and `order` (1, 2, 3…).
- Each `nav_links` entry is a tab in the guide's top menu: `name_key` is
  `<id>_<nav_id>`, and `url` is `#` plus that pane's `nav_id`.
- Images go in `images/guides/`. Keep them under 500 KB (save as `.jpg` or `.webp`).
- Don't use code blocks (lines starting with three backticks): the build removes them.

**2. Add a card to the Guides page** in `_data/guide_directory.yml`, under the same
category. Copy a neighbouring entry and change `key` and `url`:

```yaml
  - key: "farming"
    url: /LANG_CODE/guides/farming.html
    icon: |
      <path d="M12 2v20M2 12h20" />
```

The icon is SVG drawing code; copy one from a similar card, or pick one at
https://lucide.dev (open an icon, copy the `<path …>` lines).

**3. Add the card's label** to the `guides:` section of **all 8**
`_data/<lang>/ui.yml` files (this one is not translated automatically):

```yaml
guides:
  farming: "Farming Guide"     # in _data/de/ui.yml: farming: "Farm-Leitfaden"
```

**4. Preview it:** `bundle exec ruby _scripts/build.rb --lang=en --serve`, then open
http://localhost:4000/en/guides/farming.html. Before translation, the tab labels and
header subtitle may be blank; they are filled in automatically from your pane titles
once the draft is translated.

**5. Publish it** (see [below](#get-a-change-onto-the-live-site)). When the change
reaches `main`, GitHub Actions translates the draft into all 8 languages, saves it as
`_source/farming.md` and deletes `farming_en.md`. Only **one** `_en` draft is
translated per push, so add guides one at a time.

---

## Add a UI label

1. Add the same key to **all 8** `_data/<lang>/ui.yml` files, in the section that fits:
   ```yaml
   search:
     guides: "Search guides..."
     events: "Search events..."      # ← new
   ```
2. Use it in a page or include:
   ```liquid
   {{ site.data[site.active_lang].ui.search.events }}
   ```
3. If a language is missing the key, that language shows **nothing** there, so check
   all 8 files. Use `content.yml` instead of `ui.yml` for longer page wording.

---

## Change styles (CSS) safely

Styles live in `_css/style/` (every page) and `_css/portal/` (Discord tool pages and the calendar),
one small numbered file per section. See [`_css/README.md`](../_css/README.md) for how
they're joined and why the order matters.

**For a deliberate visual change** (new colours, a new component), preview it:
`bundle exec ruby _scripts/build.rb --lang=en --serve`, and check it in all three
themes (click the lantern) and on a narrow window.

**For a clean-up that should change *nothing* visible** (removing unused CSS, tidying,
reorganising), prove it with the visual diff tool:

1. First time only:
   ```bash
   cd tools/visual-diff && npm install && npx playwright install chromium && cd ../..
   ```
2. Compare your working copy with `main`:
   ```bash
   node tools/visual-diff/run.mjs --base main --quick   # ~2 min: default theme, desktop
   node tools/visual-diff/run.mjs --base main           # ~10 min: every theme, phone + desktop
   ```
3. Read `tools/visual-diff/output/report.md`. "No differences" means every element on
   every page looks exactly the same. Otherwise it lists each changed property
   (e.g. `padding-bottom: 15px -> 0px`), with before/after/diff screenshots in the
   same folder.

Pixel-only "rendering wobble" listed separately is normal (blur effects); it doesn't
fail the check. Details and limits: [`tools/visual-diff/README.md`](../tools/visual-diff/README.md).

---

## Add or change an alliance

Alliances are currently listed in several places (a planned clean-up
will merge these into one list). Until then:

| What                                  | Where                                          |
|---------------------------------------|------------------------------------------------|
| Rank, name, academies, blacklist      | The live data (`map-state.json` in the Gist). Change it on the Alliance page, which sends a proposal to Discord for Steward approval |
| The alliance's own Discord server     | Its R5 runs `/registerbot` in Discord. The alliance's tag must already exist in the live data (`map-state.json`), so add the alliance first. Later command updates reach member servers with `/registerbot action:sync` |
| Login detection and map colour        | Vercel environment variable `DISCORD_<TAG>` = the alliance's role ID in the NAP server, plus a line in `api/colors.js` |
| Fallback colour if none is set        | `DEFAULT_FALLBACK_COLORS` in `api/state.js`, `api/_accept_proposal.js`, `js/alliance.js` and `js/kvk-scheduler.js` (keep all four the same) |

Rewards and Capitol rotation logic also depend on alliances. Read the "Rewards" entry
in `DECISIONS.md` before changing anything there.

---

## Add a Discord command

Discord commands touch live leadership tools, so get the change reviewed (by Gemini
or Claude) before merging. The pieces:

1. **Register it with Discord:** add the command's definition to
   `.github/discord.json`, under each server profile that should have it (`owner`,
   `nap`, `wlo`). Pushing a change to this file automatically updates Discord
   (`.github/workflows/discord_commands.yml`).
2. **Make it do something:** write a handler, `export async function handleYourCommand(ctx)`,
   in the `api/_bot_*.js` module it belongs to (or a new one), and add it to the
   `COMMANDS` table at the top of `api/interactions.js`. `ctx` holds what every command
   gets (`res`, `interaction`, `options`, `userId`, `lang`, `t`…); look at `/sb` in
   `api/_bot_info.js` for a short example. Discord gives up after **3 seconds**, so slow
   work needs a deferred reply. Buttons work the same way, in the `BUTTONS` table.
3. **Alliance servers:** if registered alliance servers should get it too, add it to
   `ALLIANCE_COMMANDS_SCHEMA` in `api/_bot_schema.js` (one list, used by both
   `/registerbot` and the website's registration).
4. **Translated replies:** put the message text in `_source/bot.md` (all 8 language
   blocks) and read it via `getBotStrings(lang)`.

---

## Test on dev.la-s78.app (test data)

Pushing to the `dev` branch publishes it to **dev.la-s78.app**. It uses its own copy of the
data, so nothing there changes the live site.

**One-time setup** (needs your GitHub and Vercel accounts):

1. **Make the test Gist:** at gist.github.com, create a **secret** gist with one file named
   `map-state.json` containing `{}`. Copy its ID: the last part of its address.
2. **Vercel** (project → Settings → Environment Variables), for **Preview** only:
   - `TEST_GIST_ID`: the test Gist's ID.
   - `TEST_CHANNEL_ID`: a Discord channel for test proposals (the bot must be able to post
     there).
   The existing `GIST_TOKEN` is used for the test Gist too, if both Gists are on the same
   GitHub account; otherwise add `TEST_GIST_TOKEN`.
3. **Fill it:** GitHub → Actions → **Copy live data to test Gist** → Run workflow. Run it
   again whenever you want fresh test data. It reads the Gist settings from Vercel; if one
   is marked **Sensitive** there (Vercel never hands those out), the job says which, and you
   add it under GitHub → Settings → Secrets and variables → Actions with the same name.

What to expect: the test site works like the live one, but proposals go to the test channel
marked 🧪 TEST, and the live bot refuses to approve them (the bot only runs on the live
site). Discord commands themselves always use live data.

---

## Get a change onto the live site

1. Make your edits on a new branch, not directly on `main`.
2. Open a pull request into `main`. GitHub builds the site and runs the checks;
   a green tick means it built correctly. Nothing is published yet.
3. Merge the pull request. GitHub translates any `_en` drafts, builds, and publishes
   to https://la-s78.app within a few minutes. A Discord message confirms success or
   failure.

Pushing to `dev` publishes a test copy at https://dev.la-s78.app instead.

---

## When the build check fails

Run `bundle exec ruby _scripts/build.rb` locally; it prints the same messages.

| Message                                   | Usual cause                                         |
|-------------------------------------------|-----------------------------------------------------|
| `Invalid header [...]`                    | A marker line in `_source/` is mistyped: check the `--` separators and spaces |
| `destination conflict`                    | Two files produce the same page, e.g. two guides with the same `<id>` |
| `Core pages are missing`                  | A `_source/` block for home, rules, alliance or the guide index was deleted or renamed |
| `protocol-relative links`                 | A link was built as `//page.html`; usually a missing language setting |
| `Precache is … KB`                        | Large files were added; keep images under 500 KB    |
| `YAML Exception` / `could not find expected ':'` | A `.yml` file or a `---` settings block has a typo: check indentation (spaces, not tabs) and quotes |
