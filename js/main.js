/**
 * ----------------------------------------------------
 * LAST ASYLUM COMPENDIUM: MAIN ENGINE (REFACTORED + AUTH)
 * ----------------------------------------------------
 */
(() => {
    let scrollObserver = null;
    let isNewNavigation = false;

    // --- AUTHENTICATION CONFIGURATION ---
    const AUTH_CONFIG = {
        clientId: '1524254079235391558', // Replace with your actual Discord Application Client ID
        redirectUri: window.location.origin + '/' // Automatically targets your current domain root
    };

    // --- THE THEME DICTATOR ---
    const themeColors = {
        'default': 'rgb(35, 120, 45)',
        'sanctuary': 'rgb(230, 160, 80)',
        'miasma': 'rgb(140, 50, 180)'
    };

    function enforceThemeState() {
        const savedTheme = localStorage.getItem('site-theme') || 'default';
        const root = document.documentElement;
        
        if (root.getAttribute('data-theme') !== savedTheme) {
            root.setAttribute('data-theme', savedTheme);
        }
    }

    const themeDictator = new MutationObserver(() => {
        enforceThemeState();
    });

    themeDictator.observe(document.documentElement, { 
        attributes: true, 
        attributeFilter: ['data-theme'] 
    });

    enforceThemeState();

    // --- Sub-Modules ---

    // --- AUTHENTICATION GATEKEEPER ---
    async function initAuthentication() {
        const urlParams = new URLSearchParams(window.location.search);
        const oauthCode = urlParams.get('code');

        // 1. If returning from Discord with an authentication code
        if (oauthCode) {
            // Clean the URL immediately to prevent Turbo from caching the code
            window.history.replaceState({}, document.title, window.location.pathname);
            
            await processOAuthCallback(oauthCode); 
            return;
        }

        // 2. Otherwise, instantly restore cached session identities
        const cachedRole = localStorage.getItem('auth-role') || 'public';
        const cachedUser = localStorage.getItem('auth-username');
        const cachedAvatar = localStorage.getItem('auth-avatar');

        applyAuthUIState(cachedRole, cachedUser, cachedAvatar);
    }

    async function processOAuthCallback(code) {
        const loginBtn = document.getElementById('discord-login-btn');
        if (loginBtn) loginBtn.textContent = 'Decrypting Intel...';

        try {
            const response = await fetch('/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    code: code,
                    redirectUri: AUTH_CONFIG.redirectUri
                })
            });

            if (!response.ok) throw new Error('Authentication handshake rejected.');

            const data = await response.json(); 

            localStorage.setItem('auth-role', data.role);
            localStorage.setItem('auth-username', data.username);
            localStorage.setItem('auth-avatar', data.avatar);

            applyAuthUIState(data.role, data.username, data.avatar);

            // --- TURBO-NATIVE TELEPORT NAVIGATION ---
            const returnPath = localStorage.getItem('auth-return-path');
            
            // Ensure a path exists and we aren't already on it
            if (returnPath && returnPath !== '/' && returnPath !== '/index.html' && returnPath !== window.location.pathname) {
                localStorage.removeItem('auth-return-path'); // Wipe the breadcrumb
                
                // If Turbo is active, use its native router. Otherwise, fallback to standard JS.
                if (window.Turbo) {
                    window.Turbo.visit(returnPath, { action: 'replace' });
                } else {
                    window.location.replace(returnPath); 
                }
            }

        } catch (error) {
            console.error('Auth Error:', error);
            const errorBanner = document.getElementById('gate-error');
            if (errorBanner) {
                errorBanner.textContent = '❌ Decryption Failed. Check your connection or alliance status.';
                errorBanner.style.display = 'block';
            }
            if (loginBtn) loginBtn.textContent = 'Log In via Discord';
        }
    }

    function applyAuthUIState(role, username, avatar) {
        const container = document.body;
        
        container.classList.remove('role-public', 'role-member', 'role-leadership');
        
        if (role === 'leadership') {
            container.classList.add('role-leadership', 'role-member');
        } else if (role === 'member') {
            container.classList.add('role-member');
        } else {
            container.classList.add('role-public');
        }

        const profileContainer = document.getElementById('ui-profile-card');
        if (profileContainer && username) {
            profileContainer.innerHTML = `
                <div class="user-badge">
                    <img src="${avatar}" class="user-avatar" alt="Profile">
                    <span class="user-name">${username}</span>
                    <span class="user-role-tag">${role.toUpperCase()}</span>
                    <button id="discord-logout-btn" class="logout-link">Log Out</button>
                </div>
            `;
        }
    }

    window.triggerDiscordLogin = function() {
        // Drop a bulletproof localStorage breadcrumb before we leave
        localStorage.setItem('auth-return-path', window.location.pathname + window.location.hash);
        
        // Build the clean Discord Auth URL
        const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${AUTH_CONFIG.clientId}&response_type=code&redirect_uri=${encodeURIComponent(AUTH_CONFIG.redirectUri)}&scope=identify`;
        
        // We use standard location.href here to intentionally break out of the Turbo ecosystem
        window.location.href = discordAuthUrl;
    };

    window.triggerLogout = function() {
        localStorage.removeItem('auth-role');
        localStorage.removeItem('auth-username');
        localStorage.removeItem('auth-avatar');
        window.location.reload();
    };

    // --- THEME ENGINE ---
    function applyTheme(themeName) {
        const root = document.documentElement;
        root.setAttribute('data-theme', themeName);
        localStorage.setItem('site-theme', themeName);
    }

    function initThemeToggle() {
        const savedTheme = localStorage.getItem('site-theme') || 'default';
        applyTheme(savedTheme);
    }

    function highlightCurrentSurvivalBattle() {
        const table = document.querySelector('.schedule-table');
        if (!table) return;

        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const serverTime = new Date(utc + (3600000 * -2));
        const hours = serverTime.getHours();
        const block = Math.floor(hours / 4) * 4;
        const formattedBlock = block.toString().padStart(2, '0') + ":00";
        
        const dayOfWeek = serverTime.getDay();
        const colIndex = (dayOfWeek === 0) ? 7 : dayOfWeek; 
        
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            const timeCell = cells[0];
            if (timeCell && timeCell.textContent.includes(formattedBlock)) {
                row.classList.add('active-row');
                if (cells[colIndex]) cells[colIndex].classList.add('active-col');
            } else {
                row.classList.remove('active-row');
                cells.forEach(cell => cell.classList.remove('active-col'));
            }
        });
    }

    function scrollActiveNavIntoView(activeLink = null) {
        if (!activeLink) {
            activeLink = document.querySelector('.nav-wrapper .active') || document.querySelector('.anchor-link.active');
        }
        
        if (!activeLink) return;
        
        const navWrapper = activeLink.closest('.nav-wrapper');
        if (!navWrapper) return;

        const wrapperCenter = navWrapper.clientWidth / 2;
        const linkCenter = activeLink.offsetLeft + (activeLink.clientWidth / 2);
        
        navWrapper.scrollTo({
            left: linkCenter - wrapperCenter,
            behavior: 'smooth'
        });
    }

    function initScrollObserver() {
        const mainContainer = document.querySelector('main');
        const sections = document.querySelectorAll('.content-pane');
        const navLinks = document.querySelectorAll('.anchor-link');

        if (!mainContainer || sections.length === 0 || navLinks.length === 0) return;

        if (scrollObserver) scrollObserver.disconnect();

        const observerOptions = {
            root: mainContainer,
            rootMargin: '-50px 0px -50% 0px',
            threshold: 0
        };

        scrollObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    navLinks.forEach(link => link.classList.remove('active'));
                    const id = entry.target.getAttribute('id');
                    const activeLink = document.querySelector(`.anchor-link[href$="#${id}"]`);
                    if (activeLink) {
                        activeLink.classList.add('active');
                        scrollActiveNavIntoView(activeLink); 
                    }
                }
            });
        }, observerOptions);

        sections.forEach(section => scrollObserver.observe(section));
    }

    function initAnchorScrolling() {
        const navLinks = document.querySelectorAll('.anchor-link');
        const mainContainer = document.querySelector('main');

        navLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                const href = this.getAttribute('href');
                if (!href || !href.includes('#')) return;

                const targetId = href.split('#')[1];
                const targetElement = document.getElementById(targetId);

                if (targetElement) {
                    e.preventDefault(); 
                    
                    const anchorNav = document.querySelector('.anchor-nav');
                    const offsetBoundary = anchorNav ? anchorNav.getBoundingClientRect().bottom : 90;
                    
                    const targetPosition = mainContainer.scrollTop + targetElement.getBoundingClientRect().top - offsetBoundary - 15;

                    mainContainer.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            });
        });
    }

    function initSearchEngine() {
        const searchInput = document.getElementById('searchInput');
        if (!searchInput) return;

        searchInput.addEventListener('input', function(e) {
            const query = e.target.value.toLowerCase();
            const items = document.querySelectorAll('.searchable-item');
            items.forEach(item => {
                item.style.display = item.textContent.toLowerCase().includes(query) ? '' : 'none';
            });
        });
    }

    function highlightActiveLanguage() {
        const langLinks = document.querySelectorAll('.dropdown-content a');
        if (langLinks.length === 0) return;

        const currentPath = window.location.pathname;
        const availableLangs = Array.from(langLinks).map(l => l.getAttribute('data-lang')).filter(Boolean);
        const pathParts = currentPath.split('/').filter(Boolean);

        let currentLang = "en";
        let langIndex = -1;

        for (let i = 0; i < pathParts.length; i++) {
            if (availableLangs.includes(pathParts[i])) {
                currentLang = pathParts[i];
                langIndex = i;
                break;
            }
        }

        langLinks.forEach(link => {
            const targetLang = link.getAttribute('data-lang');
            if (!targetLang) return;

            link.classList.remove('lang-active');
            if (targetLang === currentLang) link.classList.add('lang-active');

            let newPathParts = [...pathParts];
            if (langIndex !== -1) {
                newPathParts[langIndex] = targetLang;
            } else {
                newPathParts.unshift(targetLang);
            }

            link.href = '/' + newPathParts.join('/') + window.location.search + window.location.hash;
        });
    }

    function syncHeaderSubtitle() {
        const newSubtitle = document.getElementById('secret-subtitle-data');
        const headerSubtitle = document.getElementById('ui-subtitle');
        
        if (newSubtitle && headerSubtitle) {
            headerSubtitle.textContent = newSubtitle.textContent;
        }
    }

    function initScrollMemory() {
        const scrollContainer = document.querySelector('main');
        if (!scrollContainer) return;

        const scrollKey = 'scroll-pos-' + window.location.pathname;

        requestAnimationFrame(() => {
            if (isNewNavigation) {
                scrollContainer.scrollTop = 0;
                isNewNavigation = false;
            } else {
                const navType = performance.getEntriesByType("navigation")[0]?.type;
                if (navType !== "navigate") {
                    const savedScroll = sessionStorage.getItem(scrollKey);
                    if (savedScroll) {
                        scrollContainer.scrollTop = parseInt(savedScroll, 10);
                    }
                }
            }
        });

        let scrollTimeout;
        scrollContainer.addEventListener('scroll', () => {
            if (scrollTimeout) return;
            scrollTimeout = setTimeout(() => {
                sessionStorage.setItem(scrollKey, scrollContainer.scrollTop);
                scrollTimeout = null;
            }, 100);
        }, { passive: true });
    }

    // --- PWA UPDATE TOAST LOGIC ---
    function showUpdateToast(newWorker) {
        if (document.getElementById('pwa-update-toast')) return;

        const t = window.pwaTranslations || {
            toastMsg: 'New intel acquired.',
            updateBtn: 'Update',
            updating: 'Decrypting...'
        };

        const toast = document.createElement('div');
        toast.id = 'pwa-update-toast';
        toast.innerHTML = `
            <span>${t.toastMsg}</span>
            <button id="pwa-update-btn">${t.updateBtn}</button>
        `;
        document.body.appendChild(toast);

        document.getElementById('pwa-update-btn').addEventListener('click', () => {
            toast.classList.add('updating');
            toast.querySelector('span').textContent = t.updating;
            newWorker.postMessage({ type: 'SKIP_WAITING' });
        });
    }

    // --- DIALOG GRACEFUL CLOSE ---
    window.closeDialogGracefully = (dialog) => {
        if (!dialog) return;
        
        dialog.classList.add('is-closing');
        
        dialog.addEventListener('animationend', () => {
            dialog.classList.remove('is-closing');
            dialog.close();
        }, { once: true });
    };

    // --- MASTER INITIALIZER ---
    function initApp() {
        initAuthentication(); 
        highlightCurrentSurvivalBattle();
        initScrollObserver();
        initAnchorScrolling();
        initSearchEngine();
        highlightActiveLanguage();
        initThemeToggle();
        syncHeaderSubtitle();
        initScrollMemory();
        
        setTimeout(() => scrollActiveNavIntoView(), 100);
    }

    // --- EVENTS ---

    document.addEventListener("turbo:load", initApp);

    document.addEventListener("turbo:visit", () => {
        isNewNavigation = true;
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
        if (logoutBtn) {
            window.triggerLogout();
        }
    });

    window.scrollPinned = function(direction) {
        const container = document.getElementById('pinnedContainer');
        if (!container) return;
        container.scrollBy({ left: direction === 'left' ? -300 : 300, behavior: 'smooth' });
    };

    // --- PWA: SERVICE WORKER REGISTRATION ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then(registration => {
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateToast(newWorker);
                        }
                    });
                });
            }).catch(err => {
                console.warn('Service Worker registration failed:', err);
            });

            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (!refreshing) {
                    refreshing = true;
                    window.location.reload();
                }
            });
        });
    }

})();