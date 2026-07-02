(function() {
    const savedTheme = localStorage.getItem('site-theme');
    if (savedTheme && savedTheme !== 'default') {
        // Apply the theme to the <html> tag immediately
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
})();