/**
 * ----------------------------------------------------
 * LAST ASYLUM COMPENDIUM: MAIN ENGINE
 * ----------------------------------------------------
 */

// Global variable to track the observer across page transitions
let scrollObserver = null;

/**
 * Survival Battle Highlighting
 * Highlights the current 4-hour slot based on Server Time (UTC-2).
 */
function highlightCurrentSurvivalBattle() {
    // Guard clause: Only run if the table exists on the current page
    if (!document.querySelector('.schedule-table')) return;

    // 1. Get Server Time (UTC-2)
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const serverTime = new Date(utc + (3600000 * -2));
    
    // 2. Calculate the Time Row (4-hour block)
    const hours = serverTime.getHours();
    const block = Math.floor(hours / 4) * 4;
    const formattedBlock = block.toString().padStart(2, '0') + ":00";
    
    // 3. Calculate the Day Column (Monday = 1, Sunday = 7)
    const dayOfWeek = serverTime.getDay();
    const colIndex = (dayOfWeek === 0) ? 7 : dayOfWeek; 
    
    // 4. Update the Table
    const rows = document.querySelectorAll('.schedule-table tbody tr');
    
    rows.forEach(row => {
        const timeCell = row.querySelector('td');
        const cells = row.querySelectorAll('td');

        if (timeCell.textContent.trim() === formattedBlock) {
            row.classList.add('active-row');
            if (cells[colIndex]) {
                cells[colIndex].classList.add('active-col');
            }
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
    
    // 1. Initialize Survival Battle Highlights
    highlightCurrentSurvivalBattle();

    // 2. Smooth Scrolling & Turbo Fix for Anchor Links
    const anchorLinks = document.querySelectorAll('.anchor-link');
    
    anchorLinks.forEach(link => {
        // Prevent Turbo from intercepting the anchor link
        link.setAttribute('data-turbo', 'false');
        
        link.addEventListener('click', function(e) {
            e.preventDefault(); 
            
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                // Offset by 120px to account for sticky header and nav
                const offset = targetElement.getBoundingClientRect().top + window.scrollY - 120;
                window.scrollTo({ top: offset, behavior: 'smooth' });
            }
        });
    });

    // 3. Kill the "Zombie Observer" (prevents memory leaks on page change)
    if (scrollObserver) {
        scrollObserver.disconnect();
    }

    // 4. Navigation Observer (ScrollSpy)
    const observerOptions = {
        root: null, 
        // Adjusted top margin to account for your 120px sticky header
        rootMargin: '-130px 0px -50% 0px', 
        threshold: 0
    };

    scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Remove active class from all nav links
                anchorLinks.forEach(link => link.classList.remove('active'));
                
                // Add active class to the link matching the target ID
                const activeLink = document.querySelector(`.anchor-link[href="#${entry.target.id}"]`);
                if (activeLink) {
                    activeLink.classList.add('active');
                }
            }
        });
    }, observerOptions);

    // Observe all headers that have an ID
    document.querySelectorAll('h2[id]').forEach(target => {
        scrollObserver.observe(target);
    });
    
});