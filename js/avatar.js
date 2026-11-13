/* =====================================================================
   avatar.js — interactive dithered "guide" avatar (PASS 1)

   The avatar is drawn as ONE inline SVG template (below) so it works
   over file:// with no fetch, no libraries, no audio, no network.

   - every word it speaks lives in js/data.js under "avatar"
   - wrapper #guide is position:fixed, pointer-events:none; only the
     avatar zones, the bubble and the controls take the pointer
   - one rAF loop drives travel + avoidance + eye/head tracking + lean;
     it runs ONLY while something animates or tracks, and pauses on a
     hidden tab or when the guide is off
   - states are a data-state / data-blink set on #guide, styled in CSS;
     all motion is transform/opacity only, stepped ~12fps for a
     sprite-like feel
   - reduced motion / html[data-motion=off] → no travel, no tracking,
     no keyframes; instant state swaps, the bubble still shows lines
   ===================================================================== */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  if (!doc.body) return;

  var DATA = window.PORTFOLIO || {};
  var CFG = DATA.avatar || {};
  if (!CFG.lines) return;

  var LINES = CFG.lines || {};
  var PROJECT_LINES = CFG.projects || {};
  var REACT = CFG.reactions || {};
  var ANCHORS = CFG.anchors || {};
  var TH = CFG.thresholds || {};
  var PROJECTS = DATA.projects || [];

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
  var FINE = window.matchMedia('(hover: hover) and (pointer: fine)');

  /* ----------------------------------------------------------- helpers */

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerpF(rate, k) { return 1 - Math.pow(1 - rate, k); }
  function qs(s, c) { return (c || doc).querySelector(s); }
  function qsa(s, c) {
    return Array.prototype.slice.call((c || doc).querySelectorAll(s));
  }
  function motionOn() {
    return root.getAttribute('data-motion') === 'on' && !REDUCED.matches;
  }
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }

  function pageSlug() {
    var m = /\/([a-z0-9-]+)\.html(?:[?#]|$)/.exec(location.pathname);
    if (m) return m[1];
    if (!/\/(?:[^/]*\/)?$/.test(location.pathname) || /\/$/.test(location.pathname)) {
      /* directory index → home */
      if (/\/$/.test(location.pathname)) return 'index';
    }
    return '';
  }
  var slug = pageSlug();

  /* project slug → its line (falls back to "<title> — <type>") */
  function projectBySlug(s) {
    for (var i = 0; i < PROJECTS.length; i++) {
      if (PROJECTS[i].slug === s) return PROJECTS[i];
    }
    return null;
  }
  function projectLine(s) {
    if (PROJECT_LINES[s]) return PROJECT_LINES[s];
    var p = projectBySlug(s);
    if (!p) return LINES.work || '';
    return p.name + (p.type ? ' — ' + p.type : '') + '.';
  }

  /* ------------------------------------------------------ svg template */

  var SVG =
    '<svg id="av" viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
    '<defs>' +
    '<pattern id="avH" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="#111010"/></pattern>' +
    '<pattern id="avHr" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#edeae4"/><circle cx="2" cy="2" r="1.7" fill="#111010"/></pattern>' +
    '<pattern id="avB" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#2a2827"/><circle cx="2" cy="2" r="1.2" fill="#edeae4"/></pattern>' +
    '<clipPath id="avC"><circle cx="100" cy="105" r="46"/></clipPath>' +
    '</defs>' +
    '<g id="av-body"><path d="M38 220 C38 172 66 158 100 158 C134 158 162 172 162 220Z" fill="url(#avB)"/></g>' +
    '<rect id="av-neck" x="88" y="142" width="24" height="22" fill="#edeae4"/>' +
    '<g id="av-head">' +
    '<g id="av-ear-l"><circle cx="54" cy="108" r="7" fill="#edeae4"/></g>' +
    '<g id="av-ear-r"><circle cx="146" cy="108" r="7" fill="#edeae4"/></g>' +
    '<circle cx="100" cy="105" r="46" fill="#edeae4"/>' +
    '<g clip-path="url(#avC)"><ellipse cx="128" cy="112" rx="30" ry="52" fill="url(#avH)"/></g>' +
    '<path id="av-hair" d="M52 100 C46 54 80 40 104 42 C132 44 156 62 150 104 C140 84 124 74 100 74 C80 74 62 84 52 100Z" fill="url(#avHr)"/>' +
    '<path id="av-brows" d="M74 92 L92 89 M108 89 L126 92" stroke="#111010" stroke-width="4" stroke-linecap="round" fill="none"/>' +
    '<g id="av-blush" opacity="0"><ellipse cx="72" cy="122" rx="9" ry="5" fill="url(#avH)"/><ellipse cx="128" cy="122" rx="9" ry="5" fill="url(#avH)"/></g>' +
    '<g id="av-eyes-open"><ellipse cx="84" cy="106" rx="6" ry="8" fill="#111010"/><ellipse cx="116" cy="106" rx="6" ry="8" fill="#111010"/><circle cx="86" cy="103" r="2" fill="#fff"/><circle cx="118" cy="103" r="2" fill="#fff"/></g>' +
    '<path id="av-eyes-closed" d="M76 106 Q84 99 92 106 M108 106 Q116 99 124 106" stroke="#111010" stroke-width="3.5" stroke-linecap="round" fill="none" opacity="0"/>' +
    '<path id="av-nose" d="M100 112 Q96 122 102 122" stroke="#111010" stroke-width="1.5" fill="none"/>' +
    '<g id="av-mouth">' +
    '<path class="m m-smile" d="M88 128 Q100 142 112 128 Q100 134 88 128Z" fill="#111010"/>' +
    '<ellipse class="m m-open" cx="100" cy="133" rx="8" ry="10" fill="#111010" opacity="0"/>' +
    '<g class="m m-grin" opacity="0"><path d="M82 123 Q100 152 118 123Z" fill="#111010"/><path d="M87 124 Q100 131 113 124 L112 128 Q100 135 88 128Z" fill="#edeae4"/></g>' +
    '<path class="m m-flat" d="M92 131 L108 131" stroke="#111010" stroke-width="3" stroke-linecap="round" fill="none" opacity="0"/>' +
    '</g>' +
    '<g id="av-hit-head" fill="none" pointer-events="all">' +
    '<circle data-zone="head" data-cursor="Pat" cx="100" cy="105" r="46"/>' +
    '<path data-zone="hair" data-cursor="Pat" d="M52 100 C46 54 80 40 104 42 C132 44 156 62 150 104 C140 84 124 74 100 74 C80 74 62 84 52 100Z"/>' +
    '<circle data-zone="ear" data-cursor="Hello" cx="54" cy="108" r="9"/>' +
    '<circle data-zone="ear" data-cursor="Hello" cx="146" cy="108" r="9"/>' +
    '<ellipse data-zone="eyes" data-cursor="Careful" cx="100" cy="105" rx="30" ry="11"/>' +
    '<ellipse data-zone="mouth" data-cursor="Talk" cx="100" cy="131" rx="15" ry="9"/>' +
    '<circle data-zone="nose" data-cursor="Boop" cx="100" cy="117" r="11"/>' +
    '</g>' +
    '</g>' +
    '<g id="av-puff" opacity="0" fill="#edeae4"><circle cx="124" cy="140" r="5"/><circle cx="135" cy="148" r="4"/><circle cx="143" cy="137" r="3"/></g>' +
    '<path data-zone="body" data-cursor="Tickle" fill="none" pointer-events="all" d="M38 220 C38 172 66 158 100 158 C134 158 162 172 162 220Z"/>' +
    '</svg>';

  /* ------------------------------------------------------------ markup */

  var wrap = doc.createElement('div');
  wrap.className = 'guide';
  wrap.id = 'guide';
  wrap.setAttribute('data-guide', '');
  wrap.setAttribute('aria-hidden', 'true');      /* decorative — its close button is the only tab stop */
  wrap.innerHTML =
    '<button type="button" class="guide__close" title="Turn the guide off" aria-label="Turn the guide off">&times;</button>' +
    '<div class="guide__bubble" aria-hidden="true">' +
    '<span class="guide__tail" aria-hidden="true"></span>' +
    '<span class="guide__bubble-sizer" aria-hidden="true"></span>' +
    '<span class="guide__bubble-text"></span></div>' +
    '<div class="guide__stage" aria-hidden="true">' +
    '<div class="guide__lean"><div class="guide__flip">' + SVG + '</div></div>' +
    '</div>';
  doc.body.appendChild(wrap);

  var bubble = qs('.guide__bubble', wrap);
  var bubbleSizer = qs('.guide__bubble-sizer', wrap);
  var bubbleText = qs('.guide__bubble-text', wrap);
  var stage = qs('.guide__stage', wrap);
  var leanEl = qs('.guide__lean', wrap);
  var closeBtn = qs('.guide__close', wrap);
  var footerToggle = qs('[data-guide-toggle]');

  /* svg handles used by the reactions / tracking */
  var avHead = qs('#av-head', wrap);
  var avEyesOpen = qs('#av-eyes-open', wrap);
  var avEyesClosed = qs('#av-eyes-closed', wrap);
  var avBody = qs('#av-body', wrap);

  /* ------------------------------------------------------------- state */

  var enabled = lsGet('guide:enabled') !== '0';
  var entered = false;
  var suppressed = '';              /* '' | 'overlay' | 'transition' */
  var anchorHide = false;           /* the active anchor says "stay away" */
  var overlapHide = false;          /* the avatar box touches a hideOver element */
  var bubbleHold = false;           /* no bubble until the visitor taps */
  var tapReleased = false;

  var anchor = null;                /* current anchor object */
  var anchorIdx = -1;
  var anchorList = [];

  /* transform drivers (all on #guide) */
  var entranceY = 0, entranceFrom = 0, entranceT0 = 0, entranceActive = false;
  var travelX = 0, travelY = 0, travelFromX = 0, travelFromY = 0, travelT0 = 0, travelActive = false;
  var avoidY = 0, avoidTargetY = 0;

  /* lean (scroll velocity) */
  var lean = 0, leanTarget = 0, lastScrollY = window.scrollY, scrollActiveT = 0;

  /* eye/head follow */
  var ptr = { x: window.innerWidth / 2, y: window.innerHeight / 2, seen: false, t: 0 };
  var eyeX = 0, eyeY = 0, headX = 0, headY = 0;
  var sideLeft = false;              /* the flip mirrors the SVG, so X inverts */

  /* reaction bookkeeping */
  var stateTimer = 0;
  var pokes = [];                   /* nose poke timestamps */
  var pokeCalmTimer = 0;
  var bodyHoverStart = 0;
  var bodyGiggle = false;
  var bodyEndTimer = 0;
  var bodyStopShown = false;
  var lastPick = {};                /* reaction → last line (no repeat) */

  /* bubble */
  var queue = [];                   /* pending lines, oldest first */
  var current = null;               /* {text, prio, id} */
  var shown = null;                 /* text currently rendered */
  var typeTimer = 0, hideTimer = 0;
  var typing = false;
  var heldEntry = null;             /* a line recorded while the bubble is held */

  /* timers */
  var blinkTimer = 0;

  /* --------------------------------------------------------- text out */

  function accentSegments(text) {
    var acc = CFG.accent;
    var i = acc ? text.indexOf(acc) : -1;
    if (i < 0) return [{ accent: false, s: text }];
    var out = [];
    if (i > 0) out.push({ accent: false, s: text.slice(0, i) });
    out.push({ accent: true, s: text.slice(i, i + acc.length) });
    if (i + acc.length < text.length) out.push({ accent: false, s: text.slice(i + acc.length) });
    return out;
  }

  function renderSegments(text) {
    var segs = accentSegments(text);
    bubbleSizer.textContent = text;           /* reserve the final height */
    bubbleText.textContent = '';
    var els = segs.map(function (sg) {
      var sp = doc.createElement('span');
      if (sg.accent) sp.className = 'guide__accent';
      bubbleText.appendChild(sp);
      return sp;
    });
    return { segs: segs, els: els, total: text.length };
  }

  function typeLine(text, instant) {
    window.clearTimeout(typeTimer);
    text = String(text == null ? '' : text);
    var pack = renderSegments(text);
    if (instant || !motionOn()) {
      pack.els.forEach(function (el, i) { el.textContent = pack.segs[i].s; });
      typing = false;
      return;
    }
    typing = true;
    var i = 0;
    (function step() {
      i += 1;
      var left = i;
      for (var s = 0; s < pack.segs.length; s++) {
        var seg = pack.segs[s];
        var take = Math.max(0, Math.min(seg.s.length, left));
        pack.els[s].textContent = seg.s.slice(0, take);
        left -= take;
      }
      if (i < pack.total) typeTimer = window.setTimeout(step, TH.typeMs || 26);
      else typing = false;
    })();
  }

  /* while the active anchor holds the bubble (noBubbleUntilTap) it is
     taken out of the layout entirely: the cluster collapses to just the
     avatar, so nothing can be covered by a bubble that is not shown */
  function syncBubbleHold() {
    if (bubbleHold) {
      bubble.setAttribute('data-hold', '');
      if (current) { current.retired = true; current = null; window.clearTimeout(hideTimer); }
      if (bubble.hasAttribute('data-open')) closeBubble();
      return;
    }
    bubble.removeAttribute('data-hold');
  }

  function openBubble() {
    if (bubbleHold) return;                 /* held — nothing to show yet */
    bubble.setAttribute('data-open', '');
    scheduleAvoid();
  }

  function closeBubble() {
    bubble.removeAttribute('data-open');
    shown = null;
    scheduleAvoid();
  }

  /* first tap lifts the hold. replay the held line unless a reaction is
     about to speak instead (a zone tap gets its own, much shorter line) */
  function releaseBubbleHold(replay) {
    if (!bubbleHold) return;
    tapReleased = true;
    bubbleHold = false;
    syncBubbleHold();
    var held = heldEntry;
    heldEntry = null;
    if (replay !== false && held) showLine(held.line, held.prio, held.id);
    scheduleAvoid();
  }

  /* ---------------------------------------------- line queue + priority */
  /* prio: 0 hint, 1 section, 2 greeting, 3 reaction. A higher prio line
     displaces the current one and clears lower-prio waits; equal prio
     (a new section) replaces; a reaction interrupts a hint. */

  function pickLine(entry) {
    if (entry.line === 'project') return projectLine(slug);
    if (entry.line === 'copied') return LINES.copied || '';
    /* sections/greetings pass a key into LINES; a reaction passes its
       line as literal text — resolve the key first, else use it as-is */
    return LINES[entry.line] || entry.line || '';
  }

  function startEntry(entry) {
    current = entry;
    var text = pickLine(entry);
    if (text && text !== shown) {
      shown = text;
      typeLine(text, false);
    }
    openBubble();
    window.clearTimeout(hideTimer);
    if (entry.prio < 3) {
      hideTimer = window.setTimeout(function () { retire(entry); }, TH.hideMs || 5000);
    }
  }

  function retire(entry) {
    if (current === entry) {
      current = null;
      closeBubble();
    }
    drain();
  }

  function drain() {
    while (queue.length) {
      var nxt = queue.shift();
      if (nxt.retired) continue;
      if (current && current.prio > nxt.prio) continue;   /* keep the stronger line */
      if (current) { current.retired = true; current = null; }
      startEntry(nxt);
      return;
    }
    if (!current) closeBubble();
  }

  function showLine(line, prio, id) {
    /* held (mobile hero): remember the line instead of drawing it, so a
       tap can replay the strongest thing that wanted to be said */
    if (bubbleHold) {
      if (!heldEntry || prio >= heldEntry.prio) heldEntry = { line: line, prio: prio, id: id };
      return;
    }
    var entry = { line: line, prio: prio, id: id, retired: false };
    if (current && !current.retired) {
      if (prio > current.prio) {
        current.retired = true;
        window.clearTimeout(hideTimer);
        current = null;
        startEntry(entry);
        return;
      }
      if (prio === current.prio) {
        /* same strength (e.g. a new section) — replace */
        current.retired = true;
        window.clearTimeout(hideTimer);
        current = null;
        startEntry(entry);
        return;
      }
      /* weaker: queue behind the current line */
      queue.push(entry);
      return;
    }
    startEntry(entry);
  }

  /* ---------------------------------------------------------- reactions */

  function randPick(arr, key) {
    if (!arr || !arr.length) return '';
    if (arr.length === 1) return arr[0];
    var last = lastPick[key];
    var pool = arr.filter(function (t) { return t !== last; });
    if (!pool.length) pool = arr;
    var pick = pool[Math.floor(Math.random() * pool.length)];
    lastPick[key] = pick;
    return pick;
  }

  function reactLine(group, key) {
    var g = REACT[group];
    var arr = g && g[key];
    return randPick(arr, group + '.' + key);
  }

  /* set the state for `ms`, then return to idle (unless overridden) */
  function setState(state, ms) {
    window.clearTimeout(stateTimer);
    if (state) wrap.setAttribute('data-state', state);
    else wrap.removeAttribute('data-state');
    if (ms) {
      stateTimer = window.setTimeout(function () {
        wrap.removeAttribute('data-state');
        stateTimer = 0;
      }, ms);
    }
  }

  function pokeNose() {
    var now = Date.now();
    pokes = pokes.filter(function (t) { return now - t <= (TH.pokeWindowMs || 6000); });
    pokes.push(now);
    window.clearTimeout(pokeCalmTimer);
    pokeCalmTimer = window.setTimeout(function () {
      pokes = [];
    }, TH.calmResetMs || 10000);

    if (pokes.length >= (TH.pokeEnough || 4)) {
      pokes = [];
      setState('', 0);
      showLine(reactLine('nose', 'enough'), 3, 'react');
      return;
    }
    if (pokes.length >= (TH.pokeSneeze || 3)) {
      setState('sneeze', TH.sneezeMs || 850);
      showLine(reactLine('nose', 'sneeze'), 3, 'react');
      return;
    }
    setState('cough', TH.coughMs || 700);
    showLine(reactLine('nose', 'cough'), 3, 'react');
  }

  function startGiggle() {
    if (bodyGiggle) return;
    bodyGiggle = true;
    bodyStopShown = false;
    window.clearTimeout(bodyEndTimer);
    setState('giggle', 0);                 /* stays while hovered */
    showLine(reactLine('body', 'giggle'), 3, 'react');
    bodyHoverStart = Date.now();
  }

  function endGiggle() {
    if (!bodyGiggle) return;
    window.clearTimeout(bodyEndTimer);
    bodyEndTimer = window.setTimeout(function () {
      bodyGiggle = false;
      if (wrap.getAttribute('data-state') === 'giggle') setState('', 0);
    }, TH.tickleEndMs || 600);
  }

  function patHead() {
    setState('pat', TH.patMs || 650);
    showLine(reactLine('head', 'pat'), 3, 'react');
  }

  function flinchEyes() {
    setState('flinch', TH.flinchMs || 400);
    showLine(reactLine('eyes', 'flinch'), 3, 'react');
  }

  /* ------------------------------------------------------------ bubble */

  bubble.addEventListener('click', function () {
    if (!enabled || suppressed) return;
    /* PASS 1: clicking the bubble dismisses the line */
    if (current) retire(current);
  });

  closeBtn.addEventListener('click', function () {
    setEnabled(false);
  });

  /* ------------------------------------------------------------- zones */

  function zoneOf(e) {
    var t = e.target;
    if (!t || !t.closest) return null;
    var z = t.closest('[data-zone]');
    return z ? z.getAttribute('data-zone') : null;
  }

  stage.addEventListener('click', function (e) {
    if (!enabled || suppressed || !entered) return;
    var z = zoneOf(e);
    var reacts = z === 'nose' || z === 'body' || z === 'hair' || z === 'head' || z === 'eyes';
    /* a zone tap speaks its own (short) line — only a zone-less tap
       replays the held greeting */
    releaseBubbleHold(!reacts);
    if (!z) return;
    if (z === 'nose') pokeNose();
    else if (z === 'body') {
      /* a tap: short giggle */
      if (!bodyGiggle) {
        setState('giggle', TH.giggleMs || 700);
        showLine(reactLine('body', 'giggle'), 3, 'react');
      }
    }
    else if (z === 'hair' || z === 'head') patHead();
    else if (z === 'eyes') flinchEyes();
    /* ear + mouth are PASS 2 */
  });

  /* body tickle: pointer held over the body for tickleMs */
  stage.addEventListener('pointermove', function (e) {
    if (!enabled || suppressed || !entered) return;
    var z = zoneOf(e);
    if (z === 'body') {
      if (!bodyHoverStart) bodyHoverStart = Date.now();
      if (!bodyGiggle && Date.now() - bodyHoverStart >= (TH.tickleMs || 400)) startGiggle();
      if (bodyGiggle && !bodyStopShown &&
          Date.now() - bodyHoverStart >= (TH.tickleStopMs || 3000)) {
        bodyStopShown = true;
        showLine(reactLine('body', 'stop'), 3, 'react');
      }
    } else {
      bodyHoverStart = 0;
      if (bodyGiggle) endGiggle();
    }
  }, { passive: true });

  stage.addEventListener('pointerleave', function () {
    bodyHoverStart = 0;
    if (bodyGiggle) endGiggle();
  });

  /* --------------------------------------------------------- avoidance */

  var INTERACTIVE = 'a[href], button, input, select, textarea, .header';

  function visibleInViewport(r) {
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  }

  /* an element only matters if it is actually on screen AND hit-testable:
     the closed menu overlay is clip-path'd, inert and pointer-events:none,
     so it must never count as something to avoid */
  function hitTestable(el) {
    var cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') return false;
    var n = el.parentElement;
    while (n && n !== doc.documentElement) {
      if (n.hasAttribute('inert')) return false;
      n = n.parentElement;
    }
    return true;
  }

  /* raise the cluster (translateY, negative) until nothing interactive in
     its horizontal band intersects it and it clears the fixed header.

     Two phases:
       1. strict — clear every control box reaching into our column
       2. centres — full-width mobile columns leave no strict gap, so at
          minimum keep every control's clickable centre outside the
          cluster (the control stays operable) */
  function computeAvoid() {
    if (!anchor) { avoidTargetY = 0; return; }

    /* base rect: #guide at its CSS position with no transforms. a parked
       ("place") anchor is judged on its stage alone — the reserved space
       of a bubble that is not showing must not shove it off its spot */
    var prevT = wrap.style.transform;
    wrap.style.transform = 'translate3d(0px,0px,0px)';
    var base = placeFor(anchor) ? stage.getBoundingClientRect() : wrap.getBoundingClientRect();
    wrap.style.transform = prevT;

    var baseTop = base.top, baseBottom = base.bottom, baseLeft = base.left, baseRight = base.right;
    var gap = TH.avoidGap || 10;
    var centreGap = 6;
    var header = qs('.header');
    var hBottom = header ? header.getBoundingClientRect().bottom : 0;
    var lo = (hBottom + gap) - baseTop;      /* keeps us below the header */
    var hi = 0;                              /* we only ever raise */
    if (hi <= lo) { avoidTargetY = 0; setBlocked(false); return; }

    /* every control that is present and actually clickable (tiny clip
       placeholders like .sr-only are not real click targets) */
    var items = [];
    var els = qsa(INTERACTIVE, doc);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (wrap.contains(el)) continue;                 /* exempt: our own controls */
      if (!hitTestable(el)) continue;                  /* hidden / inert / not clickable */
      if (!el.getClientRects().length) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;       /* visually-hidden placeholder */
      if (r.bottom <= 0 || r.top >= window.innerHeight) continue;   /* off-screen */
      items.push(r);
    }

    /* the highest y in [lo,hi] left clear: start at hi and step down to
       the low edge of every band that still contains y (the band with the
       lowest edge wins, since the union covers down to it) */
    function findY(bands) {
      var y = hi, guard = 0;
      while (guard++ < 600) {
        var lowEdge = null;
        for (var b = 0; b < bands.length; b++) {
          if (y > bands[b][0] && y < bands[b][1]) {
            if (lowEdge === null || bands[b][0] < lowEdge) lowEdge = bands[b][0];
          }
        }
        if (lowEdge === null) break;                   /* y is clear */
        y = lowEdge;
        if (y < lo) return null;                       /* no clear spot above the header */
      }
      return (y >= lo && y <= hi) ? y : null;
    }

    /* phase 1 — strict */
    var strictBands = [];
    for (var p = 0; p < items.length; p++) {
      var rs = items[p];
      if (rs.right <= baseLeft || rs.left >= baseRight) continue;   /* clear sideways */
      strictBands.push([rs.top - baseBottom, rs.bottom - baseTop]);
    }
    var yStrict = findY(strictBands);
    if (yStrict !== null) { setBlocked(false); avoidTargetY = yStrict; return; }

    /* phase 2 — centres only */
    var centreBands = [];
    for (var q = 0; q < items.length; q++) {
      var rc = items[q];
      var cx = rc.left + rc.width / 2;
      if (cx < baseLeft || cx > baseRight) continue;      /* centre never under us */
      var cy = rc.top + rc.height / 2;
      if (cy < 0 || cy > window.innerHeight) continue;    /* centre off-screen */
      centreBands.push([cy - centreGap - baseBottom, cy + centreGap - baseTop]);
    }
    var yCentre = findY(centreBands);
    if (yCentre !== null) { setBlocked(false); avoidTargetY = yCentre; return; }

    /* no clear spot at all — hide the guide for this anchor */
    avoidTargetY = 0;
    setBlocked(true);
  }

  var avoidQueued = false;
  function scheduleAvoid() {
    if (avoidQueued) return;
    avoidQueued = true;
    window.requestAnimationFrame(function () {
      avoidQueued = false;
      if (!enabled || !entered) return;
      computeAvoid();
      checkHideOver();
      /* no motion: snap the raise instead of smoothing it */
      if (!motionOn()) { avoidY = avoidTargetY; applyTransforms(); }
      ensureLoop();
    });
  }

  /* --------------------------------------------------------- suppression */

  function transitionMidCover() {
    var bars = qsa('.transition__bar');
    for (var i = 0; i < bars.length; i++) {
      var t = window.getComputedStyle(bars[i]).transform;
      if (!t || t === 'none') continue;
      var m = /matrix\([^,]+,[^,]+,[^,]+,[^,]+,([^,]+),([^)]+)\)/.exec(t);
      if (!m) continue;
      /* bar sits mid-screen (covering) — translateY near 0 of its track */
      var ty = Math.abs(parseFloat(m[2]));
      if (ty < 2) return true;
    }
    return false;
  }

  function updateSuppress() {
    var reason = '';
    if (root.classList.contains('menu-open') || qs('dialog[open]')) reason = 'overlay';
    else if (root.hasAttribute('data-intro')) reason = 'intro';
    else if (root.hasAttribute('data-transition-resume')) reason = 'transition';
    else if (transitionMidCover()) reason = 'transition';
    else if (!entered && !entranceActive) reason = 'wait';   /* before the first peek */
    if (reason === suppressed) return;
    suppressed = reason;
    applyHidden();
  }

  /* `blocked` (no clear spot for this anchor) sits beside `suppressed`
     (overlay/intro/transition); either one hides the whole guide */
  var blocked = false;
  function setBlocked(on) {
    if (on === blocked) return;
    blocked = on;
    applyHidden();
  }
  function applyHidden() {
    var reason = suppressed ||
      (anchorHide ? 'anchor' : '') ||
      (overlapHide ? 'overlap' : '') ||
      (blocked ? 'blocked' : '');
    if (reason) wrap.setAttribute('data-suppressed', reason);
    else wrap.removeAttribute('data-suppressed');
    if (reason) { stopLoop(); window.clearTimeout(hideTimer); }
    else { scheduleAvoid(); ensureLoop(); }
  }

  /* hideOver — elements the avatar may never sit on. the marquee is a
     full-width strip that sweeps the viewport as the page scrolls, so
     the only way never to cover its words is to step aside for it */
  var HIDE_OVER = CFG.hideOver || [];
  function checkHideOver() {
    if (!HIDE_OVER.length) { setOverlapHide(false); return; }
    var sr = stage.getBoundingClientRect();
    var open = bubble.hasAttribute('data-open');
    var br = open ? bubble.getBoundingClientRect() : null;
    for (var i = 0; i < HIDE_OVER.length; i++) {
      var el = qs(HIDE_OVER[i]);
      if (!el || !el.getClientRects().length) continue;
      var r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= window.innerHeight) continue;   /* off-screen */
      var hit = function (a) {
        return a.left < r.right && a.right > r.left && a.top < r.bottom && a.bottom > r.top;
      };
      if (hit(sr) || (br && hit(br))) { setOverlapHide(true); return; }
    }
    setOverlapHide(false);
  }

  function setOverlapHide(on) {
    if (on === overlapHide) return;
    overlapHide = on;
    applyHidden();
  }

  /* ------------------------------------------------- placed anchors */

  var MQ_NARROW = window.matchMedia('(max-width: 700px)');
  function isNarrow() { return MQ_NARROW.matches; }

  /* ink extent of a text element — the union of its kinetic-letter
     glyphs (the ::before marks the real paint), else its own box */
  function inkRect(el) {
    if (!el) return null;
    var kids = qsa('.kinetic__letter', el);
    if (!kids.length) {
      var r = el.getBoundingClientRect();
      if (!r.width && !r.height) return null;
      return { l: r.left, r: r.right, t: r.top, b: r.bottom,
               cy: r.top + r.height / 2, cx: r.left + r.width / 2 };
    }
    var l = Infinity, rr = -Infinity, t = Infinity, b = -Infinity;
    for (var i = 0; i < kids.length; i++) {
      var q = kids[i].getBoundingClientRect();
      if (!q.width && !q.height) continue;
      l = Math.min(l, q.left); rr = Math.max(rr, q.right);
      t = Math.min(t, q.top); b = Math.max(b, q.bottom);
    }
    if (l === Infinity) return null;
    return { l: l, r: rr, t: t, b: b, cy: (t + b) / 2, cx: (l + rr) / 2 };
  }

  /* the place block for this anchor at this width (null = plain anchor) */
  function placeFor(a) {
    if (!a || !a.place) return null;
    var p = a.place;
    if (isNarrow()) return p.mobile || null;
    return p;
  }

  function anchorSize(a) {
    var p = placeFor(a);
    return (p && p.size) || a.size;
  }

  /* Park a "place" anchor against a real element instead of the fixed
     bottom band. Everything — the vertical band, the centre, the gap,
     the bubble cap — is derived from getBoundingClientRect()/getBBox(),
     never from a magic number. */
  function positionPlaced(a, p) {
    var vw = window.innerWidth, vh = window.innerHeight;
    var gap = TH.avoidGap || 10;
    var hGap = p.hGap || 16;
    var ref = qs(p.ref) || doc.body;
    var refInk = inkRect(ref);
    if (!refInk) return;

    var stageW = stage.offsetWidth;
    var stageH = stage.offsetHeight;

    /* centre the VISIBLE drawing on the ref — the stage carries ~19%
       empty headroom above the head, so the box centre is not the
       avatar's centre. read the real viewBox + bbox to get the offset */
    var vbH = 220, drawMid = 110;
    var svgEl = qs('#av', wrap);
    try {
      if (svgEl && svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.height) {
        vbH = svgEl.viewBox.baseVal.height;
        var bb = svgEl.getBBox();
        drawMid = bb.y + bb.height / 2;
      }
    } catch (e) { /* keep the viewBox centre fallback */ }
    var drawMidOff = (drawMid / vbH) * stageH;

    /* vertical band: rects whose bottom sits above the ref's centre cap
       the top, rects whose top sits below it cap the bottom. the fixed
       header always caps the top. use the INK of a text line — its block
       box carries line-height padding that is not really "the name". */
    var bandTop = 0, bandBottom = vh;
    var avoidSel = ['.header'].concat(p.avoid || []);
    for (var i = 0; i < avoidSel.length; i++) {
      var el = qs(avoidSel[i]);
      if (!el) continue;
      var r = inkRect(el);
      if (!r) continue;
      if (avoidSel[i] === '.header' || r.b <= refInk.cy) bandTop = Math.max(bandTop, r.b);
      else if (r.t >= refInk.cy) bandBottom = Math.min(bandBottom, r.t);
    }
    bandTop = Math.max(bandTop, 0);
    bandBottom = Math.min(bandBottom, vh);

    /* shrink the anchor if the band is shorter than the avatar */
    var slack = bandBottom - bandTop - stageH;
    if (slack < 0) {
      var fit = Math.max(60, Math.round(anchorSize(a) * (bandBottom - bandTop) / Math.max(1, stageH)));
      wrap.style.setProperty('--guide-size-base', fit + 'px');
      stageW = stage.offsetWidth;
      stageH = stage.offsetHeight;
      slack = bandBottom - bandTop - stageH;
      drawMidOff = (drawMid / vbH) * stageH;
    }
    var g = Math.min(gap, Math.max(0, slack) / 2);

    var idealTop = refInk.cy - drawMidOff;
    var top = clamp(idealTop, bandTop + g, bandBottom - g - stageH);

    /* horizontal: hug the edge, or park right of the reference. the gutter
       is whatever clamp(…) applyAnchorBase already put in place — read the
       resolved value instead of repeating those numbers here */
    var side = p.side || a.side;
    var cs = window.getComputedStyle(wrap);
    var edge = parseFloat(cs.right) || parseFloat(cs.left) || 0;
    var stageLeft, leftMargin = edge;
    if (p.edge === 'ref-right') {
      stageLeft = refInk.r + hGap;
      wrap.style.left = stageLeft + 'px';
      wrap.style.right = 'auto';
    } else if (side === 'left') {
      stageLeft = edge;                    /* applyAnchorBase's clamp stands */
    } else {
      stageLeft = vw - edge - stageW;      /* applyAnchorBase's clamp stands */
    }
    wrap.style.top = 'auto';
    wrap.style.bottom = (vh - (top + stageH)) + 'px';

    /* bubble: cap it so the cluster never reaches back over the element it
       is parked beside and never past the gutter. the bubble sits on the
       avatar's outer side, so which edge it starts from depends on side */
    var gapH = parseFloat(window.getComputedStyle(wrap).gap) || 12;
    var bubbleEdge, byRef, byView;
    if (side === 'left') {
      bubbleEdge = stageLeft + stageW + gapH;   /* the bubble's inner edge */
      byView = (vw - edge) - bubbleEdge;        /* room out to the gutter */
      byRef = Infinity;                         /* the ref is on the far side */
    } else {
      bubbleEdge = stageLeft - gapH;            /* the bubble's inner edge */
      byView = bubbleEdge - leftMargin;
      byRef = bubbleEdge - refInk.r - hGap;
    }
    var cap = Math.min(260, byView);
    if (byRef >= 120) cap = Math.min(cap, byRef);
    wrap.style.setProperty('--guide-bubble-max', Math.round(Math.max(120, cap)) + 'px');
  }

  /* re-derive the parked spot after a resize / late layout settle */
  function reposition() {
    if (!anchor) return;
    var p = placeFor(anchor);
    if (!p) return;
    applyAnchorBase(anchor);
    computeAvoid();
    applyTransforms();
  }

  /* ------------------------------------------------------------- travel */

  function applyAnchorBase(a) {
    anchor = a;
    var p = placeFor(a);
    var side = (p && p.side) || a.side;
    sideLeft = side === 'left';
    wrap.setAttribute('data-side', side);
    wrap.style.setProperty('--guide-size-base', anchorSize(a) + 'px');
    if (side === 'left') {
      wrap.style.left = 'clamp(14px, 2vw, 26px)';
      wrap.style.right = 'auto';
    } else {
      wrap.style.right = 'clamp(14px, 2vw, 26px)';
      wrap.style.left = 'auto';
    }
    wrap.style.top = 'auto';
    wrap.style.bottom = (a.bottom || 0) + 'px';
    wrap.style.removeProperty('--guide-bubble-max');

    anchorHide = !!a.hide;
    bubbleHold = !!(p && p.noBubbleUntilTap) && !tapReleased;
    syncBubbleHold();
    if (p) positionPlaced(a, p);
    applyHidden();
  }

  function travelTo(a) {
    if (!a) return;
    var first = !anchor;
    heldEntry = null;              /* leaving an anchor drops its unshown held line */
    var oldRect = entered ? wrap.getBoundingClientRect() : null;
    applyAnchorBase(a);

    if (!motionOn() || !entered) {
      /* static: snap the position, no travel */
      travelX = travelY = 0;
      avoidY = avoidTargetY = 0;
      computeAvoid();
      avoidY = avoidTargetY;
      applyTransforms();
      return;
    }

    computeAvoid();
    /* measure the final resting rect (base + avoidance) */
    var prevT = wrap.style.transform;
    wrap.style.transform = 'translate3d(0px,' + avoidTargetY + 'px,0px)';
    var target = wrap.getBoundingClientRect();
    wrap.style.transform = prevT;

    if (oldRect) {
      travelFromX = oldRect.left - target.left;
      travelFromY = oldRect.top - target.top;
    } else {
      travelFromX = travelFromY = 0;
    }
    travelX = travelFromX;
    travelY = travelFromY;
    avoidY = avoidTargetY;
    travelT0 = performance.now();
    travelActive = true;
    stage.setAttribute('data-anim', 'hop');
    ensureLoop();
    if (first) { /* nothing */ }
  }

  function stepTravel(now) {
    var dur = TH.travelMs || 900;
    var t = clamp((now - travelT0) / dur, 0, 1);
    /* ease-out cubic */
    var e = 1 - Math.pow(1 - t, 3);
    travelX = travelFromX * (1 - e);
    travelY = travelFromY * (1 - e);
    if (t >= 1) {
      travelActive = false;
      travelX = travelY = 0;
      stage.removeAttribute('data-anim');
    }
  }

  /* ---------------------------------------------------------- entrance */

  function runEntrance() {
    if (!enabled) return;
    /* park against the settled hero first, then let it peek up */
    reposition();
    if (!motionOn()) {
      entranceY = 0;
      entranceActive = false;
      entered = true;
      wrap.setAttribute('data-entered', '');
      computeAvoid();
      avoidY = avoidTargetY;
      applyTransforms();
      updateSuppress();
      scheduleAvoid();
      ensureLoop();
      return;
    }
    entranceFrom = wrap.offsetHeight || 220;
    entranceY = entranceFrom;
    entranceT0 = performance.now();
    entranceActive = true;
    entered = false;
    wrap.removeAttribute('data-entered');
    updateSuppress();          /* entranceActive → drops the pre-peek hold */
    ensureLoop();
  }

  function stepEntrance(now) {
    var dur = TH.enterMs || 700;
    var t = clamp((now - entranceT0) / dur, 0, 1);
    /* stepped ~12fps for a sprite-like peek */
    var steps = Math.max(1, Math.round(dur / (1000 / 12)));
    var e = Math.floor(t * steps) / steps;
    entranceY = entranceFrom * (1 - e);
    if (t >= 1) {
      entranceActive = false;
      entranceY = 0;
      entered = true;
      wrap.setAttribute('data-entered', '');
      computeAvoid();
      avoidY = avoidTargetY;
      applyTransforms();
      updateSuppress();
      scheduleAvoid();
    }
  }

  /* -------------------------------------------------------- the rAF loop */

  function applyTransforms() {
    var y = travelY + avoidY + (entranceActive ? entranceY : 0);
    wrap.style.transform = 'translate3d(' + travelX.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)';

    if (leanEl) leanEl.style.transform = lean ? 'rotate(' + lean.toFixed(2) + 'deg)' : '';

    var live = motionOn() && entered && !entranceActive;
    if (avHead) avHead.style.transform = live && (headX || headY)
      ? 'translate(' + headX.toFixed(2) + 'px,' + headY.toFixed(2) + 'px)' : '';
    if (avEyesOpen) avEyesOpen.style.transform = live && (eyeX || eyeY)
      ? 'translate(' + eyeX.toFixed(2) + 'px,' + eyeY.toFixed(2) + 'px)' : '';
  }

  var running = false, rafId = 0, lastNow = 0;

  function needsFrame() {
    if (!enabled || suppressed || blocked || doc.hidden) return false;
    if (!entered) return entranceActive || travelActive;
    if (travelActive || entranceActive) return true;
    if (Math.abs(avoidY - avoidTargetY) > 0.15) return true;
    if (!motionOn()) return false;
    if (Math.abs(lean) > 0.02) return true;
    if (ptr.seen && (performance.now() - ptr.t) < 420) return true;
    if (Math.abs(eyeX) > 0.1 || Math.abs(eyeY) > 0.1 ||
        Math.abs(headX) > 0.1 || Math.abs(headY) > 0.1) return true;
    return false;
  }

  function frame(now) {
    rafId = window.requestAnimationFrame(frame);
    var dt = clamp((now - lastNow) / 1000, 0.001, 0.05);
    lastNow = now;
    var k = clamp(dt * 60, 0.1, 3);

    if (entranceActive) stepEntrance(now);
    if (travelActive) stepTravel(now);

    /* avoidance smoothing */
    if (Math.abs(avoidY - avoidTargetY) > 0.15) {
      avoidY += (avoidTargetY - avoidY) * lerpF(0.25, k);
    } else avoidY = avoidTargetY;

    if (motionOn() && entered && !entranceActive) {
      /* lean with scroll velocity */
      lean += (leanTarget - lean) * lerpF(0.12, k);
      if (Math.abs(lean) < 0.02) { lean = 0; leanTarget = 0; }
      if (performance.now() > scrollActiveT) leanTarget = 0;

      /* eye + head follow the pointer (X flips when the SVG is mirrored) */
      if (FINE.matches && ptr.seen) {
        var cx = window.innerWidth / 2, cy = window.innerHeight / 2;
        var nx = clamp((ptr.x - cx) / cx, -1, 1);
        var ny = clamp((ptr.y - cy) / cy, -1, 1);
        var sx = sideLeft ? -1 : 1;
        var ex = nx * (TH.eyePx || 4) * sx, ey = ny * (TH.eyePx || 4);
        var hx = nx * (TH.headPx || 3) * sx, hy = ny * (TH.headPx || 3);
        eyeX += (ex - eyeX) * lerpF(0.16, k);
        eyeY += (ey - eyeY) * lerpF(0.16, k);
        headX += (hx - headX) * lerpF(0.16, k);
        headY += (hy - headY) * lerpF(0.16, k);
      }
    } else {
      lean = leanTarget = 0;
      eyeX = eyeY = headX = headY = 0;
    }

    applyTransforms();

    if (!needsFrame()) stopLoop();
  }

  function ensureLoop() {
    if (running || doc.hidden) return;
    if (!needsFrame()) return;
    running = true;
    lastNow = performance.now();
    rafId = window.requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (!running) return;
    running = false;
    window.cancelAnimationFrame(rafId);
  }

  /* ------------------------------------------------------------- blink */

  function scheduleBlink() {
    window.clearTimeout(blinkTimer);
    if (!enabled || !motionOn()) return;
    var min = TH.blinkMinMs || 3000, max = TH.blinkMaxMs || 6000;
    var wait = min + Math.random() * (max - min);
    blinkTimer = window.setTimeout(function () {
      if (enabled && motionOn() && !suppressed && !blocked) {
        wrap.setAttribute('data-blink', '');
        window.setTimeout(function () {
          wrap.removeAttribute('data-blink');
        }, TH.blinkMs || 120);
      }
      scheduleBlink();
    }, wait);
  }

  /* ------------------------------------------------------- anchors / IO */

  function anchorsFor(s) {
    if (ANCHORS[s]) return ANCHORS[s];
    if (projectBySlug(s)) return ANCHORS['default'] || [];
    if (/^(websites|shopify|web-apps|uiux-design)$/.test(s)) {
      var d = (ANCHORS['default'] || [])[0];
      return d ? [{ selector: d.selector, side: d.side, size: d.size, bottom: d.bottom, line: 'services' }] : [];
    }
    return ANCHORS['default'] || [];
  }

  function tagLine(el, key) { if (el) el.setAttribute('data-guide-line', key); }

  function setupAnchors() {
    anchorList = anchorsFor(slug);
    if (!anchorList.length) return;

    /* resolve each selector (fall back to body) and tag for the observer */
    var uid = 0;
    anchorList = anchorList.map(function (a) {
      var el = qs(a.selector) || doc.body;
      return { def: a, el: el, uid: 'g' + (++uid) };
    });

    /* first anchor: set the base position immediately (no travel) */
    travelTo(anchorList[0].def);
    anchorIdx = 0;

    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var idx = -1;
        for (var i = 0; i < anchorList.length; i++) {
          if (anchorList[i].el === en.target) { idx = i; break; }
        }
        if (idx < 0) return;
        if (en.isIntersecting) activateAnchor(idx);
      });
    }, { rootMargin: '-40% 0px -40% 0px' });
    anchorList.forEach(function (a) { io.observe(a.el); });
  }

  function activateAnchor(idx) {
    if (idx === anchorIdx) return;
    anchorIdx = idx;
    var a = anchorList[idx].def;
    travelTo(a);
    /* section line (prio 1) — a reaction (prio 3) keeps priority */
    if (a.line) showLine(a.line, 1, 'sec');
  }

  /* ---------------------------------------------------------- greetings */

  function whenIntroDone(cb) {
    if (!root.hasAttribute('data-intro')) { window.setTimeout(cb, 350); return; }
    var done = false;
    var timer = window.setTimeout(finish, 7000);
    function finish() {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      cb();
    }
    if (!('MutationObserver' in window)) { window.setTimeout(finish, 2600); return; }
    var mo = new MutationObserver(function () {
      if (!root.hasAttribute('data-intro')) { mo.disconnect(); finish(); }
    });
    mo.observe(root, { attributes: true, attributeFilter: ['data-intro'] });
  }

  /* the parked spot is read from live rects, and the hero runs several
     load animations (kinetic letters rising, data-reveal blocks) — wait
     until their transforms are back to rest so the very first park
     measures a settled hero. checking `transform` (not the box) means the
     pointer-follow's font-variation changes can never stall it. */
  function whenHeroSettled(cb) {
    var els = qsa('.hero__line .kinetic__letter, .hero__top, .hero__intro');
    if (!els.length) { window.setTimeout(cb, 60); return; }
    var stable = 0, tries = 0;
    function probe() {
      tries++;
      var moving = false;
      for (var i = 0; i < els.length; i++) {
        var t = window.getComputedStyle(els[i]).transform;
        if (t && t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)') { moving = true; break; }
      }
      if (!moving) stable++; else stable = 0;
      /* absolute deadline: never make the visitor wait past ~3.6s for it */
      if (stable >= 3 || tries > 240 || performance.now() > 3600) { cb(); return; }
      window.requestAnimationFrame(probe);
    }
    window.requestAnimationFrame(probe);
  }

  function bootGreeting() {
    if (!enabled) return;
    var seen = lsGet('guide:seen');
    if (!seen) {
      if (slug !== 'index' && slug !== '') return;   /* first visit greets on home */
      whenIntroDone(function () {
        lsSet('guide:seen', '1');
        showLine('hero', 2, 'greeting');
      });
    } else {
      window.setTimeout(function () { showLine('returning', 2, 'greeting'); }, 900);
    }
  }

  /* -------------------------------------------------------- the toggle */

  function syncToggle() {
    if (footerToggle) {
      footerToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      footerToggle.textContent = enabled ? 'Guide: on' : 'Guide: off';
    }
  }

  function setEnabled(on) {
    enabled = on;
    lsSet('guide:enabled', on ? '1' : '0');
    syncToggle();
    if (on) {
      wrap.classList.remove('guide--off');
      wrap.removeAttribute('data-suppressed');
      blocked = false;
      if (entered) { scheduleAvoid(); updateSuppress(); }
      scheduleBlink();
      ensureLoop();
    } else {
      wrap.classList.add('guide--off');
      stopLoop();
      window.clearTimeout(blinkTimer);
      window.clearTimeout(stateTimer);
      window.clearTimeout(hideTimer);
      window.clearTimeout(typeTimer);
      queue.length = 0;
      current = null;
      closeBubble();
    }
  }

  if (footerToggle) {
    footerToggle.addEventListener('click', function () { setEnabled(!enabled); });
  }

  /* ------------------------------------------------------------- events */

  doc.addEventListener('pointermove', function (e) {
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    ptr.seen = true;
    ptr.t = performance.now();
    if (enabled) ensureLoop();
  }, { passive: true });

  var lastY = window.scrollY;
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    var dy = y - lastY;
    lastY = y;
    if (motionOn() && Math.abs(dy) > 1) {
      leanTarget = clamp(-dy * 0.35, -(TH.leanDeg || 4), TH.leanDeg || 4);
      scrollActiveT = performance.now() + 260;
      ensureLoop();
    }
    scheduleAvoid();
  }, { passive: true });

  var repositionTimer = 0;
  window.addEventListener('resize', function () {
    lastY = window.scrollY;
    window.clearTimeout(repositionTimer);
    repositionTimer = window.setTimeout(reposition, 120);
    scheduleAvoid();
  }, { passive: true });

  doc.addEventListener('visibilitychange', function () {
    if (doc.hidden) stopLoop();
    else ensureLoop();
  });

  if ('MutationObserver' in window) {
    var mo2 = new MutationObserver(function () {
      updateSuppress();
      scheduleAvoid();
    });
    mo2.observe(root, { attributes: true, attributeFilter: ['class', 'data-motion', 'data-intro', 'data-transition-resume'] });
    mo2.observe(doc.body, { attributes: true, attributeFilter: ['open'], subtree: true });
  }

  function onMotionChange() {
    travelX = travelY = entranceY = 0;
    lean = leanTarget = 0;
    eyeX = eyeY = headX = headY = 0;
    if (avHead) avHead.style.transform = '';
    if (avEyesOpen) avEyesOpen.style.transform = '';
    scheduleAvoid();
    scheduleBlink();
    ensureLoop();
  }
  if (REDUCED.addEventListener) REDUCED.addEventListener('change', onMotionChange);
  else if (REDUCED.addListener) REDUCED.addListener(onMotionChange);

  /* --------------------------------------------------------------- boot */

  wrap.style.setProperty('--travel-ms', (TH.travelMs || 900) + 'ms');
  wrap.style.setProperty('--flip-ms', (TH.flipMs || 500) + 'ms');

  syncToggle();
  wrap.classList.toggle('guide--off', !enabled);
  if (!enabled) {
    stopLoop();
    return;
  }

  setupAnchors();
  updateSuppress();
  scheduleBlink();
  bootGreeting();

  /* a parked anchor derives its spot from live rects, so re-derive once
     webfonts/images have settled and whenever the page finishes loading */
  function lateReposition() { if (enabled && anchor) reposition(); }
  window.addEventListener('load', function () { window.setTimeout(lateReposition, 80); });
  if (doc.fonts && doc.fonts.ready && doc.fonts.ready.then) {
    doc.fonts.ready.then(function () { lateReposition(); });
  }
  window.setTimeout(lateReposition, 700);

  /* entrance: after the preloader AND once the hero name has stopped
     moving, so the very first park reads a settled layout */
  whenIntroDone(function () { whenHeroSettled(runEntrance); });
})()
