# Review brief: changes since the last maintainer review

For the maintainer (Gemini). The last review covered PRs #71–#87, and its follow-up merged as
#89 on 12 November 2026. This brief covers **#90–#210**, all merged and live by 17 November
2026. The full reasoning for each change is in `docs/DECISIONS.md`; `todo.md` has the updated
roadmap. The PR numbers are the place to look for the details.

## Worth a closer look

These are the changes where a second pair of eyes matters most: they touch security, stored
data or the deploy.

1. **Alliance pictures** (#178–#180, #207, #209, #210): the first user uploads on the site.
   - Pictures are kept in a **private** Vercel Blob store. Approved ones are served only
     through `/alliance-images/<file>` (`api/_alliance_images.js`, via `/api/proposal`).
   - Each upload is checked from its bytes: WebP, JPEG or PNG only (no SVG), the exact size
     for its slot, at most 250 KB, and no hidden data such as EXIF or GPS.
   - Limits: 3 pictures per alliance per day, from R4/R5 of that alliance only.
   - A Steward reviews each picture on `/review-image.html`, which shows it only after a
     server-side Steward check. The Discord post never contains the picture.
   - Pictures nobody reviews are deleted after 7 days.
   - #207 widened the file-name check to allow lowercase letters (`RavN-…`). Please check
     that the pattern still refuses path tricks.
2. **Alliance tag identity** (#199): a site-wide rule change. Letter case now counts, accents
   don't, so RâvN and RÂVN are two alliances while RAVN is still RÂVN.
   - The rule lives in `api/_alliances.js` (`sameTag`, `findTag`, `tagSlug`, `sameScope`) and
     `js/tags.js`. It replaced case-insensitive comparisons that let one alliance reach
     another's dashboard, pictures and private calendar events.
   - Stored file names keep their capitals, so nothing stored moved. Only a tag that shares
     its capitals with another alliance keeps its letter case (`RavN`).
3. **Own service worker** (#125, #126): Workbox 4.3.1, which browsers downloaded unchecked from
   Google's servers, was replaced by the site's own `sw.js`. A build check keeps it free of
   outside scripts. A phone now saves only its reader's language plus the pages it visits.
4. **Calendar reminders** (#131, #132, #134–#144, #185, #187):
   - Discord posts come from `api/_reminders.js`, reached through `POST /api/calendar` with
     `REMINDER_SECRET`. cron-job.org calls it every 5 minutes.
   - The live site posts only with `REMINDERS_LIVE=true`. The dev site posts only to the
     test channel.
   - Leaders now add, edit and delete events after signing in on the site (#134, #172–#177).
5. **Translation pipeline:**
   - The server's messages (#95), the bot's replies (#96, #100) and Discord's command picker
     (#98) are now translated.
   - For guides, titles, subtitles and alt text are checked and filled after Gemini's
     translation (#190).
   - A guide section that doesn't match the English is rebuilt from it, sending only the text
     to Gemini as JSON (#191, #192).
   - A hand-run **Fill missing translations** workflow fixes older guides. It builds and
     checks the site before opening a pull request (#198); pull requests opened by a workflow
     show GitHub's usual check as failed with no jobs.
6. **Server functions:** still **11 of 12** on the Vercel Hobby plan. Everything new went
   through existing endpoints.

## Translations (#90–#100)

- Every tool's text, the server's messages and the Discord bot (replies, Steward tools and
  the command picker) are now in all 8 languages.
- `ui.yml` goes through the section translator; the hand translations were kept.
- Posts in the shared leadership channels stay in English.

## Live data and the installed app

- **Last known data while loading** (#117, #122, #168, #169): every tool, now including the
  calendar and the dashboard, shows the device's saved copy dimmed with "Updating…". Saved
  copies are dropped after 7 days.
- **Own service worker** (#125, #126); Back keeps the reader's place (#127, #170).
- **Installed app look** (#128–#130, #164–#167): status and bottom bar colours follow the
  theme, and a hand-run workflow takes install screenshots from the live site.
- **Lighter pages** (#110, #152): a first visit fell from about 5 MB to about 0.7 MB.

## Look and feel (from a measured audit of every page and theme)

- **Phones:**
  - roomier pages (#113);
  - one button system with three heights (#114);
  - tidy toolbars (#115);
  - nothing moves under the finger when a button is pressed (#116);
  - per-tool fixes for the buff summary, ladder rows, calendar, nominations and rewards
    card (#107, #109, #118–#123).
- **Readability:**
  - keyboard focus rings and readable accent text (#111);
  - readable alliance tags (#151);
  - roadmap tick boxes that read apart (#206).
- **Line icons instead of emojis** across the site, from one icon set in `_data/ui_icons.yml`
  (#181–#184), plus new footer and guide icons (#186).

## Features

- **Site search** (#153): any section of the guides, Rules and Alliance pages, in the reader's
  language.
- **Calendar redesign** (#155–#158, #162, #170–#177):
  - week and cycle views;
  - event types with icons and pictures (`_data/event_types.yml`) and a type filter;
  - the week's king, and one Capitol rotation board;
  - a reminder lead time chosen per event (#185);
  - the Capitol holder's banner in the holder box (#210).
- **Your own alliance highlighted** across the site (#160, #161, #171).
- **Capitol Rotation chart** on the Rules page, drawn live from the calendar (#101, #103,
  #104); `/rewards` Steward reset for overrides and buyouts (#102).
- **Dashboard:**
  - charts can swap rows and columns, with up to 40 columns (#105);
  - the site footer is back (#106);
  - the Stewards' switcher lists every alliance, academies included, in standings order (#201).
- **Map:** Planner Mode keeps the view and the plan (#154).
- **Guides:**
  - Kill Event (#188) and Frozen Era (#197), made from the owner's English graphics: the
    pictures are cut out and the words written as text, so they can be translated;
  - a shared picture viewer (#188);
  - guide cards show their event's picture (#196);
  - pictures for many guide cards (#200, #202–#205), and a new Hunt Battle event type (#200).

## Fixes

- **Tools left blank after some page loads:** tools now also start when Turbo swaps in a
  page (`turbo:frame-render`) (#124).
- **Small fixes:** section tabs follow the page reliably (#112); search, map fullscreen, the
  language picker and WLO's colour (#163); dropdowns no longer duplicate after Back (#159);
  no blue tap flash on phones (#149).
- **Alliance pictures:**
  - RâvN's approved pictures answered "not found" (#207);
  - pictures pop in late, now faded in once loaded (#209);
  - the academy icon is back on "Academy of [TAG]" (#208).
- **CI:** a queued run builds the newest commit, so back-to-back merges can't clash (#97).
  All workflows run on Node 24 (#108).

## Open questions (owner)

- How long Undead Siege and Hunt Battle last, and whether they repeat (both default to
  1 hour, no repeat).
- The Crystal Valley guide placeholder, the Thief Hunt "Store" placeholder, and the home
  page credits.
- Pictures for the remaining guide cards, waiting on Gemini image limits.
