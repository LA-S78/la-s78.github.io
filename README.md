# Last Asylum Compendium

Source code for the S78 Last Asylum Guide site (https://la-s78.app): an 8-language
Jekyll site with Discord-connected tools, deployed to Vercel by GitHub Actions.

Before changing a feature, read [`docs/DECISIONS.md`](docs/DECISIONS.md): it explains
why things work the way they do.

## Preview the site on your computer

**You need:** Ruby 3.2 or newer, with Bundler.
On Windows, install Ruby with [RubyInstaller](https://rubyinstaller.org/) (choose the "with Devkit" version).

```bash
bundle install                                          # once, and after Gemfile changes
bundle exec ruby _scripts/build.rb --serve              # build everything, then open http://localhost:4000
bundle exec ruby _scripts/build.rb --lang=en --serve    # faster: one language only
```

Press **Ctrl+C** to stop the preview. Run the command again after editing files.

- The full build (without `--lang`) also runs the same checks as GitHub, so if it
  passes on your computer, it will pass on GitHub too.
- The `/api/` endpoints (Discord, live map, rewards data) only run on Vercel, so
  pages that load live data will show errors in a local preview. That is expected.
- Translation with Gemini only happens on GitHub (see below), never locally.

## Where to edit what

| To change...                              | Edit                                         |
|-------------------------------------------|----------------------------------------------|
| A guide, home, rules or alliance page     | `_source/<name>.md` (all 8 languages live in one file) |
| Menu labels, page titles, UI text         | `_data/<lang>/ui.yml`, `_data/<lang>/content.yml` |
| Server rules / Survival Battle schedule   | `_data/<lang>/rules.yml`, `_data/<lang>/survival_battle.yml` |
| Discord bot messages                      | `_source/bot.md`                             |
| Page layout and reusable blocks           | `_layouts/`, `_includes/`                    |
| Styling                                   | `css/style.css` (site), `css/portal.css` (tool pages) |
| Interactive features                      | `js/`                                        |
| Discord commands and server logic         | `api/` (runs on Vercel)                      |
| The build itself                          | `_scripts/build.rb`                          |

**Never edit these:** they are regenerated on every build, and git ignores them:
`guides/`, `collections/`, `index.md`, `rules.md`, `alliance.md`, `404.md`, `guide_index.md`,
`_data/<lang>/bot.yml`, `_data/<lang>/rewards.yml`, `api/_generated_translations.js`,
`api/_map_svg.js`, `api/_cities_data.js`, `api/_font_data.js`, and `_site/`.

## Adding new content in all languages

Write it in English as `_source/<name>_en.md` and push. GitHub Actions asks Gemini to
translate it into the other 7 languages, saves the combined result as `_source/<name>.md`
and deletes the `_en` draft. Only one draft is translated per push.

## How it gets published

Pushing to `main` (production) or `dev` (preview at dev.la-s78.app) runs
`.github/workflows/workflow.yml`:

1. Translate any `_source/*_en.md` drafts with Gemini (push only).
2. Build with `_scripts/build.rb`, the same script you run locally.
3. Check the result with `_scripts/check_build.rb`.
4. Deploy to Vercel, and refresh the GitHub Pages redirect (push only).

Pull requests run steps 2 and 3 only, so you can see whether a change builds before merging.

## Scripts (`_scripts/`)

| Script                  | What it does                                                    |
|-------------------------|-----------------------------------------------------------------|
| `build.rb`              | Builds the whole site into `_site/` (runs the scripts below)    |
| `split_masters.rb`      | Splits `_source/*.md` into the files Jekyll reads               |
| `sync_ui_data.rb`       | Adds missing guide titles and nav labels to `ui.yml`            |
| `build_translations.rb` | Packages bot/rules text for the Discord bot                     |
| `workbox_precache.rb`   | Lists the files the offline service worker stores              |
| `check_build.rb`        | Sanity checks on the finished `_site/`                          |
| `generate_master.rb`    | Gemini translation of `_en` drafts (CI only)                    |
| `deploy_commands.mjs`   | Registers Discord slash commands (CI only)                      |

## Copyright & Licensing

The underlying Jekyll code, HTML, CSS, and layout framework of this repository are licensed under the [MIT License](LICENSE).

**All written strategy guides, gameplay metrics, visual blueprints, and lore located within the `/guides/` directory (or related content files) are Copyright © 2026. All Rights Reserved.** They may not be reproduced, distributed, or transmitted in any form without prior written permission.
