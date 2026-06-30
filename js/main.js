/**
 * ----------------------------------------------------
 * LAST ASYLUM COMPENDIUM: MAIN ENGINE (REFACTORED)
 * ----------------------------------------------------
 */
(() => {
    let scrollObserver = null;

    // --- Sub-Modules ---

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

    // --- NEW: Fixes Turbo's Anchor Link Jumping ---
    function initAnchorScrolling() {
        const navLinks = document.querySelectorAll('.anchor-link');
        
        navLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                // Ensure it's a hash link
                const href = this.getAttribute('href');
                if (!href || !href.includes('#')) return;

                const targetId = href.split('#')[1];
                const targetElement = document.getElementById(targetId);

                if (targetElement) {
                    // Stop Turbo from hijacking the click
                    e.preventDefault(); 
                    
                    // Native smooth scroll (Respects your CSS scroll-margin-top)
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
        
        // 1. Cache the original root URLs (Jekyll generates these perfectly on load)
        langLinks.forEach(link => {
            if (!link.hasAttribute('data-root-url')) {
                link.setAttribute('data-root-url', link.getAttribute('href'));
            }
        });

        // 2. Find the absolute Base URL by looking at the default English link
        const enLink = document.querySelector('.dropdown-content a[data-lang="en"]');
        const baseUrl = enLink ? enLink.getAttribute('data-root-url') : '/';

        // 3. Extract just the page route, ignoring the base URL
        let relativePath = currentPath.startsWith(baseUrl) 
            ? currentPath.slice(baseUrl.length) 
            : currentPath.replace(/^\//, '');

        // 4. Detect if a language code is currently active in the route
        let currentLang = "en";
        for (const lang of availableLangs) {
            // Only trigger if it matches perfectly (e.g., "fr" or "fr/guides", not "french-guides")
            if (lang !== "en" && (relativePath === lang || relativePath.startsWith(`${lang}/`))) {
                currentLang = lang;
                
                // Strip the old language out to get the "clean" page path
                relativePath = relativePath.slice(lang.length);
                if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
                break;
            }
        }

        // 5. Update all links dynamically
        langLinks.forEach(link => {
            const targetLang = link.getAttribute('data-lang');
            if (!targetLang) return;

            // Update Visuals
            link.classList.remove('lang-active');
            if (targetLang === currentLang) link.classList.add('lang-active');

            // Combine root and relative path, ensuring exactly one slash between them
            let targetRoot = link.getAttribute('data-root-url').replace(/\/$/, '');
            let cleanRelative = relativePath.replace(/^\//, '');
            let fullPath = `${targetRoot}/${cleanRelative}`;
            
            // Strip the trailing slash (unless the entire path is literally just "/")
            if (fullPath.endsWith('/') && fullPath.length > 1) {
                fullPath = fullPath.slice(0, -1);
            }

            link.href = fullPath + window.location.search + window.location.hash;
        });
    }

    function initThemeToggle() {
        const toggle = document.getElementById('theme-toggle');
        const body = document.body;
        if (!toggle) return;

        const themes = ['default', 'sanctuary', 'outbreak', 'miasma'];
        const savedTheme = localStorage.getItem('site-theme') || 'default';
        
        if (savedTheme !== 'default' && themes.includes(savedTheme)) {
            body.setAttribute('data-theme', savedTheme);
        }

        toggle.addEventListener('click', () => {
            const currentTheme = body.getAttribute('data-theme') || 'default';
            let nextIndex = (themes.indexOf(currentTheme) + 1) % themes.length;
            const nextTheme = themes[nextIndex];

            if (nextTheme === 'default') {
                body.removeAttribute('data-theme');
                localStorage.removeItem('site-theme');
            } else {
                body.setAttribute('data-theme', nextTheme);
                localStorage.setItem('site-theme', nextTheme);
            }
        });
    }

    function syncHeaderSubtitle() {
        const newSubtitle = document.getElementById('secret-subtitle-data');
        const headerSubtitle = document.getElementById('ui-subtitle');
        
        if (newSubtitle && headerSubtitle) {
            headerSubtitle.textContent = newSubtitle.textContent;
        }
    }

    // --- MASTER INITIALIZER ---
    function initApp() {
        highlightCurrentSurvivalBattle();
        initScrollObserver();
        initAnchorScrolling(); // <-- Initialized Here
        initSearchEngine();
        highlightActiveLanguage();
        initThemeToggle();
        syncHeaderSubtitle();
    }

    // Single source of truth for initialization
    document.addEventListener("turbo:load", initApp);

    // Expose this for your HTML onclick attributes
    window.scrollPinned = function(direction) {
        const container = document.getElementById('pinnedContainer');
        if (!container) return;
        container.scrollBy({ left: direction === 'left' ? -300 : 300, behavior: 'smooth' });
    };

})();