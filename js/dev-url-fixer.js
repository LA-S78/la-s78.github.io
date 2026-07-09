// --- DEV ENVIRONMENT URL CATCH-ALL ---
document.addEventListener('click', function(e) {
    // Find the closest anchor tag
    const anchor = e.target.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    // Check if the URL accidentally compiled as "https://index.html..." 
    // or if it's a relative path missing its leading slash on the preview domain
    if (href.startsWith('index.html') || href.startsWith('rules.html') || href.startsWith('alliance.html') || /^[a-z]{2}\//.test(href)) {
        
        e.preventDefault(); // Stop the broken redirect
        
        // Construct the clean absolute path relative to the current preview domain root
        const cleanPath = '/' + href.replace(/^\/+/, '');
        
        // Handle Turbo transitions smoothly if you use Turbo, otherwise standard fallback
        if (window.Turbo) {
            window.Turbo.visit(cleanPath);
        } else {
            window.location.pathname = cleanPath;
        }
    }
}, true);