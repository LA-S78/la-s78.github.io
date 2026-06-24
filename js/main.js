/**
 * ----------------------------------------------------
 * LAST ASYLUM COMPENDIUM: MAIN ENGINE
 * ----------------------------------------------------
 */

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
    const sections = document.querySelectorAll('section');
    const navLinks = document.querySelectorAll('.anchor-link');

    if (sections.length === 0 || navLinks.length === 0) return;

    // Disconnect old observer if it exists to prevent duplicate triggers
    if (scrollObserver) scrollObserver.disconnect();

    const observerOptions = {
        root: null,
        rootMargin: '-100px 0px -60% 0px',
        threshold: 0
    };

    scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                navLinks.forEach(link => link.classList.remove('active'));
                const id = entry.target.getAttribute('id');
                const activeLink = document.querySelector(`.anchor-link[href="#${id}"]`);
                if (activeLink) activeLink.classList.add('active');
            }
        });
    }, observerOptions);

    sections.forEach(section => scrollObserver.observe(section));
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