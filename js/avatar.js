/* =====================================================================
   avatar.js — interactive dithered "guide" avatar (PASS 1)

   The avatar is drawn as ONE inline SVG template (below) so it works
   over file:// with no fetch, no libraries, no audio, no network.

   - every word it speaks lives in js/data.js under "avatar"
   - the SVG viewBox is cropped to the artwork bbox + 6 units, so the
     stage box tightly frames what is drawn (viewBoxMap derives every
     offset from it; the stage may letterbox when its aspect differs)
   - speak(line) returns a Promise that resolves when the line ends: it
     types the captions at the speech pace, alternates m-open/m-smile
     (m-grin on laughs) and bobs the head ~2px per word
   - sound is OFF by default — 'off' captions only, 'blips' Web Audio
     (one triangle blip per letter), 'voice' speechSynthesis; nothing
     audible is built before a user gesture (markGesture)
   - the home page offers a 7-step tour (data.js "tour"), every other
     page says one narration line (data.js "pageLines"), and clicking
     the contact/footer bubble copies the email
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
    '<svg id="av" viewBox="32 36 136 190" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
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

  /* speaker icon: waves while sound is on, a slash while it is off */
  var SOUND_ICON =
    '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">' +
    '<path d="M3 6h2.4L8.6 3v10L5.4 10H3z" fill="currentColor"/>' +
    '<g class="sound-waves" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">' +
    '<path d="M10.6 6.2a3.2 3.2 0 0 1 0 3.6"/>' +
    '<path d="M12.4 4.6a5.6 5.6 0 0 1 0 6.8"/></g>' +
    '<g class="sound-slash" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">' +
    '<path d="M3 3l10 10"/></g></svg>';

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
    '<span class="guide__bubble-text"></span>' +
    '<span class="guide__offer" hidden>' +
    '<button type="button" data-tour-start>Start tour</button>' +
    '<button type="button" data-tour-dismiss>Not now</button></span>' +
    '<span class="guide__controls" hidden>' +
    '<button type="button" data-tour-prev>Prev</button>' +
    '<span class="guide__count" data-tour-count>1/7</span>' +
    '<button type="button" data-tour-next>Next</button>' +
    '<button type="button" data-tour-skip>Skip tour</button>' +
    '<span class="guide__paused" data-tour-paused hidden>Paused</span>' +
    '<button type="button" class="guide__sound" data-sound-toggle aria-pressed="false" aria-label="Sound: off" title="Sound: off">' + SOUND_ICON + '</button>' +
    '</span>' +
    '<button type="button" class="guide__sound guide__sound--bubble" data-sound-toggle aria-pressed="false" aria-label="Sound: off" title="Sound: off">' + SOUND_ICON + '</button>' +
    '</div>' +
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
  var footerSound = qs('[data-sound-toggle]:not(.guide__sound)');
  var footerTour = qs('[data-tour-link]');

  /* bubble furniture: the tour/offer rows + the two speaker buttons
     (one parked over the bubble, one inside the tour controls) */
  var offerRow = qs('.guide__offer', wrap);
  var controlsRow = qs('.guide__controls', wrap);
  var countEl = qs('[data-tour-count]', wrap);
  var pausedEl = qs('[data-tour-paused]', wrap);
  var soundBtns = qsa('[data-sound-toggle]', wrap);

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
  var placeHide = false;            /* the parked figure cannot clear its ref/avoid list */
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
  var hideTimer = 0;
  var heldEntry = null;             /* a line recorded while the bubble is held */

  /* speech (B) — one live job at a time; the rAF loop steps it */
  var speech = null;                /* {text, step(now), cancelled, ...} */
  var mouthOpen = false, lastMouthT = 0, bobT0 = 0;

  /* sound: 'off' (default) | 'blips' | 'voice' — persisted, and only
     ever turned into noise after markGesture() has run */
  var SOUND_MODES = ['off', 'blips', 'voice'];
  function validSound(v) { return SOUND_MODES.indexOf(v) >= 0 ? v : null; }
  var sound = validSound(lsGet('guide:sound')) || (validSound(CFG.sound) || 'off');
  var soundChosen = lsGet('guide:sound:chosen') === '1';
  var lastSound = validSound(lsGet('guide:sound:last')) || 'blips';
  var gestured = false;
  var ac = null, master = null;
  var voices = [];

  /* tour (C) */
  var TOUR = CFG.tour || [];
  var tour = { active: false, step: -1, paused: false, autoTimer: 0 };
  var pendingTour = false;           /* "Take the tour" clicked on another page */

  /* <=600px: narration and section lines move into the tour's bottom
     sheet instead of being suppressed for length */
  var sheetActive = false;
  var sheetTimer = 0;
  var sheetShown = {};               /* keys already shown in the sheet */

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

  /* ------------------------------------------------------ captions ---- */

  /* segment renderer (accent word kept as its own span) + a monotonic
     reveal: the speech timeline decides how much of the line exists */
  function makeReveal(text) {
    var pack = renderSegments(text);
    var last = 0;
    return {
      total: pack.total,
      set: function (n) {
        n = clamp(n, 0, pack.total);
        if (n <= last) return;                 /* never rewind a caption */
        last = n;
        var left = n;
        for (var s = 0; s < pack.segs.length; s++) {
          var seg = pack.segs[s];
          var take = Math.max(0, Math.min(seg.s.length, left));
          pack.els[s].textContent = seg.s.slice(0, take);
          left -= take;
        }
      },
      finish: function () { this.set(pack.total); }
    };
  }

  /* --------------------------------------------------------- mouth ---- */
  /* one visible mouth at a time; the reaction states (cough/giggle/…)
     are styled after these rules in CSS, so a reaction keeps its own
     mouth while it plays */

  function setMouthOpen(open, laugh) {
    mouthOpen = open;
    if (!motionOn()) return;                    /* reduced motion: static */
    if (open) wrap.setAttribute('data-mouth', 'open');
    else if (laugh) wrap.setAttribute('data-mouth', 'grin');
    else wrap.removeAttribute('data-mouth');
  }

  function resetMouth() {
    mouthOpen = false;
    lastMouthT = 0;
    wrap.removeAttribute('data-mouth');
  }

  /* alternate open/closed, but never faster than ~12fps so a blip run
     reads as chatter instead of a flicker */
  function mouthBeat(laugh) {
    if (!motionOn()) return;
    var now = performance.now();
    if (now - lastMouthT < (TH.mouthMinMs || 85)) return;
    lastMouthT = now;
    setMouthOpen(!mouthOpen, laugh);
  }

  /* ~2px head bob on every word (consumed by applyTransforms) */
  function bobBeat() {
    if (!motionOn()) return;
    bobT0 = performance.now();
    ensureLoop();
  }

  function bobOffset(now) {
    if (!bobT0) return 0;
    var t = (now - bobT0) / (TH.bobMs || 190);
    if (t >= 1) { bobT0 = 0; return 0; }
    return -(TH.bobPx || 2) * Math.sin(Math.PI * t);
  }

  /* ------------------------------------------------------ audio ---- */
  /* one shared context, created only after a real gesture, and only
     while sound is not "off" — nothing audible exists before that */

  function ensureAudio() {
    if (!gestured || sound === 'off') return null;
    if (!ac) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ac = new AC(); } catch (e) { ac = null; return null; }
      try {
        master = ac.createGain();
        master.gain.value = TH.masterGain != null ? TH.masterGain : 0.25;
        master.connect(ac.destination);
      } catch (e) { master = null; }
    }
    if (ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
    return ac;
  }

  /* one ~40ms triangle blip, pitch derived from the character */
  function playBlip(ch) {
    if (sound !== 'blips') return;
    var ctx = ensureAudio();
    if (!ctx || !master) return;
    try {
      var t = ctx.currentTime;
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'triangle';
      var lo = TH.blipLo || 380, hi = TH.blipHi || 640;
      var code = (String(ch).toLowerCase().charCodeAt(0) || 97);
      var f = lo + ((code % 26) / 26) * (hi - lo) + (Math.random() * 40 - 20);
      o.frequency.setValueAtTime(clamp(f, lo, hi), t);
      var atk = (TH.blipAttack || 8) / 1000;
      var dur = (TH.blipMs || 40) / 1000;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(TH.blipGain || 0.04, t + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + dur + 0.03);
      o.onended = function () { try { o.disconnect(); g.disconnect(); } catch (e) {} };
    } catch (e) { /* audio must never break a line */ }
  }

  function refreshVoices() {
    try { voices = window.speechSynthesis.getVoices() || []; }
    catch (e) { voices = []; }
  }

  /* en-IN first, then en-GB / en-US; inside a language prefer a voice
     whose name says Natural or Online */
  function pickVoice() {
    if (!voices.length) refreshVoices();
    var langs = ['en-IN', 'en-GB', 'en-US'];
    var names = ['natural', 'online'];
    var i, j, k;
    for (i = 0; i < langs.length; i++) {
      for (j = 0; j < names.length; j++) {
        for (k = 0; k < voices.length; k++) {
          var v = voices[k];
          if (v.lang === langs[i] &&
              String(v.name || '').toLowerCase().indexOf(names[j]) >= 0) return v;
        }
      }
    }
    for (i = 0; i < langs.length; i++) {
      for (k = 0; k < voices.length; k++) if (voices[k].lang === langs[i]) return voices[k];
    }
    return voices[0] || null;
  }

  /* Chrome cuts long utterances — sentence pieces, then ~200-char chunks */
  function splitSentences(text) {
    var out = [], base = 0, m;
    var re = /[^.!?…\n]+[.!?…]*[ \t]*/g;
    while ((m = re.exec(text))) {
      if (m[0].trim()) out.push({ text: m[0], base: base });
      base += m[0].length;
    }
    if (!out.length) out.push({ text: text, base: 0 });
    var parts = [];
    out.forEach(function (p) {
      if (p.text.length <= 220) { parts.push(p); return; }
      var words = p.text.split(' '), buf = '', off = p.base;
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        if (buf && (buf.length + 1 + w.length) > 220) {
          parts.push({ text: buf, base: off });
          off += buf.length + 1;
          buf = '';
        }
        buf = buf ? buf + ' ' + w : w;
      }
      if (buf) parts.push({ text: buf, base: off });
    });
    return parts;
  }

  function stopVoice() {
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); }
    catch (e) {}
  }

  /* ------------------------------------------------------- speak ---- */

  function clearJobTimers(job) {
    while (job.timers.length) window.clearTimeout(job.timers.pop());
  }

  function finishJob(job, natural) {
    if (!job || job.done || job.cancelled) return;
    job.done = true;
    if (speech === job) speech = null;
    job.reveal.finish();                       /* the caption always lands */
    resetMouth();
    clearJobTimers(job);
    if (job.voiceLive) stopVoice();
    job.resolve(natural === false ? 'cut' : 'end');
  }

  /* stop the current line without leaving the caller hanging; the
     reason rides along so a tour knows why its line ended */
  function cancelSpeech(reason) {
    var job = speech;
    if (!job) return false;
    job.cancelled = true;
    job.done = true;
    speech = null;
    job.reveal.finish();
    resetMouth();
    clearJobTimers(job);
    if (job.voiceLive) stopVoice();
    job.resolve(reason || 'replace');
    return true;
  }

  /* speak(line) -> Promise, resolved with 'end' when the line finishes
     or with the cancel reason when it is cut short. Captions always
     show; audio follows the sound mode. */
  function speak(text, opts) {
    opts = opts || {};
    text = String(text == null ? '' : text);
    cancelSpeech('replace');
    return new Promise(function (resolve) {
      if (!text) { resolve('none'); return; }
      var job = {
        text: text, opts: opts, resolve: resolve, timers: [],
        done: false, cancelled: false, voiceLive: false,
        marks: [], mouthBeats: [], bobBeats: [],
        mi: 0, bi: 0, boi: 0, t0: 0, duration: 0, safety: 0,
        boundarySeen: false, laugh: false, reveal: makeReveal(text)
      };
      speech = job;
      job.laugh = /haha|hehe|hihi|lol|heh/i.test(text);

      var mode = sound;
      var voiceLive = mode === 'voice' && gestured;
      job.voiceLive = voiceLive;      /* so cancel/finish can stop the TTS */
      var still = !motionOn();                 /* reduced motion: instant text */
      if (still) job.reveal.finish();

      /* ---- timeline (captions + mouth + bob) ---- */
      var cps = TH.speechCps || 15;
      var i, ch;
      if (mode === 'blips') {
        var step = 1000 / (TH.blipCps || 18);
        var t = 0;
        for (i = 0; i < text.length; i++) {
          ch = text.charAt(i);
          t += step;
          job.marks.push({ t: t, n: i + 1 });
          if (/\s/.test(ch)) continue;
          if (/[.,!?;:…]/.test(ch)) {           /* punctuation: pause, no blip */
            var p0 = TH.pauseMin || 120;
            var p1 = TH.pauseMax || 250;
            t += p0 + Math.random() * (p1 - p0);
            continue;
          }
          job.mouthBeats.push({ t: t, ch: ch });
        }
        job.duration = t + 140;
      } else {
        for (i = 1; i <= text.length; i++) job.marks.push({ t: (i / cps) * 1000, n: i });
        job.duration = (text.length / cps) * 1000;
      }
      /* the head bobs per word in every mode */
      var re = /\S+/g, m;
      while ((m = re.exec(text))) {
        var wt = (m.index / cps) * 1000;
        job.bobBeats.push({ t: wt });
        if (mode !== 'blips') job.mouthBeats.push({ t: wt, ch: m[0] });
      }
      job.safety = voiceLive ? job.duration * 1.25 + 800 : job.duration + 450;

      job.step = function (now) {
        if (job.done || job.cancelled) return;
        if (job.recording) return;             /* the file drives its own line */
        var el = now - job.t0;
        if (!job.boundarySeen) {
          while (job.mi < job.marks.length && job.marks[job.mi].t <= el) {
            job.reveal.set(job.marks[job.mi].n); job.mi++;
          }
          while (job.bi < job.mouthBeats.length && job.mouthBeats[job.bi].t <= el) {
            var b = job.mouthBeats[job.bi++];
            mouthBeat(job.laugh);
            if (b.ch) playBlip(b.ch);
          }
          while (job.boi < job.bobBeats.length && job.bobBeats[job.boi].t <= el) {
            job.boi++; bobBeat();
          }
        }
        /* a live voice ends on utterance.onend; everything else ends here */
        if (el >= job.duration && !voiceLive) finishJob(job, true);
      };

      /* ---- recorded line (data.js "audio") ---- */
      var url = opts.key && CFG.audio ? CFG.audio[opts.key] : null;
      if (url && gestured) {
        job.recording = true;
        job.safety = job.duration * 2 + 3000;   /* el.onended normally wins */
        startRecording(url, job, begin);
      } else begin();

      function begin() {
        if (job.done || job.cancelled) return;
        if (voiceLive) startVoice(job, job);
        job.t0 = performance.now();
        job.timers.push(window.setTimeout(function () { finishJob(job, true); }, job.safety));
        ensureLoop();
      }
    });
  }

  /* optional narration file: play it, drive the mouth from its level,
     and fall back to the active mode when it is missing or broken */
  function startRecording(url, job, fallback) {
    var el;
    var settled = false;
    function fail() {
      if (settled) return;
      settled = true;
      cleanup();
      job.recording = false;
      job.safety = job.duration + 450;         /* back to the active mode */
      fallback();
    }
    function cleanup() {
      if (!el) return;
      try {
        el.oncanplay = el.onerror = el.onended = null;
        el.pause();
        el.src = '';
      } catch (e) {}
      el = null;
    }
    try {
      el = new Audio();
      el.preload = 'auto';
      el.src = url;
    } catch (e) { fail(); return; }

    var ctx = ensureAudio();
    var analyser = null, data = null;
    if (ctx) {
      try {
        var src = ctx.createMediaElementSource(el);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        data = new Uint8Array(analyser.fftSize);
        src.connect(analyser);
        analyser.connect(ctx.destination);
      } catch (e) { analyser = null; }
    }

    el.oncanplay = function () {
      if (settled || job.done || job.cancelled) return;
      settled = true;
      job.recording = true;
      var p;
      try { p = el.play(); } catch (e) { fail(); return; }
      if (p && p.then) p.then(function () {}, function () { fail(); });
      /* caption + mouth: analyser level, or a word-paced timer pattern
         when the analyser reads silence (file://, muted output) */
      var cps = TH.speechCps || 15;
      var t0 = performance.now();
      var silentSince = performance.now();
      var lastOpen = false;
      job.timers.push(window.setInterval(function () {
        if (job.done || job.cancelled) return;
        var now = performance.now();
        var el2 = now - t0;
        job.reveal.set(Math.min(job.text.length, Math.ceil((el2 / 1000) * cps)));
        var level = 0;
        if (analyser) {
          try {
            analyser.getByteTimeDomainData(data);
            var sum = 0;
            for (var i = 0; i < data.length; i++) { var d = data[i] - 128; sum += d * d; }
            level = Math.sqrt(sum / data.length) / 128;
          } catch (e) { level = 0; }
        }
        if (level > 0.02) {
          silentSince = now;
          var open = level > 0.08;
          if (open !== lastOpen) { lastOpen = open; setMouthOpen(open, job.laugh); }
        } else if (now - silentSince > 400) {
          /* silence: fall back to the word pattern */
          lastOpen = !lastOpen;
          setMouthOpen(lastOpen, job.laugh);
        }
        bobBeat();
      }, 90));
      el.onended = function () { finishJob(job, true); };
    };
    el.onerror = fail;
    /* never let a broken file stall the caller */
    job.timers.push(window.setTimeout(function () {
      if (!settled) fail();
    }, 4000));
  }

  /* a live TTS voice: sentence utterances, mouth on boundary events,
     the timeline above as the fallback when they never fire */
  function startVoice(job) {
    var synth = window.speechSynthesis;
    if (!synth) return;
    refreshVoices();
    var parts = splitSentences(job.text);
    var idx = 0;
    function speakPart() {
      if (job.done || job.cancelled) return;
      var part = parts[idx];
      if (!part) { finishJob(job, true); return; }
      var u;
      try { u = new SpeechSynthesisUtterance(part.text); }
      catch (e) { finishJob(job, true); return; }
      var v = pickVoice();
      try { u.voice = v; } catch (e) {}
      try { u.lang = (v && v.lang) || 'en-IN'; } catch (e) {}
      try { u.rate = 1; } catch (e) {}
      u.onboundary = function (e) {
        if (job.done || job.cancelled) return;
        job.boundarySeen = true;
        var ci = typeof e.charIndex === 'number' ? e.charIndex : -1;
        if (ci >= 0) job.reveal.set(part.base + ci + 1);
        mouthBeat(job.laugh);
        bobBeat();
      };
      u.onend = function () {
        if (job.done || job.cancelled) return;
        idx++;
        if (idx >= parts.length) finishJob(job, true);
        else speakPart();
      };
      u.onerror = function () { /* the timer fallback keeps the line going */ };
      try { synth.speak(u); } catch (e) {}
    }
    speakPart();
  }

  /* while the active anchor holds the bubble (noBubbleUntilTap) it is
     taken out of the layout entirely: the cluster collapses to just the
     avatar, so nothing can be covered by a bubble that is not shown */
  function syncBubbleHold() {
    if (bubbleHold && !sheetActive) {      /* the sheet ignores the hold */
      bubble.setAttribute('data-hold', '');
      if (current) { current.retired = true; current = null; window.clearTimeout(hideTimer); }
      if (bubble.hasAttribute('data-open')) closeBubble();
      return;
    }
    bubble.removeAttribute('data-hold');
  }

  function openBubble() {
    if (bubbleHold && !sheetActive) return;  /* held — nothing to show yet */
    bubble.setAttribute('data-open', '');
    scheduleAvoid();
  }

  function closeBubble() {
    bubble.removeAttribute('data-open');
    shown = null;
    if (!tour.active) showControls(null);
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
    if (replay !== false && held) showLine(held.line, held.prio, held.id, held.extra);
    scheduleAvoid();
  }

  /* ---------------------------------------- bubble controls + aria ---- */
  /* kind: 'offer' (first visit), 'tour' (running) or null. The guide is
     decorative (aria-hidden) unless it is offering controls; while the
     tour runs the bubble announces each step via role="status". */

  function showControls(kind) {
    if (tour.active) kind = 'tour';
    if (offerRow) offerRow.hidden = kind !== 'offer';
    if (controlsRow) controlsRow.hidden = kind !== 'tour';
    if (kind) bubble.setAttribute('data-controls', kind);
    else bubble.removeAttribute('data-controls');
    syncAria();
    scheduleAvoid();
  }

  function syncAria() {
    var has = bubble.hasAttribute('data-controls');
    if (has) {
      wrap.removeAttribute('aria-hidden');
      bubble.removeAttribute('aria-hidden');
    } else {
      wrap.setAttribute('aria-hidden', 'true');
      bubble.setAttribute('aria-hidden', 'true');
    }
    if (tour.active) bubble.setAttribute('role', 'status');
    else bubble.removeAttribute('role');
  }

  /* ------------------------------------------------------- sound ---- */

  function setSound(mode, byUser) {
    mode = validSound(mode) || 'off';
    sound = mode;
    if (mode !== 'off') lastSound = mode;
    lsSet('guide:sound', mode);
    lsSet('guide:sound:last', lastSound);
    if (byUser) { soundChosen = true; lsSet('guide:sound:chosen', '1'); }
    if (mode === 'off') stopVoice();
    else if (gestured) ensureAudio();
    syncSound();
  }

  function syncSound() {
    var on = sound !== 'off';
    var label = 'Sound: ' + sound;
    if (footerSound) {
      footerSound.textContent = label;
      footerSound.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    for (var i = 0; i < soundBtns.length; i++) {
      var b = soundBtns[i];
      b.setAttribute('data-sound', on ? sound : 'off');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', label);
      b.setAttribute('title', on ? label + ' - click to mute'
                                : 'Sound: off - click for ' + lastSound);
    }
  }

  /* the first real gesture unlocks audio; before that nothing is built */
  function markGesture() {
    if (gestured) return;
    gestured = true;
    if (sound !== 'off') ensureAudio();
  }

  /* -------------------------------------------------- copy email ---- */

  function copyEmail(prio, id) {
    var email = CFG.email || '';
    var settled = false;
    function done() {
      if (settled) return;
      settled = true;
      showLine('copied', prio || 3, id || 'react');
    }
    function legacy() {
      if (settled) return;
      try {
        var ta = doc.createElement('textarea');
        ta.value = email;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        doc.body.appendChild(ta);
        ta.select();
        if (ta.setSelectionRange) ta.setSelectionRange(0, email.length);
        doc.execCommand('copy');
        doc.body.removeChild(ta);
      } catch (e) { /* clipboard unavailable: still confirm the click */ }
      done();
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        /* some contexts never settle this promise — the visitor still
           gets their confirmation either way */
        var guard = window.setTimeout(legacy, 700);
        navigator.clipboard.writeText(email).then(function () {
          window.clearTimeout(guard);
          done();
        }, function () {
          window.clearTimeout(guard);
          legacy();
        });
      } else legacy();
    } catch (e) { legacy(); }
  }

  /* ------------------------------------------------------------- tour */
  /* C — seven steps on the home page. Each step scrolls its target into
     view, parks the avatar on the nearest anchor, speaks its line, then
     advances 1s after the speech ends. Any wheel / touch scroll by the
     visitor pauses that auto-advance (Next still works) and shows
     "Paused"; Escape or Skip tour stops the whole thing. */

  function tourClearAuto() {
    if (tour.autoTimer) { window.clearTimeout(tour.autoTimer); tour.autoTimer = 0; }
  }

  function tourSync() {
    if (!tour.active) return;
    if (countEl) countEl.textContent = (tour.step + 1) + '/' + TOUR.length;
    if (pausedEl) pausedEl.hidden = !tour.paused;
    showControls('tour');
  }

  function tourStart() {
    if (tour.active || !TOUR.length) return;
    /* the click that got here is already a gesture (the pointerdown
       listener saw it); a tour carried over from another page is NOT,
       so nothing audible is built until the visitor really does
       something on this page */
    if (sound === 'off' && !soundChosen) setSound('blips', false);
    tour.active = true;
    tour.paused = false;
    tapReleased = true;               /* taking the tour lifts any hold */
    if (bubbleHold) { bubbleHold = false; syncBubbleHold(); }
    setPlaceHide(false);              /* the tour UI is never parked out */
    wrap.setAttribute('data-tour', '');
    tourClearAuto();
    if (current) { current.retired = true; current = null; }
    window.clearTimeout(hideTimer);
    queue.length = 0;
    tourRun(0);
  }

  function tourEnd() {
    if (!tour.active) return;
    tour.active = false;
    tourClearAuto();
    cancelSpeech('skip');
    tour.step = -1;
    tour.paused = false;
    wrap.removeAttribute('data-tour');
    if (current) { current.retired = true; current = null; }
    window.clearTimeout(hideTimer);
    queue.length = 0;
    showControls(null);
    closeBubble();
    if (pendingTour) {
      pendingTour = false;
      try { window.sessionStorage.removeItem('guide:tour'); } catch (e) {}
    }
    reposition();
    scheduleAvoid();
    ensureLoop();
  }

  function tourAuto(i) {
    tourClearAuto();
    tour.autoTimer = window.setTimeout(function () {
      tour.autoTimer = 0;
      if (!tour.active || tour.step !== i || tour.paused) return;
      tourRun(i + 1);
    }, TH.tourAdvanceMs || 1000);
  }

  function tourRun(i) {
    if (!tour.active) return;
    if (i < 0) i = 0;
    if (i >= TOUR.length) { tourEnd(); return; }
    tour.step = i;
    tour.paused = false;
    tourClearAuto();
    tourSync();
    var step = TOUR[i];
    var target = step && step.target ? qs(step.target) : null;
    if (!target) { tourRun(i + 1); return; }     /* a missing target never wedges it */
    tourScrollTo(target, function () {
      if (!tour.active || tour.step !== i) return;
      var near = tourNearestAnchor(target);
      if (near) { anchorIdx = near.idx; travelTo(near.a.def); }
      if (!tour.active || tour.step !== i) return;
      showLine(step.line, 4, 'tour', { copy: !!step.copy });
      var entry = current;
      if (!entry || entry.id !== 'tour') return;
      entry.promise.then(function (why) {
        if (!tour.active || tour.step !== i) return;
        /* only a finished line (or a copy the visitor asked for) keeps
           the tour moving — a hidden tab / skipped line must not race on */
        if (why !== 'end' && why !== 'copy') return;
        if (why === 'copy' && i >= TOUR.length - 1) return;
        if (tour.paused) return;
        tourAuto(i);
      });
    });
  }

  /* smooth-scroll the target into the middle band; reduced motion (and
     any browser without smooth scroll) jumps instead */
  function tourScrollTo(el, cb) {
    if (!motionOn()) {
      try { el.scrollIntoView({ block: 'center', behavior: 'instant' }); }
      catch (e) { try { el.scrollIntoView(); } catch (e2) {} }
      cb();
      return;
    }
    var r = el.getBoundingClientRect();
    var vh = window.innerHeight;
    var top = window.scrollY + r.top - Math.max(76, (vh - Math.min(r.height, vh)) / 2);
    var max = Math.max(0, doc.documentElement.scrollHeight - vh);
    top = clamp(top, 0, max);
    if (Math.abs(top - window.scrollY) < 6) { cb(); return; }
    var done = false;
    var timer = 0;
    function finish() {
      if (done) return;
      done = true;
      window.removeEventListener('scrollend', finish);
      window.clearTimeout(timer);
      cb();
    }
    timer = window.setTimeout(finish, 1500);
    window.addEventListener('scrollend', finish);
    /* the site's own Lenis when it is running, else native smooth */
    if (window.lenis && typeof window.lenis.scrollTo === 'function') {
      try {
        window.lenis.scrollTo(top, { duration: 0.9, force: true, onComplete: finish });
        return;
      } catch (e) { /* fall through to the native scroll */ }
    }
    try { window.scrollTo({ top: top, behavior: 'smooth' }); }
    catch (e) { try { window.scrollTo(0, top); } catch (e2) {} finish(); }
  }

  /* the anchor whose element contains the target, else the nearest one */
  function tourNearestAnchor(el) {
    if (!anchorList.length) return null;
    var best = null, bestIdx = -1, bestScore = Infinity;
    for (var i = 0; i < anchorList.length; i++) {
      var a = anchorList[i];
      var score;
      if (a.el === el || (a.el && a.el.contains && a.el.contains(el))) score = 0;
      else {
        var r1 = a.el.getBoundingClientRect();
        var r2 = el.getBoundingClientRect();
        var dy = r2.top > r1.bottom ? r2.top - r1.bottom
              : (r1.top > r2.bottom ? r1.top - r2.bottom : 0);
        var dx = r2.left > r1.right ? r2.left - r1.right
              : (r1.left > r2.right ? r1.left - r2.right : 0);
        score = dy + dx + 1;
      }
      if (score < bestScore) { bestScore = score; best = a; bestIdx = i; }
    }
    return best ? { a: best, idx: bestIdx } : null;
  }

  /* a wheel / touch scroll is the visitor taking over: hold the
     auto-advance (Next still works) and say so */
  function tourUserScroll() {
    if (!tour.active || tour.paused) return;
    tour.paused = true;
    tourClearAuto();
    tourSync();
  }

  /* ---- wiring: offer row, tour row, footer link ---- */

  qsa('[data-tour-start]', wrap).forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      tourStart();
    });
  });
  qsa('[data-tour-dismiss]', wrap).forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (current) retire(current);
      else showControls(null);
    });
  });
  qsa('[data-tour-prev]', wrap).forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (tour.active) tourRun(Math.max(0, tour.step - 1));
    });
  });
  qsa('[data-tour-next]', wrap).forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (tour.active) tourRun(tour.step + 1);
    });
  });
  qsa('[data-tour-skip]', wrap).forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      tourEnd();
    });
  });
  qsa('[data-sound-toggle]', wrap).forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      markGesture();
      setSound(sound === 'off' ? lastSound : 'off', true);
    });
  });

  window.addEventListener('wheel', tourUserScroll, { passive: true, capture: true });
  window.addEventListener('touchmove', tourUserScroll, { passive: true, capture: true });

  /* ---------------------------------------------- line queue + priority */
  /* prio: 0 hint, 1 section, 2 greeting, 3 reaction. A higher prio line
     displaces the current one and clears lower-prio waits; equal prio
     (a new section) replaces; a reaction interrupts a hint. */

  /* --------------------------------------------- the phone sheet ------ */
  /* at <=600px the page narration and the section lines are shown in the
     tour's bottom sheet instead of the bubble beside the avatar, so the
     30-character rule only ever applies to that bubble. The sheet shows
     each line once per visit, never under the menu overlay or the
     certificate dialog, dismisses itself after the text's reading time
     plus 2s, and goes away on a tap. */

  function isOverlaid() {
    return root.classList.contains('menu-open') || !!qs('dialog[open]');
  }

  function sheetEntry(entry) {
    if (!MQ_PHONE.matches || tour.active) return false;
    return entry.id === 'sec' || entry.id === 'narration';
  }

  function sheetKey(entry) { return entry.key || entry.line; }

  function clearSheetTimer() {
    if (sheetTimer) { window.clearTimeout(sheetTimer); sheetTimer = 0; }
  }

  function setSheet(on) {
    if (on === sheetActive) return;
    sheetActive = on;
    if (on) {
      wrap.setAttribute('data-sheet', '');
      bubble.removeAttribute('data-hold');       /* the caption must show */
    } else {
      wrap.removeAttribute('data-sheet');
      /* hand the anchor its hold state and spot back */
      if (anchor) { applyAnchorBase(anchor); computeAvoid(); applyTransforms(); }
    }
    scheduleAvoid();
  }

  /* auto-dismiss (reading time + 2s) and tap-to-dismiss both land here */
  function dismissSheet() {
    clearSheetTimer();
    if (!sheetActive) return;
    if (current && current.sheet) {
      cancelSpeech('sheet');                   /* stop the line with it */
      retire(current);                         /* clears the sheet too */
    } else {
      setSheet(false);
    }
  }

  function pickLine(entry) {
    if (entry.line === 'project') return projectLine(slug);
    if (entry.line === 'copied') return LINES.copied || '';
    /* sections/greetings pass a key into LINES; a reaction passes its
       line as literal text — resolve the key first, else use it as-is */
    return LINES[entry.line] || entry.line || '';
  }

  /* phones (≤600px): a bubble line outside the tour has to fit in
     TH.mobileMax characters — it either uses its short wording from
     shortLines or it is suppressed altogether */
  var MQ_PHONE = window.matchMedia('(max-width: 600px)');
  function fitLine(entry, text) {
    if (!text || entry.id === 'tour') return text;
    if (!MQ_PHONE.matches) return text;
    if (text.length <= (TH.mobileMax || 30)) return text;
    var key = LINES[entry.line] ? entry.line : null;
    var short = key && CFG.shortLines ? CFG.shortLines[key] : null;
    if (short && short.length <= (TH.mobileMax || 30)) return short;
    return null;
  }

  /* render one entry: captions are typed by speak() at the speech pace,
     and the bubble only auto-hides once the line has had its say */
  function startEntry(entry) {
    var sheet = sheetEntry(entry);
    var text = pickLine(entry);
    if (sheet) {
      /* once per visit, never while an overlay owns the screen */
      if (!text || sheetShown[sheetKey(entry)] || isOverlaid()) return false;
      sheetShown[sheetKey(entry)] = true;
      entry.sheet = true;
    } else {
      text = fitLine(entry, text);
      if (text == null) return false;           /* suppressed on this screen */
      entry.sheet = false;
    }
    current = entry;
    if (text !== shown) shown = text;
    if (entry.sheet) setSheet(true);
    else { clearSheetTimer(); setSheet(false); }
    openBubble();
    showControls(entry.controls || null);
    window.clearTimeout(hideTimer);
    var key = entry.key || (LINES[entry.line] ? entry.line : null);
    var done = speak(text, { key: key });
    entry.promise = done;
    if (entry.sheet) {
      /* the sheet lives for the text's reading time plus 2 seconds */
      clearSheetTimer();
      sheetTimer = window.setTimeout(function () { dismissSheet(); },
        Math.round(text.length / (TH.speechCps || 15) * 1000) + 2000);
    } else if (entry.prio < 3) {
      entry.t0 = performance.now();
      done.then(function () {
        if (current !== entry || entry.retired) return;
        window.clearTimeout(hideTimer);
        /* on screen for at least hideMs from the moment it appeared,
           and never yanked the instant it finished being said */
        var hold = Math.max((TH.hideMs || 5000) - (performance.now() - entry.t0), 1500);
        hideTimer = window.setTimeout(function () { retire(entry); }, hold);
      });
    }
    return true;
  }

  function retire(entry) {
    if (current === entry) {
      current = null;
      if (entry.sheet) { clearSheetTimer(); setSheet(false); }
      if (!tour.active) showControls(null);
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
      if (startEntry(nxt)) return;
      /* suppressed by the phone rule — keep draining */
    }
    if (!current) closeBubble();
  }

  function showLine(line, prio, id, extra) {
    /* the tour owns the bubble while it runs — only the tour's own
       copy confirmation may replace a step caption */
    if (tour.active && id !== 'tour' && id !== 'copy') return;
    var entry = { line: line, prio: prio, id: id, retired: false };
    if (extra) { for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) entry[k] = extra[k]; }
    entry.sheet = sheetEntry(entry);
    if (entry.sheet) {
      /* drop before touching the current line: the sheet shows each line
         once per visit and never under the menu / certificate dialog */
      if (!pickLine(entry) || sheetShown[sheetKey(entry)] || isOverlaid()) return;
    }
    /* held (mobile hero): remember the line instead of drawing it, so a
       tap can replay the strongest thing that wanted to be said. A line
       bound for the sheet ignores the hold — it is not that bubble. */
    if (bubbleHold && !entry.sheet) {
      if (!heldEntry || prio >= heldEntry.prio) {
        heldEntry = { line: line, prio: prio, id: id, extra: extra };
      }
      return;
    }
    if (current && !current.retired) {
      if (prio > current.prio) {
        current.retired = true;
        window.clearTimeout(hideTimer);
        current = null;
        if (!startEntry(entry)) drain();
        return;
      }
      if (prio === current.prio) {
        /* same strength (e.g. a new section) — replace */
        current.retired = true;
        window.clearTimeout(hideTimer);
        current = null;
        if (!startEntry(entry)) drain();
        return;
      }
      /* weaker: queue behind the current line */
      queue.push(entry);
      return;
    }
    if (!startEntry(entry)) drain();
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

  bubble.addEventListener('click', function (e) {
    if (!enabled || suppressed) return;
    if (e.target && e.target.closest && e.target.closest('button')) return;
    /* the contact / footer bubble (and the tour's last step) doubles as
       a copy button: the address goes to the clipboard for them */
    if (current && current.copy) {
      var wasTour = tour.active;
      cancelSpeech('copy');
      copyEmail(wasTour ? 4 : 3, wasTour ? 'copy' : 'react');
      return;
    }
    if (tour.active) return;                   /* the tour owns the bubble */
    /* clicking the bubble dismisses the line */
    if (current) retire(current);
  });

  /* the phone sheet dismisses on a tap anywhere on it — capture, so it
     runs before the avatar's own zone handlers (a boop still plays).
     A line that copies the address keeps its own tap behaviour. */
  wrap.addEventListener('click', function (e) {
    if (!sheetActive || !enabled || suppressed) return;
    var t = e.target;
    if (t && t.closest && t.closest('.guide__close, .guide__sound')) return;
    if (current && current.copy) return;       /* the bubble copies instead */
    dismissSheet();
  }, true);

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
    /* the pinned mobile sheet (tour or narration) needs no avoidance,
       and must never be judged "blocked" by the content it sits over */
    if ((tour.active || sheetActive) && MQ_PHONE.matches) {
      avoidTargetY = 0;
      setBlocked(false);
      return;
    }

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

    /* no clear spot at all — hide the guide for this anchor, unless a
       tour is running: its controls must never vanish mid-step */
    avoidTargetY = 0;
    setBlocked(!tour.active);
  }

  var avoidQueued = false;
  function scheduleAvoid() {
    if (avoidQueued) return;
    avoidQueued = true;
    window.requestAnimationFrame(function () {
      avoidQueued = false;
      if (!enabled || !entered) return;
      /* a parked ("place") anchor is glued to the element it sits beside:
         re-derive its spot on every scroll/resize so the figure can
         never drift onto the text as the page moves (skip the mobile
         tour sheet — it is pinned by CSS) */
      var p = placeFor(anchor);
      if (p && anchor && !((tour.active || sheetActive) && MQ_PHONE.matches)) {
        positionPlaced(anchor, p);
      }
      computeAvoid();
      /* the running tour / phone sheet must keep its UI: marquee waits */
      if (!tour.active && !sheetActive) checkHideOver();
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
    /* the phone sheet never lives under the menu or the dialog */
    if (reason === 'overlay' && sheetActive) dismissSheet();
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
      (overlapHide || placeHide ? 'overlap' : '') ||
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

  /* cached stage height at an anchor's full size — the shrink fit has
     to be derived from that, never from an already-shrunk stage */
  var shrinkFullFor = '', shrinkFullH = 0;

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

  /* map the SVG's user space onto the stage box. The viewBox is cropped
     to the artwork bbox + 6 units (32 36 136 190) and preserveAspectRatio
     meets it inside the stage, so the drawing may sit centred with a
     little room on the wider axis — every offset comes from here, never
     from a magic ratio. */
  function viewBoxMap(w, h) {
    var m = { vbX: 0, vbY: 0, vbW: 200, vbH: 220, drawMid: 110,
              scale: 1, offX: 0, offY: 0, bb: null };
    var svgEl = qs('#av', wrap);
    try {
      if (svgEl && svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.width) {
        var v = svgEl.viewBox.baseVal;
        m.vbX = v.x; m.vbY = v.y; m.vbW = v.width; m.vbH = v.height;
        var bb = svgEl.getBBox();
        m.bb = bb;
        m.drawMid = bb.y + bb.height / 2;
      }
    } catch (e) { /* keep the fallbacks */ }
    m.scale = Math.min(w / m.vbW, h / m.vbH);
    m.offX = (w - m.vbW * m.scale) / 2;
    m.offY = (h - m.vbH * m.scale) / 2;
    m.drawMidOff = m.offY + (m.drawMid - m.vbY) * m.scale;
    return m;
  }

  /* the artwork as it actually renders on screen — the figure, not the
     (possibly wider) stage box, is what can cover text */
  function figureRect(sr) {
    var m = viewBoxMap(sr.width, sr.height);
    if (!m.bb) return { l: sr.left, r: sr.right, t: sr.top, b: sr.bottom };
    var l = sr.left + m.offX + (m.bb.x - m.vbX) * m.scale;
    var t = sr.top + m.offY + (m.bb.y - m.vbY) * m.scale;
    return { l: l, r: l + m.bb.width * m.scale, t: t, b: t + m.bb.height * m.scale };
  }

  /* Park a "place" anchor against a real element instead of the fixed
     bottom band. Everything — the vertical band, the centre, the gap,
     the bubble cap — is derived from getBoundingClientRect()/getBBox(),
     never from a magic number. If the figure still cannot clear its
     ref + avoid list, the anchor hides (hide-at-overlap) instead of
     covering the words it was meant to sit beside. */
  function positionPlaced(a, p) {
    var vw = window.innerWidth, vh = window.innerHeight;
    var gap = TH.avoidGap || 10;
    var hGap = p.hGap || 16;
    var ref = qs(p.ref) || doc.body;
    var refInk = inkRect(ref);
    if (!refInk) { setPlaceHide(false); return; }
    /* the reference has scrolled away: the last park is still the best
       one — deriving a band from off-screen rects would be nonsense */
    if (refInk.b <= 0 || refInk.t >= vh) return;

    var stageW = stage.offsetWidth;
    var stageH = stage.offsetHeight;

    /* centre the VISIBLE drawing on the ref: read the real viewBox and
       artwork bbox so the empty margins of the stage never skew it */
    var map = viewBoxMap(stageW, stageH);
    var drawMidOff = map.drawMidOff;

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

    /* no legal band left — the anchor cannot sit here without covering
       something, so it hides (hide-at-overlap) instead */
    if (bandBottom - bandTop < 60) { setPlaceHide(true); return; }

    /* shrink the anchor if the band is shorter than the avatar. The fit
       is measured against the stage at its FULL anchor size — the size
       var may already be shrunk from an earlier pass, and deriving the
       fit from that would bounce it straight back up. */
    var slack = bandBottom - bandTop - stageH;
    if (slack < 0) {
      var full = anchorSize(a);
      var fullKey = full + (isNarrow() ? 'n' : 'w');
      var fullH = shrinkFullH;
      if (shrinkFullFor !== fullKey || !fullH) {
        var saved = wrap.style.getPropertyValue('--guide-size-base');
        wrap.style.setProperty('--guide-size-base', full + 'px');
        fullH = stage.offsetHeight;
        if (saved) wrap.style.setProperty('--guide-size-base', saved);
        else wrap.style.removeProperty('--guide-size-base');
        shrinkFullFor = fullKey;
        shrinkFullH = fullH;
      }
      var fit = Math.min(full, Math.max(60,
        Math.round(full * (bandBottom - bandTop) / Math.max(1, fullH))));
      wrap.style.setProperty('--guide-size-base', fit + 'px');
      stageW = stage.offsetWidth;
      stageH = stage.offsetHeight;
      slack = bandBottom - bandTop - stageH;
      drawMidOff = viewBoxMap(stageW, stageH).drawMidOff;
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

    /* hide-at-overlap: the FIGURE (not the stage box) has to clear the
       ref — RAGUL — plus every avoid element (KUMAR, the meta row, the
       nav, the button). If it cannot, this anchor has no legal spot and
       the guide stays hidden here rather than covering the words. */
    var prevT = wrap.style.transform;
    wrap.style.transform = 'translate3d(0px,0px,0px)';
    var sr = stage.getBoundingClientRect();
    wrap.style.transform = prevT;
    var fig = figureRect(sr);
    var clash = false;
    var checks = [p.ref].concat(p.avoid || []);
    for (var c = 0; c < checks.length && !clash; c++) {
      var cr = inkRect(qs(checks[c]));
      if (!cr) continue;
      if (fig.l < cr.r && fig.r > cr.l && fig.t < cr.b && fig.b > cr.t) clash = true;
    }
    setPlaceHide(clash);
  }

  function setPlaceHide(on) {
    if (tour.active || sheetActive) on = false;  /* never park the sheet out */
    if (on === placeHide) return;
    placeHide = on;
    applyHidden();
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
    if (!p) setPlaceHide(false);        /* only a parked anchor can hide */
    var side = (p && p.side) || a.side;
    sideLeft = side === 'left';
    wrap.setAttribute('data-side', side);
    wrap.style.setProperty('--guide-size-base',
      (tour.active && MQ_PHONE.matches) ? '70px' : anchorSize(a) + 'px');
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
    /* the mobile sheet (tour or narration) is pinned by CSS — never
       re-park under it */
    if (p && !((tour.active || sheetActive) && MQ_PHONE.matches)) positionPlaced(a, p);
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
    var bob = live ? bobOffset(performance.now()) : 0;
    if (avHead) avHead.style.transform = live && (headX || headY || bob)
      ? 'translate(' + headX.toFixed(2) + 'px,' + (headY + bob).toFixed(2) + 'px)' : '';
    if (avEyesOpen) avEyesOpen.style.transform = live && (eyeX || eyeY)
      ? 'translate(' + eyeX.toFixed(2) + 'px,' + eyeY.toFixed(2) + 'px)' : '';
  }

  var running = false, rafId = 0, lastNow = 0;

  function needsFrame() {
    if (!enabled || doc.hidden) return false;
    /* a spoken line always has to finish — even under an overlay */
    if (speech) return true;
    if (suppressed || blocked) return false;
    if (bobT0) return true;                   /* a head bob is in flight */
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
    if (speech) speech.step(now);             /* captions + mouth + blips */

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
    if (tour.active) return;               /* the tour parks it itself */
    if (idx === anchorIdx) return;
    anchorIdx = idx;
    var a = anchorList[idx].def;
    travelTo(a);
    /* section line (prio 1) — a reaction (prio 3) keeps priority; the
       contact and footer bubbles double as copy buttons */
    if (a.line) {
      showLine(a.line, 1, 'sec',
        { copy: a.line === 'contact' || a.line === 'footer' });
    }
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
        whenEntered(function () {
          /* C: the first visit is the tour offer, buttons and all */
          showLine('tourOffer', 2, 'greeting', { controls: 'offer' });
        });
      });
    } else {
      window.setTimeout(function () { showLine('returning', 2, 'greeting'); }, 900);
    }
  }

  /* D — one narration line per page visit, once the avatar is on screen */
  var narrated = false;
  function bootNarration() {
    if (!enabled || narrated) return;
    var line = CFG.pageLines ? CFG.pageLines[slug] : null;
    if (!line) return;
    narrated = true;
    whenEntered(function () {
      window.setTimeout(function () {
        if (!enabled || tour.active) return;
        showLine(line, 2, 'narration', { key: slug, copy: slug === 'contact' });
      }, TH.narrateAfterMs || 350);
    });
  }

  /* wait until the entrance has actually put the avatar on screen */
  function whenEntered(cb) {
    if (!enabled) { return; }
    if (entered) { cb(); return; }
    var tries = 0;
    (function probe() {
      if (entered || tries > 160) { cb(); return; }
      tries++;
      window.setTimeout(probe, 50);
    })();
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
      if (tour.active) tourEnd();              /* guide off stops the tour */
      clearSheetTimer();
      if (sheetActive) setSheet(false);
      wrap.classList.add('guide--off');
      stopLoop();
      cancelSpeech('guide-off');
      stopVoice();
      window.clearTimeout(blinkTimer);
      window.clearTimeout(stateTimer);
      window.clearTimeout(hideTimer);
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

  /* first gesture unlocks audio; the tour also listens on the keyboard */
  doc.addEventListener('pointerdown', markGesture, true);
  doc.addEventListener('keydown', function (e) {
    markGesture();
    if (!enabled) return;
    var t = e.target;
    var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (e.key === 'Escape') {
      if (tour.active) { e.preventDefault(); tourEnd(); return; }
      if (speech) { cancelSpeech('escape'); return; }
    }
    if (tour.active && !typing) {
      if (e.key === 'ArrowRight') { e.preventDefault(); tourRun(tour.step + 1); }
      else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        tourRun(Math.max(0, tour.step - 1));
      }
    }
  }, true);

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
    if (doc.hidden) {
      /* spec: a hidden tab cancels the line — and holds the tour */
      cancelSpeech('hidden');
      if (tour.active) {
        tour.paused = true;
        tourClearAuto();
        tourSync();
      }
      stopLoop();
    } else ensureLoop();
  });

  window.addEventListener('pagehide', function () {
    cancelSpeech('pagehide');
    stopVoice();
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
  syncSound();
  refreshVoices();
  if (window.speechSynthesis && window.speechSynthesis.addEventListener) {
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
  }
  wrap.classList.toggle('guide--off', !enabled);
  if (!enabled) {
    stopLoop();
    return;
  }

  /* footer controls — planted next to "Guide: on/off" by guide_apply */
  if (footerSound) {
    footerSound.addEventListener('click', function () {
      markGesture();
      var i = SOUND_MODES.indexOf(sound);
      setSound(SOUND_MODES[(i + 1) % SOUND_MODES.length], true);
    });
  }
  if (footerTour) {
    footerTour.addEventListener('click', function (e) {
      if (!enabled) setEnabled(true);
      if (slug === 'index' || slug === '') {
        e.preventDefault();                    /* stay here and run it */
        if (tour.active) tourEnd();
        else tourStart();
      } else {
        /* the tour lives on the home page — carry the intent over */
        try { window.sessionStorage.setItem('guide:tour', '1'); } catch (err) {}
      }
    });
  }

  setupAnchors();
  updateSuppress();
  scheduleBlink();
  bootGreeting();
  bootNarration();

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

  /* "Take the tour" was clicked on another page */
  try {
    if (window.sessionStorage.getItem('guide:tour') === '1') {
      window.sessionStorage.removeItem('guide:tour');
      pendingTour = true;
      whenIntroDone(function () {
        whenHeroSettled(function () { whenEntered(tourStart); });
      });
    }
  } catch (e) { /* private mode: the link still works on the home page */ }
})()
