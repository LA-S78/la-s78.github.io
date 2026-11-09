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

const click = (selector) => async (page) => {
  await page.evaluate((s) => document.querySelector(s)?.click(), selector);
};

export const STATES = [
  { name: 'default' },
  { name: 'leader', storage: LEADER },
  {
    name: 'lang-menu',
    needs: '.lang-dropdown',
    run: async (page) => page.hover('.lang-trigger').catch(() => {}),
  },
  { name: 'map-alliance', needs: '#btn-mode-alliance', storage: LEADER, run: click('#btn-mode-alliance') },
  { name: 'map-resource', needs: '#btn-mode-resource', storage: LEADER, run: click('#btn-mode-resource') },
  {
    name: 'map-buffs',
    needs: '#btn-toggle-buffs',
    storage: LEADER,
    run: async (page) => {
      await click('#btn-mode-resource')(page);
      await click('#btn-toggle-buffs')(page);
    },
  },
  { name: 'map-planner', needs: '#btn-toggle-draft', storage: LEADER, run: click('#btn-toggle-draft') },
  { name: 'map-fullscreen', needs: '#btn-toggle-fullscreen', storage: LEADER, run: click('#btn-toggle-fullscreen') },
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
  { name: 'event-form', needs: '#btn-toggle-event-form', storage: LEADER, run: click('#btn-toggle-event-form') },
  {
    name: 'proposal-modal',
    needs: '#map-container, .alliance-wrapper',
    storage: LEADER,
    run: async (page) =>
      page.evaluate(async () => {
        const m = await import('/js/auth-modal.js');
        m.submitProposalWithAuth({
          type: 'map',
          title: 'Visual Test Proposal',
          payload: {},
          diffSummaryHtml: '<p>3 territories change owner</p>',
        });
      }),
  },
  // One state per <dialog> on the page (image zoom dialogs etc.), added automatically.
  {
    name: 'dialog',
    perDialog: true,
    run: async (page, dialogId) =>
      page.evaluate((id) => document.getElementById(id)?.showModal(), dialogId),
  },
];
