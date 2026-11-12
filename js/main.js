/* =====================================================================
   main.js — vanilla motion engine for the Ragul Kumar portfolio

   Rebuilt from the reference site's approach:
   - Lenis smooth scroll (local vendor copy) driven by one rAF loop
   - scroll-linked "frames": kinetic letters, velocity marquee,
     parallax, magnets, tilt, cursor, statement scrub, work dock,
     drag gallery, hover cards
   - reveals via IntersectionObserver + Web Animations API
   - everything gated by html[data-motion=on|off] + prefers-reduced-motion
   ===================================================================== */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  if (!root.hasAttribute('data-js')) return;

  /* ----------------------------------------------------------- helpers */

  var EASE_OUT = 'cubic-bezier(.16,1,.3,1)';
  var EASE_IN_OUT = 'cubic-bezier(.76,0,.24,1)';
  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
  var FINE = matchMedia('(hover: hover) and (pointer: fine)');
  var MOBILE = matchMedia('(max-width: 700px)');

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerpF(rate, k) { return 1 - Math.pow(1 - rate, k); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function qs(s, c) { return (c || doc).querySelector(s); }
  function qsa(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }
  function anim(el, keyframes, opts) {
    if (!el || !el.animate) return null;
    try { return el.animate(keyframes, opts); } catch (e) { return null; }
  }

  var canMotion = root.getAttribute('data-motion') === 'on' && !REDUCED.matches;
  function motionOn() { return root.getAttribute('data-motion') === 'on' && !REDUCED.matches; }

  var pointer = { x: innerWidth / 2, y: innerHeight / 2, seen: false };
  doc.addEventListener('pointermove', function (e) {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.seen = true;
  }, { passive: true });

  /* -------------------------------------------------- director (rAF) */

  var frames = [];
  var measures = [];
  var running = false;
  var rafId = 0;
  var lastNow = 0;
  var vel = 0;
  var lastScrollY = window.scrollY;

  function addFrame(fn) { frames.push(fn); }
  function addMeasure(fn) { measures.push(fn); }
  function measureAll() { for (var i = 0; i < measures.length; i++) { try { measures[i](); } catch (e) {} } }
  function remeasureSoon() { requestAnimationFrame(function () { requestAnimationFrame(measureAll); }); }

  var lenis = null;
  function initLenis() {
    if (lenis || typeof window.Lenis !== 'function' || !canMotion) return;
    try { lenis = new window.Lenis({ autoRaf: false }); } catch (e) { lenis = null; }
  }

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    var dt = (now - lastNow) / 1000;
    lastNow = now;
    var k = clamp(dt * 60, 0.1, 3);
    var y = window.scrollY;
    vel = y - lastScrollY;
    lastScrollY = y;
    if (lenis) { try { lenis.raf(now); } catch (e) {} }
    for (var i = 0; i < frames.length; i++) {
      try { frames[i](now, k); } catch (e) {}
    }
  }
  function startLoop() {
    if (!running) { running = true; lastNow = performance.now(); rafId = requestAnimationFrame(tick); }
  }
  function stopLoop() { if (running) { running = false; cancelAnimationFrame(rafId); } }

  /* ------------------------------------------------------ page content */

  var DATA = window.PORTFOLIO || {};

  function escText(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function transAttr(name, sub) {
    return ' data-transition-name="' + escText(name) + '" data-transition-sub="' + escText(sub) + '"';
  }

  /* skills items are { name, level? } objects (plain strings tolerated) */
  function skillName(it) {
    return typeof it === 'string' ? it : (it && it.name) || '';
  }

  /* ------------------------------------------------------- todo gating */
  /* site.showTodos (data.js) drives every TODO surface. When false: field
     helpers return empty, "TODO: review" suffixes are stripped, static
     [data-todo] blocks are hidden by CSS, and the github fallback shows
     only the profile link. One shared helper set for all renderers. */
  var SHOW_TODOS = !!(DATA.site && DATA.site.showTodos);
  if (SHOW_TODOS) root.setAttribute('data-todos-on', '');

  /* field value — '' for TODO placeholders while hidden */
  function tVal(v) {
    if (v == null) return '';
    var s = String(v);
    if (SHOW_TODOS) return s;
    return /^\s*TODO\b/i.test(s) ? '' : s;
  }

  /* copy that may carry a "TODO: review" suffix */
  function tReview(s) {
    s = String(s == null ? '' : s);
    return SHOW_TODOS ? s : s.replace(/\s*TODO: review/g, '');
  }

  /* date range — omitted when either end is missing while hidden */
  function tRange(label) {
    if (label == null) return '';
    if (SHOW_TODOS) return String(label);
    return /TODO/i.test(String(label)) ? '' : String(label);
  }

  /* image tag with a data.js slot (a missing file keeps the placeholder) */
  function imgTag(alt, slot, ph) {
    return '<img class="img-fill" data-slot="' + escText(slot) + '" src="assets/img/' + ph +
      '" alt="' + escText(alt) + '" loading="lazy" decoding="async">';
  }

  /* kinetic letter spans for a plain word (JS-rendered page titles) */
  function kineticLetters(word, k) {
    return String(word).split('').map(function (c) {
      return '<span class="kinetic__letter" data-char="' + escText(c) +
        '" data-k="' + k + '" data-in=""></span>';
    }).join('');
  }

  /* page-title intro lines come from data.js */
  qsa('[data-page-intro]').forEach(function (el) {
    var text = (DATA.intros || {})[el.getAttribute('data-page-intro')];
    if (text) { el.textContent = text; el.setAttribute('data-reveal', ''); }
  });

  /* skills ------------------------------------------------------------ */

  (function skillsPage() {
    var host = qs('[data-render="skills"]');
    var groups = DATA.skills;
    if (!host || !groups || !groups.length) return;
    var h = ['<div class="section-head eyebrow" data-reveal="">',
      '<h2 class="skills__label">(Skills by group)</h2>',
      '<span>' + pad2(groups.length) + ' groups</span></div>',
      '<div class="skills__rows">'];
    groups.forEach(function (g, i) {
      h.push('<div class="skills__row" data-reveal="">',
        '<div class="service-tiles__fill" aria-hidden="true"></div>',
        '<span class="skills__num">' + pad2(i + 1) + '</span>',
        '<h3 class="skills__name">' + escText(g.name) + '</h3>',
        '<span class="skills__count">(' + pad2(g.items.length) + ')</span>',
        '<ul class="skills__chips chip-list">');
      g.items.forEach(function (it) {
        var nm = skillName(it);
        var lv = (it && typeof it === 'object' && it.level) ? it.level : '';
        h.push('<li class="chip">' + escText(nm) +
          (lv ? '<span class="chip__level">' + escText(lv) + '</span>' : '') + '</li>');
      });
      h.push('</ul></div>');
    });
    h.push('</div>');
    host.innerHTML = h.join('');
  })();

  /* experience -------------------------------------------------------- */

  (function experiencePage() {
    var host = qs('[data-render="experience"]');
    var data = DATA.experience;
    if (!host || !data) return;
    var h = [];

    function timeline(eyebrow, title, lead, items) {
      var out = ['<section class="process-timeline">',
        '<div class="process-timeline__intro" data-reveal="">',
        '<span class="process-timeline__eyebrow eyebrow">' + eyebrow + '</span>',
        '<h2 class="process-timeline__title">' + title + '</h2>'];
      if (lead) out.push('<p class="process-timeline__lead">' + lead + '</p>');
      out.push('</div>',
        '<div class="process-timeline__steps">',
        '<div class="process-timeline__track" aria-hidden="true"></div>',
        '<div class="process-timeline__line" aria-hidden="true"></div>',
        '<ol class="process-timeline__list">');
      out = out.concat(items);
      out.push('</ol></div></section>');
      return out;
    }

    var roleItems = (data.roles || []).map(function (role) {
      var li = ['<li class="process-timeline__step">',
        '<span class="process-timeline__diamond" aria-hidden="true"></span>'];
      var lab = tRange(role.label);
      if (lab) li.push('<span class="process-timeline__label">' + escText(lab) + '</span>');
      li.push('<h3 class="process-timeline__step-title">' + escText(role.title) + '</h3>');
      if (role.org) li.push('<p class="process-timeline__org">' + escText(role.org) + '</p>');
      var duties = (role.duties || []).filter(function (d) {
        return SHOW_TODOS || !/TODO/i.test(String(d));
      });
      var stack = tVal(role.stack);
      if (duties.length || stack) {
        li.push('<ul class="process-timeline__duties">');
        duties.forEach(function (d) { li.push('<li>' + escText(d) + '</li>'); });
        if (stack) li.push('<li>Stack: ' + escText(stack) + '</li>');
        li.push('</ul>');
      }
      li.push('</li>');
      return li.join('');
    });
    h = h.concat(timeline('(Work)', escText(data.workTitle || 'Work history'), '', roleItems));

    /* current work (experience page only — promotable to case pages later) */
    var cw = data.currentWork || [];
    if (cw.length) {
      h.push('<section class="service-list">',
        '<div class="section-head eyebrow" data-reveal="">',
        '<h2 class="current-work__label">(Current work)</h2>',
        '<span>' + pad2(cw.length) + ' items</span></div>',
        '<div class="service-list__rows">');
      cw.forEach(function (w, i) {
        var desc = tReview(w.desc || '');
        var titleHtml = w.href
          ? '<h3 class="service-list__title"><a href="' + escText(w.href) + '"' +
            transAttr(w.name, desc || 'Case study') + ' data-cursor="View">' +
            escText(w.name) + '</a></h3>'
          : '<h3 class="service-list__title">' + escText(w.name) + '</h3>';
        var inner = '<div class="service-list__heading"><span class="service-list__number">' +
          pad2(i + 1) + '</span>' + titleHtml + '</div>';
        if (desc) inner += '<p class="service-list__description">' + escText(desc) + '</p>';
        var links = w.links || [];
        if (links.length) {
          inner += '<ul class="service-list__tags chip-list">' + links.map(function (l) {
            return '<li class="chip"><a href="' + escText(l.url) +
              '" target="_blank" rel="noopener noreferrer">' + escText(l.label) + '</a></li>';
          }).join('') + '</ul>';
        }
        var note = tVal(w.note || '');
        if (note) inner += '<p class="current-work__note">' + escText(note) + '</p>';
        h.push('<div class="service-list__row built__row--static" data-reveal="">' + inner + '</div>');
      });
      h.push('</div></section>');
    }

    host.innerHTML = h.join('');
  })();

  /* certificates ------------------------------------------------------ */

  (function certificatesPage() {
    var host = qs('[data-render="certificates"]');
    var certs = DATA.certificates;
    if (!host || !certs) return;
    var count = qs('[data-cert-count]');
    if (count) count.textContent = '(' + pad2(certs.length) + ')';

    function media(c) {
      if (c.image) {
        return '<img class="img-fill" src="' + escText(c.image) + '" alt="' +
          escText(c.title) + ' certificate" loading="lazy" decoding="async">';
      }
      var phText = SHOW_TODOS ? 'TODO: add certificate image' : '';
      return '<div class="cert-card__ph"><span class="cert-card__ph-text">' +
        phText + '</span></div>';
    }

    var h = ['<div class="section-head eyebrow" data-reveal="">',
      '<h2 class="certs__label">(Course certificates)</h2></div>',
      '<div class="certs__grid">'];
    certs.forEach(function (c, i) {
      var cid = tVal(c.credentialId);
      h.push('<button type="button" class="project-card cert-card" data-reveal="" ' +
        'data-cursor="View" data-cert="' + i + '">',
        '<span class="project-card__media cert-card__media"><span class="project-card__layer">',
        media(c), '</span></span>',
        '<span class="project-card__meta"><span class="project-card__name">' +
        escText(c.title) + '</span><span class="project-card__year">' +
        tVal(c.date) + '</span></span>',
        '<span class="project-card__type">' + escText(c.issuer) + '</span>',
        cid ? '<span class="cert-card__id">ID: ' + escText(cid) + '</span>' : '',
        '</button>');
    });
    h.push('</div>');
    host.innerHTML = h.join('');

    /* accessible dialog viewer */
    var dlg = qs('[data-cert-dialog]');
    if (!dlg) return;
    var opener = null;
    var hadNocursor = false;

    function closeDlg() {
      if (typeof dlg.close === 'function' && dlg.open) dlg.close();
      else dlg.removeAttribute('open');
    }

    host.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-cert]') : null;
      if (!btn || !host.contains(btn)) return;
      var c = certs[+btn.getAttribute('data-cert')];
      if (!c) return;
      opener = btn;
      qs('[data-cert-title]', dlg).textContent = c.title || '';
      qs('[data-cert-issuer]', dlg).textContent = c.issuer || '';
      /* empty/TODO fields hide their whole row while todos are hidden */
      function setField(sel, value) {
        var el = qs(sel, dlg);
        if (!el) return;
        el.textContent = value || '';
        if (el.parentElement) el.parentElement.hidden = !value;
      }
      setField('[data-cert-date]', tVal(c.date));
      setField('[data-cert-id]', tVal(c.credentialId));
      var verify = qs('[data-cert-verify]', dlg);
      var verifyRow = verify ? verify.parentElement : null;
      if (c.verifyUrl) {
        verify.innerHTML = '<a href="' + escText(c.verifyUrl) +
          '" target="_blank" rel="noopener noreferrer">Verify credential ↗</a>';
        if (verifyRow) verifyRow.hidden = false;
      } else if (SHOW_TODOS) {
        verify.textContent = 'Verify: TODO';
        if (verifyRow) verifyRow.hidden = false;
      } else {
        verify.textContent = '';
        if (verifyRow) verifyRow.hidden = true;
      }
      qs('[data-cert-media]', dlg).innerHTML = media(c);
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
      /* the custom cursor lives below the top layer — hand the cursor
         back to the OS while the dialog is open */
      hadNocursor = doc.body.hasAttribute('data-nocursor');
      doc.body.removeAttribute('data-nocursor');
      var panel = qs('.cert-dialog__panel', dlg);
      if (panel && canMotion) {
        anim(panel, [{ opacity: 0, transform: 'translateY(18px)' },
          { opacity: 1, transform: 'none' }],
          { duration: 380, easing: EASE_OUT });
      }
      var closeBtn = qs('[data-cert-close]', dlg);
      if (closeBtn) closeBtn.focus();
    });

    qsa('[data-cert-close]', dlg).forEach(function (el) {
      el.addEventListener('click', closeDlg);
    });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) closeDlg(); });
    dlg.addEventListener('close', function () {
      if (hadNocursor && FINE.matches && motionOn()) doc.body.setAttribute('data-nocursor', '');
      hadNocursor = false;
      if (opener) { opener.focus(); opener = null; }
    });
  })();

  /* resume ------------------------------------------------------------ */

  (function resumePage() {
    var host = qs('[data-render="resume"]');
    var data = DATA.resume;
    if (!host || !data) return;
    var pdf = data.pdf || {};
    var h = [];

    if (pdf.available && pdf.path) {
      var pdfName = String(pdf.path).split('/').pop();
      h.push('<div class="resume__actions">',
        '<a class="resume__btn" href="' + escText(pdf.path) +
        '" download="Ragul_Kumar_Resume.pdf">Download PDF</a>',
        '<a class="resume__btn resume__btn--ghost" href="' + escText(pdf.path) +
        '" target="_blank" rel="noopener">Open in new tab</a></div>');
      h.push('<div class="resume__preview">',
        '<object class="resume__object" data="' + escText(pdf.path) + '" type="application/pdf">',
        '<p class="resume__p">This browser can’t embed the PDF — ',
        '<a class="resume__link" href="' + escText(pdf.path) + '" download>download it instead</a>.</p>',
        '</object></div>');
      h.push('<div class="resume__preview-card">',
        '<p class="resume__preview-card-title">' + escText(pdfName) + '</p>',
        '<p class="resume__preview-card-note">The PDF isn’t embedded on small screens — use the buttons above.</p>',
        '</div>');
    } else {
      h.push('<div class="resume__actions">',
        '<button class="resume__btn" type="button" data-print>Save as PDF</button></div>');
      h.push('<p class="resume__todo" data-todo>TODO: add resume PDF to assets/resume/</p>');
    }

    /* text summary built from data.js so it can’t drift — kept in a
       closed <details> ("Text version"); forced open while printing */
    h.push('<details class="resume__details">',
      '<summary class="resume__summary-head">Text version</summary>',
      '<div class="resume__summary">',
      '<div class="section-head eyebrow" data-reveal=""><h2>(Summary)</h2></div>',
      '<div class="resume__grid">');

    h.push('<div data-reveal=""><h3 class="resume__h">Role</h3>',
      '<p class="resume__name">' + escText(data.name || 'Ragul Kumar') + '</p>',
      '<p class="resume__p">' + escText(data.role) + '</p></div>');

    h.push('<div data-reveal=""><h3 class="resume__h">Skills</h3><ul class="resume__list">');
    (DATA.skills || []).forEach(function (g) {
      h.push('<li><b>' + escText(g.name) + '</b> ' +
        escText(g.items.map(skillName).join(', ')) + '</li>');
    });
    h.push('</ul></div>');

    var exp = DATA.experience || {};
    h.push('<div data-reveal=""><h3 class="resume__h">Experience</h3><ul class="resume__list">');
    (exp.roles || []).forEach(function (r) {
      var lab = tRange(r.label);
      h.push('<li><b>' + escText(r.title) + '</b>' +
        (r.org ? ' · ' + escText(r.org) : '') +
        (lab ? ' · ' + escText(lab) : '') + '</li>');
    });
    h.push('</ul></div>');

    h.push('<div data-reveal=""><h3 class="resume__h">Projects</h3><ul class="resume__list">');
    (DATA.projects || []).forEach(function (pr) {
      var d = tVal(pr.desc);
      h.push('<li><b>' + escText(pr.name) + '</b>' + (d ? ' — ' + escText(d) : '') + '</li>');
    });
    h.push('</ul></div>');

    h.push('<div data-reveal=""><h3 class="resume__h">Certificates</h3><ul class="resume__list">');
    (DATA.certificates || []).forEach(function (c) {
      h.push('<li><b>' + escText(c.title) + '</b> — ' + escText(c.issuer) + '</li>');
    });
    h.push('</ul></div>');

    h.push('<div data-reveal=""><h3 class="resume__h">Education</h3><ul class="resume__list">');
    (exp.education || []).forEach(function (e2) {
      var li = '<li><b>' + escText(e2.title) + '</b>';
      var d = tVal(e2.desc);
      var l = tVal(e2.label);
      if (d) li += ' — ' + escText(d);
      if (l) li += ' (' + escText(l) + ')';
      h.push(li + '</li>');
    });
    h.push('</ul></div>');

    h.push('<div data-reveal=""><h3 class="resume__h">Contact</h3>',
      '<p class="resume__p"><a class="resume__link" href="mailto:' + escText(data.email) +
      '">' + escText(data.email) + '</a></p></div>');

    h.push('</div></div></details>');
    host.innerHTML = h.join('');

    /* "Save as PDF" → browser print dialog (print styles in style.css);
       the closed <details> opens for printing and restores afterwards */
    qsa('[data-print]', host).forEach(function (btn) {
      btn.addEventListener('click', function () { window.print(); });
    });
    var det = qs('details.resume__details', host);
    if (det) {
      var wasOpen = false;
      window.addEventListener('beforeprint', function () {
        wasOpen = det.open;
        det.open = true;
      });
      window.addEventListener('afterprint', function () {
        if (!wasOpen) det.open = false;
      });
    }
  })();

  /* github ------------------------------------------------------------ */

  (function githubPage() {
    var host = qs('[data-render="github"]');
    var cfg = DATA.github;
    if (!host || !cfg) return;

    var KEY = 'rk-gh-v1';
    var TTL = 600000; /* 10 minutes */

    function cacheLoad() {
      try {
        var raw = sessionStorage.getItem(KEY);
        if (!raw) return null;
        var v = JSON.parse(raw);
        if (!v || !v.t || !v.data || Date.now() - v.t > TTL) return null;
        return v.data;
      } catch (e) { return null; }
    }
    function cacheSave(data) {
      try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), data: data })); }
      catch (e) { /* private mode — run without cache */ }
    }
    function status(text) { return '<p class="gh__status">' + escText(text) + '</p>'; }

    function renderLoading() {
      host.innerHTML = status('Loading GitHub data…');
    }

    function renderError() {
      var h = ['<div class="gh__error" role="status">',
        '<p>Couldn’t reach GitHub right now.</p>',
        '<a href="' + escText(cfg.profileUrl) + '" target="_blank" rel="noopener noreferrer">' +
        'View the profile on GitHub ↗</a></div>'];
      if (SHOW_TODOS) {
        /* static fallback list is only shown while todos are visible */
        h.push('<div class="section-head eyebrow gh__head" data-reveal="">',
          '<h2>(Repositories)</h2><span>Static fallback</span></div>',
          '<ul class="gh__repos">');
        (cfg.fallback || []).forEach(function (r) {
          h.push('<li class="gh-repo">',
            '<span class="gh-repo__name">' + escText(r.name) + '</span>',
            '<p class="gh-repo__desc">' + escText(r.description) + '</p>',
            '<div class="gh-repo__meta">',
            '<span class="gh-repo__lang">' + escText(r.language) + '</span>',
            '<span>Stars ' + escText(r.stars) + '</span>',
            '<span>Updated ' + escText(r.updated) + '</span>',
            '</div></li>');
        });
        h.push('</ul>');
      }
      host.innerHTML = h.join('');
    }

    function renderSuccess(d) {
      var p = d.profile || {};
      var repos = Array.isArray(d.repos) ? d.repos : [];
      var top = repos.filter(function (r) { return !r.fork && !r.archived; })
        .sort(function (a, b) {
          var s = (b.stargazers_count || 0) - (a.stargazers_count || 0);
          if (s) return s;
          return Date.parse(b.pushed_at || 0) - Date.parse(a.pushed_at || 0);
        })
        .slice(0, 6);

      var h = ['<div class="gh__profile">'];
      if (p.avatar_url) {
        h.push('<img class="gh__avatar" src="' + escText(p.avatar_url) + '" alt="' +
          escText(p.name || p.login || 'GitHub') + ' avatar" width="112" height="112" ' +
          'loading="lazy" decoding="async">');
      }
      h.push('<div class="gh__ident">',
        '<p class="gh__name">' + escText(p.name || p.login || cfg.user) + '</p>',
        '<p class="gh__handle">@' + escText(p.login || cfg.user) + '</p>',
        '<a class="gh__profile-link" href="' + escText(cfg.profileUrl) +
        '" target="_blank" rel="noopener noreferrer">View profile ↗</a></div>',
        '<dl class="gh__stats">',
        '<div><dt>Public repos</dt><dd>' +
        (p.public_repos != null ? p.public_repos : '—') + '</dd></div>',
        '<div><dt>Followers</dt><dd>' +
        (p.followers != null ? p.followers : '—') + '</dd></div>',
        '</dl></div>');

      h.push('<div class="section-head eyebrow gh__head" data-reveal="">',
        '<h2>(Repositories)</h2><span>Top ' + pad2(top.length) + ' by stars</span></div>');

      if (top.length) {
        h.push('<ul class="gh__repos">');
        top.forEach(function (r) {
          var updated = (r.updated_at || '').slice(0, 10);
          h.push('<li class="gh-repo" data-reveal="">');
          if (r.html_url) {
            h.push('<a class="gh-repo__name" href="' + escText(r.html_url) +
              '" target="_blank" rel="noopener noreferrer">' + escText(r.name) + '</a>');
          } else {
            h.push('<span class="gh-repo__name">' + escText(r.name) + '</span>');
          }
          h.push('<p class="gh-repo__desc">' + escText(r.description || '—') + '</p>',
            '<div class="gh-repo__meta">',
            '<span class="gh-repo__lang">' + escText(r.language || '—') + '</span>',
            '<span>Stars ' + (r.stargazers_count || 0) + '</span>',
            updated ? '<span>Updated ' + updated + '</span>' : '',
            '</div></li>');
        });
        h.push('</ul>');
      } else {
        h.push(status('No public repositories to show.'));
      }

      /* language bar, computed from each displayed repo’s primary
         language — labelled by repository count */
      var counts = {};
      var total = 0;
      top.forEach(function (r) {
        if (r.language) { counts[r.language] = (counts[r.language] || 0) + 1; total++; }
      });
      var langs = Object.keys(counts).sort(function (a, b) {
        return counts[b] - counts[a] || a.localeCompare(b);
      });
      if (total && langs.length) {
        h.push('<div class="lang-bar" role="img" aria-label="Languages by repository count">',
          '<div class="lang-bar__track">');
        langs.forEach(function (name, i) {
          h.push('<span class="lang-bar__seg lang-bar__seg--' + ((i % 6) + 1) +
            '" style="width:' + ((counts[name] / total) * 100).toFixed(2) + '%"></span>');
        });
        h.push('</div><ul class="lang-bar__legend">');
        langs.forEach(function (name, i) {
          h.push('<li><span class="lang-bar__swatch lang-bar__swatch--' +
            ((i % 6) + 1) + '"></span>' + escText(name) + ' — ' + counts[name] + '</li>');
        });
        h.push('</ul><p class="lang-bar__note">by repository count</p></div>');
      }

      host.innerHTML = h.join('');
    }

    var cached = cacheLoad();
    if (cached) { renderSuccess(cached); return; }

    renderLoading();
    if (typeof fetch !== 'function') { renderError(); return; }
    function json(res) {
      if (!res.ok) { var err = new Error('HTTP ' + res.status); err.status = res.status; throw err; }
      return res.json();
    }
    Promise.all([fetch(cfg.apiUser).then(json), fetch(cfg.apiRepos).then(json)])
      .then(function (r) {
        var data = { profile: r[0], repos: r[1] };
        cacheSave(data);
        renderSuccess(data);
      })
      .catch(function () { renderError(); });
  })();

  /* home copy: hero line, statement scrub text, marquee (data.js) ------ */

  (function homeCopy() {
    var hero = qs('.hero__intro');
    if (hero && DATA.site && DATA.site.heroLine) {
      hero.textContent = DATA.site.heroLine;
    }

    var st = DATA.statement;
    var p = qs('.statement__text');
    if (p && st && st.text) {
      var words = String(st.text).trim().split(/\s+/);
      var italics = st.italic || [];
      var accent = st.accent || '';
      var h = ['<span class="sr-only">' + escText(st.text) + '</span>'];
      words.forEach(function (w) {
        var cls = 'statement__word';
        var bare = w.replace(/[.,!?…:]+$/, '');
        if (italics.indexOf(bare) > -1) cls += ' statement__word--italic';
        if (accent && w === accent) cls += ' statement__word--accent';
        h.push('<span class="' + cls + '" data-w="" aria-hidden="true">' + escText(w) + '</span>');
      });
      p.innerHTML = h.join('');
    }

    var mq = DATA.marquee;
    if (mq && mq.length) {
      var copy = mq.map(function (w) {
        return '<span>' + escText(w) +
          '</span><span class="marquee__diamond" aria-hidden="true"></span>';
      }).join('');
      qsa('.marquee__copy').forEach(function (c) { c.innerHTML = copy; });
    }
  })();

  /* selected work: rows, dock, cursor card (data.js projects) ---------- */

  (function selectedWorkPage() {
    var host = qs('[data-render="selectedWork"]');
    var projects = DATA.projects;
    if (!host || !projects || !projects.length) return;
    var n = projects.length;
    var h = [];

    h.push('<div class="selected-work__head eyebrow" data-reveal="">',
      '<h2 class="selected-work__label">Selected work (' + pad2(n) + ')</h2>',
      '<span class="selected-work__head-end">',
      '<button type="button" class="selected-work__pause">(Pause motion)</button>',
      SHOW_TODOS ? '<span class="selected-work__years">TODO: years</span>' : '',
      '</span></div>');

    h.push('<div class="selected-work__grid"><div class="selected-work__list">');
    projects.forEach(function (pr, i) {
      h.push('<a class="selected-work__row" data-reveal="" data-cursor="View"',
        ' data-platform="' + escText(pr.platform || '') + '"',
        ' href="work/' + pr.slug + '.html"' + transAttr(pr.name, pr.listType) + '>',
        '<span class="selected-work__num" aria-hidden="true">' + pad2(i + 1) + '</span>',
        '<div class="selected-work__name"><span class="selected-work__line">' +
        escText(pr.name) + '</span></div>',
        '<span class="selected-work__year">' + tVal(pr.year) + '</span>',
        '<div class="selected-work__details"><span>' + escText(pr.type) + '</span>',
        pr.platform ? '<span class="selected-work__tag">(' + escText(pr.platform) + ')</span>' : '',
        '<span class="selected-work__cta" aria-hidden="true">View project →</span></div></a>');
    });
    h.push('<div class="selected-work__end"></div></div>');

    var first = projects[0];
    h.push('<div class="selected-work__col" aria-hidden="true">',
      '<div class="selected-work__dock">',
      '<div class="selected-work__frame" data-cursor="View">',
      '<div class="selected-work__rest">' +
      imgTag(first.altDesktop, first.slug + '-desktop', 'placeholder-4x5.svg') + '</div>',
      '<span class="selected-work__big">01</span>',
      '<div class="selected-work__stage">');
    projects.forEach(function (pr) {
      h.push('<div class="selected-work__stage-layer">',
        '<div class="selected-work__strip" style="--slides:2">',
        '<div class="selected-work__slide">' +
        imgTag(pr.altDesktop, pr.slug + '-desktop', 'placeholder-4x5.svg') + '</div>',
        '<div class="selected-work__slide">' +
        imgTag(pr.altMobile, pr.slug + '-mobile', 'placeholder-tall.svg') + '</div>',
        '</div></div>');
    });
    h.push('</div>',
      '<div class="selected-work__dots"><span class="selected-work__dot"></span>',
      '<span class="selected-work__dot"></span></div>',
      '</div>',
      '<div class="selected-work__meta"><span>(<span class="selected-work__cur">01</span> / ' +
      pad2(n) + ')</span><span class="selected-work__plat">' +
      escText(first.platform || '') + '</span></div>',
      '<div class="selected-work__track"><div class="selected-work__bar"></div></div>',
      '</div></div>');

    h.push('<div class="selected-work__card" aria-hidden="true">');
    projects.forEach(function (pr) {
      h.push('<div class="selected-work__layer"><div class="selected-work__cover">' +
        imgTag(pr.altDesktop, pr.slug + '-desktop', 'placeholder-4x5.svg') + '</div></div>');
    });
    h.push('</div>');

    host.innerHTML = h.join('');
  })();

  /* up close: 12 frames = first six projects, desktop + mobile ---------- */

  (function upClosePage() {
    var host = qs('[data-render="upClose"]');
    var projects = (DATA.projects || []).slice(0, 6);
    if (!host || !projects.length) return;
    var h = ['<div class="up-close__head eyebrow" data-reveal="">',
      '<h2 class="up-close__label">(Up close)</h2><span>Drag or scroll</span></div>',
      '<div class="up-close__wrap"><div class="up-close__track">'];
    var idx = 0;
    projects.forEach(function (pr) {
      [['Desktop', pr.altDesktop, pr.slug + '-desktop', 'placeholder-4x5.svg'],
       ['Mobile', pr.altMobile, pr.slug + '-mobile', 'placeholder-tall.svg']
      ].forEach(function (d) {
        idx += 1;
        h.push('<a class="up-close__item" draggable="false" data-cursor="Look" href="work/' +
          pr.slug + '.html"' + transAttr(pr.name, pr.listType) + '>',
          '<div class="up-close__frame"><div class="up-close__media">' +
          imgTag(d[1], d[2], d[3]) + '</div></div>',
          '<div class="up-close__caption eyebrow"><span>(' + pad2(idx) + ') ' +
          escText(pr.name) + '</span><span>' + d[0] + '</span></div></a>');
      });
    });
    h.push('</div></div>');
    host.innerHTML = h.join('');
  })();

  /* work index: list + grid + hover-reveal portal (data.js projects) ---- */

  function projectCardHtml(pr, prefix) {
    return '<a class="project-card" data-reveal="" data-cursor="View" href="' +
      (prefix || '') + 'work/' + pr.slug + '.html"' + transAttr(pr.name, pr.listType) + '>' +
      '<div class="project-card__media"><div class="project-card__layer">' +
      imgTag(pr.altDesktop, pr.slug + '-desktop', 'placeholder-4x5.svg') + '</div></div>' +
      '<div class="project-card__meta"><span class="project-card__name">' +
      escText(pr.name) + '</span><span class="project-card__year">' +
      tVal(pr.year) + '</span></div>' +
      '<p class="project-card__type">' +
      escText(pr.listType + (pr.platform ? ' · ' + pr.platform : '')) + '</p></a>';
  }

  (function workIndexPage() {
    var host = qs('[data-render="workIndex"]');
    var projects = DATA.projects;
    if (!host || !projects || !projects.length) return;
    var n = projects.length;
    var h = [];

    h.push('<div class="work-index__head">',
      '<h1 class="work-index__title"><span class="sr-only">Work </span>',
      '<span aria-hidden="true" style="display:contents">' + kineticLetters('Work', 340) + '</span>',
      '<sup class="work-index__count" data-in="">(' + pad2(n) + ')</sup></h1>',
      '<div class="work-index__toggle" role="group" aria-label="View">',
      '<button class="work-index__view work-index__view--active" type="button" ' +
      'aria-pressed="true">List</button>',
      '<button class="work-index__view" type="button" aria-pressed="false">Grid</button>',
      '</div></div>');

    h.push('<div class="work-index__list">',
      '<div class="work-index__cols"><span>#</span><span>Project</span>',
      '<span>Type</span><span>Role</span><span>Year</span></div>');
    projects.forEach(function (pr, i) {
      h.push('<a class="work-index__row" data-index="' + i + '" data-reveal="" data-cursor="View"' +
        ' data-platform="' + escText(pr.platform || '') + '" href="work/' + pr.slug + '.html"' +
        transAttr(pr.name, pr.listType) + '>',
        '<span class="work-index__num" aria-hidden="true">' + pad2(i + 1) + '</span>',
        '<h2 class="work-index__name">' + escText(pr.name) + '</h2>',
        '<span class="work-index__detail">' + escText(pr.listType) + '</span>',
        '<span class="work-index__detail">' + tVal(pr.role) + '</span>',
        '<span class="work-index__detail work-index__year">' + tVal(pr.year) + '</span></a>');
    });
    h.push('<div class="work-index__end"></div></div>');

    h.push('<div class="work-index__grid" hidden="">');
    projects.forEach(function (pr) { h.push(projectCardHtml(pr, '')); });
    h.push('</div>');

    host.innerHTML = h.join('');
  })();

  (function projectRevealPage() {
    var host = qs('[data-render="projectReveal"]');
    if (!host) return;
    host.innerHTML = (DATA.projects || []).map(function (pr) {
      return '<div class="project-reveal__layer">' +
        imgTag(pr.altDesktop, pr.slug + '-desktop', 'placeholder-4x5.svg') + '</div>';
    }).join('');
  })();

  /* about page copy (data.js) ------------------------------------------ */

  (function aboutPage() {
    var a = DATA.about;
    if (!a) return;
    var lead = qs('[data-about="lead"]');
    if (lead) lead.textContent = tReview(a.lead || '');
    var text = qs('[data-about="text"]');
    if (text && a.paras) {
      text.innerHTML = a.paras.map(function (p) {
        return '<p data-reveal="">' + escText(tReview(p)) + '</p>';
      }).join('');
    }
    var tool = qs('[data-about="toolkit"]');
    if (tool && a.toolkit) {
      tool.innerHTML = a.toolkit.map(function (s) {
        return '<span class="list__item">' + escText(s) + '</span>';
      }).join('');
    }

    /* (Now) / (Before) cards — built from the experience timeline so
       employer, role and dates can never drift (replaces the callout) */
    var cards = qs('[data-about="cards"]');
    if (cards) {
      var roles = (DATA.experience || {}).roles || [];
      function aboutCard(tag, role) {
        if (!role) return '';
        return '<a class="about-card" href="experience.html" data-cursor="Open"' +
          transAttr('Experience', 'Work history') + '>' +
          '<span class="about-card__tag eyebrow">(' + tag + ')</span>' +
          '<span class="about-card__arrow" aria-hidden="true">→</span>' +
          '<span class="about-card__org">' + escText(role.org || '') + '</span>' +
          '<span class="about-card__role">' + escText(role.title) + '</span>' +
          '<span class="about-card__dates">' + escText(tRange(role.label)) + '</span>' +
          '</a>';
      }
      cards.innerHTML = aboutCard('Now', roles[0]) + aboutCard('Before', roles[1]);
    }
  })();

  /* static "TODO" text is blanked while showTodos is false (suffixes
     stripped first); [data-todo] blocks are hidden by CSS ------------- */
  if (!SHOW_TODOS && doc.createTreeWalker) {
    var tw = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
    var todoNodes = [];
    while (tw.nextNode()) {
      var tn = tw.currentNode;
      if (tn.nodeValue && tn.nodeValue.indexOf('TODO') !== -1 &&
          tn.parentElement &&
          !tn.parentElement.closest('script, style, textarea, [data-todo]')) {
        todoNodes.push(tn);
      }
    }
    todoNodes.forEach(function (tn) {
      var v = tn.nodeValue.replace(/\s*TODO: review/g, '');
      if (/^\s*TODO\b/.test(v)) v = '';
      tn.nodeValue = v;
    });
  }

  /* --------------------------------------------- image slot hydration */
  /* runs AFTER the page-content renderers so slots inside rendered
     markup (home rows/dock/up-close, work index, reveal layers) exist */

  (function hydrateImages() {
    var data = window.PORTFOLIO;
    var imgs = qsa('img[data-slot]');
    if (!data || !data.images) {
      if (imgs.length) console.info('[portfolio] js/data.js missing — placeholder images stay in place');
      return;
    }
    imgs.forEach(function (img) {
      var key = img.getAttribute('data-slot');
      var src = data.images[key];
      if (src) img.src = src;
      else {
        img.setAttribute('data-slot-missing', '');
        console.info('[portfolio] no image for slot "' + key + '" — placeholder stays');
      }
    });
  })();

  /* case pages: optional "Built at" row from projects[].employer ----- */

  (function caseEmployer() {
    var sec = qs('.case-study');
    if (!sec) return;
    var m = /\/([a-z0-9-]+)\.html(?:[?#]|$)/.exec(location.pathname);
    if (!m) return;
    var pr = null;
    var list = DATA.projects || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].slug === m[1]) { pr = list[i]; break; }
    }
    if (!pr || !pr.employer) return;
    var dl = qs('.case-study__details', sec);
    if (!dl) return;
    var row = doc.createElement('div');
    row.setAttribute('data-reveal', '');
    row.innerHTML = '<dt class="case-study__detail-label eyebrow">Built at</dt>' +
      '<dd class="case-study__detail-value">' + escText(pr.employer) + '</dd>';
    dl.appendChild(row);
  })();

  /* ------------------------------------------------------ reveal system */

  function revealBlock(el, delay) {
    var a = anim(el, [
      { opacity: 0, transform: 'translateY(48px)' },
      { opacity: 1, transform: 'none' }
    ], { duration: 1100, delay: delay || 0, easing: EASE_OUT, fill: 'both' });
    if (a) a.onfinish = function () { el.style.opacity = ''; this.cancel(); };
    else el.style.opacity = '';
  }

  function revealIn(el) {
    if (el.hasAttribute('data-revealed')) return;
    el.setAttribute('data-revealed', '');
    if (!canMotion || root.hasAttribute('data-motion-failed')) return;
    if (el.hasAttribute('data-clipin')) {
      var a = anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 1100, easing: EASE_OUT, fill: 'backwards' });
      if (a) a.onfinish = function () { this.cancel(); };
    } else if (el.hasAttribute('data-words')) {
      qsa('[data-wd]', el).forEach(function (w, i) {
        var fvs = getComputedStyle(w).fontVariationSettings;
        anim(w, [
          { transform: 'translateY(110%)', fontVariationSettings: '"wdth" 125, "wght" 200' },
          { transform: 'none', fontVariationSettings: fvs }
        ], { duration: 1200, delay: 40 * i, easing: EASE_OUT, fill: 'backwards' });
      });
    }
  }

  function setupReveals() {
    /* initial choreography: [data-in] letters rise, then the gate opens */
    if (canMotion && !root.hasAttribute('data-motion-failed')) {
      qsa('[data-in]').forEach(function (el, i) {
        var a = anim(el, [
          { transform: 'translateY(115%)' },
          { transform: 'translateY(0)' }
        ], { duration: 1300, delay: 80 + 55 * i, easing: EASE_OUT, fill: 'both' });
        if (a) a.onfinish = function () { this.cancel(); };
      });
    }
    root.setAttribute('data-entered', '');

    /* [data-reveal] blocks: above-fold staggered, below-fold via IO */
    var blocks = qsa('[data-reveal]');
    if (canMotion && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { revealBlock(en.target); io.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px' });
      var i = 0;
      blocks.forEach(function (el) {
        if (!el.offsetParent && el.tagName !== 'BODY') return; /* hidden views */
        var top = el.getBoundingClientRect().top;
        if (top < innerHeight) revealBlock(el, 300 + 70 * i++);
        else { el.style.opacity = '0'; io.observe(el); }
      });
    }

    /* clip-in images + word groups */
    var cands = qsa('[data-clipin]:not([data-revealed]), [data-words]:not([data-revealed])');
    if ('IntersectionObserver' in window) {
      var cio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { revealIn(en.target); cio.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -12% 0px' });
      cands.forEach(function (el) {
        if (!el.offsetParent) { cio.observe(el); return; }
        if (el.getBoundingClientRect().top < innerHeight && canMotion) revealIn(el);
        else cio.observe(el);
      });
    } else cands.forEach(revealIn);
  }

  /* ---------------------------------------------------- kinetic letters */

  var kEls = qsa('[data-k]');
  var kC = [];
  function measureKinetic() {
    var sy = window.scrollY;
    kC = [];
    kEls.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      kC.push({
        el: el,
        x: r.left + r.width / 2,
        y: r.top + r.height / 2 + sy,
        r: parseFloat(el.getAttribute('data-k')) || 400
      });
    });
  }
  addMeasure(measureKinetic);

  function kineticFrame(now, k) {
    if (!FINE.matches || !pointer.seen) return;
    var sy = window.scrollY;
    var vh = innerHeight;
    for (var i = 0; i < kC.length; i++) {
      var c = kC[i];
      var vy = c.y - sy;
      if (vy < -c.r || vy > vh + c.r) {
        if (c.el._t > 0.001) { c.el._t = 0; c.el.style.fontVariationSettings = ''; }
        continue;
      }
      var dx = pointer.x - c.x, dy = pointer.y - vy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var target = Math.pow(clamp(1 - dist / c.r, 0, 1), 1.4);
      var t = (c.el._t || 0) + (target - (c.el._t || 0)) * lerpF(0.14, k);
      c.el._t = t;
      if (t < 0.001) c.el.style.fontVariationSettings = '';
      else c.el.style.fontVariationSettings =
        "'wdth' " + (70 + 55 * t).toFixed(1) + ", 'wght' " + (800 - 540 * t).toFixed(0);
    }
  }
  addFrame(kineticFrame);

  /* ------------------------------------------------------------ marquee */

  var marquee = qs('[data-marquee]');
  var mqWrap = marquee ? marquee.parentElement : null;
  var mqC = null;
  var marqueeX = 0;
  if (marquee && mqWrap) {
    addMeasure(function () {
      var r = mqWrap.getBoundingClientRect();
      mqC = { top: r.top + window.scrollY, h: r.height, half: marquee.scrollWidth / 2 };
    });
    addFrame(function (now, k) {
      if (!mqC) return;
      var sy = window.scrollY;
      if (mqC.top > sy + innerHeight || mqC.top + mqC.h < sy) return;
      marqueeX -= (0.7 + Math.min(0.35 * Math.abs(vel), 30)) * k;
      if (mqC.half && -marqueeX > mqC.half) marqueeX += mqC.half;
      var skew = clamp(-0.25 * vel, -10, 10);
      marquee.style.transform =
        'translate3d(' + marqueeX.toFixed(1) + 'px,0,0) skewX(' + skew.toFixed(2) + 'deg)';
    });
  }

  /* ----------------------------------------------------------- parallax */

  var pEls = qsa('[data-speed]');
  var pC = [];
  addMeasure(function () {
    var sy = window.scrollY;
    pC = pEls.map(function (el) {
      var box = el.parentElement || el;
      var r = box.getBoundingClientRect();
      return { el: el, top: r.top + sy, h: r.height, s: parseFloat(el.getAttribute('data-speed')) || 0 };
    });
  });
  addFrame(function () {
    var sy = window.scrollY, vh = innerHeight;
    for (var i = 0; i < pC.length; i++) {
      var c = pC[i];
      var top = c.top - sy;
      if (top > vh || top + c.h < 0) continue;
      c.el.style.transform = 'translate3d(0,' + (-(top + c.h / 2 - vh / 2) * c.s).toFixed(1) + 'px,0)';
    }
  });

  /* ------------------------------------------------------------ magnets */

  var magnets = qsa('[data-magnet]');
  function magnetFrame(now, k) {
    if (!FINE.matches || !pointer.seen) return;
    for (var i = 0; i < magnets.length; i++) {
      var el = magnets[i];
      var r = el.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = pointer.x - cx, dy = pointer.y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var range = Math.max(r.width, r.height) * 1.4 + 80;
      var pull = dist < range ? clamp(1 - dist / range, 0, 1) : 0;
      var tx = pull ? clamp(dx * 0.35, -36, 36) * pull : 0;
      var ty = pull ? clamp(dy * 0.35, -36, 36) * pull : 0;
      var mx = (el._mx || 0) + (tx - (el._mx || 0)) * lerpF(0.16, k);
      var my = (el._my || 0) + (ty - (el._my || 0)) * lerpF(0.16, k);
      el._mx = mx; el._my = my;
      if (Math.abs(mx) > 0.05 || Math.abs(my) > 0.05) {
        el.style.transform = 'translate3d(' + mx.toFixed(1) + 'px,' + my.toFixed(1) + 'px,0)';
      } else if (el.style.transform) el.style.transform = '';
    }
  }
  addFrame(magnetFrame);

  /* --------------------------------------------------------------- tilt */

  var tilt = qs('[data-tilt]');
  if (tilt) {
    var tiltAt = null, tx = 0, ty = 0;
    tilt.addEventListener('pointermove', function (e) {
      var r = tilt.getBoundingClientRect();
      tiltAt = { x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 };
    });
    tilt.addEventListener('pointerleave', function () { tiltAt = null; });
    addFrame(function (now, k) {
      var t = tiltAt || { x: 0, y: 0 };
      tx += (t.x - tx) * lerpF(0.1, k);
      ty += (t.y - ty) * lerpF(0.1, k);
      tilt.style.transform = 'rotateX(' + (-ty * 6).toFixed(2) + 'deg) rotateY(' + (tx * 6).toFixed(2) + 'deg)';
    });
  }

  /* ------------------------------------------------------------- cursor */

  var dot = qs('.cursor-dot');
  var ring = qs('.cursor-ring');
  var ringLabel = ring ? ring.firstElementChild : null;
  var ringScale = 0.35;
  var cursorLabel = '';
  if (FINE.matches) doc.body.setAttribute('data-nocursor', '');
  if (dot && ring) {
    addFrame(function (now, k) {
      if (!FINE.matches) return;
      /* the dot is centred by its own negative margins — translate straight to the pointer */
      dot.style.transform = 'translate3d(' + pointer.x.toFixed(1) + 'px,' + pointer.y.toFixed(1) + 'px,0)';
      var target = cursorLabel ? 1 : 0.35;
      ringScale += (target - ringScale) * lerpF(0.18, k);
      var rw = ring.offsetWidth || 88, rh = ring.offsetHeight || 88;
      ring.style.transform = 'translate3d(' + (pointer.x - rw / 2).toFixed(1) + 'px,' + (pointer.y - rh / 2).toFixed(1) + 'px,0) scale(' + ringScale.toFixed(3) + ')';
    });
    doc.addEventListener('pointermove', function (e) {
      var t = e.target.closest ? e.target.closest('[data-cursor]') : null;
      var label = t ? t.getAttribute('data-cursor') : '';
      if (label === cursorLabel) return;
      cursorLabel = label || '';
      if (ringLabel) ringLabel.textContent = cursorLabel;
      ring.style.background = cursorLabel ? 'var(--color-accent)' : '';
      ring.style.borderColor = cursorLabel ? 'var(--color-accent)' : '';
    }, { passive: true });
  }

  /* ------------------------------------------------------------ hero fit */

  var fitLines = qsa('.hero__line');
  function fitHeroLines() {
    fitLines.forEach(function (line) {
      line.style.removeProperty('--fit-size');
      /* letters render their glyphs through ::before; hold the kinetic
         fvs at rest while measuring so a wobbling cursor can't skew it */
      var ls = qsa('.kinetic__letter', line);
      var saved = ls.map(function (l) { return l.style.fontVariationSettings; });
      ls.forEach(function (l) { l.style.fontVariationSettings = ''; });
      var avail = line.clientWidth;
      /* scrollWidth never reports less than clientWidth, so measure the
         natural text width with a transient max-content width instead */
      line.style.width = 'max-content';
      var natural = line.getBoundingClientRect().width;
      line.style.width = '';
      ls.forEach(function (l, i) { l.style.fontVariationSettings = saved[i] || ''; });
      if (natural > 0 && avail > 0) {
        var size = parseFloat(getComputedStyle(line).fontSize);
        if (size > 0) {
          line.style.setProperty('--fit-size', (size * avail / natural).toFixed(2) + 'px');
        }
      }
    });
  }
  fitHeroLines();

  /* --------------------------------------------------- statement scrub */

  var pin = qs('[data-pin]');
  var pinC = null;
  var words = qsa('[data-w]');
  if (pin && words.length) {
    addMeasure(function () {
      var r = pin.getBoundingClientRect();
      pinC = { top: r.top + window.scrollY, h: r.height };
    });
    var lastP = -1;
    addFrame(function () {
      if (!pinC) return;
      var sy = window.scrollY, vh = innerHeight;
      if (sy + vh <= pinC.top || sy >= pinC.top + pinC.h) return;
      var p = clamp((sy - pinC.top) / (pinC.h - vh), 0, 1);
      if (p === lastP) return;
      lastP = p;
      var n = words.length;
      for (var i = 0; i < n; i++) {
        var v = clamp(p * n * 1.1 - i, 0, 1);
        if (words[i]._o !== v) {
          words[i]._o = v;
          words[i].style.opacity = (0.14 + 0.86 * v).toFixed(3);
        }
      }
    });
  }

  /* --------------------------------------------------------- work dock */

  var dockSection = qs('.selected-work');
  if (dockSection) (function () {
    var rows = qsa('.selected-work__row', dockSection);
    var names = rows.map(function (r) { return qs('.selected-work__name', r); });
    var col = qs('.selected-work__col', dockSection);
    var dockEl = qs('.selected-work__dock', dockSection);
    var frame = qs('.selected-work__frame', dockSection);
    var cur = qs('.selected-work__cur', dockSection);
    var plat = qs('.selected-work__plat', dockSection);
    var big = qs('.selected-work__big', dockSection);
    var bar = qs('.selected-work__bar', dockSection);
    var card = qs('.selected-work__card', dockSection);
    var layers = card ? qsa('.selected-work__layer', card) : [];
    var covers = card ? qsa('.selected-work__cover', card) : [];
    var stageLayers = qsa('.selected-work__stage-layer', dockSection);
    var strips = qsa('.selected-work__strip', dockSection);
    var dots = qsa('.selected-work__dot', dockSection);

    var hoverIdx = -1, focusIdx = -1, active = -1, slide = 0;
    var rowT = rows.map(function () { return { t: 0, v: -1 }; });
    var cardState = { x: pointer.x, y: pointer.y, v: 0, from: 0, t0: 0, dur: 600, shown: false, px: 0 };
    var m = null;

    function setSlide(i) {
      slide = i;
      strips.forEach(function (strip, si) {
        var count = strip.children.length || 1;
        strip.style.transform = si === active
          ? 'translate3d(' + (-(100 / count) * i).toFixed(2) + '%,0,0)'
          : '';
      });
      dots.forEach(function (d, di) {
        var count = active >= 0 && strips[active] ? strips[active].children.length : dots.length;
        d.style.display = count > 1 && di < count ? '' : 'none';
        d.style.opacity = di === i ? '1' : '.35';
      });
    }

    function advance() {
      var count = active >= 0 && strips[active] ? strips[active].children.length : 0;
      if (count > 1) setSlide((slide + 1) % count);
    }

    function applyFocus(idx, now) {
      active = idx;
      layers.forEach(function (l, i) { l.style.opacity = i === idx ? '1' : '0'; });
      stageLayers.forEach(function (l, i) { l.style.opacity = i === idx ? '1' : '0'; });
      rows.forEach(function (r, i) { r.classList.toggle('selected-work__row--focus', i === idx); });
      var num = pad2(idx + 1);
      if (cur) cur.textContent = num;
      if (big) big.textContent = num;
      if (plat) plat.textContent = rows[idx] ? (rows[idx].getAttribute('data-platform') || '') : '';
      if (canMotion) {
        var cover = covers[idx];
        var a = anim(cover, [{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
          { duration: 1200, easing: EASE_OUT });
        if (a) a.onfinish = function () { this.cancel(); };
      }
      setSlide(0);
    }

    addMeasure(function () {
      var sy = window.scrollY;
      var colR = col ? col.getBoundingClientRect() : { top: 0, height: 0 };
      var dockR = dockEl ? dockEl.getBoundingClientRect() : { top: 0, height: 0, left: 0 };
      var frR = frame ? frame.getBoundingClientRect() : { top: 0, left: 0, width: 320, height: 400 };
      m = {
        colTop: colR.top + sy, colH: colR.height,
        secTop: dockSection.getBoundingClientRect().top + sy,
        secH: dockSection.offsetHeight,
        dockTotalH: dockR.height,
        frameOffY: frR.top - dockR.top,
        frameCX: frR.left + frR.width / 2,
        frameW: frR.width, frameH: frR.height,
        stickTop: innerHeight / 2 - frR.height / 2,
        rows: rows.map(function (r) {
          var rr = r.getBoundingClientRect();
          var name = qs('.selected-work__name', r);
          var nr = name ? name.getBoundingClientRect() : rr;
          return {
            top: rr.top + sy, h: rr.height, c: rr.top + sy + rr.height / 2,
            nameTop: nr.top + sy, nameBottom: nr.bottom + sy
          };
        })
      };
    });

    addFrame(function (now, k) {
      if (!m) return;
      var sy = window.scrollY, vh = innerHeight;
      if (m.secTop > sy + vh || m.secTop + m.secH < sy) { if (card && cardState.shown) { cardState.shown = false; card.style.opacity = '0'; } return; }
      var mob = MOBILE.matches;

      /* active row: hover > keyboard focus > scroll position */
      var idx = hoverIdx >= 0 ? hoverIdx : focusIdx;
      if (idx < 0) {
        var best = 0, bestScore = -1;
        if (mob) {
          for (var i = 0; i < m.rows.length; i++) {
            var r = m.rows[i];
            var top = Math.max(r.nameTop, sy), bottom = Math.min(r.nameBottom, sy + vh);
            var vis = bottom - top;
            var score = vis > 0 ? vis / Math.max(1, r.nameBottom - r.nameTop) : -1;
            if (score > bestScore) { bestScore = score; best = i; }
          }
        } else {
          var centre = sy + vh / 2;
          var bestDist = Infinity;
          for (var j = 0; j < m.rows.length; j++) {
            var d = Math.abs(m.rows[j].c - centre);
            if (d < bestDist) { bestDist = d; best = j; }
          }
        }
        idx = best;
      }
      if (idx !== active) applyFocus(idx, now);

      /* row name kinetics: wdth 88→118, wght 700→400, opacity .5→1 */
      for (var n = 0; n < rows.length; n++) {
        var target = n === idx ? 1 : 0;
        var st = rowT[n];
        st.t += (target - st.t) * (mob ? 1 : lerpF(0.12, k));
        if (Math.abs(st.t - st.v) > 0.003) {
          st.v = st.t;
          var name = names[n];
          if (name) {
            name.style.fontVariationSettings =
              "'wdth' " + (88 + 30 * st.t).toFixed(1) + ", 'wght' " + (700 - 300 * st.t).toFixed(0);
            name.style.opacity = (0.5 + 0.5 * st.t).toFixed(3);
          }
        }
      }

      /* progress bar: viewport centre between first and last row */
      if (bar && m.rows.length > 1) {
        var first = m.rows[0].c, last = m.rows[m.rows.length - 1].c;
        var p = clamp((sy + vh / 2 - first) / Math.max(1, last - first), 0, 1);
        bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      }

      /* cursor-following preview card (desktop) */
      if (card && !mob && FINE.matches) {
        var shown = true;
        if (shown !== cardState.shown) {
          cardState.shown = shown;
          card.style.opacity = '1';
        }
        var trail = FINE.matches && hoverIdx >= 0 && focusIdx < 0;
        var vTarget = trail ? 1 : 0;
        if (vTarget !== cardState.target) {
          cardState.target = vTarget;
          cardState.from = cardState.v;
          cardState.t0 = now;
          cardState.dur = trail ? 600 : 900;
        }
        var z = clamp((now - cardState.t0) / cardState.dur, 0, 1);
        cardState.v = cardState.from + (vTarget - cardState.from) * easeOut(z);
        var V = cardState.v;
        cardState.px = cardState.x;
        cardState.x += (pointer.x - cardState.x) * lerpF(0.1, k);
        cardState.y += (pointer.y - cardState.y) * lerpF(0.1, k);
        /* sticky dock centre */
        var dockTop = clamp(m.colTop - sy, m.stickTop, m.colTop + m.colH - m.dockTotalH - sy) + m.frameOffY;
        var dcx = m.frameCX, dcy = dockTop + m.frameH / 2;
        var K = dcx + (cardState.x + 190 - dcx) * V;
        var J = dcy + (cardState.y - dcy) * V;
        var rot = clamp((cardState.x - cardState.px) * 0.6, -12, 12);
        var U = m.frameW / 320;
        var S = U + (1 - U) * V;
        card.style.transform = 'translate3d(' + (K - 160).toFixed(1) + 'px,' + (J - 200).toFixed(1) + 'px,0) rotate(' + (rot * V).toFixed(2) + 'deg) scale(' + S.toFixed(4) + ')';
      } else if (card) {
        card.style.opacity = '0';
        cardState.shown = false;
      }
    });

    /* hover + keyboard focus tracking */
    rows.forEach(function (row, i) {
      row.addEventListener('pointerenter', function () { hoverIdx = i; });
      row.addEventListener('focusin', function () { focusIdx = i; });
      row.addEventListener('focusout', function () { if (focusIdx === i) focusIdx = -1; });
    });
    var list = qs('.selected-work__list', dockSection);
    if (list) list.addEventListener('pointerleave', function () { hoverIdx = -1; });

    /* tap / click / keyboard advances the preview strip */
    if (frame) {
      frame.addEventListener('click', advance);
      frame.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); advance(); }
      });
      /* gentle autoplay while in view (screens cycling, as the reference did) */
      setInterval(function () {
        if (!motionOn() || document.hidden) return;
        if (!m) return;
        var sy = window.scrollY, vh = innerHeight;
        if (m.secTop > sy + vh || m.secTop + m.secH < sy) return;
        advance();
      }, 3400);
    }
  })();

  /* -------------------------------------------------------- up close */

  var upClose = qs('.up-close');
  if (upClose) (function () {
    var wrap = qs('.up-close__wrap', upClose);
    var track = qs('.up-close__track', upClose);
    if (!wrap || !track) return;
    var fine = FINE.matches;
    var s = { x: 0, off: 0, v: 0, drag: false, moved: false, sx: 0, o0: 0, lx: 0, focusX: null };
    var m = { top: 0, h: 0, over: 0 };

    addMeasure(function () {
      var r = wrap.getBoundingClientRect();
      var cs = getComputedStyle(wrap);
      var padL = parseFloat(cs.paddingLeft) || 0;
      m.top = r.top + window.scrollY;
      m.h = r.height;
      m.over = Math.max(0, track.scrollWidth - (wrap.clientWidth - 2 * padL));
    });

    if (fine) {
      wrap.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        s.drag = true; s.moved = false;
        s.sx = e.clientX; s.o0 = s.off; s.lx = e.clientX; s.v = 0;
      });
      doc.addEventListener('pointermove', function (e) {
        if (!s.drag) return;
        var dx = e.clientX - s.sx;
        if (Math.abs(dx) > 6) s.moved = true;
        s.off = s.o0 - dx;
        s.v = -(e.clientX - s.lx);
        s.lx = e.clientX;
      }, { passive: true });
      doc.addEventListener('pointerup', function () { s.drag = false; });
      doc.addEventListener('pointercancel', function () { s.drag = false; });
      /* suppress link clicks right after a drag */
      wrap.addEventListener('click', function (e) {
        if (s.moved && wrap.contains(e.target)) { e.preventDefault(); e.stopPropagation(); }
      }, true);
      /* keyboard focus scrolls an item into the strip view */
      qsa('.up-close__item', upClose).forEach(function (item) {
        item.addEventListener('focusin', function () {
          var cs = getComputedStyle(wrap);
          var padL = parseFloat(cs.paddingLeft) || 0;
          s.focusX = clamp(item.offsetLeft - padL, 0, m.over);
        });
        item.addEventListener('focusout', function () { s.focusX = null; });
      });
    }

    addFrame(function (now, k) {
      if (!motionOn()) return;
      var sy = window.scrollY, vh = innerHeight;
      if (m.top > sy + vh || m.top + m.h < sy) return;
      if (!s.drag) {
        s.off += s.v * k;
        s.v *= Math.pow(0.92, k);
      }
      var c = clamp((sy + vh - m.top) / (vh + m.h), 0, 1);
      var d = s.focusX != null ? s.focusX : c * m.over + s.off;
      if (d < 0) { d = 0; s.off = -c * m.over; }
      if (d > m.over) { d = m.over; s.off = m.over - c * m.over; }
      s.x += (d - s.x) * lerpF(0.2, k);
      var skew = clamp(-0.25 * vel + 0.15 * s.v, -3, 3);
      track.style.transform = 'translate3d(' + (-s.x).toFixed(1) + 'px,0,0) skewX(' + skew.toFixed(2) + 'deg)';
    });
  })();

  /* ----------------------------------------------- work index (list) */

  var workIndex = qs('.work-index');
  if (workIndex) (function () {
    /* hover preview card */
    var card = qs('.project-reveal');
    var rows = qsa('.work-index__row', workIndex);
    if (card && rows.length && FINE.matches) {
      var layers = qsa('.project-reveal__layer', card);
      var st = { x: pointer.x, y: pointer.y, s: 0.6, o: 0 };
      rows.forEach(function (row) {
        row.addEventListener('pointerenter', function () {
          var i = parseInt(row.getAttribute('data-index'), 10);
          if (isNaN(i)) return;
          layers.forEach(function (l, li) { l.classList.toggle('project-reveal__layer--active', li === i); });
          st.hover = true;
        });
        row.addEventListener('pointerleave', function () { st.hover = false; });
      });
      addFrame(function (now, k) {
        var hover = !!st.hover;
        if (!hover && st.o <= 0.005) { st.x = pointer.x; st.y = pointer.y; return; }
        var px = st.x;
        st.x += (pointer.x - st.x) * lerpF(0.1, k);
        st.y += (pointer.y - st.y) * lerpF(0.1, k);
        st.s += ((hover ? 1 : 0.6) - st.s) * lerpF(0.12, k);
        st.o += ((hover ? 1 : 0) - st.o) * lerpF(0.15, k);
        var rot = clamp((st.x - px) / Math.max(k, 0.01) * 0.02, -12, 12);
        card.style.transform = 'translate3d(' + (st.x + 30).toFixed(1) + 'px,' + (st.y - 200).toFixed(1) + 'px,0) rotate(' + rot.toFixed(2) + 'deg) scale(' + st.s.toFixed(3) + ')';
        card.style.opacity = st.o.toFixed(3);
      });
    }

    /* list / grid view toggle */
    var buttons = qsa('.work-index__view', workIndex);
    var listView = qs('.work-index__list', workIndex);
    var gridView = qs('.work-index__grid', workIndex);
    if (buttons.length === 2 && listView && gridView) {
      function setView(list) {
        listView.hidden = !list;
        gridView.hidden = list;
        buttons[0].classList.toggle('work-index__view--active', list);
        buttons[1].classList.toggle('work-index__view--active', !list);
        buttons[0].setAttribute('aria-pressed', list ? 'true' : 'false');
        buttons[1].setAttribute('aria-pressed', list ? 'false' : 'true');
        if (!list) {
          /* freshly reveal grid cards */
          qsa('[data-reveal]', gridView).forEach(function (el, i) {
            el.style.opacity = '';
            revealBlock(el, 80 * i);
          });
        }
        remeasureSoon();
      }
      buttons[0].addEventListener('click', function () { setView(true); });
      buttons[1].addEventListener('click', function () { setView(false); });
    }
  })();

  /* ------------------------------------------------------ header/menu */

  (function chrome() {
    /* logo fill sweep */
    var logo = qs('.header__logo');
    var fill = qs('.header__logo-fill');
    if (logo && fill && canMotion) {
      logo.addEventListener('pointerenter', function () {
        var a = anim(fill, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }],
          { duration: 420, easing: EASE_IN_OUT, fill: 'forwards' });
      });
      logo.addEventListener('pointerleave', function () {
        var a = anim(fill, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0)' }],
          { duration: 420, easing: EASE_IN_OUT, fill: 'forwards' });
      });
    }

    /* live clock (IST) */
    var clocks = qsa('[data-clock]');
    if (clocks.length) {
      var fmt;
      try {
        fmt = new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata'
        });
      } catch (e) { fmt = null; }
      function updateClock() {
        var text = fmt ? fmt.format(new Date()) : new Date().toTimeString().slice(0, 5);
        clocks.forEach(function (el) { el.textContent = text; });
      }
      updateClock();
      setInterval(updateClock, 30000);
    }

    /* menu overlay */
    var menuButton = qs('.header__menu-button');
    var menu = qs('#site-menu');
    if (menuButton && menu) {
      var menuOpen = false;
      function focusables() {
        return qsa('a[href], button:not([disabled])', menu)
          .filter(function (el) { return el.offsetParent !== null; });
      }
      function setMenu(open) {
        menuOpen = open;
        menuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
        root.classList.toggle('menu-open', open);
        menu.classList.toggle('menu--open', open);
        if (open) {
          menu.removeAttribute('inert');
          menu.removeAttribute('data-lenis-prevent');
          if (lenis) lenis.stop();
          var f = focusables();
          if (f.length) f[0].focus();
        } else {
          if ('inert' in menu) menu.setAttribute('inert', '');
          else menu.setAttribute('aria-hidden', 'true');
          menu.setAttribute('data-lenis-prevent', '');
          if (lenis) lenis.start();
          menuButton.focus();
        }
      }
      menuButton.addEventListener('click', function () { setMenu(!menuOpen); });
      doc.addEventListener('keydown', function (e) {
        if (!menuOpen) return;
        if (e.key === 'Escape') { setMenu(false); return; }
        if (e.key === 'Tab') {
          var f = focusables();
          if (!f.length) return;
          var first = f[0], last = f[f.length - 1];
          if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      });
      /* closed by default: keep it out of tab order */
      if ('inert' in menu) menu.setAttribute('inert', '');
      menu.setAttribute('data-lenis-prevent', '');
      /* close after choosing a link (navigation follows normally) */
      qsa('a', menu).forEach(function (a) {
        a.addEventListener('click', function () { setMenu(false); });
      });
    }
  })();

  /* ------------------------------------------------------ transitions */

  (function transitions() {
    var overlay = qs('.transition');
    var bars = overlay ? qsa('.transition__bar', overlay) : [];
    var label = overlay ? qs('.transition__label', overlay) : null;
    var metaSub = overlay ? qs('[data-psub]', overlay) : null;
    var line = overlay ? qs('.transition__line', overlay) : null;
    var KEY = 'rk-transition';

    function buildLabel(text) {
      if (!label) return;
      label.textContent = '';
      var words = String(text).trim().split(/\s+/).filter(Boolean);
      words.forEach(function (word, wi) {
        var w = doc.createElement('span');
        w.className = 'transition__word';
        var clip = doc.createElement('span');
        clip.className = 'transition__clip';
        Array.prototype.forEach.call(word, function (ch, ci) {
          var l = doc.createElement('span');
          l.className = 'transition__letter';
          l.textContent = ch;
          clip.appendChild(l);
          if (canMotion) {
            anim(l, [
              { transform: 'translateY(115%)' },
              { transform: 'translateY(0)' }
            ], { duration: 650, delay: 120 + 22 * (wi * 8 + ci), easing: EASE_OUT, fill: 'both' });
          }
        });
        w.appendChild(clip);
        label.appendChild(w);
      });
    }

    function cover(href, name, sub) {
      if (!overlay || !bars.length) { location.href = href; return; }
      buildLabel(name || '');
      if (metaSub) metaSub.textContent = sub || '';
      bars.forEach(function (bar, i) {
        anim(bar, [
          { transform: 'translateY(101%)' },
          { transform: 'translateY(0)' }
        ], { duration: 550, delay: i * 45, easing: EASE_IN_OUT, fill: 'forwards' });
      });
      if (line) anim(line, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
        { duration: 500, delay: 220, easing: EASE_IN_OUT, fill: 'forwards' });
      try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), path: new URL(href, location.href).pathname })); } catch (e) {}
      setTimeout(function () { location.href = href; }, 760);
    }

    /* reveal the destination page again (bars sweep up) */
    if (root.hasAttribute('data-transition-resume')) {
      try { sessionStorage.removeItem(KEY); } catch (e) {}
      setTimeout(function () {
        bars.forEach(function (bar, i) {
          var a = anim(bar, [
            { transform: 'translateY(0)' },
            { transform: 'translateY(-101%)' }
          ], { duration: 550, delay: i * 45, easing: EASE_IN_OUT, fill: 'forwards' });
          if (a) a.onfinish = function () { this.cancel(); };
        });
        setTimeout(function () {
          root.removeAttribute('data-transition-resume');
          if (line) line.style.transform = '';
        }, 820);
      }, 120);
    }

    /* intercept internal link clicks */
    doc.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0) return;
      var url;
      try { url = new URL(href, location.href); } catch (err) { return; }
      if (url.protocol !== location.protocol || url.host !== location.host) return;
      if (!canMotion || REDUCED.matches) return;
      e.preventDefault();
      cover(url.href,
        a.getAttribute('data-transition-name') || a.textContent.trim() || '',
        a.getAttribute('data-transition-sub') || '');
    });
  })();

  /* -------------------------------------------------------------- intro */

  (function intro() {
    if (root.getAttribute('data-intro') !== 'run' || !canMotion) return;
    var bg = qs('[data-ibg]');
    var box = qs('[data-ibox]');
    var meta = qs('[data-imeta]');
    var count = qs('[data-icount]');
    var line = qs('[data-iline]');
    var letters = qsa('.intro__letter');

    root.style.overflow = 'hidden';
    if (lenis) lenis.stop();

    letters.forEach(function (l, i) {
      var italic = l.hasAttribute('data-il') && l.getAttribute('data-il') === 'italic';
      var finalFvs = italic ? '"wdth" 110, "wght" 250' : '"wdth" 68, "wght" 850';
      anim(l, [
        { transform: 'translateY(115%)' },
        { transform: 'none' }
      ], { duration: 650, delay: 80 + 30 * i, easing: EASE_OUT, fill: 'both' });
      anim(l, [
        { fontVariationSettings: '"wdth" 125, "wght" 150' },
        { fontVariationSettings: '"wdth" 62, "wght" 900', offset: 0.45 },
        { fontVariationSettings: finalFvs }
      ], { duration: 750, delay: 100 + 22 * i, easing: 'ease-in-out', fill: 'both' });
    });
    anim(box, [
      { transform: 'scale(0) rotate(-90deg)' },
      { transform: 'none' }
    ], { duration: 650, delay: 220, easing: EASE_OUT, fill: 'forwards' });
    anim(meta, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 140, fill: 'both' });

    var v = 0, last = performance.now(), done = false;
    function exit() {
      if (done) return;
      done = true;
      var a = anim(bg, [
        { transform: 'translateY(0)' },
        { transform: 'translateY(-101%)' }
      ], { duration: 700, easing: EASE_IN_OUT, fill: 'forwards' });
      setTimeout(function () {
        root.removeAttribute('data-intro');
        root.style.overflow = '';
        if (lenis) lenis.start();
        try { sessionStorage.setItem('rk-intro', '1'); } catch (e) {}
        remeasureSoon();
      }, a ? 700 : 0);
    }
    function step(now) {
      if (done) return;
      var dt = Math.max(0, now - last);
      last = now;
      v += dt;
      var e = 1 - Math.pow(1 - Math.min(1, v / 1000), 3);
      if (count) count.textContent = ('00' + Math.round(100 * e)).slice(-3);
      if (line) line.style.transform = 'scaleX(' + e.toFixed(4) + ')';
      if (v >= 1120) exit();
      else requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    /* skip */
    doc.addEventListener('keydown', function skip(e) {
      if (root.getAttribute('data-intro') !== 'run') { doc.removeEventListener('keydown', skip); return; }
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') exit();
    });
  })();

  /* -------------------------------------------------- process timeline */

  var ptLines = [];
  (function processTimeline() {
    var timelines = qsa('.process-timeline');
    if (!timelines.length) return;

    /* steps light up as they enter the viewport (one observer for all) */
    var io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.setAttribute('data-on', ''); io.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -30% 0px' });
    }

    timelines.forEach(function (tl) {
      var steps = qsa('.process-timeline__step', tl);
      if (io) steps.forEach(function (s) { io.observe(s); });
      else steps.forEach(function (s) { s.setAttribute('data-on', ''); });

      /* each spine fills with scroll */
      var line = qs('.process-timeline__line', tl);
      if (!line) return;
      ptLines.push(line);
      var wrap = line.parentElement;
      var box = null;
      addMeasure(function () {
        var r = wrap.getBoundingClientRect();
        box = { top: r.top + window.scrollY, h: r.height };
      });
      addFrame(function () {
        if (!box || !motionOn()) return;
        var sy = window.scrollY, vh = innerHeight;
        var p = clamp((sy + vh * .6 - box.top) / Math.max(1, box.h), 0, 1);
        line.style.transform = 'scaleY(' + p.toFixed(4) + ')';
      });
    });
  })();

  /* ---------------------------------------------------------------- FAQ */

  qsa('.faq__item').forEach(function (item) {
    var btn = qs('button', item);
    if (!btn) return;
    btn.addEventListener('click', function () {
      var open = item.classList.toggle('faq__item--open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });

  /* ------------------------------------------------------ contact form */

  (function contact() {
    var form = qs('[data-contact-form]');
    if (!form) return;
    var nameF = form.querySelector('[data-field="name"]');
    var emailF = form.querySelector('[data-field="email"]');
    var msgF = form.querySelector('[data-field="message"]');
    var error = qs('.contact-form__error', form);
    var success = qs('.contact-form__success', form);
    var heading = success ? qs('.contact-form__success-heading', success) : null;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = nameF ? nameF.value.trim() : '';
      var email = emailF ? emailF.value.trim() : '';
      var bad = false;
      if (nameF) { nameF.setAttribute('aria-invalid', name ? 'false' : 'true'); bad = bad || !name; }
      if (emailF) {
        var okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        emailF.setAttribute('aria-invalid', okEmail ? 'false' : 'true');
        bad = bad || !okEmail;
      }
      if (bad) {
        if (error) { error.textContent = 'Need a name and email so I can reply.'; error.setAttribute('role', 'alert'); }
        var firstBad = form.querySelector('[aria-invalid="true"]');
        if (firstBad) firstBad.focus();
        return;
      }
      if (error) error.textContent = '';
      /* TODO: wire a real form service here; static build falls back to email */
      var need = '';
      var checked = form.querySelector('input[name="need"]:checked');
      if (checked) need = checked.value;
      var subject = encodeURIComponent('Project enquiry — ' + name);
      var bodyLines = [
        'Name: ' + name,
        'Email: ' + email,
        need ? 'Needs: ' + need : '',
        '',
        msgF && msgF.value.trim() ? msgF.value.trim() : ''
      ].filter(function (l) { return l !== ''; });
      var body = encodeURIComponent(bodyLines.join('\n'));
      window.location.href = 'mailto:ragulthedeveloper@gmail.com?subject=' + subject + '&body=' + body;
      form.setAttribute('hidden', '');
      if (success) {
        success.removeAttribute('hidden');
        var text = qs('.contact-form__success-text', success);
        if (text) text.textContent = 'Thanks, ' + name + ' — your email app should be opening with everything filled in. I\'ll reply to ' + email + ' soon.';
        if (heading) heading.focus();
      }
      showToast('Opening your email app…');
    });

    /* chips single-select styling */
    form.addEventListener('change', function (e) {
      if (e.target && e.target.name === 'need') {
        qsa('.contact-form__chip', form).forEach(function (chip) {
          var input = chip.querySelector('input');
          chip.classList.toggle('contact-form__chip--selected', !!(input && input.checked));
        });
      }
    });
  })();

  /* -------------------------------------------------- back to top/toast */

  var toastEl = qs('.toast');
  var toastTimer = 0;
  function showToast(text, ms) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.setAttribute('data-show', '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.removeAttribute('data-show'); }, ms || 3200);
  }

  var backTop = qs('[data-back-to-top]');
  if (backTop) {
    backTop.addEventListener('click', function () {
      if (lenis) lenis.scrollTo(0, { duration: 1.4 });
      else window.scrollTo({ top: 0, behavior: REDUCED.matches ? 'auto' : 'smooth' });
    });
  }

  /* ------------------------------------------------------- pause motion */

  (function pause() {
    var btn = qs('.selected-work__pause');
    if (!btn) return;
    function resetMotionStyles() {
      doc.body.removeAttribute('data-nocursor');
      if (dot) dot.style.transform = '';
      if (ring) ring.style.transform = '';
      kEls.forEach(function (el) { el.style.fontVariationSettings = ''; });
      if (marquee) marquee.style.transform = '';
      pEls.forEach(function (el) { el.style.transform = ''; });
      magnets.forEach(function (el) { el.style.transform = ''; el._mx = 0; el._my = 0; });
      if (tilt) tilt.style.transform = '';
      words.forEach(function (w) { w.style.opacity = ''; });
      qsa('.selected-work__name', dockSection || doc).forEach(function (n) {
        n.style.fontVariationSettings = ''; n.style.opacity = '';
      });
      qsa('.selected-work__strip', dockSection || doc).forEach(function (s) { s.style.transform = ''; });
      qsa('.selected-work__bar', dockSection || doc).forEach(function (b) { b.style.transform = ''; });
      var track = qs('.up-close__track');
      if (track) track.style.transform = '';
      ptLines.forEach(function (l) { l.style.transform = ''; });
      var card = qs('.selected-work__card');
      if (card) { card.style.opacity = ''; card.style.transform = ''; }
    }
    function label(off) { btn.textContent = off ? '(Play motion)' : '(Pause motion)'; }
    btn.addEventListener('click', function () {
      var off = root.getAttribute('data-motion') === 'on';
      if (off) {
        root.setAttribute('data-motion', 'off');
        resetMotionStyles();
        if (lenis) lenis.stop();
        stopLoop();
        label(true);
      } else {
        if (REDUCED.matches) { showToast('Motion stays off to respect your reduced-motion preference.'); return; }
        root.setAttribute('data-motion', 'on');
        canMotion = true;
        if (FINE.matches) doc.body.setAttribute('data-nocursor', '');
        initLenis();
        if (lenis) lenis.start();
        startLoop();
        label(false);
      }
    });
    label(false);
  })();

  /* ------------------------------------------------------------- start */

  function boot() {
    if (canMotion) {
      initLenis();
      setupReveals();
      measureAll();
      startLoop();
      root.setAttribute('data-motion-ready', '');
    } else {
      root.setAttribute('data-entered', '');
      root.setAttribute('data-motion-failed', '');
      qsa('[data-reveal]').forEach(function (el) { el.style.opacity = ''; });
      qsa('[data-clipin], [data-words]').forEach(function (el) { el.setAttribute('data-revealed', ''); });
      words.forEach(function (w) { w.style.opacity = '1'; });
    }
    /* late re-measures once fonts and images have settled */
    if (doc.fonts && doc.fonts.ready && doc.fonts.ready.then) {
      doc.fonts.ready.then(function () { fitHeroLines(); measureAll(); remeasureSoon(); });
    }
    window.addEventListener('load', function () { measureAll(); remeasureSoon(); });
    setTimeout(function () { fitHeroLines(); measureAll(); }, 1500);
    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { fitHeroLines(); measureAll(); remeasureSoon(); }, 200);
    }, { passive: true });
  }

  try {
    boot();
  } catch (err) {
    root.setAttribute('data-motion-failed', '');
    root.setAttribute('data-entered', '');
    qsa('[data-reveal]').forEach(function (el) { el.style.opacity = ''; });
  }
})();
