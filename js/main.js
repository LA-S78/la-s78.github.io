/**
 * Navigation Observer
 * Highlights active sections as the user scrolls.
 */
const observerOptions = {
    root: null, 
    rootMargin: '-200px 0px -50% 0px', 
    threshold: 0
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            document.querySelectorAll('.anchor-link').forEach(link => {
                link.classList.remove('active');
            });
            const activeLink = document.querySelector(`.anchor-link[href="#${entry.target.id}"]`);
            if (activeLink) {
                activeLink.classList.add('active');
            }
        }
    });
}, observerOptions);

document.querySelectorAll('section, h2[id]').forEach(section => {
    observer.observe(section);
});

/**
 * Survival Battle Highlighting
 * Highlights the current 4-hour slot based on Server Time (UTC-2).
 */
function highlightCurrentSurvivalBattle() {
    // 1. Get Server Time (UTC-2)
    const now = new Date();
    // Convert current local time to UTC, then subtract 2 hours
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

        // Check if this row is the current time block
        if (timeCell.textContent.trim() === formattedBlock) {
            row.classList.add('active-row');
            
            // Highlight the specific day column
            if (cells[colIndex]) {
                cells[colIndex].classList.add('active-col');
            }
        } else {
            // Cleanup: remove highlights from all non-active cells/rows
            row.classList.remove('active-row');
            cells.forEach(cell => cell.classList.remove('active-col'));
        }
    });
}

// Initialize on page load
document.addEventListener("turbo:load", function() {
    highlightCurrentSurvivalBattle();
});