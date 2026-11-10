/**
 * js/identity-pill.js
 * The sign-in button / account pill in the site header (_includes/structure/identity-pill.html).
 *
 * Signed out: "Sign In" with Discord. Signed in: avatar and rank badge; a click
 * opens a card with the alliance, what this rank can do on the site, when the login expires,
 * and Refresh Access / Sign Out. Reads what js/main.js stores after a Discord login.
 *
 * The header stays on screen across Turbo page changes (data-turbo-permanent), so listeners
 * are attached once; window.renderIdentityPill() redraws it after a login.
 */
(() => {
  const DAY = 24 * 3600 * 1000;

  /** Stored value, or '' when missing (older logins stored the text "undefined"). */
  function stored(key) {
    const v = localStorage.getItem(key);
    return v && v !== 'undefined' && v !== 'null' ? v : '';
  }

  /** Expiry time of the stored login pass, or 0 if there is none or it can't be read. */
  function passExpiry() {
    try {
      const pass = stored('auth-session');
      const data = JSON.parse(atob(pass.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
      return data.kind === 'session' ? Number(data.exp) || 0 : 0;
    } catch {
      return 0;
    }
  }

  /**
   * What the header should show, from what main.js stored at login.
   * tier: 'signed-out' | 'guest' | 'expired' | 'member' | 'R4' | 'R5' | 'steward'
   */
  function readIdentity() {
    const name = stored('auth-username');
    const role = stored('auth-role') || 'public';
    const alliance = stored('auth-alliance');
    const exp = passExpiry();
    const base = {
      name,
      avatar: stored('auth-avatar'),
      alliance: alliance && alliance !== 'Independent' ? alliance : '',
      officer: stored('auth-officer'),
      exp,
    };
    if (!name) return { ...base, tier: 'signed-out' };
    if (role === 'public') return { ...base, tier: 'guest' };
    // Members and leaders get a login pass; without a usable one they must sign in again.
    if (exp <= Date.now()) return { ...base, tier: 'expired' };
    if (stored('auth-steward') === 'true') return { ...base, tier: 'steward' };
    if (role === 'R4' || role === 'R5') return { ...base, tier: role };
    return { ...base, tier: 'member' };
  }

  const BADGES = {
    steward: ['👑', 'role_steward'],
    R5: ['🛡️', 'role_r5'],
    R4: ['⚔️', 'role_r4'],
    member: ['👤', 'role_member'],
    guest: ['👤', 'role_guest'],
    expired: ['⚠️', 'role_expired'],
  };

  /** What each rank can do on the website (kept in line with api/proposal.js). */
  const ACCESS = {
    guest: ['access_view', 'access_draft', 'access_join'],
    expired: ['access_view', 'access_draft', 'access_expired'],
    member: ['access_view', 'access_draft', 'access_ask_leader'],
    R4: ['access_view', 'access_draft', 'access_send'],
    R5: ['access_view', 'access_draft', 'access_send'],
    steward: ['access_view', 'access_draft', 'access_send_unlimited', 'access_approve'],
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  function avatarImg(src, className) {
    const img = el('img', className);
    img.alt = '';
    img.src = src || '/images/favicon.png';
    img.addEventListener('error', () => (img.src = '/images/favicon.png'), { once: true });
    return img;
  }

  function badge(tier, t, officer) {
    const [icon, key] = BADGES[tier];
    const b = el('span', `id-badge id-badge--${tier.toLowerCase()}`);
    b.append(el('span', 'id-badge-icon', icon), el('span', 'id-badge-text', t[key]));
    if (officer && tier === 'R4') b.append(el('span', 'id-badge-extra', ` · ${t.role_officer}`));
    return b;
  }

  function expiryText(exp, t) {
    const days = Math.round((exp - Date.now()) / DAY);
    if (days < 1) return t.expires_today;
    if (days === 1) return t.expires_one;
    return t.expires_days.replace('{n}', days);
  }

  function render(root, { busy, error } = {}) {
    const t = root._strings;
    // A failed sign-in stays reported (across the page change back) until the next click.
    if (error !== undefined) root._failed = error;
    error = root._failed;
    const id = readIdentity();
    const pill = root.querySelector('.id-pill');
    const pop = root.querySelector('.id-pop');
    root.dataset.tier = id.tier;
    pill.replaceChildren();
    pop.replaceChildren();

    if (id.tier === 'signed-out') {
      pill.setAttribute('aria-haspopup', 'false');
      pill.removeAttribute('aria-expanded');
      pill.setAttribute('aria-label', t.sign_in);
      pill.removeAttribute('title');
      const glyph = root.querySelector('.id-discord-glyph').content.cloneNode(true);
      pill.append(
        glyph,
        el('span', 'id-pill-text', busy ? t.signing_in : error ? t.sign_in_failed : t.sign_in),
      );
      pill.disabled = !!busy;
      setOpen(root, false);
      return;
    }

    pill.disabled = false;
    pill.setAttribute('aria-haspopup', 'true');
    pill.setAttribute('aria-expanded', root.classList.contains('is-open') ? 'true' : 'false');
    // Just the avatar and rank: a name would push into the page subtitle. The name and
    // alliance are in the card, and in the tooltip.
    const label = `${t.account}: ${id.alliance ? `[${id.alliance}] ` : ''}${id.name}`;
    pill.setAttribute('aria-label', label);
    pill.title = label;
    pill.append(avatarImg(id.avatar, 'id-avatar'), badge(id.tier, t));

    // --- the card ---
    const head = el('div', 'id-pop-head');
    const who = el('div', 'id-pop-who');
    who.append(
      el('div', 'id-pop-name', id.name),
      el(
        'div',
        'id-pop-alliance',
        `${t.alliance_label}: ${id.alliance ? `[${id.alliance}]` : t.alliance_none}`,
      ),
    );
    head.append(avatarImg(id.avatar, 'id-avatar id-avatar--large'), who);
    const badgeRow = el('div', 'id-pop-badges');
    badgeRow.append(badge(id.tier, t, id.officer));
    pop.append(head, badgeRow);

    pop.append(el('div', 'id-pop-title', t.access_title));
    const list = el('ul', 'id-pop-access');
    for (const key of ACCESS[id.tier])
      list.append(el('li', key === 'access_expired' ? 'is-warning' : '', t[key]));
    pop.append(list);

    const foot = el('div', 'id-pop-foot');
    if (id.tier !== 'guest' && id.tier !== 'expired')
      foot.append(el('div', 'id-pop-expiry', expiryText(id.exp, t)));
    const actions = el('div', 'id-pop-actions');
    const refresh = el(
      'button',
      'id-btn id-btn--primary',
      id.tier === 'expired' ? t.sign_in_again : t.refresh,
    );
    refresh.type = 'button';
    refresh.dataset.idAction = 'refresh';
    const out = el('button', 'id-btn', t.sign_out);
    out.type = 'button';
    out.dataset.idAction = 'sign-out';
    actions.append(refresh, out);
    foot.append(actions);
    pop.append(foot);
  }

  function setOpen(root, open) {
    root.classList.toggle('is-open', open);
    root.querySelector('.id-pop').hidden = !open;
    const pill = root.querySelector('.id-pill');
    if (pill.getAttribute('aria-haspopup') === 'true')
      pill.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function start(root) {
    if (root._started) return;
    root._started = true;
    try {
      root._strings = JSON.parse(root.querySelector('.id-strings').textContent);
    } catch {
      root._strings = {};
    }
    const pill = root.querySelector('.id-pill');

    pill.addEventListener('click', () => {
      root._failed = false;
      if (root.dataset.tier === 'signed-out') return window.triggerDiscordLogin?.();
      setOpen(root, !root.classList.contains('is-open'));
    });
    root.querySelector('.id-pop').addEventListener('click', (e) => {
      const action = e.target.closest('[data-id-action]')?.dataset.idAction;
      // Discord skips its "Authorize" screen for someone who already allowed the site.
      if (action === 'refresh') window.triggerDiscordLogin?.({ quiet: true });
      if (action === 'sign-out') window.triggerLogout?.();
    });
    document.addEventListener('click', (e) => {
      if (root.classList.contains('is-open') && !root.contains(e.target)) setOpen(root, false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && root.classList.contains('is-open')) {
        setOpen(root, false);
        pill.focus();
      }
    });
    document.addEventListener('turbo:visit', () => setOpen(root, false));
    // Another tab signed in or out.
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.startsWith('auth-')) render(root);
    });
    render(root);
    root.dataset.ready = '';
  }

  /** Redraws the pill (main.js calls this after a login). Options: { busy, error }. */
  window.renderIdentityPill = (options) => {
    const root = document.getElementById('identity-pill');
    if (!root) return;
    start(root);
    render(root, options);
  };

  const boot = () => window.renderIdentityPill();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  document.addEventListener('turbo:load', boot);
})();
