/**
 * js/calendar.js - Kingdom War & Alliance Event Timeline Controller
 * Manages operations, presets, time-conversion, and scoped perspectives.
 */

// The calendar is a regular page, so it can be reached by a full page load or by Turbo
// (footer navigation, back button). initCalendar runs on both, once per visit: each visit
// brings fresh page elements, and the ones already set up are remembered here. (Not a
// data- attribute: Turbo's back-button copy of the page would keep it.)
window.__calendarStarted = window.__calendarStarted || new WeakSet();
async function initCalendar() {
  const elContent = document.getElementById('calendar-content');
  if (!elContent || window.__calendarStarted.has(elContent)) return;
  window.__calendarStarted.add(elContent);

  // Escape data before putting it into HTML (see js/escape-html.js).
  const esc = (value) => window.escapeHtml(value);
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
  const filterSelect = document.getElementById('cal-scope-filter');
  const filterStatusTag = document.getElementById('filter-status-tag');
  const filterToolbar = document.getElementById('cal-filter-toolbar');

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

  const isManagementSession =
    (tokenPayload && (!tokenPayload.exp || Date.now() < tokenPayload.exp)) || isDevPreview;
  const sessionScope = isManagementSession ? tokenPayload?.scope || 'WLO' : null;
  const isGlobalAdmin = sessionScope?.toLowerCase() === 'global';

  const activeAlliance =
    !isGlobalAdmin && sessionScope ? sessionScope.trim() : allianceParam || null;

  let allEvents = [];

  // 2. Fetch Live Calendar Data
  async function loadCalendar() {
    try {
      const query = activeAlliance ? `?alliance=${encodeURIComponent(activeAlliance)}` : '';
      const res = await fetch(`/api/calendar${query}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      allEvents = data.events || [];
      renderHero(data.status, data.capitolHolder, data.capitolHolderColor);
      setupFilterOptions();
      applyFilterAndRender();
    } catch (err) {
      if (elLoading) elLoading.style.display = 'none';
      if (elError) {
        elError.style.display = 'block';
        elError.textContent = t('calendar.load_failed', { error: err.message });
      }
    }
  }

  // 3. Render Hero & Reset Clock
  function renderHero(status, capitolHolder, capitolHolderColor) {
    if (elLoading) elLoading.style.display = 'none';
    if (elContent) elContent.style.display = 'block';

    // The reward period (api/_reward_period.js): Friday ~20:00 GT to Wednesday 00:00 GT,
    // named after the week it belongs to (on Monday/Tuesday, the week before).
    const rewards = status.rewards || null;
    const heroBadge = document.getElementById('hero-phase-badge');
    if (heroBadge && rewards) {
      // The title names the week; the badge shows the rewards, so they don't repeat.
      const badge = !rewards.open
        ? ['calendar.badge_closed', 'badge-off']
        : rewards.result === 'won'
          ? ['calendar.badge_kob_open', 'badge-kw']
          : rewards.result === 'pending'
            ? ['calendar.badge_awaiting', 'badge-kw']
            : ['calendar.badge_open', 'badge-off'];
      heroBadge.textContent = t(badge[0]);
      heroBadge.className = `cal-badge ${badge[1]}`;
    }

    const titleEl = document.getElementById('hero-phase-title');
    const subEl = document.getElementById('hero-phase-subtitle');
    const capHolderEl = document.getElementById('hero-capitol-holder');
    const capRankEl = document.getElementById('hero-capitol-rank');
    const cycleProgressEl = document.getElementById('metric-cycle-progress');

    // weekName, not the configured phase name, so the site always says "Off-Week".
    if (titleEl) titleEl.textContent = weekName(status.clockWeek);
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

    if (capHolderEl) {
      capHolderEl.textContent = holderName(capitolHolder);
      // The holder's own alliance colour; without one, the CSS (theme colour) applies.
      capHolderEl.style.color = capitolHolderColor || '';
    }
    // The week's alliance captures the Capitol on Friday: before that the card shows who
    // is due to capture it, afterwards who holds it.
    const capLabelEl = document.getElementById('hero-capitol-label');
    if (capLabelEl) {
      capLabelEl.textContent = t(
        status.capitolCaptured ? 'calendar.current_holder' : 'calendar.next_holder',
      );
    }
    if (capRankEl) {
      const rankText =
        status.isOverrideWeek && status.holderActualRank
          ? t('calendar.rank_override', { rank: status.holderActualRank })
          : t('calendar.rank', { rank: status.capitolRank });
      const captureText = t(
        status.capitolCaptured
          ? 'calendar.captured_friday'
          : status.isCaptureDay
            ? 'calendar.captures_today'
            : 'calendar.captures_friday',
      );
      capRankEl.textContent = `${rankText} · ${captureText}`;
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
        kwCountdown.textContent = status.isKWBattleDay
          ? t('calendar.today')
          : kwDate.toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            });
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

  // 4. Filter Toolbar
  function setupFilterOptions() {
    if (!filterSelect || !filterToolbar) return;
    filterSelect.innerHTML = '';

    if (activeAlliance) {
      filterToolbar.style.display = 'flex';

      const optCombined = document.createElement('option');
      optCombined.value = 'combined';
      optCombined.textContent = t('calendar.combined', { tag: activeAlliance });
      filterSelect.appendChild(optCombined);

      const optAlliance = document.createElement('option');
      optAlliance.value = activeAlliance;
      optAlliance.textContent = t('calendar.internal_only', { tag: activeAlliance });
      filterSelect.appendChild(optAlliance);

      const optGlobal = document.createElement('option');
      optGlobal.value = 'global';
      optGlobal.textContent = t('calendar.kingdom_only');
      filterSelect.appendChild(optGlobal);

      filterSelect.value = 'combined';
    } else {
      filterToolbar.style.display = 'none';
    }
  }

  function applyFilterAndRender() {
    if (!filterSelect) return;
    const selected = filterSelect.value || 'global';
    let filtered = [];

    if (!activeAlliance || selected === 'global') {
      filtered = allEvents.filter(
        (e) =>
          !e.scope ||
          e.scope.toLowerCase() === 'global' ||
          e.type === 'war' ||
          e.type === 'rotation',
      );
      if (filterStatusTag) filterStatusTag.style.display = 'none';
    } else if (selected === 'combined') {
      filtered = allEvents.filter((e) => {
        if (
          !e.scope ||
          e.scope.toLowerCase() === 'global' ||
          e.type === 'war' ||
          e.type === 'rotation'
        )
          return true;
        return e.scope.trim().toLowerCase() === activeAlliance.toLowerCase();
      });
      if (filterStatusTag) {
        filterStatusTag.style.display = 'block';
        filterStatusTag.textContent = t('calendar.operations_active', { tag: activeAlliance });
      }
    } else {
      filtered = allEvents.filter(
        (e) => e.scope && e.scope.trim().toLowerCase() === activeAlliance.toLowerCase(),
      );
      if (filterStatusTag) {
        filterStatusTag.style.display = 'block';
        filterStatusTag.textContent = t('calendar.internal_only', { tag: activeAlliance });
      }
    }

    renderTimeline(filtered);
  }

  if (filterSelect) {
    filterSelect.addEventListener('change', applyFilterAndRender);
  }

  // 5. Render Timeline
  function renderTimeline(eventsList) {
    const timelineContainer = document.getElementById('events-timeline-container');
    if (!timelineContainer) return;

    if (!eventsList || eventsList.length === 0) {
      timelineContainer.innerHTML = `<div class="cal-status-banner">${esc(t('calendar.no_operations'))}</div>`;
      return;
    }

    timelineContainer.innerHTML = eventsList
      .map((evt) => {
        const start = new Date(evt.start);
        const gtHours = (start.getUTCHours() - 2 + 24) % 24;
        const gtMins = String(start.getUTCMinutes()).padStart(2, '0');
        const gtTimeStr = evt.allDay
          ? t('calendar.all_day')
          : t('common.game_time', { time: `${String(gtHours).padStart(2, '0')}:${gtMins}` });
        const localDateStr = start.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        const localTimeStr = evt.allDay
          ? ''
          : ` • ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

        let recurrenceLabel = '';
        if (evt.recurrence === '2days')
          recurrenceLabel = `<span class="event-tag-pill pill-recurring">${esc(t('calendar.every_2_days'))}</span>`;
        else if (evt.recurrence === 'weekly')
          recurrenceLabel = `<span class="event-tag-pill pill-recurring">${esc(t('calendar.weekly'))}</span>`;

        const forceLabel =
          evt.notify_target === 'everyone'
            ? `<span class="event-tag-pill pill-force">${esc(t('calendar.mandatory'))}</span>`
            : '';
        const borderStyle = evt.color ? `border-left-color: ${esc(evt.color)} !important;` : '';

        // The site's own milestones in the page's language; events leaders write stay as written.
        const own = evt.i18n && MILESTONES[evt.i18n.key];
        const [title, description] = own ? own(evt.i18n.vars || {}) : [evt.title, evt.description];

        const canDelete =
          isManagementSession &&
          evt.id &&
          evt.id.startsWith('evt-') &&
          sessionScope &&
          evt.scope &&
          evt.scope.toLowerCase() === sessionScope.toLowerCase();

        return `
        <div class="timeline-event-row event-${esc(evt.type || 'custom')}" style="${borderStyle}">
          <div class="event-main">
            <div class="event-title-line">
              <span class="event-title">${esc(title)}</span>
              ${recurrenceLabel}
              ${forceLabel}
            </div>
            <div class="event-desc">${esc(description || '')}</div>
          </div>
          <div class="event-actions-group">
            <div class="event-time-block">
              <div class="time-gt">${esc(gtTimeStr)}</div>
              <div>${localDateStr}${localTimeStr}</div>
            </div>
            ${canDelete ? `<button type="button" class="btn-delete-event" data-event-id="${esc(evt.id)}">${esc(t('calendar.delete'))}</button>` : ''}
          </div>
        </div>
      `;
      })
      .join('');

    timelineContainer.querySelectorAll('.btn-delete-event').forEach((btn) => {
      btn.addEventListener('click', () => handleDeleteEvent(btn.dataset.eventId));
    });
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
      if (mgmtScopeTag) mgmtScopeTag.textContent = t('calendar_events.kingdom_admin');
      if (mgmtScopeDesc) mgmtScopeDesc.textContent = t('calendar_events.kingdom_desc');
      if (formHeading) formHeading.textContent = t('calendar_events.kingdom_heading');
    } else {
      if (mgmtScopeTag)
        mgmtScopeTag.textContent = t('calendar_events.leadership', { tag: sessionScope });
      if (mgmtScopeDesc)
        mgmtScopeDesc.textContent = t('calendar_events.leadership_desc', { tag: sessionScope });
      if (formHeading)
        formHeading.textContent = t('calendar_events.alliance_heading', { tag: sessionScope });
    }

    const formEl = document.getElementById('form-create-event');
    const btnToggle = document.getElementById('btn-toggle-event-form');
    const btnCancel = document.getElementById('btn-cancel-event-form');
    const notifySelect = document.getElementById('evt-input-notify');
    const customRoleInput = document.getElementById('evt-input-role-id');
    const presetSelect = document.getElementById('evt-input-preset');
    const submitBtn = document.getElementById('btn-submit-event');

    // Presets fill the form in the page's language (event_presets.* in tools.yml).
    const OPERATION_PRESETS = {
      crystal_cluster: {
        title: t('event_presets.crystal_cluster_title'),
        color: '#7946C0',
        duration: 0.5,
        recurrence: 'weekly',
        description: t('event_presets.crystal_cluster_desc'),
      },
      elixir_scramble: {
        title: t('event_presets.elixir_scramble_title'),
        color: '#24523B',
        duration: 0.5,
        recurrence: 'weekly',
        description: t('event_presets.elixir_scramble_desc'),
      },
      survival_battle: {
        title: t('event_presets.survival_battle_title'),
        color: '#CF6214',
        duration: 4.0,
        recurrence: 'none',
        description: t('event_presets.survival_battle_desc'),
      },
      kill_event: {
        title: t('event_presets.kill_event_title'),
        color: '#B12A2A',
        duration: 24.0,
        recurrence: 'none',
        description: t('event_presets.kill_event_desc'),
      },
      kvk_battle: {
        title: t('event_presets.kvk_battle_title'),
        color: '#8ED2EF',
        duration: 1.0,
        recurrence: 'none',
        description: t('event_presets.kvk_battle_desc'),
      },
      gear_event: {
        title: t('event_presets.gear_event_title'),
        color: '#303A40',
        duration: 48.0,
        recurrence: 'none',
        description: t('event_presets.gear_event_desc'),
      },
      cheese_trap: {
        title: t('event_presets.cheese_trap_title'),
        color: '#FAB22F',
        duration: 0.5,
        recurrence: '2days',
        description: t('event_presets.cheese_trap_desc'),
      },
    };

    let activePresetColor = null;

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
        const selected = OPERATION_PRESETS[presetSelect.value];
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
            submitBtn.style.color =
              selected.color === '#FAB22F' || selected.color === '#8ED2EF' ? '#0b0d11' : '#ffffff';
          }
        } else {
          resetPanelTheme();
        }
      });
    }

    if (notifySelect && customRoleInput) {
      notifySelect.addEventListener('change', () => {
        const isCustom = notifySelect.value === 'custom_role';
        customRoleInput.disabled = !isCustom;
        customRoleInput.classList.toggle('input-locked', !isCustom);
        if (isCustom) customRoleInput.focus();
        else customRoleInput.value = '';
      });
    }

    if (btnToggle && formEl) {
      btnToggle.addEventListener('click', () => {
        const isHidden = formEl.style.display === 'none';
        formEl.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
          document.getElementById('evt-input-date').value = new Date().toISOString().split('T')[0];
          document.getElementById('evt-input-time').value = '19:00';
        }
      });
    }

    if (btnCancel && formEl) {
      btnCancel.addEventListener('click', () => {
        formEl.style.display = 'none';
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

        const notifyTarget = notifySelect.value;
        const customRoleId = customRoleInput.value.trim();

        if (notifyTarget === 'custom_role' && !/^\d{17,20}$/.test(customRoleId)) {
          showNotification(t('calendar_events.bad_role'), 'error');
          customRoleInput.focus();
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = t('calendar_events.publishing');

        const payload = {
          token: tokenParam,
          action: 'create',
          eventData: {
            title: document.getElementById('evt-input-title').value,
            date: document.getElementById('evt-input-date').value,
            time_gt: timeVal,
            duration_hours: document.getElementById('evt-input-duration').value,
            recurrence: document.getElementById('evt-input-recurrence').value,
            notify_target: notifyTarget,
            custom_role_id: notifyTarget === 'custom_role' ? customRoleId : null,
            color: activePresetColor,
            description: document.getElementById('evt-input-details').value,
          },
        };

        try {
          const res = await fetch('/api/manage-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || t('calendar_events.save_failed'));

          showNotification(result.message || t('calendar_events.published'), 'success');
          formEl.reset();
          resetPanelTheme();
          customRoleInput.disabled = true;
          customRoleInput.classList.add('input-locked');
          formEl.style.display = 'none';
          await loadCalendar();
        } catch (err) {
          showNotification(err.message, 'error');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = t('calendar_events.publish');
        }
      });
    }
  }

  // 7. Delete Event Handler
  async function handleDeleteEvent(eventId) {
    if (!confirm(t('calendar_events.confirm_delete'))) return;

    try {
      const res = await fetch('/api/manage-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenParam, action: 'delete', eventId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || t('calendar_events.delete_failed'));

      showNotification(result.message || t('calendar_events.removed'), 'success');
      await loadCalendar();
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
