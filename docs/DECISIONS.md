# Decisions Log

The "why" behind this project, written down so it survives beyond any one chat
history. Read this before changing a feature; update it when a decision changes.

**Roles**
- **Owner (Josh):** final say on product and behaviour questions.
- **Maintainer (Gemini):** keeps this file accurate; reviews PRs for fit with intent.
- **Implementer (Claude):** writes code; must not contradict an entry here without
  flagging it in the PR description.

**How to write an entry:** keep it short. One entry per feature or cross-cutting
choice. Fill the four fields; delete any `TODO` you answer. If something is
deliberately odd, say so under *Must not change*, or someone will "fix" it.

```markdown
## <Feature name>
- **Purpose:** what problem it solves and for whom.
- **Constraints:** limits it must respect (cost, Discord/GitHub limits, players' devices...).
- **Must not change:** behaviours or quirks that are intentional.
- **Open questions:** anything undecided.
```

---

## Hosting & deployment (GitHub Actions → Vercel, GitHub Pages redirect)
- **Purpose:** TODO
- **Constraints:** TODO
- **Must not change:** TODO
- **Open questions:**
  - Is the Vercel project connected to this Git repo? If so, should `vercel.json`
    disable Git deployments so only the Actions deploy runs?
  - Does the `dev` preview deployment share the production Gist and Discord bot?

## Multilingual content pipeline (`_source/` masters, Gemini translation)
- **Purpose:** TODO
- **Constraints:** TODO (e.g. Gemini rate limits; one draft per run)
- **Must not change:** TODO
- **Open questions:**
  - After the first translation, how should English edits reach the other
    7 languages (manual edits, re-draft, per-block re-translation)?

## Site shell (Turbo navigation, PWA / service worker, themes)
- **Purpose:** TODO
- **Constraints:** TODO
- **Must not change:** TODO
- **Open questions:**
  - Should the offline precache cover only the visitor's language?

## Authentication & roles (Discord OAuth, R4/R5/member, Stewards)
- **Purpose:** TODO
- **Constraints:** TODO
- **Must not change:** TODO
- **Open questions:**
  - Is `.content-locked` content meant to be secret, or only decluttering?
    (It is currently hidden client-side only.)

## Discord bot & proposal/approval flow (`api/interactions.js`, `api/proposal.js`, `api/accept-proposal.js`)
- **Purpose:** TODO
- **Constraints:** TODO
- **Must not change:** TODO
- **Open questions:**
  - Should submitting a proposal require a signed token (like `/nominate`)?

## Data storage (GitHub Gist as database)
- **Purpose:** TODO
- **Constraints:** TODO
- **Must not change:** TODO
- **Open questions:** TODO

## Rewards, nominations & KvK cycle
- **Purpose:** TODO
- **Constraints:** TODO
- **Must not change:** TODO
- **Open questions:** TODO

## Territory map & alliance standings
- **Purpose:** TODO
- **Constraints:** TODO
- **Must not change:** TODO
- **Open questions:** TODO

## Calendar & event management
- **Purpose:** TODO
- **Constraints:** TODO
- **Must not change:** TODO
- **Open questions:** TODO

## Test pages (`test/`)
- **Purpose:** TODO
- **Constraints:** TODO
- **Must not change:** TODO
- **Open questions:**
  - Should these be publicly published? (`mermaid.min.js`, 3.3 MB, exists only for them.)

## Conventions
- **Game Time is UTC-2.** All schedule/calendar code and bot strings use this.
- **Pull requests** must pass the "Checking build output" CI step before merge.
- TODO: add more as they come up.
