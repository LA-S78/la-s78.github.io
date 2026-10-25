/**
 * js/calendar.js - Kingdom War & Alliance Event Timeline Controller
 * Manages operations, presets, time-conversion, and scoped perspectives.
 */

(async function () {
  const elLoading = document.getElementById('loading-state');
  const elError = document.getElementById('error-state');
  const elContent = document.getElementById('calendar-content');
  const elNotification = document.getElementById('action-notification');
  const filterSelect = document.getElementById('cal-scope-filter');
  const filterStatusTag = document.getElementById('filter-status-tag');
  const filterToolbar = document.getElementById('cal-filter-toolbar');

  let resetClockInterval = null;

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

  const isManagementSession = (tokenPayload && (!tokenPayload.exp || Date.now() < tokenPayload.exp)) || isDevPreview;
  const sessionScope = isManagementSession ? (tokenPayload?.scope || 'WLO') : null;
  const isGlobalAdmin = sessionScope?.toLowerCase() === 'global';

  const activeAlliance = (!isGlobalAdmin && sessionScope)
    ? sessionScope.trim()
    : (allianceParam || null);

  let allEvents = [];

  // 2. Fetch Live Calendar Data
  async function loadCalendar() {
    try {
      const query = activeAlliance ? `?alliance=${encodeURIComponent(activeAlliance)}` : '';
      const res = await fetch(`/api/calendar${query}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      allEvents = data.events || [];
      renderHero(data.status, data.capitolHolder);
      setupFilterOptions();
      applyFilterAndRender();
    } catch (err) {
      if (elLoading) elLoading.style.display = 'none';
      if (elError) {
        elError.style.display = 'block';
        elError.textContent = `Failed to load calendar: ${err.message}`;
      }
    }
  }

  // 3. Render Hero & Reset Clock
  function renderHero(status, capitolHolder) {
    if (elLoading) elLoading.style.display = 'none';
    if (elContent) elContent.style.display = 'block';

    const heroBadge = document.getElementById('hero-phase-badge');
    if (heroBadge) {
      heroBadge.textContent = status.isKW ? '⚔️ Kingdom War Active' : '🛡️ NAP Rest Week';
      heroBadge.className = `cal-badge ${status.isKW ? 'badge-kw' : 'badge-off'}`;
    }

    const titleEl = document.getElementById('hero-phase-title');
    const subEl = document.getElementById('hero-phase-subtitle');
    const capHolderEl = document.getElementById('hero-capitol-holder');
    const capRankEl = document.getElementById('hero-capitol-rank');
    const cycleProgressEl = document.getElementById('metric-cycle-progress');

    if (titleEl) titleEl.textContent = status.phaseName;
    if (subEl) {
      subEl.textContent = status.isKW
        ? 'Double reward allotments active. Prepare for Saturday Kingdom War confrontation.'
        : 'Standard single allocation. Fortresses and territory restructuring active.';
    }

    if (capHolderEl) capHolderEl.textContent = capitolHolder;
    if (capRankEl) capRankEl.textContent = `Rank #${status.capitolRank} Privilege`;
    if (cycleProgressEl) cycleProgressEl.textContent = `Day ${status.cycleDay} of 28 (Week ${status.currentWeekNumber})`;

    const kwBox = document.getElementById('metric-kw-box');
    const kwCountdown = document.getElementById('metric-kw-countdown');
    if (kwBox && kwCountdown) {
      if (status.isKW) {
        kwBox.style.opacity = '1';
        const kwDate = new Date(status.kwBattleTimestamp * 1000);
        kwCountdown.textContent = status.isKWBattleDay
          ? '🔥 TODAY'
          : kwDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      } else {
        kwBox.style.opacity = '0.5';
        kwCountdown.textContent = 'None (Rest)';
      }
    }

    function updateResetClock() {
      const now = Date.now();
      const diff = Math.max(0, (status.nextResetTimestamp * 1000) - now);
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      const countdownEl = document.getElementById('metric-reset-countdown');
      if (countdownEl) {
        countdownEl.textContent =
          `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
    }

    if (resetClockInterval) clearInterval(resetClockInterval);
    updateResetClock();
    resetClockInterval = setInterval(updateResetClock, 1000);
  }

  // 4. Filter Toolbar
  function setupFilterOptions() {
    if (!filterSelect || !filterToolbar) return;
    filterSelect.innerHTML = '';

    if (activeAlliance) {
      filterToolbar.style.display = 'flex';

      const optCombined = document.createElement('option');
      optCombined.value = 'combined';
      optCombined.textContent = `🌐 Combined (Kingdom + [${activeAlliance}])`;
      filterSelect.appendChild(optCombined);

      const optAlliance = document.createElement('option');
      optAlliance.value = activeAlliance;
      optAlliance.textContent = `🛡️ [${activeAlliance}] Internal Only`;
      filterSelect.appendChild(optAlliance);

      const optGlobal = document.createElement('option');
      optGlobal.value = 'global';
      optGlobal.textContent = '👑 Kingdom Operations Only';
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
      filtered = allEvents.filter(e => !e.scope || e.scope.toLowerCase() === 'global' || e.type === 'war' || e.type === 'rotation');
      if (filterStatusTag) filterStatusTag.style.display = 'none';
    } else if (selected === 'combined') {
      filtered = allEvents.filter(e => {
        if (!e.scope || e.scope.toLowerCase() === 'global' || e.type === 'war' || e.type === 'rotation') return true;
        return e.scope.trim().toLowerCase() === activeAlliance.toLowerCase();
      });
      if (filterStatusTag) {
        filterStatusTag.style.display = 'block';
        filterStatusTag.textContent = `🛡️ [${activeAlliance}] Operations Active`;
      }
    } else {
      filtered = allEvents.filter(e => e.scope && e.scope.trim().toLowerCase() === activeAlliance.toLowerCase());
      if (filterStatusTag) {
        filterStatusTag.style.display = 'block';
        filterStatusTag.textContent = `🛡️ [${activeAlliance}] Internal Only`;
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
      timelineContainer.innerHTML = '<div class="cal-status-banner">No operations scheduled for this perspective.</div>';
      return;
    }

    timelineContainer.innerHTML = eventsList.map((evt) => {
      const start = new Date(evt.start);
      const gtHours = (start.getUTCHours() - 2 + 24) % 24;
      const gtMins = String(start.getUTCMinutes()).padStart(2, '0');
      const gtTimeStr = evt.allDay ? 'All Day' : `${String(gtHours).padStart(2, '0')}:${gtMins} GT`;
      const localDateStr = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      const localTimeStr = evt.allDay ? '' : ` • ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      let recurrenceLabel = '';
      if (evt.recurrence === '2days') recurrenceLabel = '<span class="event-tag-pill pill-recurring">🔁 Every 2 Days</span>';
      else if (evt.recurrence === 'weekly') recurrenceLabel = '<span class="event-tag-pill pill-recurring">🔁 Weekly</span>';

      const forceLabel = evt.notify_target === 'everyone' ? '<span class="event-tag-pill pill-force">🚨 Mandatory</span>' : '';
      const borderStyle = evt.color ? `border-left-color: ${evt.color} !important;` : '';

      const canDelete = isManagementSession && evt.id && evt.id.startsWith('evt-') &&
        (sessionScope && evt.scope && evt.scope.toLowerCase() === sessionScope.toLowerCase());

      return `
        <div class="timeline-event-row event-${evt.type || 'custom'}" style="${borderStyle}">
          <div class="event-main">
            <div class="event-title-line">
              <span class="event-title">${evt.title}</span>
              ${recurrenceLabel}
              ${forceLabel}
            </div>
            <div class="event-desc">${evt.description || ''}</div>
          </div>
          <div class="event-actions-group">
            <div class="event-time-block">
              <div class="time-gt">${gtTimeStr}</div>
              <div>${localDateStr}${localTimeStr}</div>
            </div>
            ${canDelete ? `<button type="button" class="btn-delete-event" data-event-id="${evt.id}">🗑️ Delete</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    timelineContainer.querySelectorAll('.btn-delete-event').forEach(btn => {
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
      if (mgmtScopeTag) mgmtScopeTag.textContent = '👑 KINGDOM ADMIN';
      if (mgmtScopeDesc) mgmtScopeDesc.textContent = 'Scheduling Kingdom-wide alerts and operations';
      if (formHeading) formHeading.textContent = 'Create Kingdom Operation ([GLOBAL])';
    } else {
      if (mgmtScopeTag) mgmtScopeTag.textContent = `🛡️ [${sessionScope}] LEADERSHIP`;
      if (mgmtScopeDesc) mgmtScopeDesc.textContent = `Managing internal operations for [${sessionScope}]`;
      if (formHeading) formHeading.textContent = `Create [${sessionScope}] Operation`;
    }

    const formEl = document.getElementById('form-create-event');
    const btnToggle = document.getElementById('btn-toggle-event-form');
    const btnCancel = document.getElementById('btn-cancel-event-form');
    const notifySelect = document.getElementById('evt-input-notify');
    const customRoleInput = document.getElementById('evt-input-role-id');
    const presetSelect = document.getElementById('evt-input-preset');
    const submitBtn = document.getElementById('btn-submit-event');

    const OPERATION_PRESETS = {
      crystal_cluster: { title: "Crystal Cluster Valley", color: "#7946C0", duration: 0.5, recurrence: "weekly", description: "Free For All event every Sunday" },
      elixir_scramble: { title: "Elixir Scramble", color: "#24523B", duration: 0.5, recurrence: "weekly", description: "Team Battle event every Friday" },
      survival_battle: { title: "Survival Battle", color: "#CF6214", duration: 4.0, recurrence: "none", description: "Complete tasks to earn rewards" },
      kill_event: { title: "Kill Event", color: "#B12A2A", duration: 24.0, recurrence: "none", description: "Invaders from other servers arrive! Shield up" },
      kvk_battle: { title: "Kingdom vs Kingdom Battle", color: "#8ED2EF", duration: 1.0, recurrence: "none", description: "The battle for the Royal Castle begins!" },
      gear_event: { title: "Gear Event", color: "#303A40", duration: 48.0, recurrence: "none", description: "Get rewarded for upgrading gear" },
      cheese_trap: { title: "Cheese Trap", color: "#FAB22F", duration: 0.5, recurrence: "2days", description: "Help fend off the Cheese Thief" }
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
            submitBtn.style.color = (selected.color === '#FAB22F' || selected.color === '#8ED2EF') ? '#0b0d11' : '#ffffff';
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
      btnCancel.addEventListener('click', () => { formEl.style.display = 'none'; });
    }

    if (formEl) {
      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();

        const timeVal = document.getElementById('evt-input-time').value;
        const [, mm] = timeVal.split(':').map(Number);
        if (mm % 5 !== 0) {
          showNotification('Game Time must be set in 5-minute increments (:00, :05, :10, etc.)', 'error');
          return;
        }

        const notifyTarget = notifySelect.value;
        const customRoleId = customRoleInput.value.trim();

        if (notifyTarget === 'custom_role' && !/^\d{17,20}$/.test(customRoleId)) {
          showNotification('Please enter a valid 17-20 digit Discord Role ID for the custom alert target.', 'error');
          customRoleInput.focus();
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Publishing...';

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
            description: document.getElementById('evt-input-details').value
          }
        };

        try {
          const res = await fetch('/api/manage-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Failed to save event');

          showNotification(result.message || 'Operation published successfully!', 'success');
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
          submitBtn.textContent = 'Publish to Calendar';
        }
      });
    }
  }

  // 7. Delete Event Handler
  async function handleDeleteEvent(eventId) {
    if (!confirm('Are you sure you want to remove this operation from the calendar?')) return;

    try {
      const res = await fetch('/api/manage-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenParam, action: 'delete', eventId })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to delete event');

      showNotification(result.message || 'Operation removed.', 'success');
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
})();