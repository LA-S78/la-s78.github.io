/**
 * js/calendar.js - Kingdom War & Alliance Event Timeline Controller
 * Manages operations, presets, time-conversion, and scoped perspectives.
 */

// The calendar is a regular page, so it can be reached by a full page load or by Turbo
// (footer navigation, back button). initCalendar runs on both, once per visit: each visit
// brings fresh page elements, and the ones already set up are remembered here. (Not a
// data- attribute: Turbo's back-button copy of the page would keep it.)
window.__calendarStarted = window.__calendarStarted || new WeakSet();

/**
 * The same alliance: the same letters, accents aside (RÂVN = RAVN), letter case kept (RâvN
 * and RÂVN are two alliances; owner, 2026-11-17). As js/tags.js, for this classic script.
 */
function sameAllianceTag(a, b) {
  const letters = (t) =>
    String(t || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  return Boolean(letters(a)) && letters(a) === letters(b);
}
async function initCalendar() {
  const elContent = document.getElementById('calendar-content');
  if (!elContent || window.__calendarStarted.has(elContent)) return;
  window.__calendarStarted.add(elContent);

  // Escape data before putting it into HTML (see js/escape-html.js).
  const esc = (value) => window.escapeHtml(value);
  /** An interface icon (js/ui-icons.js) for the start of a label. */
  const ic = (name, tone) => (window.uiIcon ? window.uiIcon(name, tone) : '');
  // The page's language (calendar.* in _data/<lang>/tools.yml, js/i18n.js).
  const t = window.t;
  // A week's name from its number, as the server's weekLabel() does (0 = Off-Week).
  const weekName = (n) => (Number(n) === 0 ? t('common.off_week') : t('common.kw_week', { n }));
  // "Rank #2" from the server (no alliance scheduled yet) in the page's language.
  const holderName = (s) => {
    const m = /^Rank #(\d+)$/.exec(String(s || ''));
    return m ? t('calendar.rank', { rank: m[1] }) : s;
  };
  // The site's own milestones (api/calendar.js sends a key and its values): in the page's language.
  const MILESTONES = {
    capture: (v) => {
      // A week of another cycle: its seat is decided at that cycle's reset
      if (!v.who) return [t('calendar.ev_capture_title_open'), t('calendar.ev_capture_desc_open')];
      const who = holderName(v.who);
      const rank = v.rank
        ? t(v.override ? 'calendar.rank_override_schedule' : 'calendar.rank', { rank: v.rank })
        : '';
      return [
        t('calendar.ev_capture_title', { who }),
        t('calendar.ev_capture_desc', { who, rank }),
      ];
    },
    kw_battle: () => [t('calendar.ev_kw_title'), t('calendar.ev_kw_desc')],
    rewards_open: (v) => [
      t('calendar.ev_open_title', { week: weekName(v.week) }),
      t(v.kw ? 'calendar.ev_open_desc_kw' : 'calendar.ev_open_desc'),
    ],
    rewards_close: (v) => [
      t('calendar.ev_close_title', { week: weekName(v.week) }),
      t('calendar.ev_close_desc'),
    ],
  };

  const elLoading = document.getElementById('loading-state');
  const elError = document.getElementById('error-state');
  const elNotification = document.getElementById('action-notification');

  // 1. Parse URL Parameters & Session Context
  const urlParams = new URLSearchParams(window.location.search);
  const allianceParam = urlParams.get('alliance')?.trim() || null;
  const tokenParam = urlParams.get('token');
  const isDevPreview = urlParams.get('preview') === 'true';

  let tokenPayload = null;
  if (tokenParam) {
    try {
      const [dataStr] = tokenParam.split('.');
      const binary = atob(dataStr.replace(/-/g, '+').replace(/_/g, '/'));
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const jsonStr = new TextDecoder('utf-8').decode(bytes);
      tokenPayload = JSON.parse(jsonStr);
    } catch (e) {
      console.warn('Invalid token structure:', e);
    }
  }

  // Two ways to manage events: a link from /calendar in Discord (?token=…), or being signed in
  // on the site with Discord as an R4/R5 (your alliance's events) or a Steward (also
  // server-wide events; owner decision, 2026-11-13). The server checks either again
  // (api/manage-event.js); these only decide what the page shows.
  const viaLink = Boolean(tokenPayload && (!tokenPayload.exp || Date.now() < tokenPayload.exp));
  const loginPass = localStorage.getItem('auth-session');
  const signedInAlliance = (localStorage.getItem('auth-alliance') || '').trim();
  const signedInSteward = localStorage.getItem('auth-steward') === 'true';
  const signedInLeader = ['R4', 'R5'].includes(localStorage.getItem('auth-role'));
  const viaSignIn =
    !viaLink && Boolean(loginPass) && ((signedInLeader && signedInAlliance) || signedInSteward);
  // A Steward chooses between server events and their alliance's (kept for this tab)
  const SCOPE_KEY = 'cal-manage-scope';
  let signInScope = null;
  if (viaSignIn) {
    const chosen = sessionStorage.getItem(SCOPE_KEY);
    signInScope =
      signedInSteward && (chosen === 'global' || !signedInAlliance) ? 'global' : signedInAlliance;
  }
  const isManagementSession = viaLink || viaSignIn || isDevPreview;
  const sessionScope = viaLink
    ? tokenPayload.scope
    : viaSignIn
      ? signInScope
      : isDevPreview
        ? 'WLO'
        : null;
  const isGlobalAdmin = sessionScope?.toLowerCase() === 'global';

  /** Sends a change to api/manage-event.js with whichever proof this page has. */
  function manageEvents(body) {
    const headers = { 'Content-Type': 'application/json' };
    if (viaLink) body = { token: tokenParam, ...body };
    else {
      headers.Authorization = `Bearer ${loginPass || ''}`;
      body = { scope: sessionScope, ...body };
    }
    return fetch('/api/manage-event', { method: 'POST', headers, body: JSON.stringify(body) });
  }

  const activeAlliance =
    !isGlobalAdmin && sessionScope ? sessionScope.trim() : allianceParam || null;

  let allEvents = [];
  // Whether reminders have somewhere to go: { alliance, server } (api/calendar.js)
  let reminderChannels = null;
  // Set in management mode (step 6): opens the event form to edit an event
  let openEditForm = null;
  // Set in management mode too: opens the empty event form ("Add an event"), closes it
  let openAddForm = null;
  let closeEventForm = null;

  // The hints under the reminder choice: where it goes, or that it has nowhere
  // to go yet (an alliance that hasn't run /registerbot; the NAP channel not set up)
  function updateReminderHint() {
    const hint = document.getElementById('evt-reminder-hint');
    if (!hint) return;
    // Where the reminder goes: only said when there is one
    const off = document.getElementById('evt-input-notify')?.value === 'off';
    hint.hidden = off;
    // When it's posted: nothing to choose without a reminder
    const when = document.getElementById('evt-input-remind-time');
    if (when) {
      when.disabled = off;
      document.getElementById('evt-remind-time-hint').hidden = off;
    }
    if (!reminderChannels) return;
    const missing = isGlobalAdmin ? !reminderChannels.server : reminderChannels.alliance === false;
    hint.textContent = t(
      missing
        ? isGlobalAdmin
          ? 'calendar_events.reminder_no_server_channel'
          : 'calendar_events.reminder_no_channel'
        : isGlobalAdmin
          ? 'calendar_events.reminder_hint_server'
          : 'calendar_events.reminder_hint',
    );
    hint.classList.toggle('is-warning', missing);
  }

  // 2. Fetch Live Calendar Data. While the fresh answer loads, this device's last copy is
  // shown straight away, dimmed with "⏳ Updating…", as the other tools do
  // (js/live-data-notice.js); without a connection that copy stays, with a note saying how
  // old it is. After a change the leader made (useSaved: false), only the fresh answer.
  let liveData = null; // js/live-data-notice.js, loaded once
  const apply = (data) => {
    allEvents = data.events || [];
    reminderChannels = data.reminderChannels || null;
    updateReminderHint();
    renderHero(data.status, data.capitolHolder, data.capitolHolderColor, data.capitolHolderImage);
    renderEvents(data.status);
  };
  async function loadCalendar({ useSaved = true } = {}) {
    const query = activeAlliance ? `?alliance=${encodeURIComponent(activeAlliance)}` : '';
    const url = `/api/calendar${query}`;
    liveData ||= await import('/js/live-data-notice.js').catch(() => null);
    let savedAt = null;
    try {
      const fresh = fetch(url);
      if (useSaved && liveData)
        savedAt = await liveData.showSavedWhileLoading(url, fresh, elContent, async (saved) =>
          apply(await saved.json()),
        );
      const res = await fresh;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const offlineAt = liveData?.offlineCopySavedAt(res) || null;
      // Kept for next time, unless this is already the offline copy (sw.js)
      if (!offlineAt) liveData?.rememberLiveData(url, data);
      apply(data);
      liveData?.markUpdating(elContent, false);
      liveData?.showLiveDataNotice(elContent, { savedAt: offlineAt });
    } catch (err) {
      liveData?.markUpdating(elContent, false);
      if (savedAt) {
        // The saved copy stays: say how old it is instead of "failed"
        liveData.showLiveDataNotice(elContent, { savedAt });
        return;
      }
      if (elLoading) elLoading.style.display = 'none';
      if (elError) {
        elError.style.display = 'block';
        elError.textContent = t('calendar.load_failed', { error: err.message });
      }
    }
  }

  // 3. Render Hero & Reset Clock
  function renderHero(status, capitolHolder, capitolHolderColor, capitolHolderImage) {
    if (elLoading) elLoading.style.display = 'none';
    if (elContent) elContent.style.display = 'block';

    // The reward period (api/_reward_period.js): Friday ~20:00 GT to Wednesday 00:00 GT,
    // named after the week it belongs to (on Monday/Tuesday, the week before).
    const rewards = status.rewards || null;
    const heroBadge = document.getElementById('hero-phase-badge');
    if (heroBadge && rewards) {
      // The title names the week; the badge beside it shows the rewards (hidden until known).
      const badge = !rewards.open
        ? ['calendar.badge_closed', 'badge-off']
        : rewards.result === 'won'
          ? ['calendar.badge_kob_open', 'badge-kw']
          : rewards.result === 'pending'
            ? ['calendar.badge_awaiting', 'badge-kw']
            : ['calendar.badge_open', 'badge-off'];
      const badgeIcon = {
        'calendar.badge_closed': 'lock',
        'calendar.badge_kob_open': 'swords',
        'calendar.badge_awaiting': 'hourglass',
        'calendar.badge_open': 'gift',
      }[badge[0]];
      heroBadge.innerHTML = ic(badgeIcon) + esc(t(badge[0]));
      heroBadge.className = `cal-badge ${badge[1]}`;
      heroBadge.hidden = false;
    }

    const titleEl = document.getElementById('hero-phase-title');
    const subEl = document.getElementById('hero-phase-subtitle');
    const capHolderEl = document.getElementById('hero-capitol-holder');
    const capRankEl = document.getElementById('hero-capitol-rank');
    const cycleProgressEl = document.getElementById('metric-cycle-progress');

    // "Week 1" (short, to keep the title on one line on phones) or "Off-Week"; not the
    // configured phase name, so the site always says "Off-Week".
    if (titleEl)
      titleEl.textContent =
        Number(status.clockWeek) === 0
          ? t('common.off_week')
          : t('calendar.week_n', { n: status.clockWeek });
    // No reward period in the answer: no line, rather than "Loading…" left showing
    if (subEl) subEl.hidden = !rewards;
    if (subEl && rewards) {
      const set2 = t(
        !rewards.kwWeek
          ? 'calendar.set2_off_week'
          : rewards.result === 'won'
            ? 'calendar.set2_won'
            : rewards.result === 'lost'
              ? 'calendar.set2_lost'
              : 'calendar.set2_pending',
      );
      subEl.textContent = rewards.open
        ? t('calendar.rewards_open_until', { week: weekName(rewards.week), set2 })
        : t('calendar.rewards_closed');
    }

    // The holder's banner in the Capitol holder box (js/ally-pics.js, a module: loaded on
    // demand from this classic script), faded in once loaded
    const capCard = document.querySelector('.cal-capitol-card');
    if (capCard && (capitolHolderImage || capCard.classList.contains('has-ally-pic'))) {
      import('/js/ally-pics.js')
        .then(({ showAllyPic }) => showAllyPic(capCard, capitolHolderImage))
        .catch(() => {});
    }

    if (capHolderEl) {
      capHolderEl.textContent = holderName(capitolHolder);
      // The holder's own alliance colour; without one, the CSS (theme colour) applies.
      capHolderEl.classList.toggle('ally-text', Boolean(capitolHolderColor));
      capHolderEl.style.setProperty('--ally', capitolHolderColor || '');
    }
    // The week's alliance captures the Capitol on Friday: before that the card shows who
    // is due to capture it, afterwards who holds it.
    const capLabelEl = document.getElementById('hero-capitol-label');
    if (capLabelEl) {
      capLabelEl.textContent = t(
        status.capitolCaptured ? 'calendar.current_holder' : 'calendar.next_holder',
      );
    }
    // When the holder captures (or captured) the Capitol; no rank: the order changes every
    // Kingdom War, so a rank here was more confusing than useful (owner, 2026-11-16)
    if (capRankEl) {
      capRankEl.textContent = t(
        status.capitolCaptured
          ? 'calendar.captured_friday'
          : status.isCaptureDay
            ? 'calendar.captures_today'
            : 'calendar.captures_friday',
      );
    }
    if (cycleProgressEl) {
      const weekLabel =
        status.clockWeek === 0
          ? t('common.off_week')
          : t('calendar.week_n', { n: status.clockWeek });
      cycleProgressEl.textContent = t('calendar.day_of_28', {
        day: status.cycleDay,
        week: weekLabel,
      });
    }

    // Broadcast live clock week so kvk-scheduler.js stays 100% synced
    window.__LIVE_CLOCK_WEEK__ = status.clockWeek;
    window.dispatchEvent(
      new CustomEvent('calendar:clock-synced', { detail: { clockWeek: status.clockWeek } }),
    );

    const kwBox = document.getElementById('metric-kw-box');
    const kwCountdown = document.getElementById('metric-kw-countdown');
    if (kwBox && kwCountdown) {
      if (status.isKW) {
        kwBox.style.opacity = '1';
        const kwDate = new Date(status.kwBattleTimestamp * 1000);
        kwCountdown.innerHTML = status.isKWBattleDay
          ? ic('flame') + esc(t('calendar.today'))
          : esc(
              kwDate.toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              }),
            );
      } else {
        kwBox.style.opacity = '0.5';
        kwCountdown.textContent = t('calendar.none_this_week');
      }
    }

    function updateResetClock() {
      const now = Date.now();
      const diff = Math.max(0, status.nextResetTimestamp * 1000 - now);
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      const countdownEl = document.getElementById('metric-reset-countdown');
      if (!countdownEl) {
        // Left the calendar page: stop ticking.
        clearInterval(window.__calendarResetClock);
        return;
      }
      countdownEl.textContent = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // One countdown at a time, also across visits (kept on window for that reason).
    clearInterval(window.__calendarResetClock);
    updateResetClock();
    window.__calendarResetClock = setInterval(updateResetClock, 1000);
  }

  // 4. The events "at a glance" (js/calendar-views.js): a week view and a cycle view, with
  // chips for the event types and "Find an event". The chips replace the old Perspective
  // menu: an alliance's page shows the server's events and the alliance's own (its chip
  // hides or shows them).
  // Set just before a Steward's scope switch reloads the page (step 6), read once
  const SWITCHED_KEY = 'cal-scope-switched';
  let switchedScope = false;
  try {
    switchedScope = sessionStorage.getItem(SWITCHED_KEY) === '1';
    sessionStorage.removeItem(SWITCHED_KEY);
  } catch {
    /* storage blocked: the reload starts afresh */
  }
  const eventsView =
    window.CalendarViews && document.getElementById('events-timeline-container')
      ? window.CalendarViews.create(document.getElementById('events-timeline-container'), {
          t,
          tn: window.tn,
          esc,
          hasAlliance: () => Boolean(activeAlliance),
          // Back / Forward (e.g. from an event's guide): the view, week and day the reader
          // had, not today (js/calendar-views.js remember); per address, so an alliance's
          // calendar has its own
          memoryKey: `cal-place:${location.pathname}${location.search}`,
          restore: Boolean(window.__cameBack) || switchedScope,
          // A Steward who switched between server and alliance events: still editing
          startEditing: switchedScope,
          // Leaders edit and delete their own events (and Stewards server-wide ones)
          canEdit: (evt) =>
            isManagementSession &&
            evt.id &&
            evt.id.startsWith('evt-') &&
            sessionScope &&
            evt.scope &&
            (evt.scope.toLowerCase() === 'global'
              ? sessionScope.toLowerCase() === 'global'
              : sameAllianceTag(evt.scope, sessionScope)),
          // Leaders get the "Edit events" button that shows Edit / Delete on their events,
          // and their management controls and event form just under it (shown while editing)
          canManage: () => isManagementSession,
          managePanel: document.getElementById('management-panel'),
          onEdit: (id) => openEditForm?.(id),
          onAdd: (date) => openAddForm?.(date),
          onStopEditing: () => closeEventForm?.(),
          onDelete: (id, info) => handleDeleteEvent(id, info),
        })
      : null;

  function renderEvents(status) {
    if (!eventsView) return;
    const shown = allEvents
      .filter((e) => {
        if (
          !e.scope ||
          e.scope.toLowerCase() === 'global' ||
          e.type === 'war' ||
          e.type === 'rotation'
        )
          return true;
        return Boolean(activeAlliance) && sameAllianceTag(e.scope, activeAlliance);
      })
      .map((e) => {
        // The site's own milestones in the page's language; events leaders write stay as written.
        const own = e.i18n && MILESTONES[e.i18n.key];
        if (!own) return e;
        const [title, description] = own(e.i18n.vars || {});
        return { ...e, title, description };
      });
    eventsView.render(shown, status);
  }

  // 6. Management Mode UI Setup
  if (isManagementSession) {
    const mgmtPanel = document.getElementById('management-panel');
    const mgmtScopeTag = document.getElementById('mgmt-scope-tag');
    const mgmtScopeDesc = document.getElementById('mgmt-scope-desc');
    const formHeading = document.getElementById('form-heading');

    if (mgmtPanel) mgmtPanel.style.display = 'block';

    if (isGlobalAdmin) {
      if (mgmtPanel) mgmtPanel.classList.add('scope-global');
      if (mgmtScopeTag)
        mgmtScopeTag.innerHTML = ic('crown') + esc(t('calendar_events.kingdom_admin'));
      if (mgmtScopeDesc) mgmtScopeDesc.textContent = t('calendar_events.kingdom_desc');
      if (formHeading) formHeading.textContent = t('calendar_events.kingdom_heading');
    } else {
      if (mgmtScopeTag)
        mgmtScopeTag.innerHTML =
          ic('shield') + esc(t('calendar_events.leadership', { tag: sessionScope }));
      if (mgmtScopeDesc)
        mgmtScopeDesc.textContent = t('calendar_events.leadership_desc', { tag: sessionScope });
      if (formHeading)
        formHeading.textContent = t('calendar_events.alliance_heading', { tag: sessionScope });
    }

    // A signed-in Steward with an alliance: switch between server events and the alliance's
    const scopeSwitch = document.getElementById('mgmt-scope-switch');
    if (scopeSwitch && viaSignIn && signedInSteward && signedInAlliance) {
      scopeSwitch.hidden = false;
      // Line icons (js/site-select.js): a globe for the server, a shield for the alliance
      const GLOBE =
        '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/>';
      const SHIELD = '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>';
      scopeSwitch.innerHTML = [
        ['global', t('calendar_events.scope_server'), GLOBE],
        [signedInAlliance, t('calendar_events.scope_alliance', { tag: signedInAlliance }), SHIELD],
      ]
        .map(
          ([value, label, icon]) =>
            `<option value="${esc(value)}" data-icon="${esc(icon)}"${value === sessionScope ? ' selected' : ''}>${esc(label)}</option>`,
        )
        .join('');
      scopeSwitch.addEventListener('change', () => {
        sessionStorage.setItem(SCOPE_KEY, scopeSwitch.value === 'global' ? 'global' : 'alliance');
        // The reload comes back as it was: editing on, the same view, week and day
        sessionStorage.setItem(SWITCHED_KEY, '1');
        window.location.reload();
      });
    }

    const formEl = document.getElementById('form-create-event');
    const btnCancel = document.getElementById('btn-cancel-event-form');
    const notifySelect = document.getElementById('evt-input-notify');
    const customRoleInput = document.getElementById('evt-input-role-id');
    // "Ping a specific role": a dropdown of the server's roles (owner, 2026-11-28), the ID
    // box only when those can't be read. The roles are asked for once, the first time.
    const rolePick = document.getElementById('evt-input-role-pick');
    const roleHint = document.getElementById('evt-role-pick-hint');
    let rolesAsked = null;
    const loadRoles = () =>
      (rolesAsked ||= manageEvents({ action: 'roles' })
        .then((r) => (r.ok ? r.json() : { roles: [] }))
        .then((d) => (Array.isArray(d.roles) ? d.roles : []))
        .catch(() => []));
    /** Shows the picker (or the ID box) for the current choice; `chosen`: the role to select. */
    async function showRolePicker(chosen = customRoleInput.value.trim()) {
      const isCustom = notifySelect.value === 'custom_role';
      const lockBox = (locked) => {
        customRoleInput.disabled = locked;
        customRoleInput.classList.toggle('input-locked', locked);
      };
      if (!isCustom || !rolePick) {
        if (rolePick) rolePick.hidden = true;
        if (roleHint) roleHint.hidden = true;
        customRoleInput.hidden = false;
        lockBox(!isCustom);
        if (!isCustom) customRoleInput.value = '';
        return;
      }
      if (roleHint) {
        roleHint.textContent = t('calendar_events.role_pick_loading');
        roleHint.hidden = false;
      }
      const roles = await loadRoles();
      if (notifySelect.value !== 'custom_role') return; // changed while loading
      if (!roles.length) {
        // The fallback: paste the ID, as before
        rolePick.hidden = true;
        customRoleInput.hidden = false;
        lockBox(false);
        customRoleInput.value = chosen || '';
        if (roleHint) roleHint.textContent = t('calendar_events.role_pick_unavailable');
        return;
      }
      const options = [`<option value="">${esc(t('calendar_events.role_pick_choose'))}</option>`];
      if (chosen && !roles.some((r) => r.id === chosen)) {
        options.push(
          `<option value="${esc(chosen)}">${esc(t('calendar_events.role_pick_unknown', { id: chosen }))}</option>`,
        );
      }
      for (const r of roles) options.push(`<option value="${esc(r.id)}">@${esc(r.name)}</option>`);
      rolePick.innerHTML = options.join('');
      rolePick.value = chosen || '';
      customRoleInput.value = rolePick.value;
      customRoleInput.hidden = true;
      rolePick.hidden = false;
      if (roleHint) roleHint.hidden = true;
      window.SiteSelect?.sync(rolePick);
    }
    rolePick?.addEventListener('change', () => {
      customRoleInput.value = rolePick.value;
    });
    // The event type (the site's dropdown, js/site-select.js): read and set the one picked
    const presetSelect = document.getElementById('evt-input-preset');
    const presetValue = () => presetSelect?.value || 'custom';
    const setPreset = (id) => {
      if (!presetSelect) return;
      presetSelect.value = id;
      if (presetSelect.value !== id) presetSelect.value = 'custom';
      window.SiteSelect?.sync(presetSelect);
    };
    const submitBtn = document.getElementById('btn-submit-event');

    // Presets fill the form in the page's language (event_presets.* in tools.yml), from the
    // shared list of event types (_data/event_types.yml, put in the page by calendar.html)
    const OPERATION_PRESETS = Object.fromEntries(
      (window.CalendarViews?.eventTypes().types || [])
        .filter((type) => type.preset)
        .map((type) => [
          type.id,
          {
            title: t(`event_presets.${type.id}_title`),
            color: type.color,
            duration: type.duration,
            recurrence: type.recurrence || 'none',
            description: t(`event_presets.${type.id}_desc`),
          },
        ]),
    );
    /** Dark text on a light preset colour, white on a dark one. */
    const textOn = (hex) => {
      const n = parseInt(String(hex).replace('#', ''), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#0b0d11' : '#ffffff';
    };

    let activePresetColor = null;
    // The event being edited (its id), or null when the form creates a new one
    let editingEventId = null;
    // An event being edited: who it pinged, kept when "No reminder" is chosen (so an older
    // event's @everyone, which marks it Mandatory, isn't lost)
    let editingNotifyTarget = null;
    const createHeading = formHeading ? formHeading.textContent : '';

    // Back to "create": heading, button and reminder default as for a new event
    function leaveEditMode() {
      editingEventId = null;
      if (formHeading) formHeading.textContent = createHeading;
      if (submitBtn) submitBtn.textContent = t('calendar_events.publish');
      editingNotifyTarget = null;
      window.SiteSelect?.sync(notifySelect);
      showRolePicker('');
      const remindTime = document.getElementById('evt-input-remind-time');
      if (remindTime) {
        remindTime.value = '60';
        window.SiteSelect?.sync(remindTime);
      }
      updateReminderHint();
    }

    openEditForm = (eventId) => {
      const evt = allEvents.find((e) => e.id === eventId);
      if (!evt || !formEl) return;
      editingEventId = eventId;
      resetPanelTheme();
      // The event's type (stored, or matched by title for an older event), without refilling
      // the fields from it
      const type = window.CalendarViews?.typeOf(evt);
      setPreset(type && OPERATION_PRESETS[type] ? type : 'custom');
      activePresetColor = evt.color || null;
      // The occurrence shown, in Game Time (UTC-2): a repeating event continues from it
      const startGt = new Date(new Date(evt.start).getTime() - 2 * 3600000);
      document.getElementById('evt-input-title').value = String(evt.title || '').replace(
        /^\[[^\]]+\]\s*/,
        '',
      );
      document.getElementById('evt-input-date').value = startGt.toISOString().split('T')[0];
      document.getElementById('evt-input-time').value =
        evt.time_gt || startGt.toISOString().slice(11, 16);
      document.getElementById('evt-input-duration').value = evt.duration_hours || 1;
      document.getElementById('evt-input-recurrence').value = evt.recurrence || 'none';
      document.getElementById('evt-input-details').value = evt.description || '';
      // One choice for the reminder: none, or who it pings
      editingNotifyTarget = evt.notify_target || 'role';
      notifySelect.value = evt.reminder === '1h' ? editingNotifyTarget : 'off';
      // How long before (events from before the choice existed: an hour)
      const remindTime = document.getElementById('evt-input-remind-time');
      if (remindTime) {
        const m = Number(evt.reminder_minutes);
        remindTime.value =
          Number.isInteger(m) && m >= 0 && m <= 60 && m % 10 === 0 ? String(m) : '60';
        window.SiteSelect?.sync(remindTime);
      }
      updateReminderHint();
      showRolePicker(notifySelect.value === 'custom_role' ? evt.custom_role_id || '' : '');
      if (formHeading) formHeading.textContent = t('calendar_events.edit_heading');
      if (submitBtn) submitBtn.innerHTML = ic('save') + esc(t('calendar_events.save_changes'));
      formEl.style.display = 'block';
      showForm();
    };

    function resetPanelTheme() {
      activePresetColor = null;
      if (!mgmtPanel || !submitBtn) return;
      mgmtPanel.style.borderLeftColor = '';
      mgmtPanel.style.background = '';
      mgmtPanel.style.boxShadow = '';
      submitBtn.style.background = '';
      submitBtn.style.borderColor = '';
      submitBtn.style.color = '';
    }

    if (presetSelect) {
      presetSelect.addEventListener('change', () => {
        const selected = OPERATION_PRESETS[presetValue()];
        if (selected) {
          document.getElementById('evt-input-title').value = selected.title;
          document.getElementById('evt-input-duration').value = selected.duration;
          document.getElementById('evt-input-recurrence').value = selected.recurrence;
          document.getElementById('evt-input-details').value = selected.description;
          activePresetColor = selected.color;

          if (mgmtPanel && submitBtn) {
            mgmtPanel.style.borderLeftColor = selected.color;
            mgmtPanel.style.background = `linear-gradient(145deg, ${selected.color}2e, var(--nav-bg))`;
            mgmtPanel.style.boxShadow = `0 4px 20px ${selected.color}22`;
            submitBtn.style.background = selected.color;
            submitBtn.style.borderColor = selected.color;
            submitBtn.style.color = textOn(selected.color);
          }
        } else {
          resetPanelTheme();
        }
      });
    }

    if (notifySelect && customRoleInput) {
      notifySelect.addEventListener('change', () => {
        updateReminderHint();
        showRolePicker('');
      });
    }

    // The form opens where it is, under "Edit events" / "Add an event". The page only moves
    // when the form's top would be out of sight (below the middle of the screen, or under the
    // site's header), and then just enough to bring those buttons to the top, so the reader
    // keeps their place: the buttons, the controls and the start of the form in view.
    function showForm() {
      const main = document.querySelector('main');
      const header = document.querySelector('header')?.getBoundingClientRect().bottom || 0;
      const top = formEl.getBoundingClientRect().top;
      if (top >= header && top <= window.innerHeight * 0.6) return;
      const anchor = formEl.closest('.ag-manage')?.querySelector('.ag-editbar') || formEl;
      if (!main) return anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      main.scrollTo({
        top: main.scrollTop + anchor.getBoundingClientRect().top - header - 12,
        behavior: 'smooth',
      });
    }

    // "Done editing": the form closes (an edit in progress is dropped)
    closeEventForm = () => {
      formEl.style.display = 'none';
      if (editingEventId) {
        formEl.reset();
        leaveEditMode();
      }
    };

    // "Add an event" (beside "Edit events", js/calendar-views.js): the empty form, on the day
    // being looked at, 19:00 GT. It replaced the "Schedule Operation" button at the top of the
    // panel (owner, 2026-11-16), so adding and editing sit together like on the dashboard.
    openAddForm = (date) => {
      if (!formEl) return;
      if (editingEventId) {
        formEl.reset();
        leaveEditMode();
      }
      formEl.style.display = 'block';
      document.getElementById('evt-input-date').value =
        date || new Date().toISOString().split('T')[0];
      document.getElementById('evt-input-time').value = '19:00';
      showForm();
    };

    if (btnCancel && formEl) {
      btnCancel.addEventListener('click', () => {
        formEl.style.display = 'none';
        if (editingEventId) {
          formEl.reset();
          leaveEditMode();
        }
      });
    }

    if (formEl) {
      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();

        const timeVal = document.getElementById('evt-input-time').value;
        const [, mm] = timeVal.split(':').map(Number);
        if (mm % 5 !== 0) {
          showNotification(t('calendar_events.bad_time'), 'error');
          return;
        }

        // "No reminder": no Discord post; the stored ping stays as it was (or the default)
        const remind = notifySelect.value !== 'off';
        const kept = editingNotifyTarget === 'custom_role' ? 'role' : editingNotifyTarget;
        const notifyTarget = remind ? notifySelect.value : kept || 'role';
        const customRoleId = customRoleInput.value.trim();

        if (notifyTarget === 'custom_role' && !/^\d{17,20}$/.test(customRoleId)) {
          const picking = rolePick && !rolePick.hidden;
          showNotification(
            t(picking ? 'calendar_events.role_pick_needed' : 'calendar_events.bad_role'),
            'error',
          );
          (picking ? rolePick : customRoleInput).focus();
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = t('calendar_events.publishing');

        const payload = {
          action: editingEventId ? 'edit' : 'create',
          eventId: editingEventId || undefined,
          eventData: {
            title: document.getElementById('evt-input-title').value,
            date: document.getElementById('evt-input-date').value,
            time_gt: timeVal,
            duration_hours: document.getElementById('evt-input-duration').value,
            recurrence: document.getElementById('evt-input-recurrence').value,
            notify_target: notifyTarget,
            custom_role_id: notifyTarget === 'custom_role' ? customRoleId : null,
            color: activePresetColor,
            // The event type picked (stored, so the calendar can filter, show its icon and
            // link its guide); none for a custom event
            event_type: OPERATION_PRESETS[presetValue()] ? presetValue() : null,
            description: document.getElementById('evt-input-details').value,
            reminder: remind ? '1h' : 'off',
            reminder_minutes: Number(document.getElementById('evt-input-remind-time')?.value ?? 60),
          },
        };

        try {
          const res = await manageEvents(payload);
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || t('calendar_events.save_failed'));

          showNotification(result.message || t('calendar_events.published'), 'success');
          formEl.reset();
          resetPanelTheme();
          showRolePicker('');
          formEl.style.display = 'none';
          leaveEditMode();
          await loadCalendar({ useSaved: false });
        } catch (err) {
          showNotification(err.message, 'error');
        } finally {
          submitBtn.disabled = false;
          submitBtn.innerHTML = editingEventId
            ? ic('save') + esc(t('calendar_events.save_changes'))
            : esc(t('calendar_events.publish'));
        }
      });
    }
  }

  // 7. Delete Event Handler
  // The confirmation before deleting, in the site's style (it was the browser's own box,
  // which named no event): the event, its day and time, a warning when it repeats (every
  // repeat goes), Cancel first, Delete in red. Resolves true for Delete.
  function confirmDelete({ title = '', when = '', repeat = '' } = {}) {
    let dialog = document.getElementById('cal-delete-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'cal-delete-dialog';
      dialog.className = 'auth-modal cal-confirm';
      dialog.setAttribute('aria-labelledby', 'cal-delete-heading');
      document.body.appendChild(dialog);
    }
    dialog.innerHTML = `
      <div class="auth-modal-frame">
        <div class="auth-modal-header">
          <div class="auth-modal-title-wrap">
            <span class="auth-modal-icon" aria-hidden="true">${ic('trash', 'solo')}</span>
            <h3 id="cal-delete-heading" class="auth-modal-title">${esc(t('calendar_events.delete_heading'))}</h3>
          </div>
        </div>
        <div class="auth-modal-body">
          <p class="cal-confirm-what"><strong>${esc(title)}</strong>${when ? `<br><span>${esc(when)}</span>` : ''}</p>
          ${repeat ? `<p class="cal-confirm-warn">${ic('warning', 'warn')}${esc(t('calendar_events.delete_repeats', { repeat }))}</p>` : ''}
          <p class="cal-confirm-final">${esc(t('calendar_events.delete_final'))}</p>
        </div>
        <div class="auth-modal-footer">
          <button type="button" class="btn-modal-cancel" data-answer="no" autofocus>${esc(t('common.cancel'))}</button>
          <button type="button" class="btn-modal-action is-danger" data-answer="yes">${esc(t('calendar_events.delete_confirm'))}</button>
        </div>
      </div>`;
    return new Promise((resolve) => {
      const done = (yes) => {
        dialog.removeEventListener('click', onClick);
        dialog.removeEventListener('cancel', onCancel);
        if (dialog.open) dialog.close();
        resolve(yes);
      };
      const onClick = (e) => {
        const b = e.target.closest('[data-answer]');
        if (b) done(b.dataset.answer === 'yes');
        else if (e.target === dialog) done(false); // a tap outside the box
      };
      const onCancel = (e) => {
        e.preventDefault();
        done(false); // Escape
      };
      dialog.addEventListener('click', onClick);
      dialog.addEventListener('cancel', onCancel);
      dialog.showModal();
      dialog.querySelector('[data-answer="no"]').focus();
    });
  }

  async function handleDeleteEvent(eventId, info) {
    if (!(await confirmDelete(info))) return;

    try {
      const res = await manageEvents({ action: 'delete', eventId });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || t('calendar_events.delete_failed'));

      showNotification(result.message || t('calendar_events.removed'), 'success');
      await loadCalendar({ useSaved: false });
    } catch (err) {
      showNotification(err.message, 'error');
    }
  }

  function showNotification(msg, type) {
    if (!elNotification) return;
    elNotification.textContent = msg;
    elNotification.className = `cal-notification-banner ${type}`;
    elNotification.style.display = 'block';
    setTimeout(() => {
      elNotification.style.display = 'none';
    }, 5000);
  }

  await loadCalendar();
}

// Turbo may run this file again on each visit; the listener is added only once.
if (!window.__calendarTurboListener) {
  window.__calendarTurboListener = true;
  // A footer link swaps only the page's main frame: Turbo then fires turbo:frame-render, and
  // on some routes not turbo:load (the tool stayed blank). Start on both, as js/main.js does;
  // the once-per-page guard makes the second call a no-op.
  document.addEventListener('turbo:load', () => initCalendar());
  document.addEventListener('turbo:frame-render', () => initCalendar());
}
initCalendar();
