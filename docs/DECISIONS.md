# Decisions Log

The "why" behind this project, written down so it survives beyond any one chat
history. Read this before changing a feature; update it when a decision changes.

**Roles**
- **Owner (Josh):** final say on product and behaviour questions.
- **Maintainer (Gemini):** keeps this file accurate; reviews PRs for fit with intent.
- **Implementer (Claude):** writes code; must not contradict an entry here without
  flagging it in the PR description.

**Entry format:** one section per feature, with *Purpose*, *Constraints*,
*Must not change* and *Open questions*. Anything deliberately unusual belongs
under *Must not change*, or someone will "fix" it.

---

## Hosting & deployment (GitHub Actions → Vercel, GitHub Pages redirect)
- **Purpose:** Compiles an 8-language Jekyll static site alongside Node.js serverless API routes (`api/`), deploying the combined bundle (`_site/`) to Vercel (`la-s78.app`) while publishing a path-preserving redirect (`_deploy/migration.html`) to GitHub Pages (`gh-pages`).
- **Constraints:** Vercel deployments are built and pushed via CLI (`vercel deploy --cwd _site/`) inside GitHub Actions after Ruby scripts generate in-memory JS modules (`api/_generated_translations.js`, `api/_map_svg.js`, `api/_cities_data.js`, `api/_font_data.js`).
- **Must not change:**
  - Staging `api/` into `_site/` (in `_scripts/build.rb`) MUST run *after* `WorkboxInjector.run('_site')` so `api/` is deployed to Vercel without being scanned by Jekyll or precached by the service worker.
  - The Vercel project is connected to this GitHub repo (kept for PR comments), but `vercel.json` sets `git.deploymentEnabled: false`. The GitHub Actions CLI deploy is the **only** route to production: a Git-triggered deploy would publish the raw, unbuilt repo, without `_site/` or the generated `api/_*.js` modules.
- **Open questions:**
  - Does the `dev` preview deployment share the production Gist and Discord bot?

## Multilingual content pipeline (`_source/` masters, Gemini translation)
- **Purpose:** Allows guides, UI strings, rules, and bot strings to be authored in English (`_source/*_en.md`), translated into 7 languages (`de`, `es`, `fr`, `it`, `ru`, `tr`, `uk`) via Gemini, committed as master files (`_source/*.md`), and segregated into Jekyll collections/data at build time.
- **Constraints:** Gemini API rate limits require cooldowns between language calls; translation only runs on `push` when a `*_en.md` draft file is present.
- **Must not change:**
  - Never edit generated files directly: `guides/<lang>/`, `collections/_guide_panes/`, `_data/<lang>/bot.yml`, `_data/<lang>/rewards.yml` and `api/_generated_translations.js`. They are rebuilt on every build from `_source/*.md`.
  - The other `_data/<lang>/` files (`content.yml`, `rules.yml`, `survival_battle.yml`, `ui.yml`) are **hand-maintained source files** committed to the repo. Edit them directly. `ui.yml` also receives guide titles and nav anchors injected by `_scripts/sync_ui_data.rb`, which only adds missing keys and never overwrites existing ones.
- **Open questions:**
  - After the first translation, how should English edits reach the other 7 languages (manual edits, re-draft, per-block re-translation)?

## Site shell (Turbo navigation, PWA / service worker, themes)
- **Purpose:** Provides fast app-like navigation and offline caching for guides and schedules on mobile and desktop.
- **Constraints:** Service worker precache (`_scripts/workbox_precache.rb`) must stay under 20 MB (skipping files >512 KB and `mermaid.min.js`).
- **Must not change:** Shared assets (`/css`, `/js`, `/images`) live only at the site root (`_site/`), never duplicated under `/<lang>/`. Event listeners in frontend JS must be idempotent across `DOMContentLoaded` and `turbo:load`.
- **Open questions:**
  - Should the offline precache cover only the visitor's language?
  - `js/main.js` runs `initApp` on both `turbo:load` and `turbo:frame-render`. If a frame navigation fires both, listeners added inside `initApp` (anchor clicks, search input, scroll memory) may be attached twice to the same elements. Needs checking in a browser.

## Authentication & roles (Discord OAuth, R4/R5/member, Stewards)
- **Purpose:** Restricts administrative actions, reward nominations, and calendar management to authorized leadership.
- **Constraints:** Kingdom-wide administrative approval and maintenance tasks are restricted to 1–3 designated **Kingdom Stewards** defined in Vercel environment variables (`STEWARD_USER_IDS`, comma-separated Discord User IDs, with fallback support for `AUTHORIZED_USER_ID`).
- **Must not change:** Steward user IDs must remain in Vercel environment variables (read-only at runtime), never stored inside the GitHub Gist JSON files. Official leadership communications and embeds use the term **NAP Leadership** (never "War Room"). Internal identifiers (e.g. the `WAR_ROOM_CHANNEL_ID` env var) are not user-facing and keep their names.
- **Open questions:**
  - Is `.content-locked` content meant to be secret, or only decluttering? (It is currently hidden client-side only.)

## Discord bot & proposal/approval flow (`api/interactions.js`, `api/proposal.js`, `api/accept-proposal.js`)
- **Purpose:** Powers slash commands (`/calendar`, `/nominate`, `/rewards`, `/map`, `/sb`, `/rules`, `/rank`, `/registerbot`) and interactive button approvals for map, standings, rewards, and defense overrides.
- **Constraints:** Discord interaction responses must complete within 3 seconds (Gist and Discord role fetches use strict `AbortSignal.timeout`).
- **Must not change:** Portal links are signed and checked only through `api/_tokens.js` (`createToken`, `verifyToken`). Only designated Stewards (`isSteward(userId)`) can click Approve/Reject on proposals or confirm KvK reward outcomes. Unauthorized clicks must return an ephemeral access-denied message without mutating the button state.
- **Open questions:**
  - Should submitting a proposal require a signed token (like `/nominate`)?
  - The Approve path does not meet the 3-second constraint reliably. It downloads the blueprint attachment and then calls `/api/accept-proposal` over HTTP (a Gist read and write) with no timeout and no deferred response. A slow Gist could make Discord show "interaction failed" even though the change was saved. Should it use a deferred update?

## Data storage (GitHub Gist as database)
- **Purpose:** Stores live mutable state (`map-state.json`, `rewards-data.json`, `rewards-nominations.json`, `calendar-state.json`) without requiring an external database server.
- **Constraints:** All state files reside in a single GitHub Gist (`process.env.GIST_ID`), fetched in one HTTP request.
- **Must not change:**
  - `map-state.json` is the single source of truth for alliance ranks (`#1`–`#10`).
  - All Gist reads and writes go through `api/_gist.js` (`readGist`, `gistJson`, `writeGist`). Endpoints must not call the GitHub API directly.
- **Open questions:**
  - `api/accept-proposal.js` (every approval type): if GitHub returns an error when reading the Gist, the approval carries on with default data and **saves over the live file**. This is kept as-is in `readForApproval()` pending review. Should a failed read abort the approval instead?
  - Every write reads, changes and saves the whole file with no check for a concurrent change, so two simultaneous writes can lose one. Is that acceptable at current usage?

## Rewards, nominations & KvK cycle
- **Purpose:** Automates the 4-week Capitol rotation, stepped defense overrides (Swap vs. Wartime Buyout), and weekly chest nomination quotas.
- **Constraints:** No background cron exists; cycle and reward transitions rely on deterministic clock math (`_calendar_helper.js`) and lazy synchronization triggered by Discord interactions.
- **Must not change:**
  - **Option A (4-Week Lock + Seat Inheritance):** `active_schedule` locks for the 4-week cycle (`downtime`, `week_1`, `week_2`, `week_3`). Rank #1 holds `week_3`. The three non-#1 alliances in Top 4 rotate through `[Seat A, Seat B, Seat C]` across 3 macro cycles so no alliance serves Downtime twice in a row. If a Rank #5+ contender enters the Top 4 (measured during Week 1 Duel Days 3–5), they inherit the vacated wheel seat at the start of the *next* 4-week cycle.
  - **Stepped Defense Overrides (Model 1):** 1st WLO override in a cycle swaps calendar weeks with Week 3 (0 chest cost). 2nd WLO override triggers a 2-installment Wartime Buyout (+1 Reg Gold & +1 KW Gold in target week, +1 Reg Gold & +1 KW Gold in Week 3, deducted from WLO and added to the displaced alliance).
  - **Post-Battle Reward Epoch:** A new reward nomination cycle begins Saturday post-battle (after the KvK battle window), NOT Monday 00:00 GT. Importantly, the rewards distributed during the Off-Week (Downtime) are the spoils of the **Week 3 KvK Finale** (which can be 2x `kw` if won, or 1x `standard`), and `week: 3` buyout installments must remain active for that post-Week-3 distribution before rolling the schedule to `0` (Downtime).

## Territory map & alliance standings
- **Purpose:** Tracks territory ownership (`map.html`, `/map`) and NAP alliance ranks (`alliance.html`, `/rank`).
- **Constraints:** Map PNGs are rendered dynamically via `api/map-image.js` using in-memory SVG/font/city modules compiled during the CI build.
- **Must not change:** Updating alliance ranks in `map-state.json` updates weekly chest tiers immediately, while Capitol rotation seats remain locked until the next 4-week cycle rollover.

## Calendar & event management
- **Purpose:** Displays the 28-day Kingdom War & Capitol rotation cycle alongside global and alliance-scoped operations (`portal/calendar.html`, `/calendar`).
- **Constraints:** `_calendar_helper.js` numbers weeks `1..4` (where `4` is Off-Week), whereas `rewards-data.json` and `kvk-scheduler.js` number weeks `0..3` (where `0` is `downtime`).
- **Must not change:** Both the Top Hero Card (`api/calendar.js` / `js/calendar.js`) and the 4-Week Override Console (`js/kvk-scheduler.js`) must resolve the active Capitol holder from `rewards-data.json`'s `cycle_state.active_schedule` and highlight the active week using the live clock (`clockWeek`), never static `capitol_rank` lookups alone.

## Test pages (`test/`)
- **Purpose:** Internal sandbox pages, also used to demo features.
- **Must not change:** They stay publicly published (owner decision), so `js/mermaid.min.js` stays too. It is excluded from the service-worker precache because of its size (3.3 MB).

## Conventions
- **Game Time is UTC-2.** All schedule/calendar code and bot strings use this.
- **Pull requests** must pass the "Checking build output" CI step before merge.
- **Folder layout.** Discord tool pages live in `portal/`, and their public URLs come from each page's `permalink` (e.g. `/calendar.html`), not from the folder. Files used only by the deploy (`redirect.html`, `migration.html`) live in `_deploy/`, which Jekyll never publishes. Keep public URLs unchanged when moving files.
- **One build script.** `_scripts/build.rb` is the only build definition; CI calls it rather than running its own inline steps, so a local build matches production. New build steps go in the script, not in the workflow.
- **Code style is automatic.** JavaScript and JSON are formatted by Prettier (`.prettierrc.json`: defaults plus single quotes and 100-character lines). Don't hand-format or argue style in reviews; run `npm run format` or use format-on-save. HTML/Markdown/YAML are excluded because of Liquid tags. The CI formatting check is advisory, not blocking.
- **Generated files are git-ignored** (see `.gitignore` and the README's "Never edit these" list) so local builds never show up as changes.
