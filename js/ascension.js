// The Top 4 race on the Rules page (owner rule, 2026-11-17; api/_ascension.js): each NAP
// alliance's Might on Alliance Duel Days 3, 4 and 5 of Kingdom War Week 1 and their total,
// best first, the Top 4 marked. From /api/calendar (`ascension`); hidden until a race has
// been measured. Runs on the full page load and on Turbo visits.

// Escape data before putting it into HTML (see js/escape-html.js, loaded in <head>).
const escapeHtml = (v) => window.escapeHtml(v);

const t = (key, vars) => (window.t ? window.t(`ascension.${key}`, vars) : key);
const DAYS = [3, 4, 5];

/** 10561203222 → "10.56B" (Might is shown in billions, as players read it). */
function might(n) {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  return `${(n / 1e6).toFixed(0)}M`;
}

function render(box, race) {
  const date = new Date(`${race.id}T12:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
  const measured = DAYS.filter((d) => race.taken[d]);
  const status = race.finished
    ? t('finished')
    : t('in_progress', { days: measured.map((d) => t('col_day', { n: d })).join(', ') });
  const rows = race.rows
    .map(
      (r) => `<tr class="${r.top4 ? 'is-top4' : ''}${r.complete ? '' : ' is-incomplete'}">
        <td>${r.place ? `#${r.place}` : '–'}</td>
        <td class="ascension-tag">[${escapeHtml(r.tag)}]<small class="ascension-days">${DAYS.map((d) => might(r.days[d])).join(' · ')}</small></td>
        ${DAYS.map((d) => `<td>${might(r.days[d])}</td>`).join('')}
        <td class="ascension-total">${r.complete ? might(r.total) : escapeHtml(t('missing_day'))}</td>
      </tr>`,
    )
    .join('');
  box.innerHTML = `
    <h3>${escapeHtml(t('title'))}</h3>
    <p class="ascension-meta">${escapeHtml(t('week_of', { date }))} · ${escapeHtml(status)}</p>
    <div class="ascension-scroll">
      <table class="ascension-table">
        <thead><tr><th>#</th><th>${escapeHtml(t('col_alliance'))}</th>${DAYS.map((d) => `<th>${escapeHtml(t('col_day', { n: d }))}</th>`).join('')}<th>${escapeHtml(t('col_total'))}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="ascension-source">${escapeHtml(t('source'))}</p>`;
  box.hidden = false;
}

async function start() {
  const box = document.getElementById('ascension-race');
  if (!box || box.dataset.started) return;
  box.dataset.started = '1';
  try {
    const res = await fetch('/api/calendar');
    if (!res.ok) return;
    const data = await res.json();
    if (data.ascension && data.ascension.rows && data.ascension.rows.length)
      render(box, data.ascension);
  } catch {
    // No race to show: the section stays hidden
  }
}

start();
document.addEventListener('turbo:load', start);
