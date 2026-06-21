/**
 * ----------------------------------------------------
 * LAST ASYLUM COMPENDIUM: MAIN ENGINE
 * ----------------------------------------------------
 */

// Global variable to track the observer across page transitions
let scrollObserver = null;

/**
 * Survival Battle Highlighting
 */
function highlightCurrentSurvivalBattle() {
    if (!document.querySelector('.schedule-table')) return;

    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const serverTime = new Date(utc + (3600000 * -2));
    
    const hours = serverTime.getHours();
    const block = Math.floor(hours / 4) * 4;
    const formattedBlock = block.toString().padStart(2, '0') + ":00";
    
    const dayOfWeek = serverTime.getDay();
    const colIndex = (dayOfWeek === 0) ? 7 : dayOfWeek; 
    
    const rows = document.querySelectorAll('.schedule-table tbody tr');
    rows.forEach(row => {
        const timeCell = row.querySelector('td');
        const cells = row.querySelectorAll('td');
        if (timeCell && timeCell.textContent.trim() === formattedBlock) {
            row.classList.add('active-row');
            if (cells[colIndex]) cells[colIndex].classList.add('active-col');
        } else {
            row.classList.remove('active-row');
            cells.forEach(cell => cell.classList.remove('active-col'));
        }
    });
}

/**
 * Main Turbo-Load Initialization
 */
document.addEventListener("turbo:load", function() {
    // 1. Run Battle Highlight
    highlightCurrentSurvivalBattle();

    // 2. Kill the "Zombie Observer" (The fix you were missing)
    if (scrollObserver) {
        scrollObserver.disconnect();
    }

    // 3. Initialize fresh Observer
    const observerOptions = {
        root: null, 
        rootMargin: '-200px 0px -50% 0px', 
        threshold: 0
    };

    scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                document.querySelectorAll('.anchor-link').forEach(link => link.classList.remove('active'));
                const activeLink = document.querySelector(`.anchor-link[href="#${entry.target.id}"]`);
                if (activeLink) activeLink.classList.add('active');
            }
        });
    }, observerOptions);

    // 4. Observe elements
    document.querySelectorAll('section, h2[id]').forEach(section => {
        scrollObserver.observe(section);
    });
});

/**
 * SEARCH ENGINE
 * Filters elements with the class 'searchable-item'
 */
document.addEventListener("turbo:load", function() {
    const searchInput = document.getElementById('searchInput');
    
    // Guard Clause: Only run if the search bar exists on this page
    if (!searchInput) return;

    searchInput.addEventListener('input', function(e) {
        const query = e.target.value.toLowerCase();
        const items = document.querySelectorAll('.searchable-item');

        items.forEach(item => {
            // Toggle visibility based on whether the content matches the query
            item.style.display = item.textContent.toLowerCase().includes(query) ? '' : 'none';
        });
    });
});