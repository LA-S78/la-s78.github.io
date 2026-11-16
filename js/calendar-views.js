/**
 * js/calendar-views.js - the calendar's events "at a glance" (owner design, 2026-11-15).
 *
 * Two views over the same events, with a switch (remembered on this device):
 *   - Week: a cycle week (Monday-Sunday, Game Time) as a strip of days; ‹ › go one week back
 *     or one week ahead (keeping the weekday; the week with today opens on today).
 *   - Cycle: the cycle's four weeks as a grid (a row per week, named, with its Capitol seat,
 *     the week's "king").
 *   In both, tapping a day lists that day's events underneath (today at first) and the page
 *     stays where it is (owner, 2026-11-15: a whole week listed was too long). Today has a "Now"
 *     line; an event under way says "Happening now · ends in …", the next one "Next up · in …".
 * Chips for the event types (Server, Alliance, Kingdom War, Capitol) show or hide each type
 * (they replace the old Perspective menu), and a dropdown keeps one event type (Cheese Trap,
 * Crystal Cluster Valley…: the types on the calendar), in every view. Each event shows its
 * type's line icon and, when the type names a guide, a link to it (_data/event_types.yml).
 *
 * Days are Game Time days (UTC-2; the game resets at 00:00 GT). Times show Game Time first,
 * then the reader's own time. The events come from /api/calendar (via js/calendar.js), which
 * sends last week, the whole cycle and the week after; status.rotation names each week's seat.
 *
 * js/calendar.js calls window.CalendarViews.create(container, options) once and then
 * view.render(events, status) whenever the data changes; the view redraws itself every
 * minute so the "Now" line and the countdowns move.
 */
(function () {
  const GT_OFFSET_MS = -2 * 3600000; // Game Time = UTC-2
  const DAY = 86400000;
  const WEEK = 7 * DAY;
  const KINDS = ['server', 'alliance', 'war', 'rotation'];
  const VIEW_KEY = 'cal-view';
  const store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch (e) {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch (e) {
        /* private mode: not remembered */
      }
    },
  };

  /** A date shifted to Game Time, to read with getUTC* (and format with timeZone: 'UTC'). */
  const gt = (ms) => new Date(ms + GT_OFFSET_MS);
  /** 00:00 GT of the day `ms` falls on (as a real time in ms). */
  const dayStart = (ms) => {
    const g = gt(ms);
    return Date.UTC(g.getUTCFullYear(), g.getUTCMonth(), g.getUTCDate()) - GT_OFFSET_MS;
  };
  const pad = (n) => String(n).padStart(2, '0');
  const gtTime = (ms) => `${pad(gt(ms).getUTCHours())}:${pad(gt(ms).getUTCMinutes())}`;

  /** Which colour and chip an event belongs to. */
  function kindOf(evt) {
    if (evt.type === 'war') return 'war';
    if (evt.type === 'rotation') return 'rotation';
    return evt.scope && String(evt.scope).toLowerCase() !== 'global' ? 'alliance' : 'server';
  }

  // ---------- the event types (_data/event_types.yml, put in the page by calendar.html) ----------
  let pool = null;
  const norm = (text) =>
    String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  /** { types, icons, byId, byTitle }: the types, the other icons, and lookups. */
  function eventTypes() {
    if (pool) return pool;
    const read = (id) => {
      try {
        return JSON.parse(document.getElementById(id)?.textContent || 'null');
      } catch (e) {
        return null;
      }
    };
    const data = read('event-types') || {};
    const names = read('event-type-names') || {}; // { lang: { <id>_title: name, ... } }
    const types = data.types || [];
    const byTitle = new Map();
    for (const type of types) {
      for (const lang of Object.values(names)) {
        const name = lang?.[`${type.id}_title`];
        if (name) byTitle.set(norm(name), type.id);
      }
      for (const old of type.match || []) byTitle.set(norm(old), type.id);
    }
    pool = {
      types,
      icons: data.icons || {},
      byId: Object.fromEntries(types.map((x) => [x.id, x])),
      byTitle,
    };
    return pool;
  }
  /**
   * An event's type: the one it stores (events made from a form preset, and the site's own
   * milestones), else the type whose name (in any language) or older name is its title
   * (without "[TAG] "), else none.
   */
  function typeOf(evt) {
    const { byId, byTitle } = eventTypes();
    if (evt.event_type && byId[evt.event_type]) return evt.event_type;
    return byTitle.get(norm(String(evt.title || '').replace(/^\[[^\]]+\]\s*/, ''))) || null;
  }
  /** A line icon (the SVG inside a 24x24 icon, from the event types file). */
  const svgIcon = (inner, cls = 'cal-ic') =>
    inner
      ? `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`
      : '';

  function create(container, opts) {
    const { t, tn, esc } = opts;
    // The page's language, in the reader's own regional style when it matches (en-GB: 16 Nov,
    // 16:30; en-US: Nov 16, 4:30 PM)
    const lang = document.documentElement.lang || 'en';
    const locale =
      (navigator.languages || [navigator.language]).find((l) => String(l).split('-')[0] === lang) ||
      lang;
    const dateText = (ms, o) => gt(ms).toLocaleDateString(locale, { ...o, timeZone: 'UTC' });
    const localTime = (ms) =>
      new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const duration = (ms) => {
      const m = Math.max(1, Math.round(ms / 60000));
      if (m < 60) return t('calendar.dur_m', { m });
      const h = Math.floor(m / 60);
      if (h < 24)
        return m % 60 ? t('calendar.dur_hm', { h, m: m % 60 }) : t('calendar.dur_h', { h });
      return t('calendar.dur_dh', { d: Math.floor(h / 24), h: h % 24 });
    };
    const KIND_LABEL = {
      server: t('calendar.kind_server'),
      alliance: t('calendar.kind_alliance'),
      war: t('calendar.kind_war'),
      rotation: t('calendar.kind_capitol'),
    };

    const state = {
      view: store.get(VIEW_KEY) === 'cycle' ? 'cycle' : 'week',
      week: 0, // -1, 0, 1: last, this, next week
      weekday: null, // the weekday last picked in the week view (0 = Monday), kept across weeks
      fromCycle: false, // just switched to the week view: show the week of the day picked
      day: null, // the day picked in the cycle view (00:00 GT, ms)
      kinds: new Set(KINDS),
      type: '', // the event type picked in the dropdown: '' all, 'other' events of no type
      events: [],
      status: null,
    };

    // ---------- the controls (drawn once) ----------
    container.innerHTML = `
      <div class="cal-toolbar">
        <div class="segmented-control cal-view-switch" role="group" aria-label="${esc(t('calendar.view_label'))}">
          <button type="button" class="toggle-btn" data-view="week" aria-pressed="false">${esc(t('calendar.view_week'))}</button>
          <button type="button" class="toggle-btn" data-view="cycle" aria-pressed="false">${esc(t('calendar.view_cycle'))}</button>
        </div>
        <select class="cal-type-select" data-site-select aria-label="${esc(t('calendar.type_label'))}"></select>
      </div>
      <div class="cal-chips" role="group" aria-label="${esc(t('calendar.show_label'))}">
        ${KINDS.map(
          (k) =>
            `<button type="button" class="cal-chip k-${k}" data-kind="${k}" aria-pressed="true"><i class="cal-dot" aria-hidden="true"></i>${esc(KIND_LABEL[k])}</button>`,
        ).join('')}
      </div>
      <div class="cal-view" aria-live="polite"></div>`;
    const viewEl = container.querySelector('.cal-view');
    const typeSelect = container.querySelector('.cal-type-select');
    // The site's dropdown (js/site-select.js): each type with its icon
    window.SiteSelect?.enhance(typeSelect);
    typeSelect.addEventListener('change', () => {
      state.type = typeSelect.value;
      draw();
    });
    const typeName = (id) => t(`event_presets.${id}_title`);
    /** The dropdown: the types on the calendar (by name), then "Other events". */
    function fillTypes() {
      const present = new Set(state.events.map((e) => e.type || 'other'));
      const ids = [...present]
        .filter((id) => id !== 'other')
        .sort((a, b) => typeName(a).localeCompare(typeName(b), lang));
      if (present.has('other')) ids.push('other');
      if (state.type && !present.has(state.type)) state.type = '';
      const { byId, icons } = eventTypes();
      const iconOf = (id) => esc(id === 'other' ? icons.server || '' : byId[id]?.icon || '');
      typeSelect.innerHTML = [
        `<option value="">${esc(t('calendar.type_all'))}</option>`,
        ...ids.map(
          (id) =>
            `<option value="${esc(id)}" data-icon="${iconOf(id)}">${esc(id === 'other' ? t('calendar.type_other') : typeName(id))}</option>`,
        ),
      ].join('');
      typeSelect.value = state.type;
      window.SiteSelect?.sync(typeSelect);
    }

    container.querySelectorAll('[data-view]').forEach((btn) =>
      btn.addEventListener('click', () => {
        if (state.view !== btn.dataset.view && btn.dataset.view === 'week') state.fromCycle = true;
        state.keepHeight = 0;
        state.view = btn.dataset.view;
        store.set(VIEW_KEY, state.view);
        draw();
      }),
    );
    container.querySelectorAll('[data-kind]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const k = btn.dataset.kind;
        // Turning off the last one would show nothing: it turns all back on instead
        if (state.kinds.has(k) && state.kinds.size === 1) KINDS.forEach((x) => state.kinds.add(x));
        else if (state.kinds.has(k)) state.kinds.delete(k);
        else state.kinds.add(k);
        draw();
      }),
    );
    // Clicks inside the view: week arrows, a day, Edit/Delete
    viewEl.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-week-step]');
      if (nav && !nav.disabled) {
        state.week = Math.max(-1, Math.min(1, state.week + Number(nav.dataset.weekStep)));
        state.day = null; // today if it's in that week, else the same weekday (see draw)
        state.keepHeight = 0;
        draw();
        return;
      }
      const dayBtn = e.target.closest('button[data-day]'); // a day in the strip or grid
      if (dayBtn) {
        // Both views list the day picked; the page doesn't move (owner, 2026-11-15). A day
        // with fewer events would make the page shorter and the browser pull it up, so the
        // list keeps at least the height it had while days are picked (reset by a new week
        // or view)
        const was = viewEl.querySelector('.ag')?.offsetHeight || 0;
        state.day = Number(dayBtn.dataset.day);
        draw();
        const ag = viewEl.querySelector('.ag');
        if (ag) {
          state.keepHeight = Math.max(state.keepHeight || 0, was);
          ag.style.minHeight = `${state.keepHeight}px`;
        }
        return;
      }
      const edit = e.target.closest('.btn-edit-event');
      if (edit) opts.onEdit?.(edit.dataset.eventId);
      const del = e.target.closest('.btn-delete-event');
      if (del) opts.onDelete?.(del.dataset.eventId);
    });

    // ---------- drawing ----------
    function visible(evt) {
      if (!state.kinds.has(evt.kind)) return false;
      if (!state.type) return true;
      return state.type === 'other' ? !evt.type : evt.type === state.type;
    }

    function draw() {
      if (!container.isConnected || !state.status) return;
      const now = Date.now();
      const today0 = dayStart(now);
      const status = state.status;
      const cycle0 = today0 - (Number(status.cycleDay) - 1) * DAY;
      const thisWeek0 = today0 - (Number(status.dayOfWeekNumber) - 1) * DAY;
      const rotation = status.rotation || [];
      const events = state.events.filter(visible);
      const onDay = (d0) => events.filter((e) => dayStart(e.s) === d0);
      const live = events.filter((e) => !e.allDay && e.s <= now && e.e > now);
      const next = events.find((e) => !e.allDay && e.s > now);

      container.querySelectorAll('[data-view]').forEach((b) => {
        const on = b.dataset.view === state.view;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      container.querySelectorAll('[data-kind]').forEach((b) => {
        b.setAttribute('aria-pressed', state.kinds.has(b.dataset.kind) ? 'true' : 'false');
        b.hidden = b.dataset.kind === 'alliance' && !opts.hasAlliance?.();
      });

      /** Which week of the cycle a week starting at w0 is (0-3, wrapping across cycles). */
      const slot = (w0) => {
        const i = Math.round((w0 - cycle0) / WEEK);
        return { i, seat: i >= 0 && i < 4 ? rotation[i] : null, wrapped: ((i % 4) + 4) % 4 };
      };
      const weekName = (w0) => {
        const r = rotation[slot(w0).wrapped];
        if (!r) return '';
        return r.isKW ? t('common.kw_week', { n: r.clockWeek }) : t('common.off_week');
      };
      const shortName = (w0) => {
        const r = rotation[slot(w0).wrapped];
        if (!r) return '';
        return r.isKW ? t('calendar.kvk_short', { n: r.clockWeek }) : t('calendar.off_short');
      };
      const { icons, byId } = eventTypes();
      const crown = svgIcon(icons.crown, 'cal-ic is-crown');
      const kingHtml = (w0, compact) => {
        const { seat } = slot(w0);
        // Another cycle: a past week's seat isn't sent; a coming one is decided at its reset
        if (!seat) {
          if (w0 < cycle0) return '';
          return `<span class="cal-king is-unknown">${crown}${esc(t('calendar.king_unknown'))}</span>`;
        }
        const who = seat.tag
          ? `<span class="ally-text"${seat.color ? ` style="--ally: ${esc(seat.color)}"` : ''}>[${esc(seat.tag)}]</span>`
          : esc(t('calendar.rank', { rank: seat.seat }));
        if (compact) return `<span class="cal-king">${crown}${who}</span>`;
        const when = seat.captured ? t('calendar.captured_friday') : t('calendar.captures_friday');
        return `<span class="cal-king">${crown}${who} · ${esc(when)}</span>`;
      };
      const dots = (list) =>
        [...new Set(list.map((e) => e.kind))]
          .sort((a, b) => KINDS.indexOf(a) - KINDS.indexOf(b))
          .map((k) => `<i class="cal-dot k-${k}"></i>`)
          .join('');

      const row = (e) => {
        const isLive = live.includes(e);
        const isNext = e === next;
        const past = e.e <= now;
        const badge = isLive
          ? `<span class="ag-badge is-live"><i aria-hidden="true"></i>${esc(t('calendar.happening_now', { time: duration(e.e - now) }))}</span>`
          : isNext
            ? `<span class="ag-badge is-next">${esc(t('calendar.next_up', { time: duration(e.s - now) }))}</span>`
            : '';
        const pills = [
          e.recurrence === '2days'
            ? `<span class="ag-pill">${svgIcon(icons.repeats, 'cal-ic xs')}${esc(t('calendar.every_2_days'))}</span>`
            : '',
          e.recurrence === 'weekly'
            ? `<span class="ag-pill">${svgIcon(icons.repeats, 'cal-ic xs')}${esc(t('calendar.weekly'))}</span>`
            : '',
          e.notify_target === 'everyone'
            ? `<span class="ag-pill is-must">${svgIcon(icons.mandatory, 'cal-ic xs')}${esc(t('calendar.mandatory'))}</span>`
            : '',
        ].join('');
        const type = e.type ? byId[e.type] : null;
        // The event's colour (alliance events) and its type's picture behind the card
        const styles = [
          e.kind === 'alliance' && e.color ? `--k: ${esc(e.color)}` : '',
          type?.picture ? `--pic: url('/images/events/${esc(type.picture)}')` : '',
        ].filter(Boolean);
        const color = styles.length ? ` style="${styles.join('; ')}"` : '';
        // Its type's icon (else an alliance shield or the server flag) and guide link
        const icon = svgIcon(type?.icon || (e.kind === 'alliance' ? icons.alliance : icons.server));
        const guide = type?.guide
          ? `<a class="ag-guide" href="/${esc(lang)}/guides/${esc(type.guide)}.html">${svgIcon(icons.guide, 'cal-ic xs')}${esc(t('calendar.read_guide'))}</a>`
          : '';
        const actions = opts.canEdit?.(e)
          ? `<div class="ag-actions"><button type="button" class="btn-edit-event" data-event-id="${esc(e.id)}">${esc(t('calendar.edit'))}</button>
             <button type="button" class="btn-delete-event" data-event-id="${esc(e.id)}">${esc(t('calendar.delete'))}</button></div>`
          : '';
        return `<li class="ag-event k-${e.kind}${type?.picture ? ' has-pic' : ''}${isLive ? ' is-live' : ''}${isNext ? ' is-next' : ''}${past ? ' is-past' : ''}"${color}>
          <div class="ag-time">${
            e.allDay
              ? `<b>${esc(t('calendar.all_day'))}</b>`
              : `<b>${gtTime(e.s)}</b><small>GT</small><span>${esc(t('calendar.local_time', { time: localTime(e.s) }))}</span>`
          }</div>
          <div class="ag-body">${badge}
            <div class="ag-title"><span class="ag-ic">${icon}</span><span>${esc(e.title)}</span></div>
            <div class="ag-meta"><span class="ag-kind">${esc(KIND_LABEL[e.kind])}</span>${
              e.allDay
                ? ''
                : e.e - e.s >= DAY
                  ? `<span>${esc(t('calendar.until', { when: `${dateText(e.e, { weekday: 'short' })} ${gtTime(e.e)}` }))}</span>`
                  : `<span>${gtTime(e.s)}–${gtTime(e.e)} GT</span>`
            }${pills}${guide}</div>
            ${e.description ? `<div class="ag-desc">${esc(e.description)}</div>` : ''}
            ${actions}
          </div></li>`;
      };
      const dayTitle = (d0) => {
        const diff = Math.round((d0 - today0) / DAY);
        const date = dateText(d0, { weekday: 'long', day: 'numeric', month: 'short' });
        const word = {
          0: 'calendar.day_today',
          1: 'calendar.day_tomorrow',
          [-1]: 'calendar.day_yesterday',
        }[diff];
        return word ? `<b>${esc(t(word))}</b> · ${esc(date)}` : `<b>${esc(date)}</b>`;
      };
      const dayBlock = (d0) => {
        const list = onDay(d0);
        const isToday = d0 === today0;
        const items = list.map(row);
        if (isToday) {
          const at = list.findIndex((e) => !e.allDay && e.e > now);
          items.splice(
            at === -1 ? items.length : at,
            0,
            `<li class="ag-now"><span>${esc(t('calendar.now_line', { time: gtTime(now) }))}</span></li>`,
          );
        }
        const count = list.length ? esc(tn('calendar.events_count', list.length)) : '';
        return `<section class="ag-day${isToday ? ' is-today' : ''}${d0 < today0 ? ' is-pastday' : ''}" data-day="${d0}">
          <h3 class="ag-day-title"><span>${dayTitle(d0)}</span><span class="ag-count">${count}</span></h3>
          ${list.length ? `<ol class="ag-list">${items.join('')}</ol>` : `<p class="ag-empty">${esc(t('calendar.nothing_planned'))}</p>`}
        </section>`;
      };
      const dayCell = (d0, cls) => {
        const list = onDay(d0);
        const war = list.some((e) => e.kind === 'war');
        const classes = [
          cls,
          d0 === today0 && 'is-today',
          d0 < today0 && 'is-past',
          war && 'has-war',
          d0 === state.day && 'is-selected',
        ]
          .filter(Boolean)
          .join(' ');
        const label = `${dateText(d0, { weekday: 'long', day: 'numeric', month: 'long' })}${list.length ? ` · ${tn('calendar.events_count', list.length)}` : ''}`;
        return { classes, list, label };
      };

      let html;
      if (state.view === 'cycle') {
        if (state.day === null || state.day < cycle0 || state.day >= cycle0 + 4 * WEEK)
          state.day = today0;
        const head = [...Array(7)]
          .map((_, i) => `<span>${esc(dateText(cycle0 + i * DAY, { weekday: 'short' }))}</span>`)
          .join('');
        const rows = [0, 1, 2, 3]
          .map((w) => {
            const w0 = cycle0 + w * WEEK;
            const cells = [...Array(7)]
              .map((_, i) => {
                const d0 = w0 + i * DAY;
                const c = dayCell(d0, 'cy-day');
                return `<button type="button" class="${c.classes}" data-day="${d0}" aria-label="${esc(c.label)}"${d0 === state.day ? ' aria-current="date"' : ''}>
                  <span class="cy-num">${gt(d0).getUTCDate()}</span><span class="cal-dots">${dots(c.list)}</span></button>`;
              })
              .join('');
            const current = thisWeek0 === w0;
            return `<div class="cy-row${current ? ' is-current' : ''}">
              <div class="cy-week"><b>${esc(shortName(w0))}</b>${kingHtml(w0, true)}</div>
              <div class="cy-cells">${cells}</div></div>`;
          })
          .join('');
        html = `<div class="cal-range"><b>${esc(t('calendar.this_cycle'))}</b><span>${esc(dateText(cycle0, { day: 'numeric', month: 'short' }))} – ${esc(dateText(cycle0 + 27 * DAY, { day: 'numeric', month: 'short' }))}</span></div>
          <div class="cy-grid"><div class="cy-head"><span></span><div class="cy-cells">${head}</div></div>${rows}</div>
          <div class="ag">${dayBlock(state.day)}</div>`;
      } else {
        // Just switched from the cycle view: the week of the day picked there, if it's one the
        // week view shows (last, this or next week); else this week
        if (state.fromCycle) {
          state.fromCycle = false;
          const off = state.day === null ? 0 : Math.floor((state.day - thisWeek0) / WEEK);
          state.week = off >= -1 && off <= 1 ? off : 0;
          if (off < -1 || off > 1) state.day = null;
        }
        const w0 = thisWeek0 + state.week * WEEK;
        // The day listed: the one picked in this week, else today (when it's in this week),
        // else the weekday picked before (moving between weeks keeps it), else Monday
        if (state.day === null || state.day < w0 || state.day >= w0 + WEEK) {
          const weekday = state.weekday ?? 0;
          state.day =
            today0 >= w0 && today0 < w0 + WEEK
              ? today0
              : w0 + Math.max(0, Math.min(6, weekday)) * DAY;
        }
        state.weekday = Math.round((state.day - w0) / DAY);
        const days = [...Array(7)].map((_, i) => w0 + i * DAY);
        const label = t(
          ['calendar.last_week', 'calendar.this_week', 'calendar.next_week'][state.week + 1],
        );
        const strip = days
          .map((d0) => {
            const c = dayCell(d0, 'wk-day');
            return `<button type="button" class="${c.classes}" data-day="${d0}" aria-label="${esc(c.label)}">
              <span class="wk-name">${esc(d0 === today0 ? t('calendar.day_today') : dateText(d0, { weekday: 'short' }))}</span>
              <span class="wk-num">${gt(d0).getUTCDate()}</span><span class="cal-dots">${dots(c.list)}</span>
              <span class="wk-count">${c.list.length || ''}</span></button>`;
          })
          .join('');
        html = `<div class="wk-nav">
            <button type="button" class="wk-arrow" data-week-step="-1" ${state.week <= -1 ? 'disabled' : ''} aria-label="${esc(t('calendar.prev_week'))}">‹</button>
            <div class="wk-label"><b>${esc(label)}</b>
              <span>${esc(weekName(w0))} · ${esc(dateText(w0, { day: 'numeric', month: 'short' }))} – ${esc(dateText(w0 + 6 * DAY, { day: 'numeric', month: 'short' }))}</span>
              ${kingHtml(w0, false)}</div>
            <button type="button" class="wk-arrow" data-week-step="1" ${state.week >= 1 ? 'disabled' : ''} aria-label="${esc(t('calendar.next_week_aria'))}">›</button>
          </div>
          <div class="wk-strip">${strip}</div>
          <div class="ag">${dayBlock(state.day)}</div>`;
      }
      viewEl.innerHTML = html;
    }

    // Redraw each minute: the "Now" line, the countdowns, what is past
    const timer = setInterval(() => {
      if (!container.isConnected) clearInterval(timer);
      else draw();
    }, 60000);

    return {
      /** events: as /api/calendar sends them, already translated (title, description). */
      render(events, status) {
        state.status = status;
        state.events = (events || [])
          .map((e) => {
            const s = new Date(e.start).getTime();
            const end = new Date(e.end || e.start).getTime();
            return {
              ...e,
              s,
              e: Number.isFinite(end) ? end : s,
              kind: kindOf(e),
              type: typeOf(e),
            };
          })
          .filter((e) => Number.isFinite(e.s))
          .sort((a, b) => a.s - b.s);
        fillTypes();
        draw();
      },
    };
  }

  window.CalendarViews = { create, kindOf, eventTypes, typeOf };
})();
