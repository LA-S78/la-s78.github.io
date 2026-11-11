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
  // Needs a login pass, or the pop-up asks to log in instead of sending.
  {
    name: 'proposal-modal-error',
    needs: '#map-container, .alliance-wrapper',
    storage: SIGNED_IN,
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
  // Alliance Dashboard (portal/dashboard.html). Its normal view (no login) asks to sign in.
  { name: 'dashboard-leader', needs: '#dashboard-app', storage: SIGNED_IN },
  // All five chart types (js/dashboard-widgets.js), as a leader sees them.
  {
    name: 'dashboard-widgets',
    needs: '#dashboard-app',
    storage: SIGNED_IN,
    api: (fixture, data) => {
      if (fixture !== 'dashboard') return;
      const table = (columns, rows) => ({ columns, rows });
      const widget = (type, title, d, options = {}, visibility = 'members') => ({
        id: `w_${type}`,
        type,
        title,
        note: '',
        visibility,
        data: d,
        options: { labelCol: 0, valueCols: [1], ...options },
        updatedAt: '2026-11-09T12:00:00.000Z',
      });
      const players = table(
        ['Player', 'Score', 'Last week'],
        [
          ['Aria', '15.2M', '14M'],
          ['Bram', '12.9M', '13.5M'],
          ['Cato', '9.8M', '9M'],
        ],
      );
      data.dashboard.widgets = [
        widget('bar', 'Duel scores', players, { valueCols: [1, 2] }, 'r4_only'),
        widget('bar', 'Duel scores (vertical)', players, { vertical: true }),
        widget(
          'line',
          'Might',
          table(
            ['Week', 'WLO', 'MIA'],
            [
              ['W1', '1.2B', '1.05B'],
              ['W2', '1.26B', '1.08B'],
              ['W3', '1.31B', '1.15B'],
            ],
          ),
          { valueCols: [1, 2] },
        ),
        widget(
          'pie',
          'Troops',
          table(
            ['Tier', 'Troops'],
            [
              ['T10', '420K'],
              ['T9', '610K'],
              ['T8', '380K'],
            ],
          ),
        ),
        widget(
          'progress',
          'Donations',
          table(
            ['Player', 'Given'],
            [
              ['Aria', '52K'],
              ['Bram', '31K'],
            ],
          ),
          { target: 50000 },
        ),
        widget(
          'table',
          'Roster',
          table(
            ['Player', 'Power'],
            [
              ['Aria', '312M'],
              ['Bram', '298M'],
            ],
          ),
          { highlightCol: 1, highlightMin: 300000000 },
        ),
      ];
    },
  },
  // Stacked bar to 100% with scale colours (Duel score bands), as on a phone it turns sideways.
  {
    name: 'dashboard-stacked',
    needs: '#dashboard-app',
    storage: SIGNED_IN,
    api: (fixture, data) => {
      if (fixture !== 'dashboard') return;
      data.dashboard.widgets = [
        {
          id: 'w_bands',
          type: 'bar',
          title: 'Alliance Duel bands',
          note: '',
          visibility: 'members',
          data: {
            columns: ['User', '3.6m-', '3.6m+', '7.2m+'],
            rows: [
              ['Aria', '18.75%', '68.75%', '12.50%'],
              ['Bram', '6.25%', '37.50%', '56.25%'],
              ['Cato', '100%', '0', '0'],
              ['Dax', '0', '33.33%', '66.67%'],
            ],
          },
          options: {
            labelCol: 0,
            valueCols: [1, 2, 3],
            stacked: 'percent',
            vertical: true,
            scale: true,
          },
          updatedAt: '2026-11-09T12:00:00.000Z',
        },
        {
          id: 'w_totals',
          type: 'bar',
          title: 'Duel weeks (totals)',
          note: '',
          visibility: 'members',
          data: {
            columns: ['User', 'Low', 'Mid', 'High'],
            rows: [
              ['Aria', '2/16', '11/16', '2/16'],
              ['Bram', '1/16', '6/16', '9/16'],
            ],
          },
          options: { labelCol: 0, valueCols: [1, 2, 3], stacked: 'sum' },
          updatedAt: '2026-11-09T12:00:00.000Z',
        },
      ];
    },
  },
  // Caravan Rotor (leader view): available players with Game Time windows, one picked.
  {
    name: 'dashboard-caravan',
    needs: '#dashboard-app',
    storage: SIGNED_IN,
    api: (fixture, data) => {
      if (fixture !== 'dashboard') return;
      data.dashboard.caravan = {
        membersCanView: true,
        weekStartedAt: '2026-11-09T00:00:00.000Z',
        roster: [
          { id: 'p_aria', name: 'Aria', from: '18:00', to: '22:00', picked: null },
          { id: 'p_bram', name: 'Bram', from: '06:00', to: '', picked: null },
          { id: 'p_cato', name: 'Cato', from: '', to: '', picked: null },
          {
            id: 'p_dax',
            name: 'Dax',
            from: '20:00',
            to: '23:00',
            picked: { at: '2026-11-10T10:00:00.000Z', by: 'Visual Test' },
          },
        ],
      };
    },
  },
  {
    name: 'dashboard-member',
    needs: '#dashboard-app',
    storage: SIGNED_IN,
    api: (fixture, data) => {
      if (fixture !== 'dashboard') return;
      data.viewer = { ...data.viewer, tier: 'member', canNominate: false };
      delete data.rewards;
    },
  },
  {
    name: 'dashboard-steward',
    needs: '#dashboard-app',
    storage: { ...SIGNED_IN, 'auth-steward': 'true' },
    api: (fixture, data) => {
      if (fixture !== 'dashboard') return;
      data.viewer = { ...data.viewer, tier: 'steward' };
      data.alliances = [
        { tag: 'WLO', rank: 1 },
        { tag: 'MIA', rank: 2 },
      ];
      data.rewards.nomination = { submitted: false };
    },
  },
  // One state per <dialog> on the page (image zoom dialogs etc.), added automatically.
  {
    name: 'dialog',
    perDialog: true,
    run: async (page, dialogId) =>
      page.evaluate((id) => document.getElementById(id)?.showModal(), dialogId),
  },
];
