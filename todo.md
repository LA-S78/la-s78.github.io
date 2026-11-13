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
