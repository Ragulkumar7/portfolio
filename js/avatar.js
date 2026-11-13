/* =====================================================================
   avatar.js — interactive "guide" avatar (fixed, bottom-right)

   - the markup is created here; every line it speaks comes from
     js/data.js under "avatar" (nothing is hardcoded in this file)
   - z-index 90: above page content, below the menu overlay (95), the
     page transition (9000), the cursor (9790+) and the certificate
     dialog (top layer — native <dialog> sits above everything)
   - cursor follow: perspective 800px, rotateY up to 12deg, rotateX up
     to 8deg, slight translate, smoothed with lerp 0.12 inside ONE rAF
     loop. The loop pauses while the tab is hidden, the avatar is
     offscreen/hidden or motion is off (html[data-motion=off] and
     prefers-reduced-motion both mean "static avatar")
   - drag: pointer events with setPointerCapture; releasing springs the
     avatar back (snapped instantly when motion is off)
   - bubble: dithered-edge speech bubble in site tokens, typewriter
     text (instant under reduced motion)
   - triggers: first-visit hero line, returning line (localStorage
     "guide:seen"), [data-avatar-line] sections, the mailto line, a
     10s idle hint, and click-to-copy on the email line
   - control: "Guide: on/off" toggle, persisted in localStorage
   ===================================================================== */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;

  /* resolve our own URL so ../assets/... works from every sub-folder */
  var script = doc.currentScript;
  if (!script) {
    var all = doc.getElementsByTagName('script');
    for (var si = all.length - 1; si >= 0; si--) {
      if (/avatar\.js(?:[?#]|$)/.test(all[si].src || '')) { script = all[si]; break; }
    }
  }
  var base = (script && script.src) || '';

  var DATA = window.PORTFOLIO || {};
  var CFG = DATA.avatar || {};
  var LINES = CFG.lines || {};
  var PROJECTS = CFG.projects || {};
  if (!CFG.lines || !doc.body) return;

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
  var FINE = window.matchMedia('(hover: hover) and (pointer: fine)');

  var LINE_MS = 9000;        /* auto-hide for non-persistent lines */
  var IDLE_MS = 10000;       /* idle hint */
  var DOCK_GAP = 10;         /* clearance kept above the footer */
  var AVOID_GAP = 8;         /* clearance kept above must-clear controls */
  var MAX_IDLE = 2;          /* idle hints per page load */

  /* controls the avatar must never sit on — the home hero CTA lives in
     the bottom-right corner, exactly where the avatar rests */
  var AVOID_SELECTORS = ['.hero__button'];

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function qs(s, c) { return (c || doc).querySelector(s); }
  function qsa(s, c) {
    return Array.prototype.slice.call((c || doc).querySelectorAll(s));
  }
  function motionOn() {
    return root.getAttribute('data-motion') === 'on' && !REDUCED.matches;
  }
  function lsGet(k) {
    try { return window.localStorage.getItem(k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ }
  }
  function assetUrl(path) {
    try { return new URL('../' + String(path).replace(/^\.?[\/\\]+/, ''), base).href; }
    catch (e) { return String(path); }
  }
  function pageSlug() {
    var m = /\/([a-z0-9-]+)\.html(?:[?#]|$)/.exec(location.pathname);
    return m ? m[1] : '';
  }

  var slug = pageSlug();

  /* ------------------------------------------------------------ markup */

  var wrap = doc.createElement('div');
  wrap.className = 'guide';
  wrap.setAttribute('data-guide', '');
  wrap.innerHTML =
    '<button type="button" class="guide__toggle" title="Guide: on/off" aria-pressed="true">Guide: on</button>' +
    '<div class="guide__bubble"><span class="guide__tail" aria-hidden="true"></span>' +
    '<span class="guide__bubble-sizer" aria-hidden="true"></span>' +
    '<span class="guide__bubble-text"></span></div>' +
    '<div class="guide__stage" aria-hidden="true">' +
    '<img class="guide__img" alt="" width="660" height="825" decoding="async" draggable="false"></div>';
  doc.body.appendChild(wrap);

  /* a native image drag would fire pointercancel and kill the pointer
     capture mid-drag — the avatar itself is what gets dragged */
  wrap.addEventListener('dragstart', function (e) {
    if (e.preventDefault) e.preventDefault();
  });

  var toggle = qs('.guide__toggle', wrap);
  var bubble = qs('.guide__bubble', wrap);
  var bubbleSizer = qs('.guide__bubble-sizer', wrap);
  var bubbleText = qs('.guide__bubble-text', wrap);
  var stage = qs('.guide__stage', wrap);
  var img = qs('.guide__img', wrap);
  var footerEl = qs('.footer');
  var headerEl = qs('.header');

  var avoidEls = [];
  AVOID_SELECTORS.forEach(function (sel) {
    qsa(sel).forEach(function (el) { avoidEls.push(el); });
  });

  img.src = assetUrl(CFG.image || 'assets/avatar/guide.png');
  img.addEventListener('error', function () { wrap.setAttribute('data-noimg', ''); });

  /* ------------------------------------------------------------- state */

  var enabled = lsGet('guide:enabled') !== '0';
  var suppressed = '';            /* '' | 'overlay' (menu/dialog) | 'dock' */
  var dockNoRoom = false;
  var stack = [];                /* active triggers, oldest first */
  var current = null;            /* the entry the bubble is showing */
  var shownText = null;
  var typeTimer = 0;
  var hideTimer = 0;
  var closeTimer = 0;
  var idleTimer = 0;
  var idleDue = 0;
  var idleCount = 0;

  var follow = { rx: 0, ry: 0, tx: 0, ty: 0 };
  var followT = { rx: 0, ry: 0, tx: 0, ty: 0 };
  var drag = { x: 0, y: 0, vx: 0, vy: 0, on: false };
  var ptr = { x: window.innerWidth / 2, y: window.innerHeight / 2, seen: false };

  /* ------------------------------------------------------- text output */

  function lineFor(entry) {
    if (entry.copied) return LINES.copied || '';
    if (entry.key === 'project') return PROJECTS[slug] || LINES.work || '';
    return LINES[entry.key] || '';
  }

  function typeText(text, instant) {
    window.clearTimeout(typeTimer);
    text = String(text == null ? '' : text);
    bubbleSizer.textContent = text;        /* reserves the final height */
    if (instant || !motionOn()) { bubbleText.textContent = text; return; }
    var i = 0;
    bubbleText.textContent = '';
    (function step() {
      i += 1;
      bubbleText.textContent = text.slice(0, i);
      if (i < text.length) typeTimer = window.setTimeout(step, 26);
    })();
  }

  function openBubble() {
    if (bubble.style.display !== 'block') {
      bubble.style.display = 'block';
      void bubble.offsetHeight;          /* reflow so the fade-in runs */
    }
    bubble.setAttribute('data-open', '');
  }

  function closeBubble() {
    bubble.removeAttribute('data-open');
    shownText = null;
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(function () {
      if (!bubble.hasAttribute('data-open')) bubble.style.display = 'none';
    }, 400);
  }

  /* ------------------------------------------------ trigger bookkeeping */

  function pickTop() {
    var best = null;
    var bestPrio = -1;
    for (var i = 0; i < stack.length; i++) {
      var e = stack[i];
      if (e.consumed) continue;
      if (e.prio >= bestPrio) { bestPrio = e.prio; best = e; }   /* newest wins ties */
    }
    return best;
  }

  function applyTop() {
    var top = pickTop();
    if (top === current) return;
    current = top;
    window.clearTimeout(hideTimer);
    if (!top) {
      closeBubble();
      scheduleIdle();
      return;
    }
    var text = lineFor(top);
    if (text !== shownText) {
      shownText = text;
      typeText(text, false);
    }
    openBubble();
    if (!top.persistent) {
      hideTimer = window.setTimeout(function () { consume(top); }, LINE_MS);
    }
    scheduleRefresh();
  }

  function dropById(id) {
    var dropped = false;
    for (var i = stack.length - 1; i >= 0; i--) {
      if (stack[i].id !== id) continue;
      if (stack[i] === current) current = null;
      stack.splice(i, 1);
      dropped = true;
    }
    return dropped;
  }

  function pushTrigger(id, key, prio, persistent) {
    dropById(id);
    stack.push({
      id: id, key: key, prio: prio,
      persistent: !!persistent, consumed: false, copied: false
    });
    applyTop();
    scheduleIdle();
  }

  function popTrigger(id) {
    if (!dropById(id)) return;
    applyTop();
    scheduleIdle();
  }

  function consume(entry) {
    entry.consumed = true;
    applyTop();
  }

  function dismissCurrent() {
    if (!current) return;
    current.consumed = true;
    applyTop();
    scheduleIdle();
  }

  /* --------------------------------------------------------- idle hint */

  function scheduleIdle() {
    window.clearTimeout(idleTimer);
    idleTimer = 0;
    if (!enabled || suppressed) return;
    idleDue = Date.now() + IDLE_MS;
    idleTimer = window.setTimeout(maybeIdle, IDLE_MS);
  }

  /* pointermove fires constantly — re-arm at most every 1.2s */
  function markActivity() {
    if (!idleTimer) return;
    if (idleDue - Date.now() > IDLE_MS - 1200) return;
    scheduleIdle();
  }

  function maybeIdle() {
    if (!enabled || suppressed || current) return;
    for (var i = 0; i < stack.length; i++) if (!stack[i].consumed) return;
    if (idleCount >= MAX_IDLE) return;
    idleCount += 1;
    pushTrigger('idle', 'idle', 0, false);
  }

  /* ------------------------------------------------------------ copy */

  function legacyCopy(text) {
    try {
      var ta = doc.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;';
      doc.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = doc.execCommand('copy');
      doc.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  function copyText(text, done) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { done(true); },
          function () { done(legacyCopy(text)); }
        );
        return;
      }
    } catch (e) { /* fall through to the legacy path */ }
    done(legacyCopy(text));
  }

  function copyEmail() {
    var addr = CFG.email || 'ragulthedeveloper@gmail.com';
    copyText(addr, function (ok) {
      /* no confirmation without a copy — the line stays as it was */
      if (!ok || !current || (current.key !== 'email' && current.key !== 'footer')) return;
      current.copied = true;
      var text = LINES.copied || '';
      shownText = text;
      typeText(text, false);
      window.clearTimeout(hideTimer);      /* keep the confirmation up */
    });
  }

  /* ------------------------------------------------------- bubble input */

  bubble.addEventListener('click', function () {
    if (!enabled || suppressed || !current) return;
    if (!current.copied && (current.key === 'email' || current.key === 'footer')) copyEmail();
    else dismissCurrent();
  });

  /* ------------------------------------------------------------- drag */

  var dragSX = 0, dragSY = 0, dragOX = 0, dragOY = 0, dragMoved = false;

  function clampDrag() {
    var wr = wrap.getBoundingClientRect();
    var w = stage.offsetWidth;
    var h = stage.offsetHeight;
    var left = wr.right - w;                 /* right-aligned when undragged */
    var top = wr.top + stage.offsetTop;
    drag.x = clamp(drag.x, 8 - left, window.innerWidth - 8 - w - left);
    drag.y = clamp(drag.y, 8 - top, window.innerHeight - 8 - h - top);
  }

  stage.addEventListener('pointerdown', function (e) {
    if (!enabled || suppressed) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.on = true;
    dragMoved = false;
    dragSX = e.clientX; dragSY = e.clientY;
    dragOX = drag.x; dragOY = drag.y;
    drag.vx = 0;
    drag.vy = 0;
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* optional */ }
    ensureLoop();
  });

  stage.addEventListener('pointermove', function (e) {
    if (!drag.on) return;
    var dx = e.clientX - dragSX;
    var dy = e.clientY - dragSY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) dragMoved = true;
    drag.x = dragOX + dx;
    drag.y = dragOY + dy;
    clampDrag();
    applyTransform();
  });

  function endDrag(e) {
    if (!drag.on) return;
    drag.on = false;
    try { stage.releasePointerCapture(e.pointerId); } catch (err) { /* optional */ }
    if (!dragMoved) {
      if (current) dismissCurrent();        /* tap on the avatar = shush */
    }
    if (!motionOn()) { drag.x = 0; drag.y = 0; drag.vx = 0; drag.vy = 0; applyTransform(); }
    ensureLoop();
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  /* ------------------------------------------------ follow / sway loop */

  function computeFollow() {
    var r = stage.getBoundingClientRect();
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    var nx = clamp((ptr.x - cx) / (window.innerWidth / 2), -1, 1);
    var ny = clamp((ptr.y - cy) / (window.innerHeight / 2), -1, 1);
    followT.ry = nx * 12;                    /* <= 12deg */
    followT.rx = -ny * 8;                    /* <= 8deg  */
    followT.tx = nx * 6;
    followT.ty = ny * 4;
  }

  function computeSway(now) {
    var t = now / 1000;                      /* touch devices: gentle idle sway */
    followT.ry = Math.sin(t * 0.7) * 6;
    followT.rx = Math.sin(t * 0.5 + 1.2) * 3;
    followT.tx = Math.sin(t * 0.6 + 0.5) * 3;
    followT.ty = Math.cos(t * 0.45) * 2;
  }

  function applyTransform() {
    var x = drag.x + follow.tx;
    var y = drag.y + follow.ty;
    var t = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)';
    if (motionOn() && (follow.rx || follow.ry)) {
      t += ' rotateX(' + follow.rx.toFixed(2) + 'deg) rotateY(' + follow.ry.toFixed(2) + 'deg)';
    }
    stage.style.transform = t;
  }

  function staticReset() {
    follow.rx = follow.ry = follow.tx = follow.ty = 0;
    followT.rx = followT.ry = followT.tx = followT.ty = 0;
    drag.x = 0; drag.y = 0; drag.vx = 0; drag.vy = 0;
    stage.style.transform = '';
  }

  function springActive() {
    return Math.abs(drag.x) > 0.05 || Math.abs(drag.y) > 0.05 ||
      Math.abs(drag.vx) > 0.05 || Math.abs(drag.vy) > 0.05;
  }

  function shouldRun() {
    if (!enabled || suppressed) return false;
    if (drag.on) return true;
    return motionOn();                        /* static avatar needs no frames */
  }

  function inViewport() {
    var r = stage.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight &&
      r.right > 0 && r.left < window.innerWidth;
  }

  var running = false;
  var rafId = 0;
  var lastNow = 0;

  function frame(now) {
    rafId = window.requestAnimationFrame(frame);
    if (doc.hidden || !shouldRun() || !inViewport()) { stopLoop(); return; }
    var dt = clamp((now - lastNow) / 1000, 0.001, 0.05);
    lastNow = now;
    var k = clamp(dt * 60, 0.1, 3);

    if (motionOn()) {
      if (FINE.matches && ptr.seen) computeFollow();
      else computeSway(now);
      var s = 0.12 * k;                       /* lerp 0.12 (frame-scaled) */
      follow.rx += (followT.rx - follow.rx) * s;
      follow.ry += (followT.ry - follow.ry) * s;
      follow.tx += (followT.tx - follow.tx) * s;
      follow.ty += (followT.ty - follow.ty) * s;
    } else {
      follow.rx = follow.ry = follow.tx = follow.ty = 0;
    }

    if (!drag.on && springActive()) {
      if (motionOn()) {                       /* spring back (both axes) */
        drag.vx += (-170 * drag.x - 15 * drag.vx) * dt;
        drag.vy += (-170 * drag.y - 15 * drag.vy) * dt;
        drag.x += drag.vx * dt;
        drag.y += drag.vy * dt;
        if (Math.abs(drag.x) < 0.05 && Math.abs(drag.y) < 0.05 &&
            Math.abs(drag.vx) < 0.05 && Math.abs(drag.vy) < 0.05) {
          drag.x = 0; drag.y = 0; drag.vx = 0; drag.vy = 0;
        }
      } else {                                /* snap back */
        drag.x = 0; drag.y = 0; drag.vx = 0; drag.vy = 0;
      }
    }

    applyTransform();
  }

  function ensureLoop() {
    if (running || doc.hidden) return;
    if (!shouldRun() || !inViewport()) return;
    running = true;
    lastNow = window.performance.now();
    rafId = window.requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (!running) return;
    running = false;
    window.cancelAnimationFrame(rafId);
  }

  /* ------------------------------------------------- dock (footer clear) */

  /* The avatar must never sit on footer links or buttons: it rides just
     above the footer's content (the footer's top padding is empty), it
     steps aside for must-clear controls (the hero CTA), and it only
     hides itself if even that leaves no room under the header. */
  function updateDock() {
    var base = parseFloat(window.getComputedStyle(wrap).getPropertyValue('--guide-base-bottom')) || 0;
    var vh = window.innerHeight;
    var bottom = base;
    var headBottom = headerEl ? headerEl.getBoundingClientRect().bottom : 0;
    dockNoRoom = false;
    if (footerEl) {
      var fr = footerEl.getBoundingClientRect();
      if (fr.top < vh - base) {
        var pad = parseFloat(window.getComputedStyle(footerEl).paddingTop) || 0;
        var contentTop = fr.top + pad;              /* first footer row */
        bottom = Math.max(base, vh - contentTop + DOCK_GAP);
        if (vh - bottom - wrap.offsetHeight < headBottom + 8) dockNoRoom = true;
      }
    }
    if (!dockNoRoom) bottom = stepAside(vh, bottom, headBottom);
    wrap.style.bottom = bottom + 'px';
  }

  /* raise the avatar until nothing in AVOID_SELECTORS intersects it.
     Only the avatar itself is weighed — it is the persistent, opaque
     blocker; the bubble is transient text. The cluster as a whole must
     still clear the header. */
  function stepAside(vh, bottom, headBottom) {
    if (!avoidEls.length) return bottom;
    var wr = wrap.getBoundingClientRect();
    var sw = stage.offsetWidth;
    var sh = stage.offsetHeight;
    var sLeft = wr.right - sw;                /* right-aligned in the cluster */
    var edge = vh - bottom;                   /* avatar bottom edge */
    var top = edge - sh;                      /* avatar top edge */
    for (var n = 0; n < 3; n++) {
      var moved = false;
      for (var i = 0; i < avoidEls.length; i++) {
        var el = avoidEls[i];
        if (!el || !el.getClientRects().length) continue;
        var r = el.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= vh) continue;           /* off-screen */
        if (r.right <= sLeft || r.left >= wr.right) continue;  /* clear sideways */
        if (r.top >= edge || r.bottom <= top) continue;        /* clear vertically */
        var newEdge = r.top - AVOID_GAP;
        if (newEdge - wr.height < headBottom + 8) continue;    /* no room: leave it */
        if (edge - newEdge < 0.5) continue;
        edge = newEdge;
        top = newEdge - sh;
        moved = true;
      }
      if (!moved) break;
    }
    return vh - edge;
  }

  function updateSuppress() {
    var reason = '';
    if (root.classList.contains('menu-open') || doc.querySelector('dialog[open]')) {
      reason = 'overlay';
    } else if (dockNoRoom) {
      reason = 'dock';
    }
    if (reason === suppressed) return;
    suppressed = reason;
    if (suppressed) {
      wrap.setAttribute('data-suppressed', suppressed);
      stopLoop();
      window.clearTimeout(idleTimer);
    } else {
      wrap.removeAttribute('data-suppressed');
      if (!motionOn()) staticReset();
      scheduleIdle();
      ensureLoop();
    }
  }

  var refreshQueued = false;
  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    window.requestAnimationFrame(function () {
      refreshQueued = false;
      updateDock();
      updateSuppress();
      if (!motionOn()) staticReset();
      ensureLoop();
    });
  }

  /* ---------------------------------------------------------- sections */

  function tagSections() {
    function tag(el, key) { if (el) el.setAttribute('data-avatar-line', key); }
    tag(qs('.selected-work'), 'work');
    tag(qs('.work-index'), 'work');
    tag(qs('.statement'), 'statement');
    tag(qs('.service-tiles'), 'services');
    var servicesPage = /(^|\/)services\.html$/.test(location.pathname);
    tag(servicesPage ? qs('.service-list') : qs('.service-list.about-services'), 'services');
    tag(qs('.case-study'), 'project');        /* per-project line or the work line */
    tag(qs('.footer'), 'footer');
  }

  function observeTriggers() {
    if (!('IntersectionObserver' in window)) return;
    var uid = 0;
    var secIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var id = 'sec' + en.target.getAttribute('data-avatar-uid');
        var key = en.target.getAttribute('data-avatar-line');
        if (!key) return;
        if (en.isIntersecting) pushTrigger(id, key, 2, false);
        else popTrigger(id);
      });
    }, { rootMargin: '-38% 0px -38% 0px' });
    qsa('[data-avatar-line]').forEach(function (el) {
      el.setAttribute('data-avatar-uid', 'g' + (++uid));
      secIO.observe(el);
    });

    /* the email line (footer + contact) — clicking the bubble copies */
    var mailIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var id = 'mail' + en.target.getAttribute('data-avatar-uid');
        if (en.isIntersecting) pushTrigger(id, 'email', 3, true);
        else popTrigger(id);
      });
    }, { threshold: 0.5 });
    qsa('a[href^="mailto:"]').forEach(function (a) {
      if (a.closest && a.closest('#site-menu')) return;   /* menu overlay is clipped, not scrolled */
      if (!a.getClientRects().length) return;             /* hidden (closed <details>, …) */
      a.setAttribute('data-avatar-uid', 'm' + (++uid));
      mailIO.observe(a);
    });
  }

  /* --------------------------------------------------------- greetings */

  function whenIntroDone(cb) {
    if (root.getAttribute('data-intro') !== 'run') { window.setTimeout(cb, 500); return; }
    var done = false;
    var timer = window.setTimeout(finish, 6000);
    function finish() {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      cb();
    }
    if (!('MutationObserver' in window)) { window.setTimeout(finish, 2600); return; }
    var mo = new MutationObserver(function () {
      if (root.getAttribute('data-intro') !== 'run') { mo.disconnect(); finish(); }
    });
    mo.observe(root, { attributes: true, attributeFilter: ['data-intro'] });
  }

  function bootGreeting() {
    if (!enabled) return;
    var seen = lsGet('guide:seen');
    if (!seen) {
      if (!qs('.hero')) return;              /* first visit greets on the home hero */
      whenIntroDone(function () {
        lsSet('guide:seen', '1');
        pushTrigger('greeting', 'hero', 1, false);
      });
    } else {
      window.setTimeout(function () {
        pushTrigger('greeting', 'returning', 1, false);
      }, 900);
    }
  }

  /* ------------------------------------------------------------ toggle */

  function syncEnabled() {
    toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    toggle.textContent = enabled ? 'Guide: on' : 'Guide: off';
    if (enabled) {
      wrap.classList.remove('guide--off');
      applyTop();
      scheduleIdle();
      scheduleRefresh();
    } else {
      wrap.classList.add('guide--off');
      window.clearTimeout(idleTimer);
      stopLoop();
    }
  }

  toggle.addEventListener('click', function () {
    enabled = !enabled;
    lsSet('guide:enabled', enabled ? '1' : '0');
    syncEnabled();
  });

  /* ------------------------------------------------------------ events */

  doc.addEventListener('pointermove', function (e) {
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    ptr.seen = true;
  }, { passive: true });

  ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']
    .forEach(function (evt) {
      window.addEventListener(evt, markActivity, { passive: true });
    });

  window.addEventListener('scroll', scheduleRefresh, { passive: true });
  window.addEventListener('resize', scheduleRefresh, { passive: true });

  doc.addEventListener('visibilitychange', function () {
    if (doc.hidden) stopLoop();
    else ensureLoop();
  });

  if ('MutationObserver' in window) {
    var mo = new MutationObserver(scheduleRefresh);
    mo.observe(root, { attributes: true, attributeFilter: ['class', 'data-motion'] });
    mo.observe(doc.body, { attributes: true, attributeFilter: ['open'], subtree: true });
  }

  function onMotionChange() {
    staticReset();
    scheduleRefresh();
  }
  if (REDUCED.addEventListener) REDUCED.addEventListener('change', onMotionChange);
  else if (REDUCED.addListener) REDUCED.addListener(onMotionChange);

  /* -------------------------------------------------------------- boot */

  syncEnabled();
  tagSections();
  observeTriggers();
  updateDock();
  updateSuppress();
  bootGreeting();
  scheduleIdle();
  ensureLoop();
})();
