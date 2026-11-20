# Plan: alliances by permanent ID, not by tag

Status: **proposed** (owner request, 2026-11-20). Nothing in here is built yet; each step below
becomes its own pull request once this plan is agreed.

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

One new Gist file, `alliance-register.json`:

```json
{
  "version": 1,
  "alliances": {
    "al_k7m2q9xh4d": {
      "id": "al_k7m2q9xh4d",
      "game": "lastasylum",
      "server": 78,
      "tag": "Arch",
      "name": "PRIDE",
      "status": "active",
      "created": "2026-11-21T10:00:00Z",
      "tags": [
        { "tag": "HMDA", "from": null, "to": "2026-11-21T10:05:00Z" },
        { "tag": "Arch", "from": "2026-11-21T10:05:00Z", "to": null }
      ],
      "discord_var": "HMDA",
      "links": { "tracker": { "id": 61234, "checked": "2026-11-21T01:50:00Z" } }
    }
  }
}
```

- **`id`** is made by the site: `al_` and 10 random letters and digits (from the server's
  random-number source). It never comes from the tag or from the tracker, is never reused, and
  never changes.
- **`tag` and `name`** are labels: what the site shows and what people type.
- **`tags`** is the alliance's tag history (for messages like "formerly [HMDA]", and to
  understand old records). It is never used to look data up.
- **`game` and `server`** say where the alliance lives: the opening for other servers or games.
- **`discord_var`**: the Vercel setting holding its Discord role (`DISCORD_HMDA`). It moves with
  the alliance, so a rename never touches Vercel.
- **`links.tracker`** is optional: the tracker's number for it (its `union_id`), when known.
- **`status`**: `active` or `retired` (left the server, disbanded, removed by a Steward).

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
   refused, naming the alliance that has it.
3. **One alliance per tracker number.** Two alliances can't link to the same tracker number. A
   clash is flagged for the Stewards, never settled automatically.
4. **The tracker only confirms or flags.** It never creates, merges, renames or retires an
   alliance. When a measurement by tag comes back with a **different number** than the one
   linked (a swap, or another alliance now uses that tag), the site measures the linked number
   instead and tells the Stewards; it never overwrites the link. (This closes a gap in what was
   built on 2026-11-20, and comes first: step 0.)
5. **Renaming is a Steward action** with a confirm, and is written into the tag history. The
   site may *suggest* a rename (the "renamed in the game" notice) but never does it alone.
6. **Small, reversible steps.** Each store moves in its own pull request. While a store is being
   moved, its code reads both the old (by tag) and the new (by ID) form, so nothing breaks
   half-way. The Gist keeps every revision, so a move can be undone; each move also writes a
   one-off backup copy of the file it changes (`backup-<file>-<date>.json`) before changing it.
7. **Checks after each move.** A move counts what it changed and reports it to the Steward who
   ran it (for example "6 territories, 1 event, 0 nominations moved"); a store whose numbers
   don't add up isn't saved.

## What stores alliances today, and when each moves

| Where | How alliances appear today | Step |
|---|---|---|
| `_data/alliances.yml` | colours, `role_settings` (tag → Discord setting), starting Capitol rotation | 1 |
| `map-state.json` | the alliance list (by tag: rank, academies, parent, NAP, colour, `/registerbot` server and channels), territory owners | 1, 2 |
| Session passes, `/api/verify` | the signed-in member's alliance (a tag) | 3 |
| `calendar-state.json` | alliance events and their reminders (`alliance` tag) | 4 |
| `rewards-data.json`, `rewards-nominations.json` | nominations by alliance, KW result, buyouts, Capitol rotation | 5 |
| `dashboard-<TAG>.json` | each alliance's dashboard (file named after the tag) | 6 |
| `alliance-images.json` + Blob `alliance-images/<TAG>-…` | alliance pictures and frames | 6 |
| `ascension.json` | Top 4 race, Might by tag | 7 |
| Blob `stats/…` | growth history, Top players, positions, skins, tracker numbers (`alliance-ids.json`) | 7 |
| `proposal-log.json` | past Steward proposals (history) | read as is: old entries keep their tags |
| Browser storage, links | "My alliance", planner drafts, `?tag=` in dashboard links | 3 (read both) |
| Discord bot | `/rank`, `/registerbot`, roles named after tags | 3 |

## The steps

Each is one pull request, tested on copies of the real data first, and merged only with the
owner's yes.

**Step 0: the register, and "numbers must match".** Creates `alliance-register.json` from
today's alliances (a new ID each, tracker numbers from `stats/alliance-ids.json` where known),
and the lookups (`allianceByTag`, `allianceById`). Nothing reads it yet, so pages don't change.
Adds safeguard 4 to the measurements. *Done when:* every alliance on the map has exactly one
entry, and a test swap of two tags is flagged rather than mis-measured.

**Step 1: the alliance list and configuration.** The planner, standings, colours and Discord
role settings read from the register; `_data/alliances.yml` keys become IDs (`discord_var`
moves into the register). **The Steward rename tool** arrives here: renaming changes the label
and records it. Arch can then be renamed in one click. *Done when:* renaming a test alliance
changes its name everywhere the alliance list is shown.

**Step 2: territories.** Territory owners are stored by ID; the map, planner and proposals
read IDs. *Done when:* the map is identical before and after the move.

**Step 3: sign-in, sessions and the bot.** Passes carry the alliance's ID (old passes, with a
tag, still work until they expire); "My alliance" and planner drafts in the browser are read
either way; the bot's commands turn tags into IDs. *Done when:* a member signed in before the
move keeps their access after it.

**Step 4: calendar.** Events and reminders by ID. **Step 5: rewards and nominations.**
**Step 6: dashboards and pictures** (files renamed to IDs, old names read until moved).
**Step 7: race and Stats history** (Blob files by ID; the tag at the time stays in each day's
record, so old charts still read naturally).

**Step 8: tidy-up.** Remove the "read the old form too" code once every store is moved, and
record the result in `DECISIONS.md`.

## Other servers and games, later

Not part of this plan, but kept possible by it: tags are unique per game and server, the
tracker link is one optional link among possible others (`links`), and nothing in the stored
data assumes server 78. Adding a server later would mean: register entries with
`"server": N`, a server picker where alliances are chosen, and the tracker lookups taking the
alliance's server instead of 78.

## Questions for the owner

1. **Retired alliances:** keep them listed for Stewards (with history), or hide them entirely?
2. **Tag history shown publicly** ("[Arch], formerly [HMDA]") for a while after a rename, or
   only on the Steward pages?
3. **Who may rename:** Stewards only (as planned), or also an alliance's own R5?

## What this plan doesn't do

- It doesn't merge alliances, or split one alliance's history between two.
- It doesn't create alliances from the tracker: Stewards add alliances, as today.
- It doesn't change any page's look; it changes what the data hangs on.
