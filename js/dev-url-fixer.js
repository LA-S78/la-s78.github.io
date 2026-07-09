// --- ALL-PAGE TURBO DEV ENVIRONMENT CATCH-ALL ---
(function() {
    function fixDevLink(e) {
        // Target the actual anchor element being clicked
        const anchor = e.target.closest('a');
        if (!anchor) return;

        const href = anchor.getAttribute('href');
        if (!href) return;

        // Ignore absolute external links, section hashes, and already-correct root paths
        if (href.startsWith('http') || href.startsWith('#') || href.startsWith('/')) {
            return;
        }

        // If we reach here, it's a relative path missing its leading root slash (e.g., "en/rules.html")
        e.preventDefault();

        // Standardize it to a clean root path (e.g., "/en/rules.html")
        const cleanPath = '/' + href;

        if (window.Turbo) {
            window.Turbo.visit(cleanPath);
        } else {
            window.location.pathname = cleanPath;
        }
    }

    // Bind to both standard clicks and Turbo-specific click pipelines
    document.removeEventListener('turbo:click', fixDevLink);
    document.addEventListener('turbo:click', fixDevLink);
    
    document.removeEventListener('click', fixDevLink, true);
    document.addEventListener('click', fixDevLink, true);
})();