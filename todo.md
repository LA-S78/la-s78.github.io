<div class="content-pane" style="max-width: 560px;" markdown="1">

# 📋 Todo

## 🔴 High Priority (Immediate Architecture & Core Overhaul)

- [ ] **1. Unified Read Proxy & Data Sanitizer (`api/state.js`)**
  - Consolidate `/api/alliance`, `/api/map-state`, and `/api/rewards-state` into a single `GET` proxy endpoint.
  - Implement server-side projection and data minimization: strip sensitive Discord guild IDs, alert channel/role IDs, and author tags before serving public data.
  - Configure Edge caching (`s-maxage=60, stale-while-revalidate=300`) with scoped query support (`?scope=all|alliances|map|rewards`).

- [ ] **2. Unified Portal Architecture (Deferred Auth & Proposal Pipeline)**
  - **Client (`assets/js/auth-modal.js`):** Create the reusable "Sandbox → LocalStorage Auto-Stash → Deferred Discord Auth / Token Fallback" modal.
  - **Proposal Engine (`api/proposal.js`):** Add `type: 'alliance'` payload handler that attaches `diplomacy-blueprint.dat` binary attachments to the review message.
  - **Execution Engine (`api/accept-proposal.js`):** Add `type: 'alliance'` handler to perform atomic Gist writes updating `alliances` and `blacklist` in `map-state.json`.
  - **Discord Interactions (`api/interactions.js`):** Wire button interaction handlers for `approve_alliance_proposal` and `reject_alliance_proposal`.

- [ ] **3. Interactive NAP Ranks & Diplomacy Tool (`alliance.html`)**
  - Merge Section 01 (NAP Alliances), Section 02 (NAP Academies), and Section 03 (NAP Ranks) into a single cohesive hierarchy card.
  - Implement client-side hydration via `/api/state?scope=alliances`.
  - Build interactive Sandbox mode: drag-and-drop ladder sorting, mobile step controls (`[▲][▼]`), nested academy management, and integrated blacklist maintenance.
  - Connect submission action to `api/proposal.js`.

- [ ] **4. Alliance Registration Hardening (`register.html`)**
  - Replace raw tag text input with a council-controlled dropdown sourced from `map-state.json`.
  - Enforce the 4-way validation check:
    1. Caller holds `@R5` role on the primary NAP server.
    2. Caller holds the corresponding `@<TAG>` alliance role on the primary NAP server.
    3. Caller holds `ADMINISTRATOR` or `MANAGE_GUILD` in the target Discord server.
    4. Discord bot is verified present in the target Discord server (`GET /guilds/{guild_id}`).
  - Add real-time visual brand preview card (colors, crest, tags).

- [ ] **5. Alliance Dashboard (`dashboard.html` & `/api/dashboard`)**
  - Server-side Google Doc rendering with container shields (mobile table scroll wrappers, max-width image constraints) and fallback Gist blocks.
  - Add `[ 🔒 Officers Only ]` block visibility filters.

- [ ] **6. Stateless Discord Verification (`api/auth.js`)**
  - Implement Discord OAuth2 flow and live REST role validation to issue 14-day HMAC session cookies.
  - Provide fallback validation for signed admin/officer URL tokens.

- [ ] **7. GDPR & Gist Security Hardening**
  - Implement field-level AES-256 encryption for author IDs and sensitive administrative notes.
  - Add self-service nomination withdrawal.
  - Establish monthly Gist commit squash routine to prevent long-term log leakage.

- [ ] **8. Modularization of `api/interactions.js`**
  - Refactor large slash-command blocks into specialized helpers (`_calendar_helper.js`, `_ticket_helper.js`, `_diplomacy_helper.js`) to safeguard serverless function execution times and syntax clarity.

---

## 🟡 Mid Priority (Automation, Tools & Pipelines)

- [ ] **9. Kingdom Calendar Automation Engine (`api/cron/check-reminders.js`)**
  - Set up 5-minute cron worker to query upcoming operations and dispatch webhook notifications to alliance-specific Discord channels.
  - Support instant direct-publishing for internal alliance operations by verified R4/R5 officers, while routing Kingdom-wide events to Council review.

- [ ] **10. Alliance Might & Scoreboard OCR Pipeline**
  - Integrate Gemini Flash vision pipeline to extract player and alliance Might scores from in-game Duel/Rank screenshots.

- [ ] **11. Infographic Translation Pipeline**
  - Build Canva SVG XML automation script to replace text nodes across all 8 supported languages.

- [ ] **12. Portal Localization & Discord Bot String i18n**
  - Centralize embed strings and response messages in `_data/<lang>/`.
  - Connect client-side dynamic tools to the site language switcher.

- [ ] **13. Map Plan Import / Export**
  - Add base64 URL hash serialization (`map.html#plan=...`) to allow war-room tacticians to share and load map marker drawings without database writes.

---

## 🟢 Low Priority (Reference Tools & Interface Polish)

- [ ] **14. Building Prerequisite Interactive Tree**
  - Build dependency graph viewer for Keep levels 1–30+.

- [ ] **15. Interactive Capitol Rotation Tool (`rules.html`)**
  - Replace static blueprint graphic with a dynamic 3-week rotation simulator driven by live NAP ranks from `map-state.json`.

- [ ] **16. T10 Calculator Mobile Polish**
  - Refine node scaling, tree connector alignment, and touch targets on narrow viewports.

- [ ] **17. Progressive Web App (PWA) & Cache Audit**
  - Configure service worker caching policies for map assets, fonts, and stylesheets, with automatic update notifications.

</div>