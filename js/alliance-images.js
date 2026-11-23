// js/alliance-images.js
// The Alliance Dashboard's image section (owner request, 2026-11-16): leaders pick a picture
// for the alliance's Capitol Rotation card and NAP Ranks row, move and zoom it inside a frame
// of the right shape, see it on the real cards (phone and desktop), and send it to the
// Stewards (api/_alliance_images.js). The picture is cut and saved here, in the browser, at
// the exact size the server expects; saving it again drops hidden data such as a phone
// photo's GPS position.
// Used by portal/dashboard.html: AllianceImages.render(section, ctx) / .close(section).
// Under the charts and on its own (owner request): folded to the current pictures until
// "Edit images" opens the tools, so the dashboard's main tools come first.
(function () {
  'use strict';

  const esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const t = (key, vars) => window.t(`alliance_images.${key}`, vars);
  /** An interface icon (js/ui-icons.js) for the start of a label. */
  const ic = (name, tone) => (window.uiIcon ? window.uiIcon(name, tone) : '');
  const KINDS = ['card', 'wide', 'frame'];
  // The avatar frame (owner request, 2026-11-19): a transparent PNG drawn around members'
  // pictures. Like the game's 190×190 frames, at twice the size, with a see-through square
  // in the middle 62% wide (72 to 308 px at 380). Checked here before sending.
  const FRAME = { size: 380, hole: [72, 308], minSource: 190, maxBytes: 500 * 1024 };
  // Card sizes measured on the live pages (2026-11-16): what each screen really shows
  const PREVIEWS = {
    card: [
      ['preview_phone', 159],
      ['preview_desktop', 213],
    ],
    wide: [
      ['preview_phone', 345],
      ['preview_desktop', 918],
    ],
  };
  const MAX_ZOOM = 4; // up to 4 times the smallest zoom that fills the frame
  const TARGET_BYTES = 200 * 1024; // the server takes up to 250 KB
  const when = (ms) =>
    new Date(ms).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  // ---------- The section ----------

  function render(section, ctx) {
    // A picture being positioned is never wiped by a redraw of the dashboard
    if (section._ai?.crop && section._ai.ctx.alliance.tag === ctx.alliance.tag) {
      section._ai.ctx = ctx;
      return;
    }
    close(section);
    section._ai = { ctx, crop: null };
    // Open for this alliance until "Done editing" (kept through the dashboard's redraws)
    const open = section._aiOpen === ctx.alliance.tag;
    const st = ctx.images;
    const steward = ctx.steward;
    const canSend = st.ready && (steward || st.left > 0);
    section.classList.toggle('is-editing', open);
    // On the Steward page (ctx.direct): always open, without the leaders' button and review notes
    const direct = Boolean(ctx.direct);
    section.innerHTML = `
      <h3 class="dash-card-title">${ic('image')}${esc(t('title'))}</h3>
      <div class="dash-edit-bar ai-edit-bar"${direct ? ' hidden' : ''}>
        <button type="button" class="dash-btn dash-two-labels" data-ai="toggle" aria-pressed="${open}"><span class="when-off">${ic('pencil')}${esc(t('edit'))}</span><span class="when-on">${esc(t('done'))}</span></button>
      </div>
      ${
        open && !direct
          ? `<p class="ai-help">${esc(t('help'))}</p>
      <p class="ai-rules">${esc(t('rules'))}</p>
      <p class="ai-left dash-muted">${esc(st.ready ? (steward ? '' : t('left_today', { left: st.left, max: st.dailyLimit })) : t('not_ready'))}</p>`
          : '<p class="ai-left" hidden></p>'
      }
      <div class="ai-slots">${KINDS.map((kind) => slotHtml(kind, st.slots[kind], ctx, canSend, open)).join('')}</div>
      <div class="ai-crop" hidden></div>
      <p class="ai-message" role="status" hidden></p>
      <input type="file" class="ai-file" accept="image/*" hidden>`;
    section.querySelector('.ai-left').hidden = !section.querySelector('.ai-left').textContent;
    // A note from before the redraw (e.g. "Sent"), shown once
    if (section._aiNote) {
      say(section, section._aiNote.text, section._aiNote.kind);
      section._aiNote = null;
    }
    section.addEventListener('click', onClick);
    section.querySelector('.ai-file').addEventListener('change', onFile);
  }

  function slotHtml(kind, slot, ctx, canSend, open) {
    const lines = [];
    // [icon, its tone, text]
    if (slot.live) lines.push(['check', 'ok', t('live', { when: when(slot.live.at) })]);
    if (slot.pending)
      lines.push(['hourglass', 'wait', t('pending', { when: when(slot.pending.at) })]);
    if (slot.last) {
      const w = when(slot.last.at);
      if (slot.last.status === 'expired')
        lines.push(['hourglass', 'warn', t('expired', { when: w })]);
      else
        lines.push([
          'cross',
          'bad',
          slot.last.reason
            ? t('rejected_reason', { when: w, reason: slot.last.reason })
            : t('rejected', { when: w }),
        ]);
    }
    return `<div class="ai-slot" data-kind="${kind}">
      <div class="ai-slot-head"><strong>${esc(t(kind))}</strong>${open ? `<span class="dash-muted">${slot.width}×${slot.height}</span>` : ''}</div>
      <div class="ai-thumb${!open && !slot.live ? ' is-empty' : ''}"${open || slot.live ? ` style="aspect-ratio: ${slot.width} / ${slot.height}"` : ''}>${
        slot.live
          ? kind === 'frame'
            ? framedSample(slot.live.url, 'lg')
            : `<img src="${esc(slot.live.url)}" alt="${esc(`[${ctx.alliance.tag}] ${t(kind)}`)}" loading="lazy">`
          : `<span class="dash-muted">${esc(t('none'))}</span>`
      }</div>
      ${
        kind === 'frame' && slot.live
          ? `<label class="dash-check ai-use-frame"><input type="checkbox" data-ai="use-frame"${ctx.images.frameOn ? ' checked' : ''}> ${esc(t('use_frame'))}</label>
      ${
        // Over special frames too (owner, 2026-11-23): by default only the game's plain frame
        ctx.images.frameOn
          ? `<label class="dash-check ai-use-frame"><input type="checkbox" data-ai="frame-all"${ctx.images.frameAll ? ' checked' : ''}> ${esc(t('frame_all'))}</label>`
          : ''
      }
      <p class="dash-muted dash-small">${esc(t(!ctx.images.frameOn ? 'use_frame_off' : ctx.images.frameAll ? 'use_frame_all' : 'use_frame_on'))}</p>`
          : ''
      }
      ${kind === 'frame' && open ? `<p class="dash-muted dash-small ai-frame-spec">${esc(t('frame_spec'))}</p>` : ''}
      ${lines.map(([icon, tone, text]) => `<p class="ai-status">${ic(icon, tone)}${esc(text)}</p>`).join('')}
      ${
        open
          ? `<div class="ai-slot-actions">
        <button type="button" class="dash-btn" data-ai="choose" ${canSend ? '' : 'disabled'}>${ic('camera')}${esc(t(slot.live ? 'replace' : 'choose'))}</button>
        ${slot.live && ctx.images.canRemove ? `<button type="button" class="dash-btn" data-ai="remove">${ic('trash')}${esc(t('remove'))}</button>` : ''}
      </div>`
          : ''
      }
    </div>`;
  }

  /** A sample player's picture inside a frame, as the site draws members (player portraits). */
  function framedSample(url, size) {
    return `<span class="player-portrait ai-frame-sample pf-${size}" aria-hidden="true"><span class="pf-pic pf-initial">A</span><img class="pf-frame" src="${esc(url)}" alt=""></span>`;
  }

  /** "Send for review", or "Save (live now)" for a Steward on the Steward page. */
  const sendLabel = (section) => t(section._ai?.ctx.direct ? 'save_live' : 'send');

  function say(section, text, kind = '') {
    const el = section.querySelector('.ai-message');
    el.hidden = !text;
    el.className = `ai-message${kind ? ` is-${kind}` : ''}`;
    // Errors with a red cross, good news with a green tick
    const icon = kind === 'error' ? ic('cross', 'bad') : kind === 'ok' ? ic('check', 'ok') : '';
    el.innerHTML = text ? icon + esc(text) : '';
  }

  async function onClick(e) {
    const section = e.currentTarget;
    const b = e.target.closest('[data-ai]');
    if (!b) return;
    const act = b.dataset.ai;
    const kind = b.closest('[data-kind]')?.dataset.kind;
    if (act === 'toggle') {
      const tag = section._ai.ctx.alliance.tag;
      section._aiOpen = section._aiOpen === tag ? null : tag;
      const ctx = section._ai.ctx;
      closeCrop(section);
      render(section, ctx);
    } else if (act === 'choose') {
      section._ai.pickFor = kind;
      const input = section.querySelector('.ai-file');
      input.value = '';
      input.click();
    } else if (act === 'remove') {
      if (!confirm(t('confirm_remove', { slot: t(kind) }))) return;
      b.disabled = true;
      const r = await post(section, {
        type: 'alliance_image_remove',
        alliance: section._ai.ctx.alliance.tag,
        kind,
      });
      if (r.ok) section._ai.ctx.onChange?.();
      else b.disabled = false;
    } else if (act === 'use-frame' || act === 'frame-all') {
      b.disabled = true;
      const r = await post(section, {
        type: 'alliance_image_frame',
        alliance: section._ai.ctx.alliance.tag,
        // "Use for our members", and whether over special frames too
        on: act === 'use-frame' ? b.checked : true,
        all: act === 'frame-all' ? b.checked : Boolean(section._ai.ctx.images.frameAll),
      });
      if (r.ok) section._ai.ctx.onChange?.();
      else {
        b.checked = !b.checked;
        b.disabled = false;
      }
    } else if (act === 'cancel') {
      closeCrop(section);
    } else if (act === 'send') {
      send(section, b);
    } else if (act === 'send-frame') {
      sendFrame(section, b);
    }
  }

  function onFile(e) {
    const section = e.target.closest('section') || e.target.parentElement;
    const file = e.target.files && e.target.files[0];
    const kind = section._ai?.pickFor;
    if (!file || !section._ai?.ctx.images.slots[kind]) return; // only after "Choose a picture"
    say(section, '');
    if (kind === 'frame') return checkFrameFile(section, file);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => openCrop(section, kind, img, url);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      say(section, t('not_image'), 'error');
    };
    img.src = url;
  }

  // ---------- Moving and zooming ----------
  // Everything is worked out in the picture's final pixels (W×H); the frame on screen is the
  // same shape at any size, so a phone turned sideways keeps the same result.

  function openCrop(section, kind, img, url) {
    closeCrop(section);
    const ctx = section._ai.ctx;
    const slot = ctx.images.slots[kind];
    const W = slot.width;
    const H = slot.height;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    if (!iw || !ih) {
      URL.revokeObjectURL(url);
      return say(section, t('load_failed'), 'error');
    }
    const min = Math.max(W / iw, H / ih);
    const c = {
      kind,
      W,
      H,
      img,
      url,
      iw,
      ih,
      min,
      s: min,
      x: (W - iw * min) / 2,
      y: (H - ih * min) / 2,
      pointers: new Map(),
      previewUrls: [],
    };
    section._ai.crop = c;

    const box = section.querySelector('.ai-crop');
    box.hidden = false;
    box.innerHTML = `
      <h4 class="ai-crop-title">${esc(t('crop_title', { slot: t(kind) }))}</h4>
      <p class="dash-muted ai-crop-help">${esc(t('crop_help'))}</p>
      ${iw < W || ih < H ? `<p class="ai-status">${esc(t('too_small', { width: iw, height: ih }))}</p>` : ''}
      <div class="ai-frame ai-frame-${kind}" tabindex="0" role="img" aria-label="${esc(t('crop_title', { slot: t(kind) }))}" style="aspect-ratio: ${W} / ${H}">
        <img alt="" draggable="false" src="${esc(url)}" style="width:${iw}px;height:${ih}px">
      </div>
      <label class="ai-zoom"><span>${esc(t('zoom'))}</span><input type="range" min="0" max="100" step="1" value="0"></label>
      <h4 class="ai-crop-title">${esc(t('preview_title'))}</h4>
      <div class="ai-previews">${PREVIEWS[kind]
        .map(
          ([label, width]) =>
            `<figure class="ai-preview"><figcaption class="dash-muted">${esc(t(label))}</figcaption><div class="ai-scale"><div class="ai-scale-inner" style="width:${width}px">${previewCard(kind, ctx)}</div></div></figure>`,
        )
        .join('')}</div>
      <div class="dash-editor-actions">
        <button type="button" class="dash-icon-btn" data-ai="cancel">${esc(t('cancel'))}</button>
        <button type="button" class="submit-plan-btn" data-ai="send">${esc(sendLabel(section))}</button>
      </div>`;
    const frame = box.querySelector('.ai-frame');
    const zoom = box.querySelector('.ai-zoom input');
    c.frame = frame;
    c.zoom = zoom;

    frame.addEventListener('pointerdown', (e) => {
      try {
        frame.setPointerCapture(e.pointerId); // keeps following a finger that leaves the frame
      } catch (err) {
        // A pointer the browser no longer knows: the frame still gets its moves
      }
      c.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    frame.addEventListener('pointermove', (e) => {
      const before = c.pointers.get(e.pointerId);
      if (!before) return;
      const d = scaleOnScreen(c);
      if (c.pointers.size === 1) {
        c.x += (e.clientX - before.x) / d;
        c.y += (e.clientY - before.y) / d;
        c.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      } else if (c.pointers.size === 2) {
        const [a, b] = [...c.pointers.entries()].map(([id, p]) =>
          id === e.pointerId ? { x: e.clientX, y: e.clientY } : p,
        );
        const [a0, b0] = [...c.pointers.values()];
        const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) || 1;
        const r = frame.getBoundingClientRect();
        const mid = (p, q) => ({
          x: ((p.x + q.x) / 2 - r.left) / d,
          y: ((p.y + q.y) / 2 - r.top) / d,
        });
        const m0 = mid(a0, b0);
        const m1 = mid(a, b);
        zoomAt(c, c.s * (dist(a, b) / dist(a0, b0)), m0.x, m0.y);
        c.x += m1.x - m0.x; // and follow the fingers
        c.y += m1.y - m0.y;
        c.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      update(section);
    });
    const lift = (e) => c.pointers.delete(e.pointerId);
    frame.addEventListener('pointerup', lift);
    frame.addEventListener('pointercancel', lift);
    frame.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const d = scaleOnScreen(c);
        const r = frame.getBoundingClientRect();
        zoomAt(
          c,
          c.s * Math.exp(-e.deltaY * 0.0015),
          (e.clientX - r.left) / d,
          (e.clientY - r.top) / d,
        );
        update(section);
      },
      { passive: false },
    );
    frame.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 40 : 10;
      const moves = {
        ArrowLeft: [step, 0],
        ArrowRight: [-step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      };
      if (moves[e.key]) {
        c.x += moves[e.key][0];
        c.y += moves[e.key][1];
      } else if (e.key === '+' || e.key === '=') zoomAt(c, c.s * 1.1, W / 2, H / 2);
      else if (e.key === '-') zoomAt(c, c.s / 1.1, W / 2, H / 2);
      else return;
      e.preventDefault();
      update(section);
    });
    zoom.addEventListener('input', () => {
      zoomAt(c, c.min * Math.pow(MAX_ZOOM, zoom.value / 100), W / 2, H / 2);
      update(section, { fromSlider: true });
    });
    c.onResize = () => update(section);
    window.addEventListener('resize', c.onResize);
    update(section);
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /** How many screen pixels one final pixel takes in the frame. */
  const scaleOnScreen = (c) => c.frame.getBoundingClientRect().width / c.W || 1;

  /** Zooms to scale s, keeping the point (px, py) of the frame where it is. */
  function zoomAt(c, s, px, py) {
    const next = Math.min(c.min * MAX_ZOOM, Math.max(c.min, s));
    c.x = px - ((px - c.x) * next) / c.s;
    c.y = py - ((py - c.y) * next) / c.s;
    c.s = next;
  }

  /** The picture always fills the frame: no empty edge can be moved into view. */
  function clamp(c) {
    c.x = Math.min(0, Math.max(c.W - c.iw * c.s, c.x));
    c.y = Math.min(0, Math.max(c.H - c.ih * c.s, c.y));
  }

  function update(section, { fromSlider = false } = {}) {
    const c = section._ai?.crop;
    if (!c) return;
    clamp(c);
    const d = scaleOnScreen(c);
    c.frame.querySelector('img').style.transform =
      `translate(${c.x * d}px, ${c.y * d}px) scale(${c.s * d})`;
    if (!fromSlider)
      c.zoom.value = String(Math.round((Math.log(c.s / c.min) / Math.log(MAX_ZOOM)) * 100));
    fitPreviews(section);
    queuePreview(section);
  }

  // ---------- Previews on the real cards ----------

  function previewCard(kind, ctx) {
    const tag = esc(ctx.alliance.tag);
    const colour = /^#[0-9a-f]{6}$/i.test(ctx.alliance.color || '')
      ? ctx.alliance.color
      : '#b8975a';
    if (kind === 'card') {
      return `<div class="ops-week-card is-active-week has-ally-pic">
        <div class="ops-week-header"><span class="ops-week-num">${esc(t('preview_week'))}</span></div>
        <div class="ops-week-tag-row"><span class="ops-week-tag ally-text" style="--ally: ${colour}">[${tag}]</span></div>
        <div class="ops-week-loot"><small>${esc(t('preview_loot'))}</small></div>
      </div>`;
    }
    const rank = Number(ctx.alliance.rank) || 0;
    const tier = ['', 'rank-gold', 'rank-silver', 'rank-bronze'][rank] || '';
    return `<div class="alliance-ladder-row ${tier} has-ally-pic">
      <div class="ladder-rank-col"><span class="ladder-rank-badge ${tier}">${rank ? `#${rank}` : '--'}</span></div>
      <div class="ladder-identity-col"><div class="ladder-primary-line">
        <span class="alliance-color-indicator" style="background-color: ${colour}"></span>
        <strong class="ladder-tag ally-text" style="--ally: ${colour}">[${tag}]</strong>
      </div></div>
      <div class="ladder-status-col"><span class="nap-badge nap-active">${esc(t('preview_status'))}</span></div>
    </div>`;
  }

  /** Each preview is drawn at the card's real width, then shrunk to fit the dashboard. */
  function fitPreviews(section) {
    section.querySelectorAll('.ai-scale').forEach((outer) => {
      const inner = outer.firstElementChild;
      const width = parseFloat(inner.style.width);
      const k = Math.min(1, outer.parentElement.clientWidth / width);
      inner.style.transform = `scale(${k})`;
      outer.style.height = `${inner.offsetHeight * k}px`;
      outer.style.width = `${width * k}px`;
    });
  }

  // A small copy of the cut, redrawn at most once per frame while the picture moves
  function queuePreview(section) {
    const c = section._ai.crop;
    if (c.drawing) {
      c.dirty = true;
      return;
    }
    c.drawing = true;
    requestAnimationFrame(() => {
      const canvas = cut(c, 0.5);
      canvas.toBlob(
        (blob) => {
          c.drawing = false;
          if (section._ai.crop !== c || !blob) return;
          const url = URL.createObjectURL(blob);
          c.previewUrls.forEach((u) => URL.revokeObjectURL(u));
          c.previewUrls = [url];
          section
            .querySelectorAll('.ai-previews .has-ally-pic')
            .forEach((card) => card.style.setProperty('--ally-pic', `url("${url}")`));
          if (c.dirty) {
            c.dirty = false;
            queuePreview(section);
          }
        },
        'image/jpeg',
        0.8,
      );
    });
  }

  /** What's inside the frame, drawn at `k` times the final size. */
  function cut(c, k = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(c.W * k);
    canvas.height = Math.round(c.H * k);
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.setTransform(c.s * k, 0, 0, c.s * k, c.x * k, c.y * k);
    g.drawImage(c.img, 0, 0);
    return canvas;
  }

  // ---------- The avatar frame: checked, previewed and sent as it is ----------

  /**
   * A frame picture checked: { error } stops it (not square, too small, nothing drawn);
   * { warning } only tells (owner, 2026-11-19: a design may cover the picture on purpose,
   * like a winter garland), with how much of the middle it covers; {} when it's fine.
   */
  function frameCheck(img, g) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (Math.abs(w - h) > 1) return { error: t('frame_not_square', { width: w, height: h }) };
    if (w < FRAME.minSource) return { error: t('frame_too_small', { width: w, height: h }) };
    const all = g.getImageData(0, 0, FRAME.size, FRAME.size).data;
    let solid = 0;
    let clear = 0;
    for (let i = 3; i < all.length; i += 4) {
      if (all[i] > 100) solid++;
      if (all[i] < 40) clear++;
    }
    if (solid / (all.length / 4) < 0.03) return { error: t('frame_empty') };
    // A frame needs see-through parts somewhere (a PNG with no transparency would be a square)
    if (clear / (all.length / 4) < 0.05) return { error: t('frame_no_transparency') };
    const [a, b] = FRAME.hole;
    const inner = g.getImageData(a, a, b - a, b - a).data;
    let covered = 0;
    for (let i = 3; i < inner.length; i += 4) if (inner[i] >= 40) covered++;
    const share = covered / (inner.length / 4);
    if (share > 0.1) {
      return {
        warning: t(share > 0.6 ? 'frame_covers_most' : 'frame_covers', {
          percent: Math.round(share * 100),
        }),
      };
    }
    return {};
  }

  /**
   * A frame file must be a PNG or WebP, read from its first bytes (not its name): the browser
   * saves every frame again as a PNG, so a JPEG would otherwise arrive looking like one, with
   * nothing see-through (found in the owner's testing, 2026-11-19).
   */
  async function checkFrameFile(section, file) {
    let head;
    try {
      head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    } catch {
      return say(section, t('load_failed'), 'error');
    }
    const png = [0x89, 0x50, 0x4e, 0x47].every((b, i) => head[i] === b);
    const webp =
      String.fromCharCode(...head.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...head.slice(8, 12)) === 'WEBP';
    if (!png && !webp) return say(section, t('frame_not_png'), 'error');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => openFrame(section, img, url);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      say(section, t('not_image'), 'error');
    };
    img.src = url;
  }

  function openFrame(section, img, url) {
    closeCrop(section);
    const canvas = document.createElement('canvas');
    canvas.width = FRAME.size;
    canvas.height = FRAME.size;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, FRAME.size, FRAME.size);
    URL.revokeObjectURL(url);
    const check = frameCheck(img, g);
    if (check.error) return say(section, check.error, 'error');
    canvas.toBlob((blob) => {
      if (!blob) return say(section, t('load_failed'), 'error');
      if (blob.size > FRAME.maxBytes) {
        return say(section, t('frame_too_big', { kb: Math.round(blob.size / 1024) }), 'error');
      }
      const preview = URL.createObjectURL(blob);
      section._ai.crop = {
        kind: 'frame',
        blob,
        url: preview,
        previewUrls: [],
        onResize: () => {},
      };
      const box = section.querySelector('.ai-crop');
      box.hidden = false;
      box.innerHTML = `
        <h4 class="ai-crop-title">${esc(t('frame_title'))}</h4>
        ${
          check.warning
            ? `<p class="ai-status ai-frame-warning">${ic('warning', 'warn')}${esc(check.warning)}</p>`
            : `<p class="dash-muted ai-crop-help">${esc(t('frame_check_ok'))}</p>`
        }
        <div class="ai-frame-previews">
          <figure>${framedSample(preview, 'lg')}<figcaption class="dash-muted">${esc(t('frame_big'))}</figcaption></figure>
          <figure>${framedSample(preview, 'md')}<figcaption class="dash-muted">${esc(t('frame_roster'))}</figcaption></figure>
          <figure>${framedSample(preview, 'sm')}<figcaption class="dash-muted">${esc(t('frame_lists'))}</figcaption></figure>
        </div>
        <div class="dash-editor-actions">
          <button type="button" class="dash-icon-btn" data-ai="cancel">${esc(t('cancel'))}</button>
          <button type="button" class="submit-plan-btn" data-ai="send-frame">${esc(sendLabel(section))}</button>
        </div>`;
    }, 'image/png');
  }

  async function sendFrame(section, button) {
    const c = section._ai.crop;
    if (!c || c.kind !== 'frame') return;
    button.disabled = true;
    button.textContent = t('sending');
    try {
      const r = await post(section, {
        type: 'alliance_image',
        alliance: section._ai.ctx.alliance.tag,
        kind: 'frame',
        image: await dataUrl(c.blob),
        ...(section._ai.ctx.direct ? { direct: true } : {}),
      });
      if (!r.ok) throw new Error('');
      closeCrop(section);
      // A Steward's upload from the Steward page is live at once (the server says so)
      const note = r.out?.live ? r.out.message || t('sent') : t('sent');
      say(section, note, 'ok');
      section._aiNote = { text: note, kind: 'ok' };
      section._ai.ctx.onChange?.();
    } catch (err) {
      if (err.message) say(section, err.message, 'error');
      button.disabled = false;
      button.textContent = sendLabel(section);
    }
  }

  // ---------- Sending ----------

  const toBlob = (canvas, type, q) => new Promise((resolve) => canvas.toBlob(resolve, type, q));

  /** WebP where the browser can make it (not Safari), else JPEG; smaller until it fits. */
  async function encode(canvas) {
    let type = 'image/webp';
    let blob = null;
    for (const q of [0.88, 0.8, 0.72, 0.62, 0.5, 0.4]) {
      blob = await toBlob(canvas, type, q);
      if (blob && blob.type !== type) {
        type = 'image/jpeg'; // asked for WebP, got PNG: this browser can't make WebP
        blob = await toBlob(canvas, type, q);
      }
      if (blob && blob.size <= TARGET_BYTES) return blob;
    }
    return blob;
  }

  const dataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });

  async function send(section, button) {
    const c = section._ai.crop;
    if (!c) return;
    button.disabled = true;
    button.textContent = t('sending');
    try {
      const blob = await encode(cut(c));
      const r = await post(section, {
        type: 'alliance_image',
        alliance: section._ai.ctx.alliance.tag,
        kind: c.kind,
        image: await dataUrl(blob),
        ...(section._ai.ctx.direct ? { direct: true } : {}),
      });
      if (!r.ok) throw new Error('');
      closeCrop(section);
      // A Steward's upload from the Steward page is live at once (the server says so)
      const note = r.out?.live ? r.out.message || t('sent') : t('sent');
      say(section, note, 'ok');
      section._aiNote = { text: note, kind: 'ok' };
      section._ai.ctx.onChange?.();
    } catch (err) {
      if (err.message) say(section, err.message, 'error');
      button.disabled = false;
      button.textContent = sendLabel(section);
    }
  }

  async function post(section, body) {
    try {
      const res = await fetch('/api/proposal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${section._ai.ctx.pass()}`,
        },
        body: JSON.stringify(body),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        say(section, out.error || `HTTP ${res.status}`, 'error');
        return { ok: false, out };
      }
      return { ok: true, out };
    } catch (err) {
      say(section, err.message, 'error');
      return { ok: false };
    }
  }

  // ---------- Closing ----------

  function closeCrop(section) {
    const c = section._ai?.crop;
    if (!c) return;
    window.removeEventListener('resize', c.onResize);
    URL.revokeObjectURL(c.url);
    c.previewUrls.forEach((u) => URL.revokeObjectURL(u));
    section._ai.crop = null;
    const box = section.querySelector('.ai-crop');
    if (box) {
      box.hidden = true;
      box.innerHTML = '';
    }
  }

  function close(section) {
    closeCrop(section);
    section.removeEventListener('click', onClick);
    section._ai = null;
  }

  window.AllianceImages = { render, close };
})();
