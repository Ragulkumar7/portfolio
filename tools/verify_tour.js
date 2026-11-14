/* TOUR + VOICE verification (replaces PASS 2).

   Playwright cannot hear anything, so audio is spied on instead:
   AudioContext construction, oscillator creation and speechSynthesis
   speak/cancel are counted from an init script. Everything else is
   asserted from what the visitor can actually see.

   node tools/verify_tour.js [--quick]                                  */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const QUICK = process.argv.includes('--quick');
const fileUrl = (rel) => 'file:///' + path.join(ROOT, rel).replace(/\\/g, '/');
const fail = (list, check, detail) =>
  list.push(check + (detail ? ' — ' + detail : ''));

/* installed before any page script runs */
const SPY = `(() => {
  window.__spy = { ac: 0, osc: 0, speak: 0, cancel: 0, utterances: [] };
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    const Spy = function () { window.__spy.ac++; return new AC(); };
    Spy.prototype = AC.prototype;
    window.AudioContext = Spy;
    if (window.webkitAudioContext) window.webkitAudioContext = Spy;
    const co = AC.prototype.createOscillator;
    AC.prototype.createOscillator = function () {
      window.__spy.osc++;
      return co.apply(this, arguments);
    };
  }
  const ss = window.speechSynthesis;
  if (ss) {
    const so = ss.speak.bind(ss);
    ss.speak = function (u) { window.__spy.speak++; window.__spy.utterances.push(u.text); return so(u); };
    const sc = ss.cancel.bind(ss);
    ss.cancel = function () { window.__spy.cancel++; return sc(); };
  }
})();`;

async function openPage(browser, rel, vp, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: !!opts.touch,
    isMobile: !!opts.touch,
    reducedMotion: opts.reduced ? 'reduce' : 'no-preference'
  });
  await ctx.addInitScript(SPY);
  if (opts.seen) {
    await ctx.addInitScript(() => { try { localStorage.setItem('guide:seen', '1'); } catch (e) {} });
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(fileUrl(rel), { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intro'), null, { timeout: 9000 });
  } catch (e) { /* no intro */ }
  try {
    await page.waitForFunction(
      () => { const g = document.querySelector('#guide'); return g && g.hasAttribute('data-entered'); },
      null, { timeout: 9000 });
  } catch (e) { /* entrance never ran: later checks report it */ }
  await page.waitForTimeout(300);
  return { ctx, page, errors };
}

const readSpy = (page) => page.evaluate(() => Object.assign({}, window.__spy));
const caption = (page) => page.evaluate(() => {
  const b = document.querySelector('.guide__bubble');
  const t = document.querySelector('.guide__bubble-text');
  return b && b.hasAttribute('data-open') && t ? t.textContent : '';
});

async function waitForCaption(page, expected, ms) {
  const t0 = Date.now();
  let seen = '';
  while (Date.now() - t0 < ms) {
    seen = await caption(page);
    if (seen === expected) return seen;
    await page.waitForTimeout(120);
  }
  return seen;
}

/* click the bubble away so the next line is not queued behind it */
async function dismissLine(page) {
  const open = await page.evaluate(() => {
    const b = document.querySelector('.guide__bubble');
    return !!(b && b.hasAttribute('data-open') && !b.hasAttribute('data-hold'));
  });
  if (!open) return;
  await page.evaluate(() => document.querySelector('.guide__bubble').click());
  await page.waitForTimeout(250);
}

/* wait until the page has actually started speaking a new line */
async function waitForSpeech(page, base, ms) {
  const t0 = Date.now();
  let s = await readSpy(page);
  while (s.speak <= base && Date.now() - t0 < ms) {
    await page.waitForTimeout(150);
    s = await readSpy(page);
  }
  return s;
}

/* click a tour control; if it is not reachable, report the guide's
   state instead of letting Playwright throw the whole run away */
async function tourClick(page, failures, label, sel) {
  try {
    await page.click(sel, { timeout: 6000 });
    return true;
  } catch (e) {
    const st = await page.evaluate(() => {
      const g = document.querySelector('#guide');
      const b = document.querySelector('.guide__bubble');
      const c = document.querySelector('.guide__controls');
      if (!g) return { missing: true };
      return {
        sup: g.getAttribute('data-suppressed'), tour: g.hasAttribute('data-tour'),
        bubbleOpen: b ? b.hasAttribute('data-open') : null,
        controlsHidden: c ? c.hidden : null,
        vis: getComputedStyle(g).visibility, disp: getComputedStyle(g).display
      };
    });
    fail(failures, `tour: ${label} not clickable`, JSON.stringify(st));
    return false;
  }
}

/* push the speech pace up for the long tour lines (the assertions are
   about content and order, not about waiting50s) */
const fastSpeech = (page) => page.evaluate(() => {
  const th = (window.PORTFOLIO || {}).avatar && window.PORTFOLIO.avatar.thresholds;
  if (!th) return false;
  th.speechCps = 70;
  th.blipCps = 110;
  th.pauseMin = 4;
  th.pauseMax = 9;
  th.tourAdvanceMs = 700;
  return true;
});

/* ---------------------------------------------------------------- 1 -- */
/* defaults, gesture gating, blips, voice, mouth */

async function checkSound(browser, failures) {
  const vp = { name: '1440', width: 1440, height: 900 };
  const rel = 'index.html';
  const { ctx, page, errors } = await openPage(browser, rel, vp, {});

  /* sound is off by default and nothing audible exists before a gesture */
  let s = await readSpy(page);
  if (s.ac || s.osc || s.speak) {
    fail(failures, 'sound: audible before a gesture', JSON.stringify(s));
  }
  let label = await page.evaluate(() => {
    const b = document.querySelector('.footer__sound');
    return b ? b.textContent.trim() : null;
  });
  if (label !== 'Sound: off') fail(failures, 'sound: default label', String(label));

  /* a gesture with sound still off must not build anything either */
  await page.mouse.click(900, 200);
  await page.waitForTimeout(300);
  s = await readSpy(page);
  if (s.ac || s.osc || s.speak) {
    fail(failures, 'sound: audible after a gesture while off', JSON.stringify(s));
  }
  /* clear the first-visit line so the next one is not queued behind it */
  await dismissLine(page);

  /* cycle the footer control: off -> blips (this click is the gesture) */
  await page.click('.footer__sound');
  await page.waitForTimeout(300);
  label = await page.evaluate(() => document.querySelector('.footer__sound').textContent.trim());
  if (label !== 'Sound: blips') fail(failures, 'sound: blips label', String(label));
  s = await readSpy(page);
  if (s.ac < 1) fail(failures, 'sound: AudioContext after enabling blips', JSON.stringify(s));

  /* a line in blips mode: oscillators + a mouth that moves. Sample the
     mouth WHILE it speaks — after the caption lands it must be back on
     the default (smile). */
  const seenMouth = new Set();
  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      const m = await page.evaluate(() => document.querySelector('#guide').getAttribute('data-mouth'));
      seenMouth.add(m || 'smile');
      await page.waitForTimeout(60);
    }
  })();
  await page.evaluate(() => document.querySelector('.selected-work').scrollIntoView({ block: 'center' }));
  const workLine = await page.evaluate(() => window.PORTFOLIO.avatar.lines.work);
  const shown = await waitForCaption(page, workLine, 9000);
  if (shown !== workLine) fail(failures, 'blips: caption', `got "${shown}"`);
  await page.waitForTimeout(400);
  sampling = false;
  await sampler;
  s = await readSpy(page);
  if (s.osc < 1) fail(failures, 'blips: no oscillators created', JSON.stringify(s));
  if (!seenMouth.has('open')) {
    fail(failures, 'mouth: never opened while speaking', JSON.stringify([...seenMouth]));
  }
  const after = await page.evaluate(() => document.querySelector('#guide').getAttribute('data-mouth'));
  if (after !== null) fail(failures, 'mouth: not back to smile', String(after));

  /* voice mode calls speechSynthesis */
  await page.click('.footer__sound');            /* blips -> voice */
  await page.waitForTimeout(200);
  label = await page.evaluate(() => document.querySelector('.footer__sound').textContent.trim());
  if (label !== 'Sound: voice') fail(failures, 'sound: voice label', String(label));
  const beforeSpeak = (await readSpy(page)).speak;
  await page.evaluate(() => document.querySelector('.service-tiles').scrollIntoView({ block: 'center' }));
  const svcLine = await page.evaluate(() => window.PORTFOLIO.avatar.lines.services);
  const t0 = Date.now();
  let s2 = await readSpy(page);
  while (s2.speak === beforeSpeak && Date.now() - t0 < 8000) {
    await page.waitForTimeout(150);
    s2 = await readSpy(page);
  }
  if (s2.speak <= beforeSpeak) fail(failures, 'voice: speechSynthesis.speak never called', JSON.stringify(s2));
  if (!s2.utterances.some((u) => u.indexOf('Shopify') >= 0)) {
    fail(failures, 'voice: utterance text', JSON.stringify(s2.utterances));
  }
  /* caption still shows in voice mode */
  const vShown = await waitForCaption(page, svcLine, 8000);
  if (vShown !== svcLine) fail(failures, 'voice: caption', `got "${vShown}"`);

  if (errors.length) fail(failures, 'sound/tour console errors', errors.join(' | '));
  await ctx.close();

  /* sound saved as ON: still nothing audible until the first gesture,
     then the context is created by that gesture */
  {
    const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await c2.addInitScript(SPY);
    await c2.addInitScript(() => {
      try {
        localStorage.setItem('guide:sound', 'blips');
        localStorage.setItem('guide:sound:chosen', '1');
        localStorage.setItem('guide:seen', '1');
      } catch (e) {}
    });
    const p2 = await c2.newPage();
    const errs2 = [];
    p2.on('pageerror', (e) => errs2.push('pageerror: ' + e.message));
    await p2.goto(fileUrl(rel), { waitUntil: 'load' });
    await p2.waitForFunction(
      () => { const g = document.querySelector('#guide'); return g && g.hasAttribute('data-entered'); },
      null, { timeout: 9000 }).catch(() => {});
    await p2.waitForTimeout(400);
    let r = await readSpy(p2);
    const label2 = await p2.evaluate(() => document.querySelector('.footer__sound').textContent.trim());
    if (label2 !== 'Sound: blips') fail(failures, 'saved sound: label', String(label2));
    if (r.ac || r.osc || r.speak) fail(failures, 'saved sound: audible before a gesture', JSON.stringify(r));
    await p2.mouse.click(900, 200);           /* the first gesture */
    await p2.waitForTimeout(400);
    r = await readSpy(p2);
    if (r.ac < 1) fail(failures, 'saved sound: no AudioContext on first gesture', JSON.stringify(r));
    if (errs2.length) fail(failures, 'saved sound pageerror', errs2.join(' | '));
    await c2.close();
  }
}

/* ---------------------------------------------------------------- 2 -- */
/* cancel() on skip, Escape, pagehide, hidden tab and guide off */

async function checkCancel(browser, failures) {
  const vp = { name: '1440', width: 1440, height: 900 };
  const rel = 'index.html';

  /* Escape cancels a running line */
  {
    const { ctx, page } = await openPage(browser, rel, vp, { seen: true });
    await page.click('.footer__sound');            /* off -> blips, gesture */
    await page.click('.footer__sound');            /* blips -> voice       */
    await page.waitForTimeout(200);
    await dismissLine(page);
    await page.evaluate(() => document.querySelector('.selected-work').scrollIntoView({ block: 'center' }));
    let s = await waitForSpeech(page, 0, 9000);
    if (s.speak === 0) fail(failures, 'cancel: nothing spoke before Escape');
    const before = s.cancel;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    s = await readSpy(page);
    if (s.cancel <= before) fail(failures, 'cancel: Escape', `${before} -> ${s.cancel}`);
    await ctx.close();
  }

  /* guide off cancels too */
  {
    const { ctx, page } = await openPage(browser, rel, vp, { seen: true });
    await page.click('.footer__sound');
    await page.click('.footer__sound');
    await page.waitForTimeout(200);
    await dismissLine(page);
    await page.evaluate(() => document.querySelector('.selected-work').scrollIntoView({ block: 'center' }));
    let s = await waitForSpeech(page, 0, 9000);
    if (s.speak === 0) fail(failures, 'cancel: nothing spoke before guide off');
    const before = s.cancel;
    await page.click('[data-guide-toggle]');
    await page.waitForTimeout(300);
    s = await readSpy(page);
    if (s.cancel <= before) fail(failures, 'cancel: guide off', `${before} -> ${s.cancel}`);
    await ctx.close();
  }

  /* pagehide + hidden tab */
  {
    const { ctx, page } = await openPage(browser, rel, vp, { seen: true });
    await page.click('.footer__sound');
    await page.click('.footer__sound');
    await page.waitForTimeout(200);
    await dismissLine(page);
    await page.evaluate(() => document.querySelector('.selected-work').scrollIntoView({ block: 'center' }));
    let s = await waitForSpeech(page, 0, 9000);
    if (s.speak === 0) fail(failures, 'cancel: nothing spoke before pagehide');
    let before = s.cancel;
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForTimeout(250);
    s = await readSpy(page);
    if (s.cancel <= before) fail(failures, 'cancel: pagehide', `${before} -> ${s.cancel}`);

    /* a NEW line, then hide the tab */
    const speakBase = s.speak;
    await page.evaluate(() => document.querySelector('.service-tiles').scrollIntoView({ block: 'center' }));
    s = await waitForSpeech(page, speakBase, 9000);
    if (s.speak <= speakBase) fail(failures, 'cancel: no second line for the hidden tab');
    before = s.cancel;
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(250);
    s = await readSpy(page);
    if (s.cancel <= before) fail(failures, 'cancel: hidden tab', `${before} -> ${s.cancel}`);
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await ctx.close();
  }

  /* skip (tour) cancels */
  {
    const { ctx, page } = await openPage(browser, rel, vp, {});
    await fastSpeech(page);
    await page.click('.footer__sound');            /* off -> blips */
    await page.click('.footer__sound');            /* blips -> voice (chosen) */
    await page.waitForTimeout(200);
    const started = await page.waitForSelector('.guide__offer:not([hidden]) [data-tour-start]',
      { timeout: 9000 }).catch(() => null);
    if (!started) fail(failures, 'cancel/skip: offer never appeared');
    else {
      /* the first-visit offer IS the current line — start from it */
      await page.click('.guide__offer [data-tour-start]');
      let s = await waitForSpeech(page, 0, 9000);
      if (s.speak === 0) fail(failures, 'cancel/skip: the tour never spoke');
      const before = s.cancel;
      await page.click('[data-tour-skip]');
      await page.waitForTimeout(300);
      s = await readSpy(page);
      if (s.cancel <= before) fail(failures, 'cancel: skip tour', `${before} -> ${s.cancel}`);
      const touring = await page.evaluate(() => document.querySelector('#guide').hasAttribute('data-tour'));
      if (touring) fail(failures, 'cancel: skip left the tour running');
    }
    await ctx.close();
  }
}

/* ---------------------------------------------------------------- 3 -- */
/* the tour: 7 steps in order, captions equal data.js, scroll targets,
   Prev / Next / Skip / keyboard, pause on manual scroll, auto-advance */

async function checkTour(browser, failures) {
  const vp = { name: '1440', width: 1440, height: 900 };
  const rel = 'index.html';
  const { ctx, page, errors } = await openPage(browser, rel, vp, {});

  const data = await page.evaluate(() => {
    const av = window.PORTFOLIO.avatar;
    return { tour: av.tour, advance: av.thresholds.tourAdvanceMs, speechCps: av.thresholds.speechCps };
  });

  /* measure the default reading pace on the offer line (about 15 cps) */
  const offer = await page.evaluate(() => window.PORTFOLIO.avatar.lines.tourOffer);
  const t0 = Date.now();
  const offerShown = await waitForCaption(page, offer, 8000);
  const took = Date.now() - t0;
  if (offerShown !== offer) fail(failures, 'tour: offer caption', `got "${offerShown}"`);
  const want = (offer.length / data.speechCps) * 1000;
  if (took < want * 0.5 || took > want * 2.2) {
    fail(failures, 'tour: reading pace', `${offer.length} chars took ${took}ms, expected ~${Math.round(want)}ms`);
  }

  await fastSpeech(page);

  /* start via the offer button (the gesture) */
  const startBtn = await page.$('.guide__offer [data-tour-start]');
  if (!startBtn) fail(failures, 'tour: Start tour button missing');
  else {
    try { await startBtn.click({ timeout: 6000 }); }
    catch (e) { fail(failures, 'tour: Start tour not clickable'); }
  }
  await page.waitForTimeout(500);

  /* starting the tour is the gesture that turns blips on */
  const soundLabel = await page.evaluate(() => document.querySelector('.footer__sound').textContent.trim());
  if (soundLabel !== 'Sound: blips') fail(failures, 'tour: did not enable blips', soundLabel);
  const touring = await page.evaluate(() => document.querySelector('#guide').hasAttribute('data-tour'));
  if (!touring) fail(failures, 'tour: data-tour not set');
  const role = await page.evaluate(() => document.querySelector('.guide__bubble').getAttribute('role'));
  if (role !== 'status') fail(failures, 'tour: bubble role', String(role));

  /* walk all 7 with Next, asserting order, caption and scroll target */
  for (let i = 0; i < data.tour.length; i++) {
    const step = data.tour[i];
    const counter = await page.evaluate(() => document.querySelector('[data-tour-count]').textContent.trim());
    if (counter !== `${i + 1}/${data.tour.length}`) {
      fail(failures, `tour step ${i + 1} counter`, counter);
    }
    const shown = await waitForCaption(page, step.line, 12000);
    if (shown !== step.line) {
      fail(failures, `tour step ${i + 1} caption`, `got "${shown.slice(0, 60)}" want "${step.line.slice(0, 60)}"`);
    }
    /* the step's target is actually on screen */
    const inView = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
    }, step.target);
    if (!inView) fail(failures, `tour step ${i + 1} scroll`, `${step.target} not in view`);

    if (i < data.tour.length - 1) {
      await tourClick(page, failures, `Next from step ${i + 1}`, '[data-tour-next]');
      await page.waitForTimeout(400);
    }
  }

  /* Prev steps back */
  await tourClick(page, failures, 'Prev', '[data-tour-prev]');
  await page.waitForTimeout(500);
  let counter = await page.evaluate(() => document.querySelector('[data-tour-count]').textContent.trim());
  if (counter !== `${data.tour.length - 1}/${data.tour.length}`) fail(failures, 'tour: Prev', counter);

  /* keyboard: ArrowLeft back one more, ArrowRight forward again */
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(500);
  counter = await page.evaluate(() => document.querySelector('[data-tour-count]').textContent.trim());
  if (counter !== `${data.tour.length - 2}/${data.tour.length}`) fail(failures, 'tour: ArrowLeft', counter);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(500);
  counter = await page.evaluate(() => document.querySelector('[data-tour-count]').textContent.trim());
  if (counter !== `${data.tour.length - 1}/${data.tour.length}`) fail(failures, 'tour: ArrowRight', counter);

  /* a manual wheel scroll pauses auto-advance and says so */
  await tourClick(page, failures, 'Next to the last step', '[data-tour-next]');
  await page.waitForTimeout(400);
  await page.mouse.move(700, 400);
  await page.mouse.wheel(0, 160);
  await page.waitForTimeout(300);
  const paused = await page.evaluate(() => {
    const p = document.querySelector('[data-tour-paused]');
    return p && !p.hidden;
  });
  if (!paused) fail(failures, 'tour: manual scroll did not show "Paused"');
  const c1 = await page.evaluate(() => document.querySelector('[data-tour-count]').textContent.trim());
  await page.waitForTimeout(2600);
  const c2 = await page.evaluate(() => document.querySelector('[data-tour-count]').textContent.trim());
  if (c1 !== c2) fail(failures, 'tour: paused tour still auto-advanced', `${c1} -> ${c2}`);

  /* Next still works while paused */
  await tourClick(page, failures, 'Next while paused', '[data-tour-next]');
  await page.waitForTimeout(400);
  const ended = await page.evaluate(() => !document.querySelector('#guide').hasAttribute('data-tour'));
  if (!ended) fail(failures, 'tour: Next on the last step did not end it');
  const controlsHidden = await page.evaluate(() => document.querySelector('.guide__controls').hidden);
  if (!controlsHidden) fail(failures, 'tour: controls still shown after the end');
  const roleAfter = await page.evaluate(() => document.querySelector('.guide__bubble').getAttribute('role'));
  if (roleAfter !== null) fail(failures, 'tour: role=status left behind', String(roleAfter));

  /* auto-advance + Escape on a fresh run */
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  /* the offer only shows on a first visit — start from the footer link */
  await page.evaluate(() => document.querySelector('[data-tour-link]').click());
  await page.waitForTimeout(600);
  const running = await page.evaluate(() => document.querySelector('#guide').hasAttribute('data-tour'));
  if (!running) fail(failures, 'tour: footer link did not start it');
  const a1 = await page.evaluate(() => document.querySelector('[data-tour-count]').textContent.trim());
  /* wait for step 1 to finish speaking + the auto-advance delay */
  const tAuto = Date.now();
  let a2 = a1;
  while (a2 === a1 && Date.now() - tAuto < 25000) {
    await page.waitForTimeout(300);
    a2 = await page.evaluate(() => document.querySelector('[data-tour-count]').textContent.trim());
  }
  if (a2 === a1) fail(failures, 'tour: no auto-advance after the speech', a1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const afterEsc = await page.evaluate(() => document.querySelector('#guide').hasAttribute('data-tour'));
  if (afterEsc) fail(failures, 'tour: Escape did not stop it');

  if (errors.length) fail(failures, 'tour console errors', errors.join(' | '));
  await ctx.close();
}

/* ---------------------------------------------------------------- 4 -- */
/* mobile sheet at 390 and 360 */

async function checkSheet(browser, failures) {
  for (const vp of [{ name: '390', width: 390, height: 844 }, { name: '360', width: 360, height: 740 }]) {
    const { ctx, page, errors } = await openPage(browser, 'index.html', vp, { touch: true });
    await fastSpeech(page);
    await page.evaluate(() => document.querySelector('[data-tour-link]').click());
    await page.waitForTimeout(900);
    const m = await page.evaluate(() => {
      const g = document.querySelector('#guide');
      const s = g.getBoundingClientRect();
      const h = document.querySelector('.header').getBoundingClientRect();
      const st = document.querySelector('.guide__stage').getBoundingClientRect();
      const b = document.querySelector('.guide__bubble');
      return {
        touring: g.hasAttribute('data-tour'),
        l: Math.round(s.left), r: Math.round(s.right), t: Math.round(s.top), b: Math.round(s.bottom),
        headerBottom: Math.round(h.bottom),
        stageW: Math.round(st.width),
        hScroll: document.documentElement.scrollWidth - window.innerWidth,
        bodyScroll: document.body.scrollWidth - window.innerWidth,
        controls: !document.querySelector('.guide__controls').hidden,
        role: b.getAttribute('role'),
        text: document.querySelector('.guide__bubble-text').textContent,
        suppressed: g.getAttribute('data-suppressed')
      };
    });
    const tag = `sheet ${vp.name}`;
    if (!m.touring) fail(failures, `${tag}: tour not running`);
    if (m.l > 1 || m.r < vp.width - 1) fail(failures, `${tag}: not full width`, `${m.l}..${m.r} of ${vp.width}`);
    if (m.t < m.headerBottom) fail(failures, `${tag}: covers the header`, `sheet top ${m.t} < header ${m.headerBottom}`);
    if (Math.abs(m.stageW - 70) > 2) fail(failures, `${tag}: avatar width`, String(m.stageW));
    if (m.hScroll > 1 || m.bodyScroll > 1) fail(failures, `${tag}: horizontal scroll`, `${m.hScroll}/${m.bodyScroll}`);
    if (!m.controls) fail(failures, `${tag}: controls hidden`);
    if (m.role !== 'status') fail(failures, `${tag}: role`, String(m.role));
    if (!m.text) fail(failures, `${tag}: no caption`);
    if (m.suppressed) fail(failures, `${tag}: suppressed`, String(m.suppressed));

    /* the sheet really is at the bottom and its controls are clickable */
    const clicked = await page.evaluate(() => {
      const b = document.querySelector('[data-tour-next]');
      if (!b) return false;
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
    });
    if (!clicked) fail(failures, `${tag}: Next not reachable`);

    if (errors.length) fail(failures, `${tag} console errors`, errors.join(' | '));
    await ctx.close();
  }
}

/* ---------------------------------------------------------------- 5 -- */
/* page narration (D) + the contact copy bubble */

async function checkNarration(browser, failures) {
  const vp = { name: '1440', width: 1440, height: 900 };
  const pages = ['about', 'experience', 'skills', 'certificates', 'resume', 'github', 'contact', 'services'];
  for (const slug of pages) {
    const { ctx, page, errors } = await openPage(browser, slug + '.html', vp, { seen: true });
    const want = await page.evaluate((s) => (window.PORTFOLIO.avatar.pageLines || {})[s], slug);
    const got = await waitForCaption(page, want, 16000);
    if (got !== want) fail(failures, `narration ${slug}`, `got "${got}" want "${want}"`);
    if (errors.length) fail(failures, `narration ${slug} console errors`, errors.join(' | '));
    await ctx.close();
    process.stdout.write('.');
  }
  console.log('');

  /* once per page visit: dismissed, it must not come back on its own */
  {
    const { ctx, page } = await openPage(browser, 'about.html', vp, { seen: true });
    const want = await page.evaluate(() => window.PORTFOLIO.avatar.pageLines.about);
    const got = await waitForCaption(page, want, 16000);
    if (got !== want) fail(failures, 'narration once: never showed', `got "${got}"`);
    await dismissLine(page);
    await page.waitForTimeout(1800);
    const again = await caption(page);
    if (again === want) fail(failures, 'narration once: came back', again);
    await ctx.close();
  }

  /* the contact bubble copies the email and says so */
  {
    const { ctx, page, errors } = await openPage(browser, 'contact.html', vp, { seen: true });
    const line = await page.evaluate(() => window.PORTFOLIO.avatar.pageLines.contact);
    const shown = await waitForCaption(page, line, 16000);
    if (shown !== line) fail(failures, 'copy: narration never showed', `got "${shown}"`);
    const copied = await page.evaluate(() => window.PORTFOLIO.avatar.lines.copied);
    await page.evaluate(() => document.querySelector('.guide__bubble').click());
    const got = await waitForCaption(page, copied, 6000);
    if (got !== copied) fail(failures, 'copy: contact bubble', `got "${got}" want "${copied}"`);
    if (errors.length) fail(failures, 'copy console errors', errors.join(' | '));
    await ctx.close();
  }
}

/* ---------------------------------------------------------------- 6 -- */
/* reduced motion: instant text, no movement */

async function checkReducedMotion(browser, failures) {
  const vp = { name: '1440', width: 1440, height: 900 };
  const { ctx, page, errors } = await openPage(browser, 'index.html', vp, { seen: true, reduced: true });
  const line = await page.evaluate(() => window.PORTFOLIO.avatar.lines.returning);
  const t0 = Date.now();
  const got = await waitForCaption(page, line, 6000);
  const took = Date.now() - t0;
  if (got !== line) fail(failures, 'reduced: caption', `got "${got}"`);
  if (took > 900) fail(failures, 'reduced: text not instant', `${took}ms`);

  const still = await page.evaluate(async () => {
    const g = document.querySelector('#guide');
    const head = document.querySelector('#av-head');
    const tf0 = g.style.transform;
    const h0 = head.style.transform;
    const mouth0 = g.getAttribute('data-mouth');
    await new Promise((r) => setTimeout(r, 600));
    return { g0: tf0, g1: g.style.transform, h0, h1: head.style.transform,
             m0: mouth0, m1: g.getAttribute('data-mouth') };
  });
  if (still.g0 !== still.g1) fail(failures, 'reduced: guide moved', `${still.g0} -> ${still.g1}`);
  if (still.h0 !== still.h1) fail(failures, 'reduced: head moved', `${still.h0} -> ${still.h1}`);
  if (still.m1 !== null) fail(failures, 'reduced: mouth animated', String(still.m1));
  if (errors.length) fail(failures, 'reduced console errors', errors.join(' | '));
  await ctx.close();
}

/* ---------------------------------------------------------------- 7 -- */
/* the phone sheet (<=600px): page narration + section lines move into
   the tour's bottom sheet instead of being suppressed for length. */

async function sheetState(page) {
  return page.evaluate(() => {
    const g = document.querySelector('#guide');
    if (!g) return { missing: true };
    const b = document.querySelector('.guide__bubble');
    const t = document.querySelector('.guide__bubble-text');
    const st = document.querySelector('.guide__stage');
    const h = document.querySelector('.header');
    const cs = getComputedStyle(g);
    const r = g.getBoundingClientRect();
    const hr = h ? h.getBoundingClientRect() : { bottom: 0 };
    const str = st ? st.getBoundingClientRect() : { width: 0 };
    const ctrl = document.querySelector('.guide__controls');
    return {
      sheet: g.hasAttribute('data-sheet'),
      visible: cs.visibility === 'visible' && cs.display !== 'none',
      open: !!(b && b.hasAttribute('data-open')),
      text: t ? t.textContent : '',
      left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top),
      headerBottom: Math.round(hr.bottom),
      stageW: Math.round(str.width),
      hScroll: document.documentElement.scrollWidth - window.innerWidth,
      controls: ctrl ? !ctrl.hidden : false,
      bubble: b ? (function () {
        const br = b.getBoundingClientRect();
        return { cx: Math.round(br.left + br.width / 2), cy: Math.round(br.top + br.height / 2) };
      })() : null
    };
  });
}

async function waitForSheetText(page, expected, ms) {
  const t0 = Date.now();
  let s = await sheetState(page);
  while (Date.now() - t0 < ms) {
    if (s.sheet && s.visible && s.text === expected) return { state: s, at: Date.now() - t0 };
    await page.waitForTimeout(120);
    s = await sheetState(page);
  }
  return { state: s, at: -1 };
}

async function waitForSheetGone(page, ms) {
  const t0 = Date.now();
  let s = await sheetState(page);
  while (Date.now() - t0 < ms) {
    if (!s.sheet || !s.visible) return Date.now() - t0;
    await page.waitForTimeout(120);
    s = await sheetState(page);
  }
  return -1;
}

function checkSheetGeometry(failures, tag, s, vp) {
  if (s.left > 1 || s.right < vp.width - 1) {
    fail(failures, `${tag}: sheet not full width`, `${s.left}..${s.right} of ${vp.width}`);
  }
  if (s.top < s.headerBottom) {
    fail(failures, `${tag}: sheet covers the header`, `top ${s.top} < header ${s.headerBottom}`);
  }
  if (s.hScroll > 1) fail(failures, `${tag}: horizontal scroll`, `+${s.hScroll}px`);
  if (Math.abs(s.stageW - 70) > 2) fail(failures, `${tag}: avatar width`, String(s.stageW));
  if (s.controls) fail(failures, `${tag}: tour controls shown outside the tour`);
}

async function checkPhoneSheet(browser, failures) {
  for (const vp of [{ name: '390', width: 390, height: 844 }, { name: '360', width: 360, height: 740 }]) {
    /* ---- A. page narration lands in the sheet, then dismisses ---- */
    {
      const tag = `sheet ${vp.name} narration`;
      const { ctx, page, errors } = await openPage(browser, 'about.html', vp, { seen: true, touch: true });
      await fastSpeech(page);
      const want = await page.evaluate(() => window.PORTFOLIO.avatar.pageLines.about);
      const cps = await page.evaluate(() => window.PORTFOLIO.avatar.thresholds.speechCps);
      if (want.length <= 30) fail(failures, `${tag}: test line is not long enough to prove the rule`, want);

      const found = await waitForSheetText(page, want, 9000);
      if (found.at < 0) {
        fail(failures, `${tag}: sheet text`,
             `got sheet=${found.state.sheet} "${found.state.text}" want "${want}"`);
      } else {
        checkSheetGeometry(failures, tag, found.state, vp);
        /* auto-dismiss: the text's reading time plus 2s */
        const expected = Math.round(want.length / cps * 1000) + 2000;
        const showAt = Date.now() - found.at;
        const goneIn = await waitForSheetGone(page, expected + 5000);
        const lived = goneIn < 0 ? Infinity : (Date.now() - showAt);
        if (lived < expected - 700) {
          fail(failures, `${tag}: dismissed too early`, `${lived}ms < ~${expected}ms`);
        } else if (lived > expected + 3000) {
          fail(failures, `${tag}: did not auto-dismiss`, `${lived}ms > ~${expected}ms`);
        }
      }
      if (errors.length) fail(failures, `${tag} console errors`, errors.join(' | '));
      await ctx.close();
      process.stdout.write('.');
    }

    /* ---- B. a section line: sheet text, tap to dismiss, no repeat ---- */
    {
      const tag = `sheet ${vp.name} section`;
      const { ctx, page, errors } = await openPage(browser, 'index.html', vp, { seen: true, touch: true });
      await fastSpeech(page);
      const work = await page.evaluate(() => window.PORTFOLIO.avatar.lines.work);
      const stmt = await page.evaluate(() => window.PORTFOLIO.avatar.lines.statement);
      if (work.length <= 30) fail(failures, `${tag}: test line is not long enough`, work);

      await page.evaluate(() => document.querySelector('.selected-work').scrollIntoView({ block: 'center' }));
      let found = await waitForSheetText(page, work, 8000);
      if (found.at < 0) {
        fail(failures, `${tag}: section text in sheet`, `got "${found.state.text}" want "${work}"`);
      } else {
        checkSheetGeometry(failures, tag, found.state, vp);

        /* tap the sheet where its caption sits */
        const bc = found.state.bubble;
        if (!bc) fail(failures, `${tag}: sheet has no caption box`);
        else await page.mouse.click(bc.cx, bc.cy);
        const goneIn = await waitForSheetGone(page, 2500);
        if (goneIn < 0) fail(failures, `${tag}: tap did not dismiss the sheet`);

        /* a different section shows its own line … */
        await page.evaluate(() => document.querySelector('.statement').scrollIntoView({ block: 'center' }));
        found = await waitForSheetText(page, stmt, 8000);
        if (found.at < 0) {
          fail(failures, `${tag}: second section text`, `got "${found.state.text}" want "${stmt}"`);
        } else {
          /* … and auto-dismisses … */
          const cps2 = await page.evaluate(() => window.PORTFOLIO.avatar.thresholds.speechCps);
          const expected = Math.round(stmt.length / cps2 * 1000) + 2000;
          if (await waitForSheetGone(page, expected + 5000) < 0) {
            fail(failures, `${tag}: second sheet did not auto-dismiss`);
          }
          /* … and coming back does not repeat it */
          await page.evaluate(() => document.querySelector('.selected-work').scrollIntoView({ block: 'center' }));
          await page.waitForTimeout(1600);
          const after = await sheetState(page);
          if (after.sheet && after.visible) {
            fail(failures, `${tag}: line repeated on the same visit`, `"${after.text}"`);
          }
        }
      }
      if (errors.length) fail(failures, `${tag} console errors`, errors.join(' | '));
      await ctx.close();
      process.stdout.write('.');
    }

    /* ---- C. the menu overlay: dismisses, and drops what arrives ---- */
    {
      const tag = `sheet ${vp.name} menu`;
      const { ctx, page, errors } = await openPage(browser, 'index.html', vp, { seen: true, touch: true });
      await fastSpeech(page);
      const work = await page.evaluate(() => window.PORTFOLIO.avatar.lines.work);
      const stmt = await page.evaluate(() => window.PORTFOLIO.avatar.lines.statement);

      /* showing, then the menu opens → gone */
      await page.evaluate(() => document.querySelector('.selected-work').scrollIntoView({ block: 'center' }));
      const found = await waitForSheetText(page, work, 8000);
      if (found.at < 0) fail(failures, `${tag}: sheet never showed`, `"${found.state.text}"`);
      const before = await sheetState(page);
      if (!before.sheet || !before.visible) fail(failures, `${tag}: sheet vanished before the menu`);
      await page.click('.header__menu-button');
      if (await waitForSheetGone(page, 2500) < 0) fail(failures, `${tag}: menu did not clear the sheet`);
      await page.click('.header__menu-button');            /* close again */
      await page.waitForTimeout(600);
      const afterClose = await sheetState(page);
      if (afterClose.sheet && afterClose.visible) {
        fail(failures, `${tag}: sheet came back under the closed menu`, `"${afterClose.text}"`);
      }

      /* with the overlay present, a new line must not show at all */
      await page.evaluate(() => document.documentElement.classList.add('menu-open'));
      await page.waitForTimeout(150);
      await page.evaluate(() => document.querySelector('.statement').scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(2000);
      const dropped = await sheetState(page);
      if (dropped.sheet) fail(failures, `${tag}: line showed under the overlay`, `"${dropped.text}"`);
      await page.evaluate(() => document.documentElement.classList.remove('menu-open'));
      await page.waitForTimeout(500);
      const settled = await sheetState(page);
      if (settled.sheet && settled.visible) {
        fail(failures, `${tag}: dropped line appeared after the overlay`, `"${settled.text}"`);
      }
      if (stmt && settled.text === stmt && settled.sheet) {
        fail(failures, `${tag}: statement line leaked through the overlay`);
      }
      if (errors.length) fail(failures, `${tag} console errors`, errors.join(' | '));
      await ctx.close();
      process.stdout.write('.');
    }

    /* ---- D. the certificate dialog clears the sheet too ---- */
    {
      const tag = `sheet ${vp.name} dialog`;
      const { ctx, page, errors } = await openPage(browser, 'certificates.html', vp, { seen: true, touch: true });
      const want = await page.evaluate(() => window.PORTFOLIO.avatar.pageLines.certificates);
      const found = await waitForSheetText(page, want, 9000);
      if (found.at < 0) {
        fail(failures, `${tag}: sheet text`, `got "${found.state.text}" want "${want}"`);
      } else {
        checkSheetGeometry(failures, tag, found.state, vp);
        await page.evaluate(() => {
          const c = document.querySelector('[data-cert]');
          if (c) c.scrollIntoView({ block: 'center' });
        });
        await page.waitForTimeout(300);
        const still = await sheetState(page);
        if (!still.sheet || !still.visible) fail(failures, `${tag}: sheet vanished before the dialog`);
        const clicked = await page.$('[data-cert]');
        if (!clicked) fail(failures, `${tag}: no certificate card`);
        else {
          try { await clicked.click({ timeout: 6000 }); }
          catch (e) { fail(failures, `${tag}: certificate card not clickable`); }
          if (await waitForSheetGone(page, 2500) < 0) {
            fail(failures, `${tag}: dialog did not clear the sheet`);
          }
          const open = await page.evaluate(() => !!document.querySelector('dialog[open]'));
          if (!open) fail(failures, `${tag}: dialog never opened`);
        }
      }
      if (errors.length) fail(failures, `${tag} console errors`, errors.join(' | '));
      await ctx.close();
      process.stdout.write('.');
    }
  }
  console.log('');
}

/* ------------------------------------------------------------- driver -- */

async function main() {
  const failures = [];
  const browser = await chromium.launch();

  console.log('sound…');
  await checkSound(browser, failures);
  console.log('cancel…');
  await checkCancel(browser, failures);
  if (!QUICK) {
    console.log('tour…');
    await checkTour(browser, failures);
  }
  console.log('sheet…');
  await checkSheet(browser, failures);
  console.log('phone sheet (narration + sections)…');
  await checkPhoneSheet(browser, failures);
  console.log('narration…');
  await checkNarration(browser, failures);
  console.log('reduced…');
  await checkReducedMotion(browser, failures);

  await browser.close();
  console.log('');
  if (failures.length) {
    console.log(`FAILURES (${failures.length}):`);
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
  console.log('ALL CHECKS PASSED');
}

main().catch((e) => { console.error(e); process.exit(1); });
