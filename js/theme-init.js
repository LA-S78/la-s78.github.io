(function() {
    const savedTheme = localStorage.getItem('site-theme');
    const themes = {
        'sanctuary': '#e6a050',
        'miasma': '#8c32b4',
        'default': '#1a1512'
    };
    
    const color = themes[savedTheme] || themes['default'];
    document.write('<meta name="theme-color" content="' + color + '">');
})();