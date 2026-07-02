/**
 * ----------------------------------------------------
 * LAST ASYLUM COMPENDIUM: MAIN ENGINE (REFACTORED)
 * ----------------------------------------------------
 */
(() => {
    let scrollObserver = null;
    let isNewNavigation = false;

    // --- Sub-Modules ---

    function initPWA() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(err => {
                console.warn('Service Worker registration failed:', err);
            });
        }
    }

    function applyTheme(themeName) {
        const root = document.documentElement;
        const themes = ['default', 'sanctuary', 'miasma'];
        
        // The same dictionary
        const themeColors = {
            'default': 'rgb(35, 120, 45)',
            'sanctuary': 'rgb(230, 160, 80)',
            'miasma': 'rgb(140, 50, 180)'
        };
        
        if (themeName === 'default') {
            root.removeAttribute('data-theme');
            localStorage.removeItem('site-theme');
        } else if (themes.includes(themeName)) {
            root.setAttribute('data-theme', themeName);
            localStorage.setItem('site-theme', themeName);
        }

        // Apply the new color to the status bar
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', themeColors[themeName] || 'rgb(35, 120, 45)');
        }
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
                    if (activeLink) activeLink.classList.add('active');
                }
            });
        }, observerOptions);

        sections.forEach(section => scrollObserver.observe(section));
    }

    function initAnchorScrolling() {
        const navLinks = document.querySelectorAll('.anchor-link');
        
        navLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                const href = this.getAttribute('href');
                if (!href || !href.includes('#')) return;

                const targetId = href.split('#')[1];
                const targetElement = document.getElementById(targetId);

                if (targetElement) {
                    e.preventDefault(); 
                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    function restoreThemeState() {
        const root = document.documentElement;
        // 1. Read the TRUE state from local storage, ignoring what Turbo just did to the DOM
        const savedTheme = localStorage.getItem('site-theme') || 'default';
        
        // 2. Force the HTML tag to hold the correct theme
        if (savedTheme === 'default') {
            root.removeAttribute('data-theme');
        } else {
            root.setAttribute('data-theme', savedTheme);
        }

        // 3. Force the Meta Tag to hold the correct color
        const themeColors = {
            'default': 'rgb(35, 120, 45)',
            'sanctuary': 'rgb(230, 160, 80)',
            'miasma': 'rgb(140, 50, 180)'
        };
        
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', themeColors[savedTheme]);
        }
    }

    // --- MASTER INITIALIZER ---
    function initApp() {
        initPWA(); 
        highlightCurrentSurvivalBattle();
        initScrollObserver();
        initAnchorScrolling();
        initSearchEngine();
        highlightActiveLanguage();
        initThemeToggle();
        syncHeaderSubtitle();
        initScrollMemory();
        restoreThemeState();
    }

    // --- EVENTS ---
    document.addEventListener("turbo:load", initApp);

    document.addEventListener("turbo:visit", () => {
        isNewNavigation = true;
    });

    document.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('#theme-toggle');
        if (!toggleBtn) return;

        const themes = ['default', 'sanctuary', 'miasma'];
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'default';
        let nextIndex = (themes.indexOf(currentTheme) + 1) % themes.length;
        
        applyTheme(themes[nextIndex]);
    });

    window.scrollPinned = function(direction) {
        const container = document.getElementById('pinnedContainer');
        if (!container) return;
        container.scrollBy({ left: direction === 'left' ? -300 : 300, behavior: 'smooth' });
    };

})();