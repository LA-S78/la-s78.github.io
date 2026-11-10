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
- **To do (owner):** the `dev` preview (dev.la-s78.app) currently **shares the production Gist and Discord bot**: `GIST_ID` has no separate Preview value in Vercel, so testing on dev changes live kingdom data. Plan (maintainer): create a separate test Gist (a copy of the four JSON files) and set its ID as `GIST_ID` for the **Preview** environment in Vercel.

## Multilingual content pipeline (`_source/` masters, Gemini translation)
- **Purpose:** Allows guides, UI strings, rules, and bot strings to be authored in English (`_source/*_en.md`), translated into 7 languages (`de`, `es`, `fr`, `it`, `ru`, `tr`, `uk`) via Gemini, committed as master files (`_source/*.md`), and segregated into Jekyll collections/data at build time.
- **Constraints:** Gemini API rate limits require cooldowns between language calls; translation only runs on `push` when a `*_en.md` draft file is present.
- **Must not change:**
  - Never edit generated files directly: `guides/<lang>/`, `collections/_guide_panes/`, `_data/<lang>/bot.yml`, `_data/<lang>/rewards.yml` and `api/_generated_translations.js`. They are rebuilt on every build from `_source/*.md`.
  - The other `_data/<lang>/` files (`content.yml`, `rules.yml`, `survival_battle.yml`, `ui.yml`) are **hand-maintained source files** committed to the repo. Edit them directly. `ui.yml` also receives guide titles and nav anchors injected by `_scripts/sync_ui_data.rb`, which only adds missing keys and never overwrites existing ones.
- **Updating translated text (maintainer):** for small wording or number fixes, edit all 8 language blocks in `_source/<name>.md` directly (or ask Claude to update all 8 in the PR). For a major rewrite, rename `_source/<name>.md` back to `_source/<name>_en.md` containing only the updated English; CI then regenerates all 7 translations on push.

## Site shell (Turbo navigation, PWA / service worker, themes)
- **Purpose:** Provides fast app-like navigation and offline caching for guides and schedules on mobile and desktop.
- **Constraints:** Service worker precache (`_scripts/workbox_precache.rb`) must stay under 20 MB (skipping files >512 KB and `mermaid.min.js`).
- **Must not change:** Shared assets (`/css`, `/js`, `/images`) live only at the site root (`_site/`), never duplicated under `/<lang>/`. Event listeners in frontend JS must be idempotent across `DOMContentLoaded` and `turbo:load`. `initApp` (js/main.js) runs on both `turbo:load` and `turbo:frame-render`, so element listeners are attached through `firstTime(el, key)`; map controls are bound only by `js/map.js` (guarded by `data-bound`). Any data inserted into HTML (names, titles, tags, colours, anything from the API, localStorage or a form) goes through `escapeHtml()` from `js/escape-html.js`; never put raw data into `innerHTML`.
- **Open questions:**
  - Should the offline precache cover only the visitor's language?

## Authentication & roles (Discord OAuth, R4/R5/member, Stewards)
- **Purpose:** Restricts administrative actions, reward nominations, and calendar management to authorized leadership.
- **Constraints:** Kingdom-wide administrative approval and maintenance tasks are restricted to 1–3 designated **Kingdom Stewards** defined in Vercel environment variables (`STEWARD_USER_IDS`, comma-separated Discord User IDs, with fallback support for `AUTHORIZED_USER_ID`).
- **Must not change:** Steward user IDs must remain in Vercel environment variables (read-only at runtime), never stored inside the GitHub Gist JSON files. Official leadership communications and embeds use the term **NAP Leadership** (never "War Room"). Internal identifiers (e.g. the `WAR_ROOM_CHANNEL_ID` env var) are not user-facing and keep their names.
- **Also must not change:**
  - `.content-locked` is **decluttering only** (progressive disclosure for leaders), not a security boundary: anything inside it is public in the page source. Real access control lives server-side (`api/_tokens.js`, `isSteward()`, alliance-scoped calendar filtering). Never put secrets in locked content.
  - Permissions are matched by Discord **role names** (`@R5`, `@HR`, `@<TAG>`), deliberately not role IDs: each registered alliance server has its own role IDs, and matching is scoped to the registered `guild_id` (or the central NAP server). Don't replace this with hard-coded role IDs.

## Discord bot & proposal/approval flow (`api/interactions.js`, `api/proposal.js`, `api/_accept_proposal.js`)
- **Purpose:** Powers slash commands (`/calendar`, `/nominate`, `/rewards`, `/map`, `/sb`, `/rules`, `/rank`, `/registerbot`) and interactive button approvals for map, standings, rewards, and defense overrides.
- **Constraints:** Discord interaction responses must complete within 3 seconds (Gist and Discord role fetches use strict `AbortSignal.timeout`).
- **Must not change:** Portal links are signed and checked only through `api/_tokens.js` (`createToken`, `verifyToken`). They are signed with a dedicated key: `PORTAL_HMAC_SECRET` if set in Vercel, otherwise a key derived from the bot token. Never sign with the raw bot token. Every portal link carries an `action` (`nominate`, `register`, `manage_events`) and each endpoint accepts only its own, since they are all signed with the same key. Only designated Stewards (`isSteward(userId)`) can click Approve/Reject on proposals or confirm KvK reward outcomes. Unauthorized clicks must return an ephemeral access-denied message without mutating the button state.
- **Open questions:**
  - **Done: `/api/proposal` requires a login pass (owner decisions).** At login, `/api/verify` gives members of the Discord server a signed pass (`createSessionToken` in `api/_tokens.js`: Discord id, server nickname, rank, alliance; **30 days**). The proposal pop-up sends it as `Authorization: Bearer`. `/api/proposal` accepts **R4 and R5 leaders and Stewards** only, shows the name from the pass as the submitter (with a Discord mention; the page's `submittedBy` is ignored), rejects oversized or malformed proposals, and limits R4/R5 to **5 proposals per 24 hours** (Stewards: no limit), counted in the Gist's `proposal-log.json` only once a proposal was actually posted. If that log can't be read, nothing is sent (503). Login passes are signed with their own derived key, so a pass is never accepted as a portal link (e.g. `/nominate`) or the other way round.
  - **Done:** the Steward Approve path calls the acceptance logic in-process (`acceptProposal()` in `api/_accept_proposal.js`) after the bot has verified Discord's signature and checked `isSteward`. The public `/api/accept-proposal` endpoint, which took the bot token as a password, is gone; the bot token is only used to talk to Discord.
  - **Done:** Approve answers Discord at once with a deferred update (type 6), then saves and edits the message through the click's interaction webhook (its own token, valid 15 minutes; never the bot token), so slow Gist calls can't exceed Discord's 3-second limit. Work after the answer is kept alive with Vercel's `waitUntil` (`api/_after_response.js`, the same hook `@vercel/functions` uses, without that package and its dependencies). If `waitUntil` or the click's id/token is missing, it saves first and then answers, as before. Reject saves nothing and answers straight away.

## Data storage (GitHub Gist as database)
- **Purpose:** Stores live mutable state (`map-state.json`, `rewards-data.json`, `rewards-nominations.json`, `calendar-state.json`, and `proposal-log.json`: who sent a proposal when, last 24 hours only, for the daily limit) without requiring an external database server.
- **Constraints:** All state files reside in a single GitHub Gist (`process.env.GIST_ID`), fetched in one HTTP request.
- **Must not change:**
  - `map-state.json` is the single source of truth for alliance ranks (`#1`–`#10`).
  - All Gist reads and writes go through `api/_gist.js` (`readGist`, `gistJson`, `writeGist`). Endpoints must not call the GitHub API directly.
  - **Write paths never fall back to defaults.** If the Gist can't be read, a write or mutation (approvals, nominations, events, registration, cycle resets) stops with an error and saves nothing; continuing with `{}` would wipe live data. Defaults are only used when a read succeeds but the file doesn't exist yet. Read-only endpoints (`api/state.js`, `api/calendar.js`, `api/map-image.js`) may fall back to defaults so pages still render.
  - **A failed save is never hidden.** E.g. if the automatic Downtime reset in `/nominate` can't be saved, the leader gets "Service busy … retry" instead of a nomination link.
  - Each save sends only the Gist files it changed (`writeGist` only sends what it is given).
- **Open questions:**
  - Every write reads, changes and saves the whole file with no check for a concurrent change, so two simultaneous writes can lose one. Is that acceptable at current usage?

## Rewards, nominations & KvK cycle
- **Purpose:** Automates the 4-week Capitol rotation, stepped defense overrides (Swap vs. Wartime Buyout), and weekly chest nomination quotas.
- **Constraints:** No background cron exists; cycle and reward transitions rely on deterministic clock math (`_calendar_helper.js`) and lazy synchronization triggered by Discord interactions.
- **Must not change:**
  - **Option A (4-Week Lock + Seat Inheritance):** `active_schedule` locks for the 4-week cycle (`downtime`, `week_1`, `week_2`, `week_3`). Rank #1 holds `week_3`. The three non-#1 alliances in Top 4 rotate through `[Seat A, Seat B, Seat C]` across 3 macro cycles so no alliance serves Downtime twice in a row. If a Rank #5+ contender enters the Top 4 (measured during Week 1 Duel Days 3–5), they inherit the vacated wheel seat at the start of the *next* 4-week cycle.
  - **Stepped Defense Overrides (Model 1):** 1st WLO override in a cycle swaps calendar weeks with Week 3 (0 chest cost). 2nd WLO override triggers a 2-installment Wartime Buyout (+1 Reg Gold & +1 KW Gold in target week, +1 Reg Gold & +1 KW Gold in Week 3, deducted from WLO and added to the displaced alliance).
  - **Post-Battle Reward Epoch:** A new reward nomination cycle begins Saturday post-battle (after the KvK battle window), NOT Monday 00:00 GT. Importantly, the rewards distributed during the Off-Week (Downtime) are the spoils of the **Week 3 KvK Finale** (which can be 2x `kw` if won, or 1x `standard`), and `week: 3` buyout installments must remain active for that post-Week-3 distribution before rolling the schedule to `0` (Downtime).
- **Planned (after the safety items; needs a written rule from owner + maintainer first):** a Saturday post-battle reward epoch (`getRewardEpochState`: a new nomination cycle at Saturday 14:00 GT after the KvK battle window, Steward prompt for 2x/1x after the Week 3 Finale, `week: 3` buyout installments preserved through the Off-Week), and making `isKW` in `api/_rewards_helper.js` depend strictly on `mode === 'kw'` (today it falls back to "weeks 1-3" when no mode is set). Option A seat inheritance and `isSteward` checks already exist.

## Territory map & alliance standings
- **Purpose:** Tracks territory ownership (`map.html`, `/map`) and NAP alliance ranks (`alliance.html`, `/rank`).
- **Constraints:** Map PNGs are rendered dynamically via `api/map-image.js` using in-memory SVG/font/city modules compiled during the CI build.
- **Must not change:** Updating alliance ranks in `map-state.json` updates weekly chest tiers immediately, while Capitol rotation seats remain locked until the next 4-week cycle rollover.

## Calendar & event management
- **Purpose:** Displays the 28-day Kingdom War & Capitol rotation cycle alongside global and alliance-scoped operations (`calendar.html`, `/calendar`).
- **Page type (owner decision):** a regular page with the footer, like Map and Alliance (everyone reads it; leaders get extra controls), not a portal page. Its styles come from `/css/portal.css`, linked inside the page so they apply only there. Its scripts start once per visit, whether reached by a full load, the footer, or the back button, and the countdown stops when the page is left. Discord links (`/calendar.html?token=…`, `?view=…`) are unchanged.
- **Constraints:** `_calendar_helper.js` numbers calendar weeks `1..4` in the order `capitol_rotation` lists them (by default the Off-Week is `4`, but `calendar-state.json` in the Gist can put it anywhere, e.g. first). `rewards-data.json` and `kvk-scheduler.js` use the seats `downtime` (`0`), `week_1`..`week_3`.
- **One conversion only:** `getScheduleSlot()` in `_calendar_helper.js` turns a calendar week into a seat: the week marked `is_kw: false` is `downtime`, and the Kingdom War weeks count up from 1. `getCycleState()` returns the result as `clockWeek` and `scheduleSlot`. The website and the bot must use these, never their own rule such as "week 4 is downtime" (that rule made the hero card and the console disagree with the phase name when the live calendar started on the Off-Week).
- **Week names (owner):** the off-week is called **"Off-Week"** everywhere people read it (site, Discord), never "Downtime" or "NAP Rest Week"; Kingdom War weeks are "Kingdom War Week 1..3". Use `weekLabel()` / `getCycleState().weekName`, not the configured `phase` text (the Gist's `calendar-state.json` may still hold old names). `downtime` stays only as the internal key of the reward schedule.
- **Week and capture day (owner):** event weeks run Monday to Saturday, and the week's alliance captures the Capitol on **Friday** (`capture_day_of_week: 5`). `getCycleState()` returns `capitolCaptured`, `isCaptureDay` and `captureTimestamp`. Before the capture the hero card and `/calendar` say "Next Capitol Holder … captures Friday"; afterwards "Current Capitol Holder … captured Friday". The timeline's "Capitol Capture" entry is on the Friday, never on the Monday reset.
- **Must not change:** Both the Top Hero Card (`api/calendar.js` / `js/calendar.js`) and the 4-Week Override Console (`js/kvk-scheduler.js`) must resolve the active Capitol holder from `rewards-data.json`'s `cycle_state.active_schedule` and highlight the active week using the live clock (`clockWeek`), never static `capitol_rank` lookups alone.

## Test pages (`test/`)
- **Purpose:** Internal sandbox pages, also used to demo features.
- **Must not change:** They stay publicly published (owner decision), so `js/mermaid.min.js` stays too. It is excluded from the service-worker precache because of its size (3.3 MB).

## Conventions
- **Game Time is UTC-2.** All schedule/calendar code and bot strings use this.
- **Pull requests** must pass the "Checking build output" CI step before merge.
- **Deploys never overlap.** The workflow's `concurrency` setting runs one deploy per branch at a time; a newer push waits rather than racing, so the newest commit always deploys last. Don't remove it.
- **Folder layout.** Discord tool pages (single-purpose, opened from a Discord link, no footer) live in `portal/`, and their public URLs come from each page's `permalink` (e.g. `/calendar.html`), not from the folder. Files used only by the deploy (`redirect.html`, `migration.html`) live in `_deploy/`, which Jekyll never publishes. Keep public URLs unchanged when moving files.
- **Stylesheets are split into ordered pieces.** `_css/<name>/*.css` is joined in filename order into `/css/<name>.css` by `build.rb` (plain CSS, no Sass). Order is significant (later rules win), so pieces are numbered and media queries come last. The published URLs `/css/style.css` and `/css/portal.css` must not change.
- **One build script.** `_scripts/build.rb` is the only build definition; CI calls it rather than running its own inline steps, so a local build matches production. New build steps go in the script, not in the workflow.
- **Code style is automatic.** JavaScript and JSON are formatted by Prettier (`.prettierrc.json`: defaults plus single quotes and 100-character lines). Don't hand-format or argue style in reviews; run `npm run format` or use format-on-save. HTML/Markdown/YAML are excluded because of Liquid tags. The CI formatting check is advisory, not blocking.
- **Page scripts and Turbo.** A page's script must start only when its own section is on the page, and once per visit: keep the started section elements in a `WeakSet` (not a `data-` attribute, which Turbo's back-button copy of the page keeps). When a script starts on a fresh section, it first clears leftover `data-bound` marks inside it, because a fresh section can be that back-button copy. Inline `<script>`s run again on every visit, so they must not declare top-level `const`/`let`. `js/map.js`, `js/alliance.js`, `js/rewards.js`, `js/calendar.js` and `js/kvk-scheduler.js` follow this.
- **Theme colours (owner decision).** The three themes change one colour family, `--active-theme*` (set per theme in `05-base-variables-themes.css`). The accent (`--accent-color`), borders (`--border-color`) and surfaces (`--bg-color`, `--nav-bg`, `--card-bg*`, `--surface-*`) mix that theme colour into the original gold and browns: 70% for the accent, 30% for borders, 6–8% for surfaces (the owner compared four strengths and chose this one, "3c"). Text and fixed meanings don't follow the theme: status red/green, rank colours, chest tiers, alliance colours, Discord blue. Where gold means *gold* (the gold chest tier, the #1 row of the alliance ladder), use `--gold`, not `--accent-color`.
- **See-through colours use `color-mix()`.** A transparent version of a colour that has a variable is written `color-mix(in srgb, var(--accent-color) 20%, transparent)`, not `rgba(184, 151, 90, 0.2)`, so changing the variable changes every use. Use whole percentages. Variables that already include transparency (`--card-bg`, `--status-danger-bg`, `--status-success-bg`) can't be mixed this way (the two transparencies would multiply), so their other strengths stay as `rgba()`. Measured against `rgba()`: identical pixels (192 colour/strength/background combinations).
- **White and black overlays and shadows use a fixed scale.** `--overlay-3/5/8/12/25` (white) and `--shade-30/40/50/60/70/80/95` (black) in `05-base-variables-themes.css` are the only strengths for see-through fills, borders and shadows. Pick the nearest step instead of writing a new `rgba(255, 255, 255, 0.07)`; add a step only when a new strength is really needed.
- **Generated files are git-ignored** (see `.gitignore` and the README's "Never edit these" list) so local builds never show up as changes.
