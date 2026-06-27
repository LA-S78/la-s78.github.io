// js/dev-router.js
document.addEventListener('click', function(e) {
  const link = e.target.closest('a');
  if (link && link.getAttribute('href')) {
    const href = link.getAttribute('href');
    // If the link starts with a language code (e.g., /en/ or /fr/), strip it out.
    if (href.match(/^\/[a-z]{2}\//)) {
      e.preventDefault();
      window.location.href = href.replace(/^\/[a-z]{2}/, '');
    }
  }
});