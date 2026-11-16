(function () {
  const savedTheme = localStorage.getItem('site-theme') || 'default';

  // Keeps the CSS theme state snappy
  if (savedTheme !== 'default') {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  // The phone's status bar (Android: the installed app's top bar; also the browser bar) takes
  // its colour from <meta name="theme-color">. (The navigation bar at the bottom does not: on
  // the owner's Android phone it keeps the installed app's manifest theme_color, whatever the
  // page sets, so a page can't change it while it runs. site.webmanifest has #1a1513 for
  // theme_color and background_color, the average of the three themes' footers as drawn
  // (#12160e, #221911, #1b1019): neutral between them, owner decision 2026-11-16. theme_color
  // was #22301c, Lantern's header green, which showed as a green bar in every theme.) It used to be a fixed dark brown whatever the
  // theme; now it is the colour of the header's top edge in the active theme. Turbo swaps the
  // page's <head> on every visit (bringing back the fixed colour), so it is set again after
  // each visit as well as on a theme change (js/main.js, applyTheme).
  const toHex = (cssColour) => {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = cssColour;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  };
  window.syncThemeColour = function () {
    if (!document.body) return;
    // The header's top edge in this theme (--status-bar, measured: _css/style/05-…themes.css)
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:absolute;width:0;height:0;visibility:hidden;background-color:var(--status-bar)';
    document.body.appendChild(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    if (!colour || colour === 'rgba(0, 0, 0, 0)') return; // styles not loaded yet
    const hex = toHex(colour);
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      if (meta.content !== hex) meta.content = hex;
    }
  };
  for (const ev of ['DOMContentLoaded', 'load', 'turbo:render', 'turbo:load']) {
    (ev === 'load' ? window : document).addEventListener(ev, window.syncThemeColour);
  }
})();
