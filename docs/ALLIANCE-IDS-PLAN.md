# Plan: alliances by permanent ID, not by tag

Status: **proposed, revised after the maintainer's review** (owner request, 2026-11-20; Gemini's
review the same day). Nothing in here is built yet; each step below becomes its own pull request,
rehearsed on the test site first.

## Why

Today the site stores everything about an alliance under its **tag**: its territories, events,
nominations, dashboard, pictures, race and Stats history, even which Discord role it is. When an
alliance changes its tag in the game (HMDA became "Arch", 2026-11-20), all of that is stranded
under the old tag, and renaming on the site would mean moving every piece by hand.

Goals:

1. **A rename is just a new label.** History, territories, roles and pictures stay attached.
2. **Room for other servers, and possibly other games, later.** Nothing assumes server 78 or
   Last Asylum in how the data is kept.
3. **No dependence on the Last Asylum Tracker.** The site keeps working fully without it; the
   tracker only adds live data and spots renames when it's there.

## The design

### A register of alliances, each with the site's own ID

One new Gist file, `alliance-register.json` (its own file: it can be saved together with
`map-state.json` and the others in one `updateGist` save, and stays apart from the territory map,
which another server or game might not have):

```json
{
  "version": 1,
  "alliances": {
    "al_k7m2q9xh4d": {
      "id": "al_k7m2q9xh4d",
      "game": "lastasylum",
      "server": "78",
      "tag": "Arch",
      "name": "PRIDE",
      "status": "active",
      "created": "2026-11-21T10:00:00Z",
      "tags": [
        { "tag": "HMDA", "from": null, "to": "2026-11-21T10:05:00Z" },
        { "tag": "Arch", "from": "2026-11-21T10:05:00Z", "to": null }
      ],
      "color": "#ff0000",
      "discord_var": "HMDA",
      "links": { "tracker": { "id": 61234, "checked": "2026-11-21T01:50:00Z" } }
    }
  }
}
```

- **`id`** is made by the site: `al_` and 10 random characters from Node's crypto random source,
  using lowercase letters and digits **without the easily confused ones** (`0 o 1 l i`). It
  never comes from the tag, the game, the server or the tracker, is never reused, and never
  changes. (Not putting the server in it matters: games merge servers.)
- **`tag` and `name`** are labels: what the site shows and what people type.
- **`tags`** is the alliance's tag history (for "formerly [HMDA]", and to read old records). It
  is never used to look data up.
- **`game` and `server`** say where the alliance lives. `server` is text (`"78"`), since other
  games name servers like `"S78"` or `"EU-12"`.
- **`color`** and the other runtime settings live here. `_data/alliances.yml` becomes only the
  seed the register starts from, not something the site reads while running (a Steward adding an
  alliance on the site can't edit a file in Git).
- **`discord_var`**: the Vercel setting holding its Discord role (`DISCORD_HMDA`). It moves with
  the alliance, so a rename never touches Vercel.
- **`links.tracker`** is optional: the tracker's number for it (its `union_id`), when known.
- **`status`**: `active` or `retired` (left the server, disbanded, removed by a Steward).
- **Never sent to browsers:** `discord_var` and `links` stay on the server; `/api/state` sends
  only what pages show (id, tag, name, colour, status, recent tag history).

Everything else (territories, events, nominations, dashboards, pictures, race, Stats) refers
to alliances by **`id`** once moved.

### How a tag becomes an ID

People keep typing tags everywhere (the planner, `/rank`, "Change to:", the calendar's
alliance picker). One function, `allianceByTag(tag, { game, server })`, turns a tag into the
alliance, with today's rules (`findTag`): exact tag first; accents aside next; another letter
case only if it can mean one alliance. RâvN and RÂVN stay two alliances. Ambiguous tags are
refused, as now. Only the **ID** is stored.

## Safeguards

1. **IDs are random, checked and never reused.** A new ID is checked against every ID in the
   register, retired ones included, before it's used. Retiring an alliance keeps its ID (and
   its history) for good.
2. **One alliance per tag, per server, at a time.** Among *active* alliances on a server, a tag
   (by the rules above) belongs to one alliance. Adding or renaming to a tag that's taken is
   refused, naming the alliance that has it. Two alliances **swapping** tags are handled by a
   two-way swap in the rename tool (both changed in one save), not one at a time.
3. **One alliance per tracker number.** Two alliances can't link to the same tracker number. A
   clash is flagged for the Stewards, never settled automatically.
4. **The tracker only confirms or flags.** It never creates, merges, renames or retires an
   alliance. When a measurement by tag comes back with a **different number** than the one
   linked (a swap, a disbanded alliance whose tag a new one took, or another alliance now using
   that tag), the site measures the linked number instead and tells the Stewards; it never
   overwrites the link. The flag offers three Steward actions:
   - **retire** the old alliance and **add** the newcomer under that tag;
   - **rename** the old alliance to the tag it uses now;
   - **relink** to a different tracker number (a wrong first link, or the tracker renumbering).

   A Steward link or rename also clears the tracker's "not found" memory for that tag at once.
   (This closes a gap in what was built on 2026-11-20, and comes first: step 0.)
5. **Renaming is a Steward action** with a confirm, written into the tag history. The site may
   *suggest* a rename (the "renamed in the game" notice) but never does it alone. The rename
   tool only goes live once every store reads by ID (step 7); until then it runs only on the test
   site.
6. **Small steps, one way of writing.** Each store moves in its own pull request. Once a store
   has moved, it is **written only by ID**; reading the old (by tag) form is kept only as a safety
   net for the minutes around the deploy, never as a second place to write (no "split brain").
   Each move first writes a backup copy of the files it changes (`backup-<file>-<date>.json`), and
   the Gist keeps every revision, so a move can be undone.
7. **Checks after each move.** A move counts what it changed and reports it to the Steward who
   ran it (for example "6 territories, 1 event, 0 nominations moved"); a store whose numbers
   don't add up isn't saved.
8. **Rehearsed on the test site.** See below.

## Rehearsing on the test site

The test site (dev.la-s78.app) already keeps its data apart from the live site: its own test
Gist (`TEST_GIST_ID`), its own `test/` folders in the Blob store (Stats, pictures, skins), and
reminders and proposals go only to the test channel. What it lacks is today's live data.

- **A by-hand "Copy live data to the test site" action** (GitHub Actions, run from the Actions
  tab) copies the live Gist's files into the test Gist, and the live Blob's `stats/` and
  `alliance-images/` index into `test/`. It never writes to the live data.
  - It copies private data (dashboards, nominations) into the test Gist, which is a secret Gist
    on the same account as the live one; the test site has the same sign-in rules as the live
    one, so nobody sees more there than on the live site.
  - Each rehearsal starts from a fresh copy, which replaces the previous one.
- **Every step runs on the test site first:** copy, run the move, check the pages (and the
  move's report), and only then run it on the live site.

## What stores alliances today, and when each moves

| Where | How alliances appear today | Step |
|---|---|---|
| Session passes, `/api/verify` | the signed-in member's alliance (a tag) | 1 |
| Browser storage, links | "My alliance", planner drafts, `?tag=` in dashboard links (and any other page's) | 1 (read both) |
| Discord bot | `/rank`, roles named after tags, any command choices listing tags | 1 |
| `_data/alliances.yml` | colours, `role_settings` (tag → Discord setting), starting Capitol rotation | 2 (becomes the seed only) |
| `map-state.json` | the alliance list (by tag: rank, `parent_tag`, `academies`, NAP, colour, `/registerbot` server, channels and roles), territory owners | 2 |
| `calendar-state.json` | alliance events and their reminders (`alliance`/`scope` tag; reminder records are per event ID, unaffected) | 3 |
| `rewards-data.json`, `rewards-nominations.json` | nominations by alliance, KW result, buyouts, Capitol rotation | 4 |
| `dashboard-<TAG>.json` | each alliance's dashboard, Caravan Rotor and roster refresh count (file named after the tag) | 5 |
| `alliance-images.json` + Blob `alliance-images/<TAG>-…` | alliance pictures and frames | 5 |
| `ascension.json` | Top 4 race, Might by tag | 6 |
| Blob `stats/…` | `summary.json`, `days/<date>.json`, `top.json`, `player-series.json`, `player-index.json` (each player's alliance tag), `positions.json`, `skins.json`, `alliance-ids.json` | 6 |
| `proposal-log.json` | past Steward proposals (history) | read as is: old entries keep their tags |
| `api/_tracker.js` | the server number (`TRACKER_SERVER = 78`) and the "not found" memory by tag | 0 (by alliance's server), link/rename clear it |

Each step starts by searching the code for its stores again, in case something new was added.

## The steps

Each is one pull request, rehearsed on the test site, and merged only with the owner's yes.

**Step 0: the register, "numbers must match", and the test-site copy.** The "Copy live data to
the test site" action. `alliance-register.json` built from today's alliances (a new ID each,
colours and Discord settings from `_data/alliances.yml` and the map, tracker numbers from
`stats/alliance-ids.json` where known), and the lookups (`allianceByTag`, `allianceById`).
Nothing reads the register yet, so pages don't change. Safeguard 4 in the measurements, with the
Steward actions. *Done when:* every alliance on the map has exactly one entry, and a test swap of
two tags is flagged rather than mis-measured.

**Step 1: sign-in, sessions, browser storage, links and the bot.** First, because every write
checks the signed-in member's alliance: new passes carry the alliance's ID (old passes, with a
tag, still work until they expire); "My alliance" and planner drafts are read either way; links
accept `?id=` as well as `?tag=`; the bot's commands turn tags into IDs. *Done when:* a member
signed in before the move keeps their access after it.

**Step 2: the alliance list and territories** (both in `map-state.json`, one move): alliance
records, `parent`/`academies` links and territory owners by ID; colours and Discord settings read
from the register; `_data/alliances.yml` becomes the seed only. *Done when:* the map, standings
and planner are identical before and after.

**Step 3: calendar.** **Step 4: rewards, nominations, buyouts and the Capitol rotation.**

**Step 5: dashboards and pictures.** Dashboards: one move renames every `dashboard-<TAG>.json`
to `dashboard-<ID>.json` in a single save (after the backup), not one by one as they're edited.
Pictures: the index (`alliance-images.json`) moves to IDs, but **existing picture files keep their
names** (no file renames, no broken caches); new uploads are named by ID.

**Step 6: race and Stats history.** Blob files by ID; the tag at the time stays in each day's
record, so old charts still read naturally.

**Step 7: the rename tool goes live,** and HMDA becomes Arch in one click. (Until now it ran only
on the test site.)

**Step 8: tidy-up.** Remove the "read the old form too" safety nets once old passes have expired,
and record the result in `DECISIONS.md`.

## Other servers and games, later

Not part of this plan, but kept possible by it: tags are unique per game and server, the
tracker link is one optional link among possible others (`links`), and nothing in the stored
data assumes server 78. Adding a server later would mean: register entries with
`"server": "N"`, a server picker where alliances are chosen, the tracker lookups taking the
alliance's server, and game art kept under a per-game folder (`/game-art/<game>/…`).

## Questions for the owner (with the maintainer's recommendations)

1. **Retired alliances:** recommended: a collapsed "Retired" section on the Steward page, with
   their history and a way to undo a mistake; hidden from public lists and pickers.
2. **Tag history shown publicly:** recommended: "[Arch], formerly [HMDA]" publicly for 30 days
   after a rename, then only on Steward pages.
3. **Who may rename:** recommended: Stewards only; an R5 could later *request* a rename through
   the Steward review queue.

## What this plan doesn't do

- It doesn't merge alliances, or split one alliance's history between two.
- It doesn't create alliances from the tracker: Stewards add alliances, as today.
- It doesn't change any page's look; it changes what the data hangs on.
