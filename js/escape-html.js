// Escapes text before it is inserted into HTML (innerHTML / template strings), so names,
// titles and other data from users or the API can never be interpreted as HTML or script.
// Use it for every value that isn't fixed text written in the code:
//   el.innerHTML = `<span>${escapeHtml(player.name)}</span>`;
// Loaded early in <head> (structure/head.html), so every script, module or not, can use it.
(function () {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  window.escapeHtml = (value) =>
    value === null || value === undefined ? '' : String(value).replace(/[&<>"']/g, (c) => map[c]);
})();
