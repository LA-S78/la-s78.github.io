// The page states the visual diff checks, besides each page's normal view.
// A state runs on every page where its `needs` selector exists, so new pages are
// covered automatically. Add a state here when a feature has a view that only
// appears after a click (a planner, a mode toggle, a modal...).

/** Logged-in leader: unlocks role-gated content and planner buttons. */
export const LEADER = {
  'auth-role': 'R5',
  'auth-username': 'Visual Test',
  'auth-alliance': 'WLO',
  'auth-avatar': '/images/favicon.png',
};

/** Logged-in R5 with a login pass that has 30 days left at run.mjs's fixed clock (FIXED_TIME). */
const loginPass = (payload) =>
  Buffer.from(JSON.stringify({ kind: 'session', ...payload })).toString('base64url') + '.sig';
export const SIGNED_IN = {
  ...LEADER,
  'auth-session': loginPass({
    uid: '1',
    name: 'Visual Test',
    role: 'R5',
    exp: Date.parse('2026-12-10T12:00:00Z'),
  }),
  'auth-steward': 'false',
};

const click = (selector) => async (page) => {
  await page.evaluate((s) => document.querySelector(s)?.click(), selector);
};

/** Opens the proposal pop-up the way the planners do. */
const openProposal = async (page) =>
  page.evaluate(async () => {
    const m = await import('/js/auth-modal.js');
    m.submitProposalWithAuth({
      type: 'map',
      title: 'Visual Test Proposal',
      payload: {},
      diffSummaryHtml: '<p>3 territories change owner</p>',
    });
  });

/** Changes the reward cycle in the sample data (used by `api` below). */
const cycle = (change) => (fixture, data) => {
  const rewards = data.rewards || (fixture === 'state-rewards' ? data : null);
  if (rewards?.cycle_state) change(rewards.cycle_state);
};

/** Fills in the Capitol Defense console so its preview box appears. */
const defensePreview = (week) => async (page) => {
  await page.selectOption('#ops-input-target-week', String(week));
  await page.fill('#ops-input-threat', 'Server 112');
  // Leave the box, so the blinking text cursor isn't in the screenshot.
  await page.evaluate(() => document.activeElement?.blur());
};

export const STATES = [
  { name: 'default' },
  { name: 'leader', storage: LEADER },
  // The account card under the header's sign-in pill (one page is enough: same header everywhere)
  {
    name: 'account-card',
    needs: '.alliance-wrapper',
    storage: SIGNED_IN,
    run: click('#identity-pill .id-pill'),
  },
  {
    name: 'lang-menu',
    needs: '.lang-dropdown',
    run: async (page) => page.hover('.lang-trigger').catch(() => {}),
  },
  {
    name: 'map-alliance',
    needs: '#btn-mode-alliance',
    storage: LEADER,
    run: click('#btn-mode-alliance'),
  },
  {
    name: 'map-resource',
    needs: '#btn-mode-resource',
    storage: LEADER,
    run: click('#btn-mode-resource'),
  },
  {
    name: 'map-buffs',
    needs: '#btn-toggle-buffs',
    storage: LEADER,
    run: async (page) => {
      await click('#btn-mode-resource')(page);
      await click('#btn-toggle-buffs')(page);
    },
  },
  {
    name: 'map-planner',
    needs: '#btn-toggle-draft',
    storage: LEADER,
    run: click('#btn-toggle-draft'),
  },
  {
    name: 'map-fullscreen',
    needs: '#btn-toggle-fullscreen',
    storage: LEADER,
    run: click('#btn-toggle-fullscreen'),
  },
  {
    name: 'alliance-planner',
    needs: '#btn-toggle-alliance-planner',
    storage: LEADER,
    run: click('#btn-toggle-alliance-planner'),
  },
  {
    name: 'rewards-planner',
    needs: '#btn-toggle-rewards-planner',
    storage: LEADER,
    run: click('#btn-toggle-rewards-planner'),
  },
  {
    name: 'event-form',
    needs: '#btn-toggle-event-form',
    storage: LEADER,
    run: click('#btn-toggle-event-form'),
  },
  {
    name: 'proposal-modal',
    needs: '#map-container, .alliance-wrapper',
    storage: LEADER,
    run: openProposal,
  },
  // Not logged in: the pop-up asks the visitor to log in via Discord.
  {
    name: 'proposal-modal-guest',
    needs: '#map-container, .alliance-wrapper',
    run: openProposal,
  },
  // Sending fails (the test API has no /api/proposal): the pop-up shows its error box.
  {
    name: 'proposal-modal-error',
    needs: '#map-container, .alliance-wrapper',
    storage: LEADER,
    run: async (page) => {
      await openProposal(page);
      await click('#auth-modal-action-btn')(page);
      await page.waitForSelector('#auth-modal-error:not(.hidden)', { timeout: 5000 });
    },
  },
  // Calendar hero card with no Capitol holder alliance: the tag falls back to the theme colour.
  {
    name: 'hero-no-holder-colour',
    needs: '.cal-hero-card',
    api: (fixture, data) => {
      if (fixture === 'calendar') data.capitolHolderColor = null;
    },
  },
  // Capitol Defense console previews. The normal view already shows the Step 2 buyout box
  // (the sample data has one override used), so these add the other two boxes.
  {
    name: 'defense-swap',
    needs: '#ops-preview-box',
    storage: LEADER,
    api: cycle((c) => (c.override_count = 0)),
    run: defensePreview(1),
  },
  {
    name: 'defense-already-scheduled',
    needs: '#ops-preview-box',
    storage: LEADER,
    api: cycle(
      (c) => (c.active_schedule = { ...c.active_schedule, week_1: 'WLO', week_3: 'BOTS' }),
    ),
    run: defensePreview(1),
  },
  // One state per <dialog> on the page (image zoom dialogs etc.), added automatically.
  {
    name: 'dialog',
    perDialog: true,
    run: async (page, dialogId) =>
      page.evaluate((id) => document.getElementById(id)?.showModal(), dialogId),
  },
];
