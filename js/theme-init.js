(function() {
    const savedTheme = localStorage.getItem('site-theme') || 'default';
    
    // Keeps the CSS theme state snappy
    if (savedTheme !== 'default') {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
})();