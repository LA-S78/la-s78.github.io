# Review brief: changes since the last maintainer review

For the maintainer (Gemini). Your last full review covered the charts and dashboard work. Its
follow-ups merged as **#320** on 23 November 2026. This brief covers **#324–#345** plus one
workflow change pushed straight to `main`. Everything is merged and live as of 27 November
2026.

The reasoning for each change is in `docs/DECISIONS.md`. The PR numbers are the place to look
for the details.

## Worth a closer look

These changes touch security, stored data, outside services or the deploy, so a second pair
of eyes matters most here.

1. **The alliance sheet can read caravan picks (#334).** This is a new way in from outside the
   site.
   - **Endpoint:** `GET /api/state?scope=caravan-export` with `Authorization: Bearer cvk.<al_id>.<32 hex>`.
     It answers `private, no-store`.
   - **The key** (`api/_caravan_export.js`):
     - It's made by an R5 or a Steward on the dashboard and shown once.
     - Only a hash is stored, in the alliance's dashboard `settings.caravanKey`.
     - It's checked with a timing-safe compare.
     - It can be replaced or revoked.
   - **What it returns:** the alliance, the week's start, and the picks. Each pick has a name,
     a time and a week, and there are no Discord IDs.
   - **Source of the picks:** a pick log (`caravan.log`, newest 400) that survives "New week".
     `visibleDashboard` strips the log out of what the page receives.
   - **Please check:** the key format, the hash compare, and that the log can't reach members.
2. **Sheet lists for any layout (#336, #337).** The server now reads a range from any Google
   Sheet a leader links.
   - **Where the list is:** "Fill from sheet" (nominations) and the caravan suggestions no
     longer read fixed Duel Tools tabs. A leader picks the tab, the cells and the column
     roles with a sheet picker. That's `js/sheet-list.js`, which reuses the chart builder's
     grid.
   - **The saved link** (`settings.capitolLink` / `caravanLink`) is `{ url, gid, tab, range,
     cols, heads }`. `api/_sheet_list.js` has `cleanLink`, `readList`, `readSavedList` and
     `linkList`.
   - **The safeguard:** the **headings seen when linking** are stored. A later read with
     different headings stops with `code: 'changed'`. This guards against Google's habit of
     quietly returning the *first* tab when the requested one is missing (that's how duel
     scores once showed up as caravan suggestions). It also catches columns being moved.
   - **What's fetched** still goes through `api/_google_source.js`: Google hosts only,
     timeouts, a size cap. `sourceRequest` now also takes a `gid`.
   - **Who can call it:**
     - On `/api/nominate`, the new actions `sheet-tabs`, `sheet-grid`, `sheet-link` and
       `sheet-fill` take the /nominate token.
     - On `/api/dashboard`, `caravan-link` and `caravan-suggest` are leader-only.
     - A Steward's **test link** saves the sheet link too (#338). That's the alliance's sheet
       setting, not its nominations, and Stewards can already change it on the dashboard.
3. **Steward image uploads skip review (#326).** On the Steward page's Alliance settings, a
   Steward's upload goes live straight away (`saveLive()` in `api/_alliance_images.js`,
   `direct: true`), with no review post.
   - The byte checks still apply.
   - **Please check:** that `direct` is honoured only for a verified Steward session.
4. **New Discord commands and options (#332, #334).**
   - **`/nominate show:list`:** leaders see the saved list privately.
   - **`/nominate alliance:`:** Stewards only. It gives a **test token** (`test: true`, 24
     hours) when the real link would be refused. With a test token, the page works but
     saving nominations returns `409 test_no_save`.
   - **`/caravan`:** show, pick or unpick, with `player:` and a Steward-only `alliance:`. It's
     allowed for R4s, R5s and delegated leadership (`api/_bot_caravan.js`). A name not in the
     rotor is added, then picked.
   - Both command lists are updated: `.github/discord.json` and `api/_bot_schema.js`.
5. **The deploy workflow (pushed to `main`; the owner asked for no PR).**
   - **Two jobs:** `build-and-deploy` is now **`build`**, then **`deploy`**. `deploy` runs
     only on pushes and Run workflow, and only fetches the built site's bundle. A failed
     deploy can be re-run alone. Each job sends its own Discord alert.
   - **A new build step fails if `_site` holds any hidden file.** The upload leaves hidden
     files out by default. That keeps secrets out (for example `.vercel` from `vercel pull`),
     and the check means nothing goes missing silently.
   - Its first run succeeded.
   - Any required-check rule naming `build-and-deploy` would need to name `build` now.
   - Earlier, #328 added a time limit for translations (`TRANSLATE_BUDGET_SECONDS`, default
     900) and a manual "Run workflow".
6. **Leader titles are stored (#330, #331).** `stats/titles.json` holds `{ uid: "R4 · Title" }`,
   saved from live tracker lookups, because the tracker's cached rosters don't carry titles.
   - The standings cards' open view lists the R5 and R4s with titles: Goddess, God of War,
     Diplomat, Recruiter.
   - The cards carry names, ranks, avatars and frames, and **no player IDs**.

## Other changes

**Alliance settings and the alliance page**
- **#326:** the Steward page's Alliance settings: pick an alliance, then edit its tag and
  name, trade tags with another alliance, retire it, or upload pictures.
  - The fixed HMDA/Arch race warning came from the race keeping tags from before the move to
    IDs (`formerOwner`, `currentTags`).
- **#340:** the NAP Roster bar's background is diagonal stripes of the NAP alliances'
  colours, in rank order. They're cached in `localStorage` and redrawn only when a colour or
  the order changes.
- **#343:** the tool bars (`.map-controls`) now have the theme colour on all four sides. Only
  the bottom edge had it before.

**Dashboard layout and each viewer's own view**
- **#339, tools above charts:** the tools (rewards, rotor, roster) always come before the
  charts (growth plus the alliance's own).
  - Leaders' moves stay within each group: `layoutOrder`, and `move-item` refuses a move
    across groups.
  - A chart the layout doesn't name (a new one) goes to the top of the charts.
- **#339, the viewer's own view:** every card folds to its title line. "Arrange my view" lets
  everyone reorder within each group, with "Reset to alliance layout".
  - All of this is per browser, per alliance, in `localStorage` (`dash-view:<tag>`), with no
    server writes.
  - Charts not yet seen on that device get a "New" tag.
- **#338, #341, header tidy-up:**
  - The rotor's and the roster's header details now sit on one line.
  - Edit and Arrange share one row, and their extra buttons appear below only while they're
    on.
  - Every card has the same square Show/Hide arrow, with its name in the tooltip.
  - Sync is a square button in a chart's title row.
- **#344:** opening or closing a card keeps it where it was on screen (`keepInPlace`), on the
  dashboard and the alliance standings. `arrange()` now moves cards only when the order
  changed, because moving them every time made phones jump.

**Charts**
- **#324:** pie, line and table charts can read across tabs, and bar charts gain "Total of N
  tabs".
- **#345:** a bar chart's legend now stays when a viewer picks a series with no numbers yet.
  Before, it vanished and the choice couldn't be undone.

**Nominations and caravans**
- **#335:** Fill from sheet uses the Player ID column when there is one, so a name change in
  the game doesn't matter.
- **#336:** after a fill, the sheet's names are listed with their scores, plus an Undo.

**Map**
- **#342, the pinch fix (`js/map-zoom.js`):** a finger whose lift was missed stayed listed.
  The next one-finger drag then counted as a pinch around a forgotten point. Fixes:
  - a first finger (`isPrimary`) clears any left over;
  - lifts and cancels are heard on the whole window, and removed when the page changes;
  - when one of three fingers lifts, the pinch carries on without a jump.
- **#342, skins status:** the Steward page shows how the nightly skin collection is doing
  (`skinsStatus` in `api/_skins.js`). No fault was found in the collector. With the cap of
  150 a night after the first pass, each NAP player is refreshed about every 5–6 days.

**Translations (#328):** the translator has a time limit. Sections not reached are left for
the next push or the manual run.

## Questions for you

1. **The caravan export key:** is one key per alliance, stored as a hash in the dashboard
   file, enough? Or should it live in its own file?
2. **Test links saving the sheet link (#338):** acceptable, or should test links keep only an
   in-page copy?
3. **The skin collection cap:** raise it from 150 to about 300 a night, for a refresh every
   2–3 days? The owner will decide after seeing the Steward page's numbers.
4. **Per-device view settings (#339):** fine for now? Syncing them per account would mean a
   Gist write for every fold.
