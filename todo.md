<div class="content-pane" style="max-width: 560px;" markdown="1">

# 📋 Roadmap

_Last tidied: 19 November 2026. Decisions behind finished work are in `docs/DECISIONS.md`; what changed since the maintainer's last review (#71–#87) is summed up in `docs/REVIEW_BRIEF.md`._

## 🚧 Active (next up)

Ideas for more Last Asylum Tracker data (owner, 2026-11-19). The tracker allows 1,000 requests a day; today the site uses about one per alliance per hour, only when a page is opened.

- [x] **Research and help in the dashboard roster (leaders only)** — today's alliance research donations (tracker `daily_tech`) and help given to members' construction and research (`daily_honor`), with Research and Help sorts and a note of how current they are. No extra requests. Not the game's weekly activity score (owner: it weighs Survival Battle like Alliance Duel, so it misjudges players).
- [x] **Live stats on the Alliance standings cards** — each NAP alliance's in-game badge on its card, and Might, members (99/100) and level behind an arrow; every card one line high outside planner mode (academies move into the details too). Not the game's kingdom ranking: ranks stay with our rules.
- [ ] **Stats page** — new page for numbers over time:
  - Might history: every NAP alliance's Might saved once a day (about 10 requests a day, stored like the Top 4 race), drawn as growth charts here and on the dashboard.
  - Kill Event and Kingdom War stats: kills by alliance, and the change in kills before and after an event.
- [ ] **Members on the territory map (leaders only)** — a toggle that shows where the signed-in officer's own alliance members' Sanctuaries are, and a search box to find one of them. Positions are the most sensitive data, so only the officer's own alliance.
- [ ] **Player lookup by ID** — look up any player (name, Might, kills, Sanctuary level, alliance). Good idea, but no home yet: maybe the Stats page, or a Steward tool.
- ~~NAP checks from alliance declarations~~ — dropped (owner): declarations are free text and too unreliable.

## 🙋 Owner to-dos

- [ ] **HMDA** — the tracker can't find it. If it has left the server or renamed, switch it off as a NAP alliance (or tell me its new tag).
- [ ] **Delete the branch `claude/calendar-capitol-box-picture`** (on GitHub): a comparison branch, no longer needed (#210 took its style).
- [ ] **Undead Siege and Hunt Battle** — how long they last and whether they repeat (both default to 1 hour, no repeat), and whether Hunt Battle gets a guide.
- [ ] **Pictures still to come (waiting on Gemini image limits)** — guide cards for Survival Battle, Royal Scramble, Canyon Conquest, Thief Hunt, Dwarven Pickaxe, Honor Shop, Campaign Shop, Premium Shop. Survival Battle is also a calendar event, so its picture would show there too.
- [ ] **Thief Hunt guide** — the "Store" placeholder.
- [ ] **Home page credits** — what they should say.

## 🔴 High Priority

- [x] **Alliance Dashboard (`portal/dashboard.html`, `api/dashboard.js`)** — spec agreed 2026-11-11, built in four steps:
  - [x] Foundation: page, who sees what (server-side), Steward switcher, pill link, officers-only reward card, R5 nomination link. (#78)
  - [x] Widgets: edit mode, paste-in tables, 5 themed chart types, visibility per widget, size limits. (#79)
  - [x] Google Sheets / Docs sync (Google hosts only, Sync Now). (#80)
  - [x] Caravan Rotor (R4-managed pick list, Undo, New Week, game time + local time, copy status). (#81)

- [ ] **GDPR & Gist Security Hardening**
  - Field-level AES-256 encryption for author IDs and sensitive admin notes.
  - Self-service nomination withdrawal.
  - Monthly Gist history squash, so old revisions don't keep personal data forever.

---

## 🟡 Mid Priority (Automation, Tools & Pipelines)

- [x] **Kingdom Calendar Reminders** (owner answers, 2026-11-13; live since 2026-11-13): set per event by the alliance (its events) or a Steward (server events); one reminder per event, posted when it starts or 10–60 minutes before, as the event chooses (#185); alliance events to the alliance's alert channel, server events to the NAP Discord (NAP_ALERT_CHANNEL_ID) plus alliances that opt in; pings the role chosen on the event; can be switched off per event. cron-job.org (every 5 min, #187) calls the site, which does the work with the variables Vercel already has (REMINDER_SECRET proves the call). Built-in KvK/Capitol events: later, as a Steward setting. Reminder messages are in English (shared channels).
  - [x] **Part 1 — event settings:** "Remind on Discord 1 hour before" on the event form (on by default for new events), editing events (Edit next to Delete; same scope rule as delete), a hint when there is no alert channel, and the registration opt-in for server-event reminders.
  - [x] **Part 2 — the reminder check:** `api/_reminders.js`, reached through `POST /api/calendar` (no new function) with REMINDER_SECRET; cron-job.org calls dev and live every 10 minutes (GitHub's schedule never started; by hand: Actions → Calendar reminders → Run workflow, dry run by default). The live site posts nothing until `REMINDERS_LIVE=true` is set in Vercel; dev.la-s78.app posts only to TEST_CHANNEL_ID, pinging nobody.
  - [x] **Go live (owner):** tested on dev (reminder posted to the test channel), then `REMINDERS_LIVE=true` set on the live site. Leaders can also manage events by signing in (R4/R5, Stewards).
- [x] **Last Asylum Tracker API** (owner, 2026-11-17; more ideas under Active): alliance Might and member lists for our server, from `api.lastasylumtracker.com` (key in Vercel as `LAT_API_KEY`).
  - [x] Name checks in the nomination list and the Caravan Rotor: game spellings, unknown names, close matches.
  - [x] Top 4 race: live snapshots 10 minutes before reset on Duel Days 3–5 of Kingdom War Week 1; NAP alliances and academies ranked by their three-day total on the Rules page; results posted to NAP leadership with Apply new ranks / Keep current order buttons for Stewards: applying re-ranks the whole NAP list by total, academies included; seats change at the next cycle.
  - [x] Alliance roster on the dashboard: pictures in frames, rank, ID, Might, Sanctuary level; search and sort; tracker credit. Leaders only (the Members can view option was removed, 2026-11-19).
  - [x] Pictures in the Caravan Rotor, nomination list and King's console.
  - [x] Player IDs in nominations: officers type an ID or a name; the King's console shows the current name and picture.

- [x] **Infographics** (decided 2026-11-12): the designed pictures were replaced by live, translated components. The Capitol Rotation chart is drawn from the calendar; the reward-distribution and territory-map pictures were removed (the rewards card and the live map replace them). Game screenshots in the guides stay as they are (players see the game in their own language).

- [ ] **Tool Translations** (in progress, leaders' tools first)
  - Tool text lives in `_data/en/tools.yml`; changed sections are translated by Gemini on push (`_scripts/translate_sections.rb`, see HOWTO "Add or change text in a tool").
  - [x] System + Alliance Dashboard (charts, editor, Caravan Rotor, reward card)
  - [x] Nomination page, King's console, registration
  - [x] Calendar, King's scheduler, rewards
  - [x] Alliance page and map planners (incl. the proposal pop-up and live-data notices)
  - [x] `ui.yml` through the same system (hand translations kept; `guides`/`nav_anchors` left to the guides)
  - [x] Server messages (`api/`, `_data/en/server.yml`; technical admin messages stay English)
  - [x] Discord bot replies: `/calendar`, `/map`, `/nominate`, `/rewards` (shared leadership-channel posts stay English)
  - [x] Discord command picker descriptions (`bot_commands`; alliance servers update on `/registerbot` sync)
  - [x] `/registerbot`, `/rank`, `/devupdate` and the proposal-review buttons' private replies (the shared war-room post stays English)
  - [x] Guides: section titles, subtitles and picture descriptions are checked after translation and filled if left in English; a guide whose sections don't match the English is rebuilt from it; **Actions → Fill missing translations** fixes older guides and opens a checked pull request (#190–#192, #198)
  - [ ] `/suggest` (later, once most other work is done): it's in the alliance servers' command list but the bot has no handler for it yet

- [x] **Calendar event pictures (owner idea, 2026-11-15)** — a faded picture behind each event card by event type, in `_data/event_types.yml` (#156); the same picture behind the event's guide card (#196). Pictures so far: Crystal Cluster, Elixir Scramble, Undead Siege, Gear Upgrade, Cheese Trap, Kingdom War, Kill Event, Hunt Battle (#200).
- [x] **Your alliance highlighted across the site (owner idea, 2026-11-15)** — the signed-in reader's alliance glows in the calendar's rotation, the Alliance standings, the rewards tool and the map's buff summary (#160, #161, #171).
- [x] **Alliance pictures** — R4/R5 send a card picture and a banner from the dashboard (crop with drag and zoom, 3 a day); a Steward approves them privately from Discord; approved pictures show on the Capitol Rotation cards, the NAP Ranks rows and the calendar's Capitol holder box, fading in once loaded (#178–#180, #207, #209, #210). Stored privately in Vercel Blob.
- [x] **Telling alliances apart** — letter case counts, accents don't: RâvN and RÂVN are two alliances everywhere (pictures, dashboards, calendar scopes, reminders, sign-in, `/rank`, map, blacklist), while RAVN is still RÂVN (#199).
- [ ] **Map Plan Import / Export**
  - Share map marker drawings as a link (`map.html#plan=...`), with no database writes.

- [x] **Own service worker (`sw.js`)** (owner decision, 2026-11-13): replaced Workbox 4.3.1, which every visitor's browser downloaded from Google's servers unchecked, with the site's own plain worker (no outside script; a build check keeps it that way). Same jobs: offline app shell (only changed files re-downloaded on an update; Workbox's saved copy reused on the switch, so phones don't download the site again), image store, live data, offline Home fallback, update toast. Pages are saved under their plain address, so `?__WB_REVISION__=…` no longer appears in the address bar. A phone saves only its reader's language plus the pages it opens (first visit 10.9 → 5.1 MB); an update refreshes every saved page, including visited pages in other languages.
- [ ] **Retire the old-page rescue in `sw.js`** (section 6, about 40 lines) a few weeks after November 2026, once no phone runs pages from before the update toast.

- [ ] **Guides from the owner's English graphics** — each graphic cut into its pictures, with the words as text so every language can read it, one guide per pull request. Done: Kill Event (#188), Frozen Era (#197), Alliance Duel (#212), Crystal Cluster Valley. More to come from the owner.

---

## 🎨 Look & Feel (site-wide)

_From a measured audit of every page, all three themes, phone and desktop (November 2026)._

- [x] **Lighter pages** — a first visit downloaded ~5 MB, mostly a background picture fetched twice (WebP and a 4.4 MB PNG fallback). WebP only now, a 48px tab icon instead of the 452 KB app icon, and right-sized lantern, link-preview banner and 404 picture: ~0.7 MB.
- [x] **Keyboard focus & readability** — a clear ring in the theme's colour shows where the keyboard is (Tab); small accent-coloured text (links, table headings, labels, badges) uses a slightly paler accent that reads clearly in every theme; red text uses the lighter red; footer labels 11 → 12px.
- [x] **Section tabs follow the page** — the tabs under the header (Server Rules / Rotation / Rewards, guide sections) now always light the section being read: scrolling back up, a short last section, and a tapped tab no longer flicker through the sections in between.
- [x] **Tools that fit phones** (owner report, 2026-11-13: tools feel "compressed" on phones and stack buttons oddly, worse with each feature and language). From screenshots of every tool at phone width in English and German:
  - [x] **Step 1 — Roomier phones:** narrower page edges (20 → 12px), and tools come out of their inner frames (map, T10 tree, calendar phase card), so the content gets about a tenth more of the screen. Desktop unchanged.
  - [x] **Step 2 — One button system:** about 40 button and box styles (13–50px high, 8 corner shapes) now use three heights — compact 28px inside rows, standard 32px in toolbars, large 40px for main actions and form fields — and one corner shape, set in `_css/style/86-controls.css` and `_css/portal/85-controls.css`. The tiny ▲▼, × and "+ Link Academy" buttons are finger-sized.
  - [x] **Step 3 — Tidy toolbars:** every tool's controls bar has two parts — what you're looking at (view switches, information) on the left, then the planner: Planner Mode and Submit together at the right of the top row on desktop, and on phones a line of their own with Planner Mode on the left and Submit on the right (the blacklist bar too; the dashboard's Edit / Add chart pair stays centred). On phones the two parts are full-width rows that hold in every language (the map's bar was three ragged rows in German); view switches span the row. The map's "Change to:" tag box always has a line of its own under the buttons, so on phones the map's bar is three steady rows (views; planner; tag box), and on a narrower desktop window Buff Summary and Fullscreen drop to their icons when the bar would otherwise wrap. Set in `_css/style/88-toolbars.css`. (A "mode switch first, Submit at the far end" rule was tried and dropped: it made the bars look odd — owner, 2026-11-13.)
  - [x] **Step 4 — Steady screens** (owner ideas):
    - [x] **No jumping on tap:** Submit Plan and its count are always in the bar, greyed out until there is something to send (owner decision); the map's "Change to:" tag box is always on its own line, greyed out until Planner Mode is on; the resource key sits under the map instead of pushing it down; "Copy" → "✓ Copied", the T10 unlock buttons and Edit Dashboard keep their width; the dashboard's Add chart waits greyed out beside Edit. Measured by tapping every tool button: the tapped button no longer moves (switching a planner or editor on still opens its tools below the button, as it must).
    - [x] **Last known data while loading:** the map, alliance standings and blacklist, rewards tiers and the Capitol rotation board show this device's last saved copy straight away (the one sw.js keeps for offline use), dimmed and not clickable, with "⏳ Updating…" floating in a corner (it takes no space, so nothing moves when it goes), and swap to the fresh data when it arrives. Planner Mode stays off until the fresh data is in. If the fresh data can't be loaded, the saved copy stays with a note saying when it was saved. The calendar and the Alliance Dashboard joined later (#168, #169); saved copies are dropped after 7 days. (`js/live-data-notice.js`)
  - [x] **Step 5 — Per-tool polish:** the ladder's edit rows, the buff summary table (cut off on phones), the calendar's cards, the King's console rows and the rewards tier editor.
    - [x] **Buff summary** (the map's ⚖️ panel): one card per alliance — tag and number of cities on top, its buffs below, wrapping — instead of a three-column table that was cut off on the right (phones, and desktop in German); on phones the panel takes nearly the map's whole width.
    - [x] **Ladder rows in Planner Mode** (phones): the rank and its ▲▼ sit at the top left beside the tag, name and academies; the NAP line runs the full width below, with the × (remove alliance) on its own at the far right, away from Revoke NAP. A little shorter than before (German: 1158 → 1122px for the list).
    - [x] **Calendar** (phones): cycle progress, next reset and next KW battle share one box, a line each (label left, value right; a long value moves under its label), instead of three full-width boxes; event cards show their time straight under the title (a large gap and an empty line sat between). The phase card's "Loading cycle details…" no longer stays when the answer has no reward period. About 150px shorter in German.
    - [x] **King's console & nomination page** (phones): the console's rows needed nothing more after the button system (step 2). On the nomination page, the "Who gets what" list's "If won" column was cut off where a chest name is one long word (German "Logistikunterstützung"); chest names now break with a hyphen inside their column.
    - [x] **Rewards card** (phones): the tier editor itself needed nothing more after steps 2–3. The weekly allocation line keeps each chest whole (no line starts with "|"), and the totals table keeps "Rank 2–3" on one line; the card is about 45px shorter.

---

## 🟢 Low Priority (Reference Tools & Polish)

- [ ] **Building Prerequisite Interactive Tree** — dependency viewer for Keep levels 1–30+.
- [x] **Interactive Capitol Rotation Tool (`rules.html`)** — the static picture is replaced by a live 4-week chart from the calendar (`js/capitol-rotation.js`).
- [x] **T10 Calculator Mobile Polish** — the Health/Attack row shrinks with the screen (brackets still meet the hexagon centres), 40px buttons on phones, a real "−" with spoken labels, totals in three columns that stay in view, billions as B.
- [x] **Distinct page titles** — each tab shows its page's name in its language ("Regeln | Last Asylum Guide"); the home page is the site name alone.
- [x] **Visual-diff coverage** — the nomination page (its list, and after a win) and the King's console (as the King's alliance) are checked with real sample data.
- [x] **GitHub Actions Node warning** — every workflow step now runs on Node 24 (`setup-node@v5`, `upload-artifact@v6`, `cache@v5`), and the command deploy uses Node 24.
- [ ] **Test Discord bot (optional)** — a second bot for dev.la-s78.app, so test proposals never touch the live bot's servers.

---

## ✅ Done

- [x] **Unified read API (`api/state.js`)** — one `GET /api/state?scope=all|alliances|map|rewards`, public data only, edge-cached.
- [x] **Proposal pipeline** — sandbox planners on the site save a draft, ask for a login pass and send a proposal to Discord; Stewards approve in Discord and the change is saved (map, alliance ladder, blacklist each have their own proposal). R4/R5 only, 5 a day; Stewards unlimited. (#53–#55, #58)
- [x] **Interactive NAP ranks & diplomacy tool (`alliance.html`)** — one hierarchy card, live data, drag-and-drop and ▲/▼ ordering, academies, a separate Edit Blacklist mode.
- [x] **Discord login (`api/verify.js`)** — Discord sign-in with a signed 30-day login pass; alliance found by role ID, NAP role name, then `[TAG]` nickname; officers named with /registerbot get R4 access; header sign-in pill. (#56, #57, #67; alliances from `_data/alliances.yml` role settings only, so BOTS and NAVI are found by role ID: #72)
- [x] **Split the Discord bot (`api/interactions.js`)** — now only checks and routes; each command lives in an `api/_bot_*.js` module. (#60)
- [x] **Weekly reward periods** — King's Commendation every week; King of Battle Reward after a Steward records a Won; ranked nomination lists; King's console hands out one set at a time. (#59)
- [x] **Test site with its own data** — dev.la-s78.app uses a separate test Gist; Stewards refresh it with `/devupdate`. (#61–#65)
- [x] **One alliance list & live data only** — `_data/alliances.yml` is the single list of alliance colours and starting rotation; pages show live data, with clear notices when loading, failed or offline. (#69)
- [x] **Installed app (PWA)** — update notice, app shortcuts, iPhone icon, offline fallback to the home page, old caches cleaned up (#69); stuck old versions take over by themselves, `/reset` link and Update App in the pill (#76); the site's own service worker replaced Workbox (2026-11-13).
- [x] **Safe saves** — every Gist save checks the revision history afterwards and repairs any save it overwrote, so nominations, the Won/Lost result, approvals, `/rank`, events and the proposal log made at the same moment are all kept. (#73)
- [x] **King's checklist on the server** — ticks saved for everyone, by the King's alliance R4/R5 and Stewards; a handed-out chest is locked through any re-sort. (#74)
- [x] **Alliance registration hardening** — the alliance comes from the signed `/registerbot` link (R5 + alliance role checked); the portal checks the bot is in the server, the person can manage it, and the channels and role belong to it. (#75)
- [x] **Theme colours** — accent, borders and surfaces follow the chosen theme. (#50–#52)
- [x] **Site search** — the search box finds any section of the guides, Rules and Alliance pages, in the reader's language (#153).
- [x] **Calendar redesign** — week and cycle views, event types with icons and pictures, a type filter, the week's king, one Capitol rotation board; leaders add, edit and delete events from the page after signing in; Back keeps the reader's place (#155–#158, #162, #170, #172–#177).
- [x] **Line icons instead of emojis** — one SVG icon set (`_data/ui_icons.yml`) across dropdowns, the dashboard, the calendar and every other tool (#181–#184); new footer and guide icons, Pinned Pages and an Event Calendar directory on the home page (#186).
- [x] **Installed app look** — neutral theme and bottom-bar colours, install screenshots taken from the live site by a hand-run workflow (#164–#167).
- [x] **Stewards' dashboard switcher** — every alliance, academies included, in the Alliance page's standings order; alliances outside the NAP last (#201).

</div>
