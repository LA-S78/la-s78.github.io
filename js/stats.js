// The Alliance page's Stats tab (owner request, 2026-11-19): views of the NAP's numbers over
// time, from a daily snapshot of the Last Asylum Tracker taken just before each reset
// (api/_stats.js; /api/state?scope=stats). One view at a time, to keep the tab compact.
// First view: NAP growth, each NAP alliance's Might as a line, and a table of Might today
// with the change over 7 and 30 days. Runs on the full page load and on Turbo visits.

const esc = (v) => window.escapeHtml(v);
const t = (key, vars) => (window.t ? window.t(`stats.${key}`, vars) : key);

// Lines for alliances without a colour of their own
const PALETTE = [
  '#e6b450',
  '#59c2ff',
  '#ff8f40',
  '#c2d94c',
  '#d2a6ff',
  '#f07178',
  '#95e6cb',
  '#ffb454',
];
const DAY_MS = 86400000;

/** 10561203222 → "10.56B" */
function might(n) {
  if (!Number.isFinite(n)) return t('no_number');
  return n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : `${(n / 1e6).toFixed(0)}M`;
}

/** +123456789 → "+123.5M" (or B), with its sign. */
function change(n) {
  if (!Number.isFinite(n)) return t('no_number');
  const abs = Math.abs(n);
  const text = abs >= 1e9 ? `${(abs / 1e9).toFixed(2)}B` : `${(abs / 1e6).toFixed(1)}M`;
  return `${n >= 0 ? '+' : '−'}${text}`;
}

const dateLabel = (day) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** The value on a day, or on the nearest earlier day that has one (within `within` days). */
function valueOn(series, days, day, within = 3) {
  const i = days.indexOf(day);
  for (let j = i; j >= 0 && j >= i - within; j--) {
    if (Number.isFinite(series[days[j]])) return series[days[j]];
  }
  return null;
}

function growthChart(data, days, hidden) {
  const lines = data.nap
    .map((a, i) => ({ ...a, color: a.color || PALETTE[i % PALETTE.length] }))
    .filter((a) => data.alliances[a.tag] && !hidden.has(a.tag));
  const W = 600;
  const H = 260;
  const pad = { l: 46, r: 12, t: 12, b: 26 };
  const values = lines.flatMap((a) =>
    days.map((d) => data.alliances[a.tag][d]).filter(Number.isFinite),
  );
  if (days.length < 2 || !values.length) return '';
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const span = hi - lo || hi * 0.05 || 1;
  lo = Math.max(0, lo - span * 0.08);
  hi += span * 0.08;
  const x = (i) => pad.l + (i / (days.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => lo + (hi - lo) * k);
  const grid = ticks
    .map(
      (v) =>
        `<line class="stats-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"></line><text class="stats-axis" x="${pad.l - 6}" y="${y(v).toFixed(1)}" dy="0.32em" text-anchor="end">${esc(might(v))}</text>`,
    )
    .join('');
  const xLabels = [0, Math.floor((days.length - 1) / 2), days.length - 1]
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .map(
      (i) =>
        `<text class="stats-axis" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}">${esc(dateLabel(days[i]))}</text>`,
    )
    .join('');
  const paths = lines
    .map((a) => {
      const pts = days
        .map((d, i) => [i, data.alliances[a.tag][d]])
        .filter(([, v]) => Number.isFinite(v));
      if (!pts.length) return '';
      const d = pts
        .map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
        .join('');
      const dots =
        pts.length <= 12
          ? pts
              .map(
                ([i, v]) =>
                  `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" fill="${esc(a.color)}"></circle>`,
              )
              .join('')
          : '';
      return `<g><title>[${esc(a.tag)}]</title><path d="${d}" fill="none" stroke="${esc(a.color)}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"></path>${dots}</g>`;
    })
    .join('');
  return `<svg class="stats-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('view_growth'))}">${grid}${xLabels}${paths}</svg>`;
}

function growthView(box, data, range, hidden) {
  const all = data.days || [];
  if (!all.length) {
    box.innerHTML = `<p class="stats-note">${esc(t('collecting'))}</p>`;
    return;
  }
  const last = all[all.length - 1];
  const from =
    range === 'all'
      ? all[0]
      : new Date(Date.parse(`${last}T12:00:00Z`) - (Number(range) - 1) * DAY_MS)
          .toISOString()
          .slice(0, 10);
  const days = all.filter((d) => d >= from);
  const dayBefore = (n) =>
    new Date(Date.parse(`${last}T12:00:00Z`) - n * DAY_MS).toISOString().slice(0, 10);
  const legend = data.nap
    .map((a, i) => ({ ...a, color: a.color || PALETTE[i % PALETTE.length] }))
    .filter((a) => data.alliances[a.tag]);
  const rows = legend
    .map((a) => {
      const s = data.alliances[a.tag];
      const now = valueOn(s, all, last, 0);
      const week =
        all.includes(dayBefore(7)) || all.some((d) => d <= dayBefore(7))
          ? valueOn(s, all, all.filter((d) => d <= dayBefore(7)).pop(), 3)
          : null;
      const month = all.some((d) => d <= dayBefore(30))
        ? valueOn(s, all, all.filter((d) => d <= dayBefore(30)).pop(), 5)
        : null;
      return {
        a,
        now,
        week: Number.isFinite(now) && Number.isFinite(week) ? now - week : null,
        month: Number.isFinite(now) && Number.isFinite(month) ? now - month : null,
      };
    })
    .sort((p, q) => (q.now ?? -1) - (p.now ?? -1));
  const cls = (n) => (Number.isFinite(n) ? (n >= 0 ? ' is-up' : ' is-down') : '');
  box.innerHTML = `
    <p class="stats-note">${esc(t('since', { date: dateLabel(all[0]) }))}${all.length < 2 ? ` ${esc(t('one_day'))}` : ''}</p>
    ${growthChart(data, days, hidden)}
    <div class="stats-legend" role="group" aria-label="${esc(t('show_hide'))}">
      ${legend.map((a) => `<button type="button" class="stats-chip${hidden.has(a.tag) ? ' is-off' : ''}" data-stats-tag="${esc(a.tag)}" aria-pressed="${!hidden.has(a.tag)}"><span class="stats-swatch" style="background:${esc(a.color)}"></span>[${esc(a.tag)}]</button>`).join('')}
    </div>
    <table class="stats-table">
      <thead><tr><th>${esc(t('col_alliance'))}</th><th>${esc(t('col_might'))}</th><th>${esc(t('col_week'))}</th><th>${esc(t('col_month'))}</th></tr></thead>
      <tbody>${rows
        .map(
          (r) =>
            `<tr><td><span class="stats-swatch" style="background:${esc(r.a.color)}"></span>[${esc(r.a.tag)}]</td><td>${esc(might(r.now))}</td><td class="stats-change${cls(r.week)}">${esc(change(r.week))}</td><td class="stats-change${cls(r.month)}">${esc(change(r.month))}</td></tr>`,
        )
        .join('')}</tbody>
    </table>`;
}

// ---------- Top players ----------

/** A small line of a player's Might over the month (millions per day; gaps skipped). */
function sparkline(series) {
  const pts = (series || []).map((v, i) => [i, v]).filter(([, v]) => Number.isFinite(v));
  if (pts.length < 2) return '<span class="stats-spark"></span>';
  const W = 72;
  const H = 22;
  const vs = pts.map(([, v]) => v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const n = series.length - 1 || 1;
  const x = (i) => (i / n) * (W - 2) + 1;
  const y = (v) => (hi === lo ? H / 2 : H - 2 - ((v - lo) / (hi - lo)) * (H - 4));
  const d = pts
    .map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join('');
  const up = vs[vs.length - 1] >= vs[0];
  return `<svg class="stats-spark ${up ? 'is-up' : 'is-down'}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}"></path></svg>`;
}

/** A player's picture: their own (from the game, no referrer) or their initial. */
function face(p) {
  return p.avatar
    ? `<img class="stats-face" src="${esc(p.avatar)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : `<span class="stats-face stats-initial">${esc((p.name || '?').charAt(0).toUpperCase())}</span>`;
}

/** Rows shown before "Show more" (the tab stays compact). */
const FIRST_ROWS = 25;

function playersView(box, top, nap, list, tag, expanded) {
  const lists = [
    ['strongest', t('list_strongest')],
    ['week', t('list_week')],
    ['month', t('list_month')],
  ];
  const all = top.lists || {};
  const tags = nap.filter((a) => all[a.tag]);
  // The alliance's own list when one is picked (each alliance has its top 15)
  const ids = (all[tag || 'all'] || {})[list] || [];
  const rows = ids
    .map((entry) => {
      const [uid, gain] = Array.isArray(entry) ? entry : [entry, null];
      const p = top.players?.[uid];
      return p ? { ...p, uid, change: gain } : null;
    })
    .filter(Boolean);
  const empty =
    list === 'week' && !(all.all?.week || []).length
      ? t('players_wait_week')
      : list === 'month' && !(all.all?.month || []).length
        ? t('players_wait_month')
        : t('players_none');
  const gain = list !== 'strongest';
  box.innerHTML = `
    <div class="stats-bar stats-subbar">
      <div class="segmented-control" role="group" aria-label="${esc(t('list_label'))}">
        ${lists.map(([k, label]) => `<button type="button" class="toggle-btn${k === list ? ' active' : ''}" data-stats-list="${k}" aria-pressed="${k === list}">${esc(label)}</button>`).join('')}
      </div>
      <label class="stats-filter"><span>${esc(t('filter_label'))}</span>
        <select data-stats-filter>
          <option value="">${esc(t('filter_all'))}</option>
          ${tags.map((a) => `<option value="${esc(a.tag)}"${a.tag === tag ? ' selected' : ''}>[${esc(a.tag)}]</option>`).join('')}
        </select>
      </label>
    </div>
    ${top.day ? `<p class="stats-note">${esc(t('players_as_of', { date: dateLabel(top.day) }))}${list === 'week' ? ` ${esc(t('week_note'))}` : ''}</p>` : ''}
    ${
      rows.length
        ? `<ol class="stats-players">${rows
            .slice(0, expanded ? rows.length : FIRST_ROWS)
            .map(
              (p, i) => `<li class="stats-player">
                <span class="stats-place">${i + 1}</span>
                ${face(p)}
                <span class="stats-who"><strong>${esc(p.name)}</strong><small>[${esc(p.tag)}]</small></span>
                ${sparkline(p.series)}
                <span class="stats-num"><strong>${esc(gain ? change(p.change) : might(p.power))}</strong><small>${esc(gain ? might(p.power) : '')}</small></span>
              </li>`,
            )
            .join('')}</ol>${
            !expanded && rows.length > FIRST_ROWS
              ? `<button type="button" class="draft-btn stats-more" data-stats-more>${esc(t('show_more', { n: rows.length }))}</button>`
              : ''
          }`
        : `<p class="stats-note">${esc(empty)}</p>`
    }`;
  fallbackFaces(box);
}

/** A picture that doesn't load (changed, or the game's server is slow) shows the initial. */
function fallbackFaces(box) {
  box.querySelectorAll('img.stats-face').forEach((img) =>
    img.addEventListener(
      'error',
      () => {
        const span = document.createElement('span');
        span.className = 'stats-face stats-initial';
        span.textContent = (img.closest('li')?.querySelector('strong')?.textContent || '?')
          .charAt(0)
          .toUpperCase();
        img.replaceWith(span);
      },
      { once: true },
    ),
  );
}

// ---------- Achievements ----------

/** 47368659 → "47.4M", 950000 → "950K" */
function count(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

const plural = (key, n) => t(`${key}_${n === 1 ? 'one' : 'other'}`, { n });

// Each record: its icon and how its number reads (api/_stats.js topPlayers achievements)
const RECORDS = [
  ['strongest', 'crown', (v) => might(v)],
  ['gain_week', 'line_chart', (v) => change(v)],
  ['kills', 'swords', (v) => t('value_kills', { n: count(v) })],
  ['kills_week', 'flame', (v) => `+${t('value_kills', { n: count(v) })}`],
  ['climb_month', 'castle', (v) => plural('value_levels', v)],
  ['away', 'map', (v) => plural('value_days', v)],
];

function achievementsView(box, top, nap, tag) {
  const ic = (name, tone) => (window.uiIcon ? window.uiIcon(name, tone) : '');
  const all = top.achievements || {};
  const tags = nap.filter((a) => all[a.tag]);
  const board = all[tag || 'all'] || {};
  const medal = ['gold', 'silver', 'bronze'];
  box.innerHTML = `
    <div class="stats-bar stats-subbar">
      <label class="stats-filter"><span>${esc(t('filter_label'))}</span>
        <select data-stats-filter>
          <option value="">${esc(t('filter_all'))}</option>
          ${tags.map((a) => `<option value="${esc(a.tag)}"${a.tag === tag ? ' selected' : ''}>[${esc(a.tag)}]</option>`).join('')}
        </select>
      </label>
    </div>
    ${top.day ? `<p class="stats-note">${esc(t('players_as_of', { date: dateLabel(top.day) }))} ${esc(t('week_note'))}</p>` : ''}
    <div class="stats-records">${RECORDS.map(([key, icon, show]) => {
      const rows = (board[key] || [])
        .map(([uid, v]) => (top.players?.[uid] ? { ...top.players[uid], v } : null))
        .filter(Boolean);
      return `<section class="stats-record">
        <h3>${ic(icon)}${esc(t(`ach_${key}`))}</h3>
        ${key === 'away' ? `<p class="stats-note">${esc(t('ach_away_help'))}</p>` : ''}
        ${
          rows.length
            ? `<ol>${rows
                .map(
                  (p, i) => `<li class="stats-podium is-${medal[i]}">
                    <span class="stats-medal">${i + 1}</span>
                    ${face(p)}
                    <span class="stats-who"><strong>${esc(p.name)}</strong><small>[${esc(p.tag)}]</small></span>
                    <span class="stats-value">${esc(show(p.v))}</span>
                  </li>`,
                )
                .join('')}</ol>`
            : `<p class="stats-note">${esc(t('ach_none'))}</p>`
        }
      </section>`;
    }).join('')}</div>`;
  fallbackFaces(box);
}

async function start() {
  const app = document.getElementById('stats-app');
  if (!app || app.dataset.started) return;
  app.dataset.started = '1';
  const box = app.querySelector('#stats-body');
  const state = { view: 'growth', range: '30', hidden: new Set(), data: null };
  state.list = 'strongest';
  state.tag = '';
  state.top = null;
  const rangeBar = app.querySelector('.stats-range');
  const draw = async () => {
    if (!state.data) return;
    // The time span is the growth view's; the players view has its own lists
    if (rangeBar) rangeBar.hidden = state.view !== 'growth';
    if (state.view === 'growth') return growthView(box, state.data, state.range, state.hidden);
    if (!state.top) {
      box.innerHTML = `<p class="stats-note">${esc(t('loading'))}</p>`;
      try {
        const res = await fetch('/api/state?scope=stats-players');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        state.top = await res.json();
      } catch {
        box.innerHTML = `<p class="stats-note">${esc(t('failed'))}</p>`;
        return;
      }
    }
    if (state.view === 'achievements')
      return achievementsView(box, state.top, state.data.nap || [], state.tag);
    if (state.view === 'players')
      playersView(box, state.top, state.data.nap || [], state.list, state.tag, state.more);
  };
  const press = (sel, attr, value) =>
    app.querySelectorAll(sel).forEach((b) => {
      const on = b.getAttribute(attr) === value;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  app.addEventListener('click', (e) => {
    const range = e.target.closest('[data-stats-range]');
    const view = e.target.closest('[data-stats-view]');
    const chip = e.target.closest('[data-stats-tag]');
    const list = e.target.closest('[data-stats-list]');
    const more = e.target.closest('[data-stats-more]');
    if (more) {
      state.more = true;
    } else if (list) {
      state.list = list.dataset.statsList;
      state.more = false;
    } else if (range) {
      state.range = range.dataset.statsRange;
      press('[data-stats-range]', 'data-stats-range', state.range);
    } else if (view) {
      state.view = view.dataset.statsView;
      press('[data-stats-view]', 'data-stats-view', state.view);
    } else if (chip) {
      const tag = chip.dataset.statsTag;
      if (state.hidden.has(tag)) state.hidden.delete(tag);
      else state.hidden.add(tag);
    } else return;
    draw();
  });
  app.addEventListener('change', (e) => {
    if (!e.target.matches('[data-stats-filter]')) return;
    state.tag = e.target.value;
    state.more = false;
    draw();
  });
  try {
    const res = await fetch('/api/state?scope=stats');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
    draw();
  } catch {
    box.innerHTML = `<p class="stats-note">${esc(t('failed'))}</p>`;
  }
}

start();
document.addEventListener('turbo:load', start);
document.addEventListener('turbo:frame-render', start);
