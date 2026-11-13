<div class="content-pane" style="max-width: 560px;" markdown="1">

# 📋 Roadmap

_Last tidied: November 2026. Decisions behind finished work are in `docs/DECISIONS.md`._

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

- [ ] **Kingdom Calendar Reminders (`api/cron/check-reminders.js`)**
  - A 5-minute scheduled job that posts upcoming events to each alliance's Discord channel.
  - Alliance-only events published directly by verified R4/R5; Kingdom-wide events go to Steward review.

- [ ] **Alliance Might & Scoreboard OCR**
  - Read player and alliance Might from in-game Duel/Rank screenshots (Gemini Flash vision).

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
  - [ ] `/suggest` (later, once most other work is done): it's in the alliance servers' command list but the bot has no handler for it yet

- [ ] **Map Plan Import / Export**
  - Share map marker drawings as a link (`map.html#plan=...`), with no database writes.

- [ ] **Workbox upgrade (`sw.js`)**
  - The service worker loads Workbox 4.3.1 from Google's CDN. Bundle a current version with the site instead (see `docs/HOWTO.md`).

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
    - [x] **Last known data while loading:** the map, alliance standings and blacklist, rewards tiers and the Capitol rotation board show this device's last saved copy straight away (the one sw.js keeps for offline use), dimmed and not clickable, with "⏳ Updating…" floating in a corner (it takes no space, so nothing moves when it goes), and swap to the fresh data when it arrives. Planner Mode stays off until the fresh data is in. If the fresh data can't be loaded, the saved copy stays with a note saying when it was saved. The calendar page is left as it is: its data depends on who is signed in. (`js/live-data-notice.js`)
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
- [x] **Installed app (PWA)** — update notice, app shortcuts, iPhone icon, offline fallback to the home page, old caches cleaned up (#69); stuck old versions take over by themselves, `/reset` link and Update App in the pill (#76). Workbox upgrade still open above.
- [x] **Safe saves** — every Gist save checks the revision history afterwards and repairs any save it overwrote, so nominations, the Won/Lost result, approvals, `/rank`, events and the proposal log made at the same moment are all kept. (#73)
- [x] **King's checklist on the server** — ticks saved for everyone, by the King's alliance R4/R5 and Stewards; a handed-out chest is locked through any re-sort. (#74)
- [x] **Alliance registration hardening** — the alliance comes from the signed `/registerbot` link (R5 + alliance role checked); the portal checks the bot is in the server, the person can manage it, and the channels and role belong to it. (#75)
- [x] **Theme colours** — accent, borders and surfaces follow the chosen theme. (#50–#52)

</div>
