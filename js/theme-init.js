(function() {
    const savedTheme = localStorage.getItem('site-theme') || 'default';
    
    // Hardcoded dictionary for instant, zero-jitter injection
    const themeColors = {
        'default': 'rgb(35, 120, 45)',   // Plague (Green)
        'sanctuary': 'rgb(230, 160, 80)', // Sanctuary (Orange)
        'miasma': 'rgb(140, 50, 180)'     // Miasma (Purple)
    };

    if (savedTheme !== 'default') {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
    
    // Inject the theme color into the meta tag immediately
    let metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
        metaTheme.setAttribute('content', themeColors[savedTheme] || 'rgb(35, 120, 45)');
    }
})();