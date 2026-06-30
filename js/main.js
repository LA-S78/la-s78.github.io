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
        const pathParts = window.location.pathname.split('/').filter(Boolean);
        const langLinks = document.querySelectorAll('.dropdown-content a');
        if (langLinks.length === 0) return;

        // Gather all valid language codes from your dropdown data attributes
        const availableLangs = Array.from(langLinks).map(l => l.getAttribute('data-lang')).filter(Boolean);
        
        // Determine current language from the URL (defaults to 'en' if no valid lang code is in the path)
        let currentLang = "en";
        if (pathParts.length > 0 && availableLangs.includes(pathParts[0])) {
            currentLang = pathParts[0];
        }

        langLinks.forEach(link => {
            const targetLang = link.getAttribute('data-lang');
            if (!targetLang) return;

            // 1. Highlight the active link
            link.classList.remove('lang-active');
            if (targetLang === currentLang) link.classList.add('lang-active');

            // 2. Dynamically rebuild the href for the current page
            let newPathParts = [...pathParts];
            
            if (currentLang !== "en" && availableLangs.includes(currentLang)) {
                // We are currently on a translated page (e.g., /fr/guides)
                if (targetLang === "en") {
                    newPathParts.shift(); // Remove the 'fr' to return to default English root
                } else {
                    newPathParts[0] = targetLang; // Swap 'fr' for 'de'
                }
            } else {
                // We are currently on the default English page (e.g., /guides)
                if (targetLang !== "en") {
                    newPathParts.unshift(targetLang); // Prepend the new language code
                }
            }

            // Reconstruct the full URL, preserving any search queries (?) or anchor links (#)
            link.href = '/' + newPathParts.join('/') + window.location.search + window.location.hash;
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