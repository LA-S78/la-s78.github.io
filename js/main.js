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
        const currentLang = pathParts.length > 0 ? pathParts[0] : "en"; 
        const langLinks = document.querySelectorAll('.dropdown-content a');
        
        langLinks.forEach(link => {
            link.classList.remove('lang-active');
            if (link.getAttribute('data-lang') === currentLang) link.classList.add('lang-active');
        });
    }

    function initThemeToggle() {
        const toggle = document.getElementById('theme-toggle');
        const body = document.body;
        if (!toggle) return;

        const themes = ['default', 'sanctuary', 'miasma'];

        // 2. Restore saved preference on load
        const savedTheme = localStorage.getItem('site-theme') || 'default';
        
        // Ensure the saved theme is still valid before applying it
        if (savedTheme !== 'default' && themes.includes(savedTheme)) {
            body.setAttribute('data-theme', savedTheme);
        }

        // 3. Cyclic Switcher Listener
        toggle.addEventListener('click', () => {
            // Read current state
            const currentTheme = body.getAttribute('data-theme') || 'default';
            
            // Find the index of the next theme in the loop
            let nextIndex = (themes.indexOf(currentTheme) + 1) % themes.length;
            const nextTheme = themes[nextIndex];

            // Apply new state
            if (nextTheme === 'default') {
                body.removeAttribute('data-theme');
                localStorage.removeItem('site-theme');
            } else {
                body.setAttribute('data-theme', nextTheme);
                localStorage.setItem('site-theme', nextTheme);
            }
        });
    }

    // --- Dynamic Subtitle Sync ---
    // Grabs the hidden subtitle from the newly loaded Turbo Frame and pushes it to the frozen header
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
        initSearchEngine();
        highlightActiveLanguage();
        initThemeToggle();
        syncHeaderSubtitle(); // <-- Ensures subtitle updates on every page swap
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