/**
 * ----------------------------------------------------
 * LAST ASYLUM COMPENDIUM: MAIN ENGINE
 * ----------------------------------------------------
 */

// Wrap everything in an IIFE to create a local scope (Sandbox)
(() => {
    
    let scrollObserver = null;

    function highlightCurrentSurvivalBattle() {
        const table = document.querySelector('.schedule-table');
        if (!table) return; // Silent abort if not on the page

        console.log("Survival Battle table found. Calculating server time...");

        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const serverTime = new Date(utc + (3600000 * -2));
        
        const hours = serverTime.getHours();
        const block = Math.floor(hours / 4) * 4;
        const formattedBlock = block.toString().padStart(2, '0') + ":00";
        
        const dayOfWeek = serverTime.getDay();
        const colIndex = (dayOfWeek === 0) ? 7 : dayOfWeek; 
        
        console.log(`Targeting Block: ${formattedBlock}, Day Column: ${colIndex}`);
        
        const rows = table.querySelectorAll('tbody tr');
        let matchFound = false;

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            const timeCell = cells[0]; // Safely grabs the very first cell

            // We use .includes() instead of strict === to ignore hidden spaces/breaks
            if (timeCell && timeCell.textContent.includes(formattedBlock)) {
                matchFound = true;
                row.classList.add('active-row');
                if (cells[colIndex]) {
                    cells[colIndex].classList.add('active-col');
                }
            } else {
                row.classList.remove('active-row');
                cells.forEach(cell => cell.classList.remove('active-col'));
            }
        });

        if (!matchFound) {
            console.warn(`Could not find a row containing the time: ${formattedBlock}`);
        }
    }

    function initScrollObserver() {
        const mainContainer = document.querySelector('main'); // Watch the correct scrolling container
        const sections = document.querySelectorAll('.content-pane'); // Target your sections
        const navLinks = document.querySelectorAll('.anchor-link');

        if (!mainContainer || sections.length === 0 || navLinks.length === 0) return;

        if (scrollObserver) scrollObserver.disconnect();

        const observerOptions = {
            root: mainContainer, // Explicitly use 'main' as the scroll container
            rootMargin: '-50px 0px -50% 0px', // Adjusted for better trigger
            threshold: 0
        };

        scrollObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Remove active from all
                    navLinks.forEach(link => link.classList.remove('active'));
                    
                    // Add active to current
                    const id = entry.target.getAttribute('id');
                    const activeLink = document.querySelector(`.anchor-link[href$="#${id}"]`);
                    if (activeLink) activeLink.classList.add('active');
                }
            });
        }, observerOptions);

        sections.forEach(section => scrollObserver.observe(section));

        // FIX: Manually activate the first link if the page loads at the top
        // Check if the scroll position is at the very top (or near it)
        if (mainContainer.scrollTop < 100) {
            navLinks.forEach(link => link.classList.remove('active'));
            if (navLinks[0]) navLinks[0].classList.add('active');
        }
    }

    function initSearchEngine() {
        const searchInput = document.getElementById('searchInput');
        if (!searchInput) return;

        // Remove old listeners by cloning and replacing the node (prevents duplicate triggers)
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);

        newSearchInput.addEventListener('input', function(e) {
            const query = e.target.value.toLowerCase();
            const items = document.querySelectorAll('.searchable-item');

            items.forEach(item => {
                item.style.display = item.textContent.toLowerCase().includes(query) ? '' : 'none';
            });
        });
    }

    /**
     * MASTER INITIALIZER
     * Runs all scripts cleanly. We use a named function so we can attach it
     * safely to multiple load events without duplicate execution.
     */
    function initCompendium() {
        highlightCurrentSurvivalBattle();
        initScrollObserver();
        initSearchEngine();
    }

    // Turbo navigation event
    document.addEventListener("turbo:load", initCompendium);

    // Fallback for direct page loads where Turbo might bypass the first event
    document.addEventListener("DOMContentLoaded", initCompendium);

    // Pinned Directory scrolling (Exposed to global scope so HTML onClick can find it)
    window.scrollPinned = function(direction) {
        const container = document.getElementById('pinnedContainer');
        const scrollAmount = 300; 
        if (direction === 'left') {
            container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
        } else {
            container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
    };

})(); // End of Sandbox

function highlightActiveLanguage() {
    // 1. Grab the current URL path (e.g., "/de/guides/")
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    
    // 2. The first folder is always the language. If empty, default to 'en'
    const currentLang = pathParts.length > 0 ? pathParts[0] : "en"; 

    // 3. Find all language links
    const langLinks = document.querySelectorAll('.dropdown-content a');
    
    langLinks.forEach(link => {
        // Reset all links
        link.classList.remove('lang-active');
        
        // If the data-lang matches the URL, turn it gold
        if (link.getAttribute('data-lang') === currentLang) {
            link.classList.add('lang-active');
        }
    });
}

// Run on standard initial load
document.addEventListener("DOMContentLoaded", highlightActiveLanguage);

// Run every time Turbo.js swaps the page content
document.addEventListener("turbo:load", highlightActiveLanguage);