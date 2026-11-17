// Alliance pictures behind the NAP Ranks rows and the Capitol Rotation cards, without the
// late "pop" (owner, 2026-11-17). The pictures were already kept by sw.js like other images
// (30 days), but a row was drawn first and its picture appeared a moment later, and the
// Alliance page draws twice (this device's saved copy, then the fresh answer). Now:
//   - a picture starts loading as soon as a page knows about it;
//   - a row whose picture isn't ready yet is drawn plain, and the picture fades in once it
//     is fully loaded (.ally-pic-in, _css/style/72-alliance-pictures.css);
//   - a picture already loaded in this visit is drawn straight away, so a redraw doesn't
//     fade it again.

const SAFE = /^\/alliance-images\/[A-Za-z0-9.-]+$/;
const ready = new Set();
const loading = new Map();

/** Loads and decodes a picture once; resolves when it can be shown at once. */
export function loadAllyPic(url) {
  if (ready.has(url)) return Promise.resolve();
  if (!loading.has(url)) {
    const img = new Image();
    img.src = url;
    const done = img.decode
      ? img.decode()
      : new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
    loading.set(
      url,
      done.then(() => ready.add(url)).finally(() => loading.delete(url)),
    );
  }
  return loading.get(url);
}

/**
 * The class and attributes for an element with `url` behind it: the picture itself when it
 * is ready, else a data-ally-pic for revealAllyPics(). Both '' when there is no picture.
 */
export function allyPicMarkup(url) {
  if (typeof url !== 'string' || !SAFE.test(url)) return { cls: '', attrs: '' };
  if (ready.has(url)) return { cls: ' has-ally-pic', attrs: ` style="--ally-pic: url('${url}')"` };
  loadAllyPic(url).catch(() => {});
  return { cls: '', attrs: ` data-ally-pic="${url}"` };
}

/** Fades in each picture under `root` that wasn't ready when it was drawn. */
export function revealAllyPics(root) {
  if (!root) return;
  root.querySelectorAll('[data-ally-pic]').forEach((el) => {
    const url = el.dataset.allyPic;
    loadAllyPic(url)
      .then(() => {
        if (!el.isConnected || el.dataset.allyPic !== url) return;
        el.removeAttribute('data-ally-pic');
        el.style.setProperty('--ally-pic', `url('${url}')`);
        el.classList.add('has-ally-pic', 'ally-pic-in');
        const end = (e) => {
          if (e.target !== el || e.animationName !== 'ally-pic-in') return;
          el.classList.remove('ally-pic-in');
          el.removeEventListener('animationend', end);
        };
        el.addEventListener('animationend', end);
      })
      .catch(() => {}); // a picture that won't load: the row stays plain
  });
}
