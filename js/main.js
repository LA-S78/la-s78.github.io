/**
 * ----------------------------------------------------
 * LAST ASYLUM COMPENDIUM: MAIN ENGINE (FINAL AUTH VERSION)
 * ----------------------------------------------------
 */
(() => {
  // Escape data before putting it into HTML (see js/escape-html.js).
  const esc = (value) => window.escapeHtml(value);

  // initApp runs on both 'turbo:load' and 'turbo:frame-render', often twice for the same
  // page. firstTime(el, key) returns true only the first time it's asked about this
  // element and purpose, so each listener is attached exactly once (see DECISIONS.md).
  const bindings = new WeakMap();
  function firstTime(el, key) {
    let keys = bindings.get(el);
    if (!keys) bindings.set(el, (keys = new Set()));
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  }

  let isNewNavigation = false;
  let isRestoreVisit = false;

  // --- AUTHENTICATION CONFIGURATION ---
  const AUTH_CONFIG = {
    clientId: '1524254079235391558',
    redirectUri: window.location.origin + '/en/',
  };

  // --- THE THEME DICTATOR ---
  const themeColors = {
    default: 'rgb(35, 120, 45)',
    sanctuary: 'rgb(230, 160, 80)',
    miasma: 'rgb(140, 50, 180)',
  };

  function enforceThemeState() {
    const savedTheme = localStorage.getItem('site-theme') || 'default';
    const root = document.documentElement;

    if (root.getAttribute('data-theme') !== savedTheme) {
      root.setAttribute('data-theme', savedTheme);
    }
  }

  const themeDictator = new MutationObserver(() => enforceThemeState());
  themeDictator.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  enforceThemeState();

  // --- AUTHENTICATION GATEKEEPER ---
  async function initAuthentication() {
    const urlParams = new URLSearchParams(window.location.search);
    const oauthCode = urlParams.get('code');

    if (oauthCode) {
      window.history.replaceState({}, document.title, window.location.pathname);
      await processOAuthCallback(oauthCode);
      return;
    }

    // Discord sends ?error=... instead of a code when the login is cancelled or refused.
    if (urlParams.get('error') && localStorage.getItem('auth-return-path')) {
      window.history.replaceState({}, document.title, window.location.pathname);
      window.renderIdentityPill?.({ error: true });
      returnAfterLogin();
      return;
    }

    const cachedRole = localStorage.getItem('auth-role') || 'public';
    const cachedUser = localStorage.getItem('auth-username');
    const cachedAvatar = localStorage.getItem('auth-avatar');
    const cachedAlliance = localStorage.getItem('auth-alliance');

    applyAuthUIState(cachedRole, cachedUser, cachedAvatar, cachedAlliance);
  }

  async function processOAuthCallback(code) {
    const loginBtn = document.getElementById('discord-login-btn');
    if (loginBtn) loginBtn.textContent = 'Decrypting Intel...';
    window.renderIdentityPill?.({ busy: true });

    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code,
          redirectUri: AUTH_CONFIG.redirectUri,
        }),
      });

      if (!response.ok) throw new Error('Authentication handshake rejected.');

      const data = await response.json();

      // Missing values are removed, not stored as the text "undefined".
      const keep = (key, value) =>
        value ? localStorage.setItem(key, value) : localStorage.removeItem(key);
      keep('auth-role', data.role);
      keep('auth-username', data.username);
      keep('auth-avatar', data.avatar);
      keep('auth-alliance', data.alliance);
      // Officer role from the alliance's own server (counts as R4; see api/_officer_roles.js).
      keep('auth-officer', data.officer);
      // How the alliance was found (shown to Stewards in the header pill)
      keep('auth-alliance-source', data.alliance_source);
      // Signed login pass for sending proposals (only given to members of the Discord server).
      if (data.session) localStorage.setItem('auth-session', data.session);
      else localStorage.removeItem('auth-session');
      localStorage.setItem('auth-steward', data.steward ? 'true' : 'false');

      applyAuthUIState(data.role, data.username, data.avatar, data.alliance);
      returnAfterLogin();
    } catch (error) {
      console.error('Auth Error:', error);
      const errorBanner = document.getElementById('gate-error');
      if (errorBanner) {
        errorBanner.textContent = '❌ Decryption Failed. Check your connection or alliance status.';
        errorBanner.style.display = 'block';
      }
      if (loginBtn) loginBtn.textContent = 'Log In via Discord';
      window.renderIdentityPill?.({ error: true });
    }
  }

  /** Goes back to the page the visitor was on before the Discord login. */
  function returnAfterLogin() {
    const returnPath = localStorage.getItem('auth-return-path');
    localStorage.removeItem('auth-return-path');
    if (
      returnPath &&
      returnPath !== '/' &&
      returnPath !== '/index.html' &&
      returnPath !== window.location.pathname &&
      returnPath.startsWith('/') &&
      !returnPath.startsWith('//')
    ) {
      if (window.Turbo) window.Turbo.visit(returnPath, { action: 'replace' });
      else window.location.replace(returnPath);
    }
  }

  function applyAuthUIState(role, username, avatar, alliance) {
    const container = document.body;

    container.classList.remove('role-public', 'role-member', 'role-leadership');

    const isLeadership = role === 'R4' || role === 'R5' || role === 'leadership';
    if (isLeadership) container.classList.add('role-leadership', 'role-member');
    else if (role === 'member') container.classList.add('role-member');
    else container.classList.add('role-public');

    if (isLeadership || role === 'member') {
      const lockedElements = document.querySelectorAll('.content-locked');
      lockedElements.forEach((el) => el.classList.remove('content-locked'));
      const loginBtn = document.getElementById('discord-login-btn');
      if (loginBtn) loginBtn.style.display = 'none';
    }

    const textUsername = document.getElementById('ui-username');
    if (textUsername && username) textUsername.textContent = username;

    const textRank = document.getElementById('ui-rank');
    if (textRank && role) textRank.textContent = role;

    const textAlliance = document.getElementById('ui-alliance');
    if (textAlliance && alliance) textAlliance.textContent = alliance;

    const profileContainer = document.getElementById('ui-profile-card');
    if (profileContainer && username) {
      profileContainer.innerHTML = `
                <div class="user-badge">
                    <img src="${esc(avatar)}" class="user-avatar" alt="Profile">
                    <span class="user-name">${esc(username)}</span>
                    <span class="user-role-tag">${esc(role.toUpperCase())}</span>
                    <button id="discord-logout-btn" class="logout-link">Log Out</button>
                </div>
            `;
    }

    highlightAllianceRow('nap-alliance-table');
    highlightAllianceRow('nap-ranks-table');
    window.renderIdentityPill?.();
  }

  function highlightAllianceRow(tableId) {
    const table = document.getElementById(tableId);
    const playerAlliance = localStorage.getItem('auth-alliance');

    if (!table || !playerAlliance) return;

    const normalize = (str) =>
      str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    const normalizedPlayerAlliance = normalize(playerAlliance);

    const rows = table.querySelectorAll('tr');
    rows.forEach((row) => {
      if (normalize(row.textContent.trim()) === normalizedPlayerAlliance) {
        row.classList.add('highlight-alliance');
      }
    });
  }

  /**
   * Sends the visitor to Discord to log in, then back to this page.
   * quiet: skip Discord's "Authorize" screen if they already allowed the site (Refresh Access).
   */
  window.triggerDiscordLogin = function ({ quiet = false } = {}) {
    // The whole address, query included (portal links carry their ?token=...).
    localStorage.setItem(
      'auth-return-path',
      window.location.pathname + window.location.search + window.location.hash,
    );
    const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${AUTH_CONFIG.clientId}&response_type=code&redirect_uri=${encodeURIComponent(AUTH_CONFIG.redirectUri)}&scope=identify${quiet ? '&prompt=none' : ''}`;
    window.location.href = discordAuthUrl;
  };

  window.triggerLogout = function () {
    localStorage.removeItem('auth-role');
    localStorage.removeItem('auth-username');
    localStorage.removeItem('auth-avatar');
    localStorage.removeItem('auth-alliance');
    localStorage.removeItem('auth-session');
    localStorage.removeItem('auth-steward');
    localStorage.removeItem('auth-officer');
    localStorage.removeItem('auth-alliance-source');
    window.location.reload();
  };

  window.closeDialogGracefully = (dialog) => {
    if (!dialog) return;
    dialog.classList.add('is-closing');
    dialog.addEventListener(
      'animationend',
      () => {
        dialog.classList.remove('is-closing');
        dialog.close();
      },
      { once: true },
    );
  };

  function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('site-theme', themeName);
    window.syncThemeColour?.(); // the phone's status bar follows the theme (js/theme-init.js)
  }

  function initThemeToggle() {
    applyTheme(localStorage.getItem('site-theme') || 'default');
  }

  function highlightCurrentSurvivalBattle() {
    const table = document.querySelector('.schedule-table');
    if (!table) return;

    const now = new Date();
    // Game Time is UTC-2
    const gameTime = new Date(now.getTime() - 2 * 3600000);
    const hours = gameTime.getUTCHours();
    const block = Math.floor(hours / 4) * 4;
    const formattedBlock = block.toString().padStart(2, '0') + ':00';

    const dayOfWeek = gameTime.getUTCDay();
    const colIndex = dayOfWeek === 0 ? 7 : dayOfWeek;

    const rows = table.querySelectorAll('tbody tr');
    rows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      const timeCell = cells[0];

      // Clear all previous highlights in this row first
      row.classList.remove('active-row');
      cells.forEach((cell) => cell.classList.remove('active-col'));

      if (timeCell && timeCell.textContent.includes(formattedBlock)) {
        row.classList.add('active-row');
        if (cells[colIndex]) {
          cells[colIndex].classList.add('active-col');
        }
      }
    });
  }

  function scrollActiveNavIntoView(activeLink = null) {
    if (!activeLink)
      activeLink =
        document.querySelector('.nav-wrapper .active') ||
        document.querySelector('.anchor-link.active');
    if (!activeLink) return;
    const navWrapper = activeLink.closest('.nav-wrapper');
    if (!navWrapper) return;
    const wrapperCenter = navWrapper.clientWidth / 2;
    const linkCenter = activeLink.offsetLeft + activeLink.clientWidth / 2;
    navWrapper.scrollTo({
      left: linkCenter - wrapperCenter,
      behavior: 'smooth',
    });
  }

  // The section tabs under the header (Server Rules / Rotation / Rewards…) follow the page as
  // it scrolls. The section is the last one whose top has passed a line a third of the way
  // down the visible area; at the very bottom, the last section (a short last section never
  // reaches the line). After a tap on a tab, that tab stays lit while the page glides there,
  // instead of flickering through the sections in between.
  let stopSectionTracking = null;

  function initScrollObserver() {
    if (stopSectionTracking) stopSectionTracking();
    stopSectionTracking = null;
    const mainContainer = document.querySelector('main');
    const sections = [...document.querySelectorAll('.content-pane[id]')];
    const navLinks = [...document.querySelectorAll('.anchor-link')];
    if (!mainContainer || sections.length === 0 || navLinks.length === 0) return;

    const linkFor = (id) => navLinks.find((link) => link.getAttribute('href')?.endsWith(`#${id}`));
    let current = null;
    let heldUntil = 0;
    let frame = 0;

    const setActive = (id) => {
      if (id === current) return;
      current = id;
      const active = linkFor(id);
      navLinks.forEach((link) => link.classList.toggle('active', link === active));
      if (active) scrollActiveNavIntoView(active);
    };

    const pick = () => {
      frame = 0;
      if (Date.now() < heldUntil) return;
      const box = mainContainer.getBoundingClientRect();
      const nav = document.querySelector('.anchor-nav');
      const top = nav ? nav.getBoundingClientRect().bottom : box.top;
      const atBottom =
        mainContainer.scrollTop + mainContainer.clientHeight >= mainContainer.scrollHeight - 4;
      if (atBottom) return setActive(sections[sections.length - 1].id);
      const line = top + (box.bottom - top) / 3;
      let found = sections[0];
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= line) found = section;
      }
      setActive(found.id);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(pick);
    };
    // A tab was tapped: light it now and hold it until the page stops moving
    const onHold = (event) => {
      setActive(event.detail);
      heldUntil = Date.now() + 1500;
    };
    // The glide is over: the tapped tab stays lit (near the bottom, the page may not reach
    // its section's top) until the reader scrolls again
    const onScrollEnd = () => {
      heldUntil = 0;
    };

    mainContainer.addEventListener('scroll', onScroll, { passive: true });
    mainContainer.addEventListener('scrollend', onScrollEnd);
    document.addEventListener('anchor-nav:go', onHold);
    stopSectionTracking = () => {
      mainContainer.removeEventListener('scroll', onScroll);
      mainContainer.removeEventListener('scrollend', onScrollEnd);
      document.removeEventListener('anchor-nav:go', onHold);
      if (frame) cancelAnimationFrame(frame);
    };
    pick();
  }

  /** Scrolls the page so a section starts just under the section tabs (or the header). */
  function scrollToSection(targetElement, behavior = 'smooth') {
    const mainContainer = document.querySelector('main');
    if (!mainContainer) return;
    const anchorNav = document.querySelector('.anchor-nav');
    const offsetBoundary = anchorNav ? anchorNav.getBoundingClientRect().bottom : 90;
    mainContainer.scrollTo({
      top:
        mainContainer.scrollTop + targetElement.getBoundingClientRect().top - offsetBoundary - 15,
      behavior,
    });
  }

  function initAnchorScrolling() {
    const navLinks = document.querySelectorAll('.anchor-link');
    navLinks.forEach((link) => {
      if (!firstTime(link, 'anchor-scroll')) return;
      link.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (!href || !href.includes('#')) return;
        const targetId = href.split('#')[1];
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
          e.preventDefault();
          document.dispatchEvent(new CustomEvent('anchor-nav:go', { detail: targetId }));
          scrollToSection(targetElement);
        }
      });
    });
  }

  // ---------- Site search ----------
  // The search box on Home and the guides index: it filters that page's cards as you type
  // and, from two letters, lists matching sections from every guide and the Rules and
  // Alliance pages. The list comes from /<lang>/search-index.json (built by
  // _scripts/search_index.rb from the finished pages; the service worker keeps the reader's
  // language for offline use). Every word typed must appear; letter case and accents don't
  // matter. A section whose name or page title matches comes first.
  const searchIndexes = {}; // language -> Promise of the index (fetched once per visit)
  const MAX_RESULTS = 8;
  const fold = (text) => String(text).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

  function loadSearchIndex(lang) {
    if (!searchIndexes[lang]) {
      searchIndexes[lang] = fetch(`/${lang}/search-index.json`)
        .then((r) => {
          if (!r.ok) throw new Error(`search index: HTTP ${r.status}`);
          return r.json();
        })
        .then((entries) =>
          entries.map((e) => ({ ...e, key: fold(`${e.p} ${e.s}`), body: fold(e.x) })),
        )
        .catch((err) => {
          delete searchIndexes[lang]; // try again next time (e.g. back online)
          throw err;
        });
    }
    return searchIndexes[lang];
  }

  function searchSections(index, query) {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const scored = [];
    for (const e of index) {
      let score = 0;
      for (const w of words) {
        const inKey = e.key.includes(w);
        const hits = e.body.split(w).length - 1;
        if (!inKey && !hits) {
          score = -1;
          break;
        }
        score += (inKey ? 10 : 0) + Math.min(hits, 5);
      }
      if (score > 0) scored.push({ e, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
  }

  /** The text folded like fold(), with where each folded character came from in the original
   *  (folding can drop characters: accents, and the variation mark after an emoji like ⚠️). */
  function foldWithMap(text) {
    let folded = '';
    const from = [];
    let i = 0;
    for (const ch of text) {
      const f = fold(ch);
      folded += f;
      for (let k = 0; k < f.length; k++) from.push(i);
      i += ch.length;
    }
    from.push(text.length);
    return { folded, from };
  }

  /** About 150 characters of the section around the first word found, words highlighted. */
  function searchSnippet(text, query) {
    const words = fold(query).split(/\s+/).filter(Boolean);
    const all = foldWithMap(text);
    const found = words.map((w) => all.folded.indexOf(w)).filter((i) => i >= 0);
    const at = found.length ? all.from[Math.min(...found)] : 0; // else only the name matched
    const start = Math.max(0, at - 50);
    let snippet = text.slice(start, start + 150);
    if (start > 0) snippet = '…' + snippet.replace(/^\S*\s/, '');
    if (start + 150 < text.length) snippet = snippet.replace(/\s\S*$/, '') + '…';
    // Highlight: escape everything, wrapping each match (found in the folded text, mapped
    // back to the original characters) in <mark>
    const { folded, from } = foldWithMap(snippet);
    const marks = [];
    for (const w of words) {
      for (let i = folded.indexOf(w); i >= 0; i = folded.indexOf(w, i + w.length)) {
        marks.push([from[i], from[i + w.length]]);
      }
    }
    marks.sort((a, b) => a[0] - b[0]);
    let html = '';
    let pos = 0;
    for (const [a, b] of marks) {
      if (a < pos) continue;
      html += esc(snippet.slice(pos, a)) + '<mark>' + esc(snippet.slice(a, b)) + '</mark>';
      pos = b;
    }
    return html + esc(snippet.slice(pos));
  }

  function initSearchEngine() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput || !firstTime(searchInput, 'search')) return;
    const results = document.getElementById('searchResults');
    const lang = document.documentElement.lang || 'en';
    let latest = 0;

    const show = async (query) => {
      const ticket = ++latest;
      if (!results) return;
      if (query.trim().length < 2) {
        results.hidden = true;
        results.innerHTML = '';
        return;
      }
      let html;
      try {
        const found = searchSections(await loadSearchIndex(lang), query);
        html = found.length
          ? '<ul class="search-result-list">' +
            found
              .map(
                ({ e }) => `<li><a class="search-result" href="${esc(e.u)}" data-turbo-frame="_top">
                  <span class="search-result-where">${esc(e.p)}${e.s && e.s !== e.p ? ` <span aria-hidden="true">›</span> ${esc(e.s)}` : ''}</span>
                  <span class="search-result-text">${searchSnippet(e.x, query)}</span>
                </a></li>`,
              )
              .join('') +
            '</ul>'
          : `<p class="search-result-none">${esc(results.dataset.noResults.replace('{query}', query.trim()))}</p>`;
      } catch (err) {
        console.warn(err.message);
        html = `<p class="search-result-none">${esc(results.dataset.unavailable)}</p>`;
      }
      if (ticket !== latest) return; // a newer search has started
      results.innerHTML = html;
      results.hidden = false;
    };

    searchInput.addEventListener('input', function (e) {
      const query = e.target.value.toLowerCase();
      const items = document.querySelectorAll('.searchable-item');
      items.forEach((item) => {
        item.style.display = item.textContent.toLowerCase().includes(query) ? '' : 'none';
      });
      // A box of cards (Critical Intel, Directories, a guides category) with none left is
      // hidden rather than left empty under the results
      document.querySelectorAll('.content-pane').forEach((pane) => {
        const cards = [...pane.querySelectorAll('.searchable-item')];
        if (!cards.length) return;
        pane.hidden = Boolean(query) && cards.every((c) => c.style.display === 'none');
      });
      show(e.target.value);
    });
    // Fetch the index when the box is first used, so typing feels instant
    searchInput.addEventListener('focus', () => loadSearchIndex(lang).catch(() => {}), {
      once: true,
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchInput.value) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
      }
    });
  }

  function highlightActiveLanguage() {
    const langLinks = document.querySelectorAll('.dropdown-content a');
    if (langLinks.length === 0) return;
    const currentPath = window.location.pathname;
    const availableLangs = Array.from(langLinks)
      .map((l) => l.getAttribute('data-lang'))
      .filter(Boolean);
    const pathParts = currentPath.split('/').filter(Boolean);
    let currentLang = 'en';
    let langIndex = -1;
    for (let i = 0; i < pathParts.length; i++) {
      if (availableLangs.includes(pathParts[i])) {
        currentLang = pathParts[i];
        langIndex = i;
        break;
      }
    }
    langLinks.forEach((link) => {
      const targetLang = link.getAttribute('data-lang');
      if (!targetLang) return;
      link.classList.remove('lang-active');
      if (targetLang === currentLang) link.classList.add('lang-active');
      let newPathParts = [...pathParts];
      if (langIndex !== -1) newPathParts[langIndex] = targetLang;
      else newPathParts.unshift(targetLang);
      link.href = '/' + newPathParts.join('/') + window.location.search + window.location.hash;
    });
  }

  function highlightActiveFooterNav() {
    const footerLinks = document.querySelectorAll('footer .nav-item');
    if (footerLinks.length === 0) return;
    const currentPath = window.location.pathname;
    const normalize = (path) => path.replace(/\/index\.html$/, '/').replace(/\/$/, '');
    const normalizedCurrent = normalize(currentPath);

    footerLinks.forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;
      if (normalize(href) === normalizedCurrent) link.classList.add('active');
      else link.classList.remove('active');
    });
  }

  function syncHeaderSubtitle() {
    const newSubtitle = document.getElementById('secret-subtitle-data');
    const headerSubtitle = document.getElementById('ui-subtitle');
    if (newSubtitle && headerSubtitle) headerSubtitle.textContent = newSubtitle.textContent;
  }

  // Puts the page back at `target` (pixels down). Live sections (standings, rewards, map) grow
  // as their data arrives, so a page can be too short at first: the position is applied again
  // each frame until it holds, for up to 4 seconds. Touching, scrolling or a key stops it at
  // once, so it never fights the reader.
  function restoreScroll(scrollContainer, target) {
    const started = performance.now();
    let stopped = false;
    const stop = () => (stopped = true);
    for (const ev of ['wheel', 'touchstart', 'keydown', 'mousedown']) {
      scrollContainer.addEventListener(ev, stop, { once: true, passive: true });
    }
    const step = () => {
      if (stopped) return;
      scrollContainer.scrollTop = target;
      if (Math.abs(scrollContainer.scrollTop - target) <= 2) return;
      if (performance.now() - started < 4000) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function initScrollMemory() {
    const scrollContainer = document.querySelector('main');
    if (!scrollContainer) return;
    const scrollKey = 'scroll-pos-' + window.location.pathname;
    const saved = () => parseInt(sessionStorage.getItem(scrollKey) || '', 10);
    if (isNewNavigation) {
      // A new visit (a link): the top of the page, or the section its address names
      // (/en/guides/thief.html#coins, e.g. from a search result)
      isNewNavigation = false;
      isRestoreVisit = false;
      const id = decodeURIComponent(window.location.hash.slice(1));
      const section = id && document.getElementById(id);
      requestAnimationFrame(() => {
        if (section) scrollToSection(section, 'auto');
        else scrollContainer.scrollTop = 0;
      });
    } else if (isRestoreVisit) {
      // The back or forward button: where the reader was (Turbo redraws the page from its
      // snapshot at the top, so the position has to be put back)
      isRestoreVisit = false;
      if (saved() > 0) restoreScroll(scrollContainer, saved());
    } else {
      const navType = performance.getEntriesByType('navigation')[0]?.type;
      if (navType !== 'navigate' && saved() > 0) restoreScroll(scrollContainer, saved());
    }
    if (!firstTime(scrollContainer, 'scroll-memory')) return;
    let scrollTimeout;
    scrollContainer.addEventListener(
      'scroll',
      () => {
        if (scrollTimeout) return;
        // The page this scroll belongs to (by the time the timer runs, a link may have
        // moved the address on to the next page)
        const key = 'scroll-pos-' + window.location.pathname;
        scrollTimeout = setTimeout(() => {
          if (scrollContainer.isConnected) sessionStorage.setItem(key, scrollContainer.scrollTop);
          scrollTimeout = null;
        }, 100);
      },
      { passive: true },
    );
  }

  // --- MAP INITIALIZATION & INTERACTION ---
  function initMapInteraction() {
    const allSvgs = document.querySelectorAll('svg');
    let mapSvg = null;

    allSvgs.forEach((svg) => {
      if (svg.innerHTML.includes('inkscape:label')) mapSvg = svg;
    });

    if (!mapSvg || !firstTime(mapSvg, 'map-init')) return;

    import('./map.js')
      .then(async (MapModule) => {
        setTimeout(async () => {
          // map.js sets the map up itself (initMap: once per visit, controls included). Calling
          // it here too is harmless: whichever runs first does the work, the other does nothing.
          MapModule.initMap();
          MapModule.enableMapHighlighting(mapSvg);

          try {
            const response = await fetch('/api/colors');
            if (response.ok) {
              const allianceColors = await response.json();
              if (MapModule.setAllianceColors) {
                MapModule.setAllianceColors(allianceColors, mapSvg);
              }
            }
          } catch (err) {
            console.warn('Could not load public alliance colors:', err);
          }
        }, 50);
      })
      .catch((err) => {
        console.error('Map Module Error: Could not load map.js', err);
      });
  }

  function initApp() {
    initAuthentication();
    highlightCurrentSurvivalBattle();
    highlightAllianceRow('nap-alliance-table');
    highlightAllianceRow('nap-ranks-table');
    initScrollObserver();
    initAnchorScrolling();
    initSearchEngine();
    highlightActiveLanguage();
    highlightActiveFooterNav();
    initThemeToggle();
    syncHeaderSubtitle();
    initScrollMemory();
    setTimeout(() => scrollActiveNavIntoView(), 100);
    initMapInteraction();
  }

  // --- EVENTS ---
  document.addEventListener('turbo:load', initApp);
  document.addEventListener('turbo:frame-render', initApp);
  // A link is a new visit (top of the page); the back/forward buttons are a "restore" visit
  // (back to where the reader was). Both used to count as new, so Back always went to the top.
  document.addEventListener('turbo:visit', (event) => {
    const restore = event.detail?.action === 'restore';
    isNewNavigation = !restore;
    isRestoreVisit = restore;
  });

  document.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('#theme-toggle');
    if (toggleBtn) {
      const themes = ['default', 'sanctuary', 'miasma'];
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'default';
      let nextIndex = (themes.indexOf(currentTheme) + 1) % themes.length;
      applyTheme(themes[nextIndex]);
      return;
    }
    const logoutBtn = e.target.closest('#discord-logout-btn');
    if (logoutBtn) window.triggerLogout();
  });

  window.scrollPinned = function (direction) {
    const container = document.getElementById('pinnedContainer');
    if (!container) return;
    container.scrollBy({
      left: direction === 'left' ? -300 : 300,
      behavior: 'smooth',
    });
  };

  // --- PWA: SERVICE WORKER & "NEW VERSION" TOAST ---
  // When a new version of the site has downloaded in the background, offer to switch to it.
  // Texts come from _data/<lang>/ui.yml (pwa:), via window.pwaTranslations in head.html.
  function showUpdateToast(waitingWorker) {
    if (!waitingWorker || document.getElementById('pwa-update-toast')) return;
    const t = window.pwaTranslations || {
      toastMsg: 'New intel acquired.',
      updateBtn: 'Update',
      updating: 'Decrypting...',
    };

    const toast = document.createElement('div');
    toast.id = 'pwa-update-toast';
    toast.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = t.toastMsg;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = t.updateBtn;
    toast.append(text, button);
    document.body.appendChild(toast);

    button.addEventListener('click', () => {
      toast.classList.add('updating');
      text.textContent = t.updating;
      // sw.js listens for this and activates the new version; 'controllerchange' then reloads.
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    });
  }

  function watchForUpdates(registration) {
    // An update downloaded on an earlier visit is already waiting.
    if (registration.waiting && navigator.serviceWorker.controller) {
      showUpdateToast(registration.waiting);
    }
    // An update found during this visit.
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateToast(newWorker);
        }
      });
    });
  }

  /**
   * Force Update (identity pill card, and /reset): drops this site's service worker and
   * saved files, then loads the page fresh from the network. The login pass, theme and
   * planner drafts live in localStorage and are kept.
   */
  async function clearAppCache() {
    try {
      const registrations = (await navigator.serviceWorker?.getRegistrations?.()) || [];
      await Promise.all(registrations.map((r) => r.unregister()));
    } catch (e) {
      /* nothing registered, or not allowed: carry on */
    }
    try {
      if (window.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
    } catch (e) {
      /* no saved files */
    }
  }
  window.forceAppUpdate = async function () {
    try {
      sessionStorage.setItem('app-updated', '1'); // "App updated" note after the reload
    } catch (e) {
      /* private mode: no note */
    }
    // Never wait more than 3 s: reload whatever happens.
    await Promise.race([clearAppCache(), new Promise((r) => setTimeout(r, 3000))]);
    window.location.reload();
  };

  /** A short "App updated" note after Force Update or /reset (/?updated=1). */
  function showUpdatedNote() {
    let flagged = false;
    try {
      flagged = sessionStorage.getItem('app-updated') === '1';
      sessionStorage.removeItem('app-updated');
    } catch (e) {
      /* no session storage */
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get('updated') === '1') {
      flagged = true;
      url.searchParams.delete('updated');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    }
    if (!flagged || document.getElementById('pwa-update-toast')) return;
    const toast = document.createElement('div');
    toast.id = 'pwa-update-toast';
    toast.className = 'is-done';
    toast.setAttribute('role', 'status');
    toast.textContent =
      (window.pwaTranslations && window.pwaTranslations.updatedMsg) ||
      '✅ App updated to the latest version.';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  if ('serviceWorker' in navigator) {
    // A new version (sw.js) asks open pages whether they can show the update toast. Pages
    // too old to answer are updated automatically after 2 s; this one answers, and shows
    // the toast when the new version is ready (watchForUpdates).
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SW_UPDATE_AVAILABLE' && event.source) {
        event.source.postMessage({ type: 'SW_TOAST_SHOWN' });
      }
    });
    window.addEventListener('load', showUpdatedNote);

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then(watchForUpdates)
        .catch((err) => console.warn('Service worker registration failed:', err));

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    });

    // Turbo replaces the page body on navigation, which removes the toast; show it again.
    document.addEventListener('turbo:load', () => {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting && navigator.serviceWorker.controller) showUpdateToast(reg.waiting);
      });
    });
  }
})();
