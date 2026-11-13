/* Verify the guide avatar across every page at 1440 / 768 / 390.
   Usage: node tools/verify_guide.js [--quick]
   --quick  only index.html + one work page + contact.html */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const QUICK = process.argv.includes('--quick');

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 }
];

function listPages(dir, prefix, out) {
  fs.readdirSync(dir).forEach((name) => {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (name === 'assets' || name === 'tools') return;
      listPages(full, prefix + name + '/', out);
    } else if (name.endsWith('.html')) {
      out.push(prefix + name);
    }
  });
  return out;
}

const PAGES = listPages(ROOT, '', []).sort();
const TARGET = QUICK
  ? PAGES.filter((p) => ['index.html', 'contact.html', 'work/v4startup.html', 'certificates.html'].includes(p))
  : PAGES;

const fileUrl = (rel) => 'file:///' + path.join(ROOT, rel).replace(/\\/g, '/');
const fail = (list, rel, vp, check, detail) =>
  list.push(`[${vp}] ${rel} :: ${check}${detail ? ' — ' + detail : ''}`);

async function waitForIntro(page) {
  try {
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intro'), null, {
      timeout: 9000
    });
  } catch (e) { /* intro never ran */ }
}

async function openPage(browser, rel, vp, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    reducedMotion: opts.reduced ? 'reduce' : 'no-preference'
  });
  if (opts.blockAvatar) await ctx.route('**/js/avatar.js', (r) => r.abort());
  try {
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'file://' });
  } catch (e) { /* file:// origins may refuse — the fallback path covers it */ }
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(fileUrl(rel), { waitUntil: 'load' });
  await waitForIntro(page);
  return { ctx, page, errors };
}

/* ---------------------------------------------------------------- basics */

async function checkBasics(page, rel, vp, errors, failures) {
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    const g = document.querySelector('.guide');
    const stage = document.querySelector('.guide__stage');
    const toggle = document.querySelector('.guide__toggle');
    const img = document.querySelector('.guide__img');
    const head = document.querySelector('.header');
    const menu = document.querySelector('#site-menu');
    const rect = (el) => (el ? el.getBoundingClientRect() : null);
    const overlap = (a, b) =>
      a && b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    const gr = rect(g);
    return {
      hasGuide: !!g,
      hScroll: doc.scrollWidth - window.innerWidth,
      bodyScroll: document.body.scrollWidth - window.innerWidth,
      zGuide: g ? getComputedStyle(g).zIndex : null,
      zMenu: menu ? getComputedStyle(menu).zIndex : null,
      zHeader: head ? getComputedStyle(head).zIndex : null,
      zTransition: (() => {
        const t = document.querySelector('.transition');
        return t ? getComputedStyle(t).zIndex : null;
      })(),
      zCursor: (() => {
        const c = document.querySelector('.cursor-ring');
        return c ? getComputedStyle(c).zIndex : null;
      })(),
      perspective: g ? getComputedStyle(g).perspective : null,
      /* layout box: transforms (the 3D follow) do not affect it */
      stageBox: stage ? { width: stage.offsetWidth, height: stage.offsetHeight } : null,
      toggleBox: rect(toggle),
      imgLoaded: !!(img && img.complete && img.naturalWidth > 0),
      imgNatural: img ? [img.naturalWidth, img.naturalHeight] : null,
      imageRendering: img ? getComputedStyle(img).imageRendering : null,
      guideHidden: g ? getComputedStyle(g).visibility !== 'visible' : null,
      headerOverlap: overlap(gr, rect(head)),
      pointerNone: g ? getComputedStyle(g).pointerEvents === 'none' : null,
      bubblePointer: (() => {
        const b = document.querySelector('.guide__bubble');
        return b ? getComputedStyle(b).pointerEvents : null;
      })(),
      ariaHiddenStage: stage ? stage.getAttribute('aria-hidden') : null,
      bubbleLive: (() => {
        const b = document.querySelector('.guide__bubble');
        return b ? b.getAttribute('aria-live') : null;
      })()
    };
  });

  if (!m.hasGuide) { fail(failures, rel, vp, 'guide markup missing'); return m; }
  if (m.hScroll > 1) fail(failures, rel, vp, 'horizontal scroll', `+${m.hScroll}px`);
  if (m.bodyScroll > 1) fail(failures, rel, vp, 'body horizontal scroll', `+${m.bodyScroll}px`);
  if (!m.imgLoaded) fail(failures, rel, vp, 'avatar image not loaded', JSON.stringify(m.imgNatural));
  if (m.imageRendering !== 'pixelated') fail(failures, rel, vp, 'image-rendering', m.imageRendering);
  if (m.pointerNone !== true) fail(failures, rel, vp, 'container pointer-events', m.pointerNone);
  if (m.bubblePointer !== 'auto') fail(failures, rel, vp, 'bubble pointer-events', m.bubblePointer);
  if (m.ariaHiddenStage !== 'true') fail(failures, rel, vp, 'avatar aria-hidden', String(m.ariaHiddenStage));
  if (m.bubbleLive !== null) fail(failures, rel, vp, 'bubble must not be aria-live', m.bubbleLive);
  if (m.headerOverlap) fail(failures, rel, vp, 'overlaps the header');
  const zG = parseInt(m.zGuide, 10), zM = parseInt(m.zMenu, 10), zH = parseInt(m.zHeader, 10);
  if (!(zG < zM && zG < zH)) fail(failures, rel, vp, 'z-index order', `guide ${m.zGuide}, menu ${m.zMenu}, header ${m.zHeader}`);
  if (!(zG < m.zTransition || m.zTransition === null)) {
    fail(failures, rel, vp, 'below the page transition', `guide ${m.zGuide}, transition ${m.zTransition}`);
  }
  if (!(zG < m.zCursor || m.zCursor === null)) {
    fail(failures, rel, vp, 'below the cursor', `guide ${m.zGuide}, cursor ${m.zCursor}`);
  }
  if (m.perspective !== '800px') fail(failures, rel, vp, 'perspective', m.perspective);

  /* avatar size: 160 desktop, 96 at 390 (vp is the viewport name) */
  const want = parseInt(vp, 10) <= 700 ? 96 : 160;
  if (m.stageBox && Math.abs(m.stageBox.width - want) > 1) {
    fail(failures, rel, vp, 'avatar width', `${m.stageBox.width} (want ${want})`);
  }
  if (m.stageBox && Math.abs(m.stageBox.height - want * 1.25) > 1) {
    fail(failures, rel, vp, 'avatar height (4:5)', `${m.stageBox.height}`);
  }
  if (m.toggleBox && m.toggleBox.height < 24) {
    fail(failures, rel, vp, 'toggle tap target too small', `${m.toggleBox.height}px`);
  }
  return m;
}

/* ------------------------------------------------- footer / tap targets */

async function checkFooter(page, rel, vp, failures) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(900);
  const m = await page.evaluate(() => {
    const g = document.querySelector('.guide');
    const gr = g.getBoundingClientRect();
    const overlap = (a, b) =>
      !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    const targets = [...document.querySelectorAll('.footer a, .footer button')];
    const covered = targets
      .filter((el) => overlap(gr, el.getBoundingClientRect()))
      .map((el) => (el.textContent || '').trim().slice(0, 24) + '|' + el.className);
    const unreachable = [];
    const probe = (el) => {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) return;
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) {
        unreachable.push((el.textContent || '').trim().slice(0, 24) + ' -> ' +
          (hit ? hit.className || hit.tagName : 'null'));
      }
    };
    targets.forEach(probe);
    const toggle = document.querySelector('.guide__toggle');
    if (toggle) {
      const b = toggle.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      if (hit !== toggle) unreachable.push('toggle blocked by ' + (hit ? hit.className : 'null'));
    }
    return {
      covered,
      unreachable,
      guideBox: { top: Math.round(gr.top), bottom: Math.round(gr.bottom), left: Math.round(gr.left) },
      footerTop: Math.round(document.querySelector('.footer').getBoundingClientRect().top),
      vh: window.innerHeight
    };
  });
  if (m.covered.length) fail(failures, rel, vp, 'guide covers footer links/buttons', m.covered.join(', '));
  if (m.unreachable.length) fail(failures, rel, vp, 'tap target unreachable', m.unreachable.join(', '));
  /* the cluster must stay above the footer's content (its top padding
     is empty, so overlapping that band is allowed) */
  const padTop = await page.evaluate(() => {
    const f = document.querySelector('.footer');
    return Math.round(f.getBoundingClientRect().top + parseFloat(getComputedStyle(f).paddingTop));
  });
  if (m.guideBox.bottom > padTop) {
    fail(failures, rel, vp, 'sits on footer content',
      `guide.bottom ${m.guideBox.bottom} > footer content top ${padTop}`);
  }
  return m;
}

/* --------------------------------------------------------- interactions */

async function checkMenuAndDialog(page, rel, vp, failures) {
  const suppressed = await page.evaluate(() => {
    const g = document.querySelector('.guide');
    return g ? g.hasAttribute('data-suppressed') : null;
  });
  if (suppressed) fail(failures, rel, vp, 'guide suppressed with nothing open');

  const btn = await page.$('.header__menu-button');
  if (btn && await btn.isVisible()) {
    await btn.click();
    await page.waitForTimeout(400);
    const hid = await page.evaluate(() => {
      const g = document.querySelector('.guide');
      return g.hasAttribute('data-suppressed') && getComputedStyle(g).visibility === 'hidden';
    });
    if (!hid) fail(failures, rel, vp, 'guide visible while the menu overlay is open');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const back = await page.evaluate(() => !document.querySelector('.guide').hasAttribute('data-suppressed'));
    if (!back) fail(failures, rel, vp, 'guide stays hidden after the menu closes');
  }

  if (rel === 'certificates.html') {
    const card = await page.$('[data-cert]');
    if (card) {
      await card.click();
      await page.waitForTimeout(400);
      const hid = await page.evaluate(() => {
        const g = document.querySelector('.guide');
        const d = document.querySelector('dialog[open]');
        return !!d && g.hasAttribute('data-suppressed') && getComputedStyle(g).visibility === 'hidden';
      });
      if (!hid) fail(failures, rel, vp, 'guide visible while the certificate dialog is open');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  }
}

/* ------------------------------------------------------------ copy test
   A: the normal path (navigator.clipboard.writeText records the value)
   B: the API removed — the execCommand fallback must still confirm     */

async function copyFlow(page, rel, vpName, failures) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1200);
  const before = await page.evaluate(() => {
    const t = document.querySelector('.guide__bubble-text');
    return t ? t.textContent : '';
  });
  if (!/Write to me anytime/.test(before)) {
    fail(failures, rel, vpName, 'no email line at the footer', JSON.stringify(before));
    return false;
  }
  await page.click('.guide__bubble');
  let after = '';
  for (let i = 0; i < 15 && !/waiting\.$/.test(after); i++) {
    await page.waitForTimeout(300);
    after = await page.evaluate(() => document.querySelector('.guide__bubble-text').textContent);
  }
  if (!/Copied\. I’ll be waiting\.$/.test(after)) {
    fail(failures, rel, vpName, 'copy confirmation missing', JSON.stringify(after));
    return false;
  }
  return true;
}

async function checkCopyPaths(browser, rel, vpName, failures) {
  const vp = VIEWPORTS.find((v) => v.name === vpName);

  /* A — clipboard API present */
  const a = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  await a.addInitScript(() => {
    window.__copied = [];
    if (navigator.clipboard && navigator.clipboard.writeText) {
      const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = (t) => { window.__copied.push(t); return orig(t); };
    }
  });
  const pa = await a.newPage();
  const errA = [];
  pa.on('console', (m) => { if (m.type() === 'error') errA.push(m.text()); });
  pa.on('pageerror', (e) => errA.push('pageerror: ' + e.message));
  await pa.goto(fileUrl(rel), { waitUntil: 'load' });
  await waitForIntro(pa);
  await copyFlow(pa, rel, vpName, failures);
  const copied = await pa.evaluate(() => window.__copied);
  if (!copied.length || copied[0] !== 'ragulthedeveloper@gmail.com') {
    fail(failures, rel, vpName, 'writeText not called with the address', JSON.stringify(copied));
  }
  if (errA.length) fail(failures, rel, vpName, 'console errors', errA.join(' | '));
  await a.close();

  /* B — clipboard API unavailable */
  const b = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  await b.addInitScript(() => {
    try {
      Object.defineProperty(Navigator.prototype, 'clipboard', {
        get: () => undefined, configurable: true
      });
    } catch (e) { /* cannot remove — B then behaves like A */ }
  });
  const pb = await b.newPage();
  const errB = [];
  pb.on('console', (m) => { if (m.type() === 'error') errB.push(m.text()); });
  pb.on('pageerror', (e) => errB.push('pageerror: ' + e.message));
  await pb.goto(fileUrl(rel), { waitUntil: 'load' });
  await waitForIntro(pb);
  const hadApi = await pb.evaluate(() => !!(navigator.clipboard && navigator.clipboard.writeText));
  await copyFlow(pb, rel, vpName + '-fallback', failures);
  if (hadApi) fail(failures, rel, vpName, 'could not disable the clipboard API for the fallback test');
  if (errB.length) fail(failures, rel, vpName, 'console errors (fallback)', errB.join(' | '));
  await b.close();
}

/* ------------------------------------------------------ reduced motion */

async function checkReduced(browser, rel, failures) {
  const vp = { name: '390r', width: 390, height: 844 };
  const { ctx, page, errors } = await openPage(browser, rel, vp, { reduced: true });
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => {
    const stage = document.querySelector('.guide__stage');
    const text = document.querySelector('.guide__bubble-text');
    const sizer = document.querySelector('.guide__bubble-sizer');
    const bubble = document.querySelector('.guide__bubble');
    return {
      transform: stage.style.transform,
      fullText: text && sizer ? text.textContent === sizer.textContent : null,
      text: text ? text.textContent : '',
      open: bubble ? bubble.hasAttribute('data-open') : false,
      transition: getComputedStyle(bubble).transitionDuration
    };
  });
  if (m.transform !== '') fail(failures, rel, '390-rm', 'avatar is not static', JSON.stringify(m.transform));
  if (m.open && !m.fullText) fail(failures, rel, '390-rm', 'typewriter not instant', JSON.stringify(m.text));
  if (m.open && parseFloat(m.transition) > 0.01) {
    fail(failures, rel, '390-rm', 'bubble transition active', m.transition);
  }
  if (errors.length) fail(failures, rel, '390-rm', 'console errors', errors.join(' | '));
  await ctx.close();
}

/* --------------------------------------------------------- toggle test */

async function checkToggle(browser, rel, failures) {
  const vp = { name: '1440', width: 1440, height: 900 };
  const { ctx, page } = await openPage(browser, rel, vp, {});
  await page.waitForTimeout(600);
  await page.click('.guide__toggle');
  let st = await page.evaluate(() => ({
    off: document.querySelector('.guide').classList.contains('guide--off'),
    stored: (function () { try { return localStorage.getItem('guide:enabled'); } catch (e) { return 'ERR'; } })(),
    label: document.querySelector('.guide__toggle').textContent
  }));
  if (!st.off || st.stored !== '0') fail(failures, rel, '1440-toggle', 'off not persisted', JSON.stringify(st));
  if (st.label !== 'Guide: off') fail(failures, rel, '1440-toggle', 'label', st.label);
  await page.reload({ waitUntil: 'load' });
  await waitForIntro(page);
  await page.waitForTimeout(400);
  st = await page.evaluate(() => ({
    off: document.querySelector('.guide').classList.contains('guide--off'),
    label: document.querySelector('.guide__toggle').textContent
  }));
  if (!st.off) fail(failures, rel, '1440-toggle', 'off state lost after reload');
  await page.click('.guide__toggle');
  st = await page.evaluate(() => ({
    off: document.querySelector('.guide').classList.contains('guide--off'),
    stored: (function () { try { return localStorage.getItem('guide:enabled'); } catch (e) { return 'ERR'; } })(),
    label: document.querySelector('.guide__toggle').textContent
  }));
  if (st.off || st.stored !== '1') fail(failures, rel, '1440-toggle', 're-enable failed', JSON.stringify(st));
  await ctx.close();
}

/* -------------------------------------------------------- greeting test */

async function checkGreeting(browser, rel, failures) {
  const vp = { name: '1440', width: 1440, height: 900 };
  const { ctx, page, errors } = await openPage(browser, rel, vp, {});
  const getText = () => page.evaluate(() => {
    const t = document.querySelector('.guide__bubble-text');
    return t ? t.textContent : '';
  });
  let text = '';
  for (let i = 0; i < 30 && !/what I build\.$/.test(text); i++) {
    await page.waitForTimeout(300);
    text = await getText();
  }
  if (!/^Hi, I’m Ragul\./.test(text)) fail(failures, rel, '1440', 'first-visit hero line', JSON.stringify(text));
  await page.reload({ waitUntil: 'load' });
  await waitForIntro(page);
  text = '';
  for (let i = 0; i < 30 && !/left off\.$/.test(text); i++) {
    await page.waitForTimeout(300);
    text = await getText();
  }
  if (!/^Back again\?/.test(text)) fail(failures, rel, '1440', 'returning line', JSON.stringify(text));
  const seen = await page.evaluate(() => {
    try { return localStorage.getItem('guide:seen'); } catch (e) { return 'ERR'; }
  });
  if (seen !== '1') fail(failures, rel, '1440', 'guide:seen not stored', String(seen));
  if (errors.length) fail(failures, rel, '1440', 'console errors', errors.join(' | '));
  await ctx.close();
}

/* -------------------------------------------- follow / drag / sections */

async function checkInteractions(browser, failures) {
  const rel = 'index.html';
  const vp = { name: '1440', width: 1440, height: 900 };
  const { ctx, page, errors } = await openPage(browser, rel, vp, {});
  const bubbleText = () =>
    page.evaluate(() => {
      const t = document.querySelector('.guide__bubble-text');
      return t ? t.textContent : '';
    });

  /* wait for the greeting so the cluster is at its widest/tallest */
  let text = '';
  for (let i = 0; i < 30 && !/what I build\.$/.test(text); i++) {
    await page.waitForTimeout(300);
    text = await bubbleText();
  }
  if (!/^Hi, I’m Ragul\./.test(text)) fail(failures, rel, '1440', 'greeting missing', JSON.stringify(text));

  /* data-avatar-line wiring (selected work / statement / services / footer) */
  const tags = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('[data-avatar-line]').forEach((el) => {
      out[(el.className || el.tagName).split(' ')[0]] = el.getAttribute('data-avatar-line');
    });
    return out;
  });
  const want = { footer: 'footer', 'selected-work': 'work', statement: 'statement', 'service-tiles': 'services' };
  Object.keys(want).forEach((k) => {
    if (tags[k] !== want[k]) fail(failures, rel, '1440', `data-avatar-line on .${k}`, JSON.stringify(tags));
  });

  /* the hero CTA must stay clear even with the bubble open */
  const hero = await page.evaluate(() => {
    const btn = document.querySelector('.hero__button');
    const guide = document.querySelector('.guide');
    if (!btn || !guide) return null;
    const b = btn.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return { covered: !!(hit && guide.contains(hit)), at: Math.round(b.left) + ',' + Math.round(b.top) };
  });
  if (hero && hero.covered) fail(failures, rel, '1440', 'guide covers the hero CTA', hero.at);

  /* cursor follow: responds and stays inside rotateY 12 / rotateX 8 */
  await page.mouse.move(300, 180);
  await page.waitForTimeout(800);
  const tf = await page.evaluate(() => document.querySelector('.guide__stage').style.transform);
  const rot = /rotateX\((-?[\d.]+)deg\) rotateY\((-?[\d.]+)deg\)/.exec(tf);
  if (!rot) fail(failures, rel, '1440', 'no follow rotation', JSON.stringify(tf));
  else {
    const rx = Math.abs(parseFloat(rot[1]));
    const ry = Math.abs(parseFloat(rot[2]));
    if (rx > 8.01 || ry > 12.01) fail(failures, rel, '1440', 'rotation beyond limits', tf);
    if (rx < 0.5 || ry < 0.5) fail(failures, rel, '1440', 'no follow response', tf);
  }

  /* drag with pointer capture, spring back on release */
  const box = await page.locator('.guide__stage').boundingBox();
  if (!box) fail(failures, rel, '1440', 'stage has no box during drag test');
  else {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2 - 60, { steps: 10 });
    await page.waitForTimeout(150);
    const during = await page.evaluate(() => document.querySelector('.guide__stage').style.transform);
    const d = /translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(during);
    if (!d || Math.abs(parseFloat(d[1]) + 80) > 20) {
      fail(failures, rel, '1440', 'drag did not move the avatar', during);
    }
    await page.mouse.up();
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => document.querySelector('.guide__stage').style.transform);
    const a = /translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(after);
    if (!a) fail(failures, rel, '1440', 'transform lost after spring', after);
    else if (Math.abs(parseFloat(a[1])) > 7 || Math.abs(parseFloat(a[2])) > 5) {
      fail(failures, rel, '1440', 'did not spring back', after);
    }
  }

  /* section lines: selected work, statement, services */
  const sections = [
    ['.selected-work', /Stores, CRMs and billing software\./],
    ['.statement', /Dashboards for every role\./],
    ['.service-tiles', /That’s what I do\./]
  ];
  for (const [sel, re] of sections) {
    await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (el) el.scrollIntoView({ block: 'center' });
    }, sel);
    let line = '';
    for (let i = 0; i < 20 && !re.test(line); i++) {
      await page.waitForTimeout(300);
      line = await bubbleText();
    }
    if (!re.test(line)) fail(failures, rel, '1440', `section line for ${sel}`, JSON.stringify(line));
  }

  if (errors.length) fail(failures, rel, '1440', 'console errors', errors.join(' | '));
  await ctx.close();
}

/* ------------------------------------- touch sway + html[data-motion=off] */

async function checkTouchSway(browser, failures) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(fileUrl('index.html'), { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intro'), null, { timeout: 9000 });
  } catch (e) {}
  await page.waitForTimeout(1500);
  const t1 = await page.evaluate(() => document.querySelector('.guide__stage').style.transform);
  await page.waitForTimeout(800);
  const t2 = await page.evaluate(() => document.querySelector('.guide__stage').style.transform);
  if (!/rotateX\(-?[\d.]+deg\) rotateY\(-?[\d.]+deg\)/.test(t1)) {
    fail(failures, 'index.html', '390-touch', 'no idle sway on touch', JSON.stringify(t1));
  }
  if (t1 === t2) fail(failures, 'index.html', '390-touch', 'sway is not animating', JSON.stringify(t1));
  if (errors.length) fail(failures, 'index.html', '390-touch', 'console errors', errors.join(' | '));
  await ctx.close();
}

async function checkMotionOff(browser, failures) {
  const vp = { name: '1440', width: 1440, height: 900 };
  const { ctx, page, errors } = await openPage(browser, 'index.html', vp, {});
  await page.mouse.move(300, 200);
  await page.waitForTimeout(900);
  const on = await page.evaluate(() => document.querySelector('.guide__stage').style.transform);
  if (!/rotateX/.test(on)) fail(failures, 'index.html', '1440-motion', 'follow not running before the switch', JSON.stringify(on));

  await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'off'));
  await page.waitForTimeout(600);
  const off = await page.evaluate(() => ({
    transform: document.querySelector('.guide__stage').style.transform,
    text: document.querySelector('.guide__bubble-text').textContent,
    sizer: document.querySelector('.guide__bubble-sizer').textContent
  }));
  if (off.transform !== '') fail(failures, 'index.html', '1440-motion', 'avatar not static with data-motion=off', JSON.stringify(off.transform));

  /* a line triggered after the switch must appear in full (no typewriter) */
  await page.evaluate(() => {
    const el = document.querySelector('.statement');
    if (el) el.scrollIntoView({ block: 'center' });
  });
  let cmp = null;
  for (let i = 0; i < 25 && !cmp; i++) {
    await page.waitForTimeout(120);
    cmp = await page.evaluate(() => {
      const t = document.querySelector('.guide__bubble-text');
      const s = document.querySelector('.guide__bubble-sizer');
      if (!t || !t.textContent) return null;
      return { t: t.textContent, s: s.textContent, open: t.parentElement.hasAttribute('data-open') };
    });
    if (cmp && !cmp.open) cmp = null;
  }
  if (!cmp) fail(failures, 'index.html', '1440-motion', 'no line after switching motion off');
  else if (cmp.t !== cmp.s) {
    fail(failures, 'index.html', '1440-motion', 'typewriter still running with data-motion=off', JSON.stringify(cmp));
  }

  await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'on'));
  await page.waitForTimeout(700);
  const back = await page.evaluate(() => document.querySelector('.guide__stage').style.transform);
  if (!/rotateX/.test(back)) fail(failures, 'index.html', '1440-motion', 'follow did not resume', JSON.stringify(back));
  if (errors.length) fail(failures, 'index.html', '1440-motion', 'console errors', errors.join(' | '));
  await ctx.close();
}

/* -------------------------------------------------------- section test */

async function checkSectionLines(browser, rel, failures) {
  const vp = { name: '1440', width: 1440, height: 900 };
  const { ctx, page } = await openPage(browser, rel, vp, {});
  await page.waitForTimeout(800);
  /* per-project line on a case page (V4 Startup) */
  if (rel === 'work/v4startup.html') {
    const text = await page.evaluate(() => document.querySelector('.guide__bubble-text').textContent);
    if (!/V4 Startup is a complete CRM/.test(text)) {
      fail(failures, rel, '1440', 'per-project line', JSON.stringify(text));
    }
  }
  await ctx.close();
}

async function checkIdle(browser, rel, failures) {
  const vp = { name: '1440', width: 1440, height: 900 };
  const { ctx, page } = await openPage(browser, rel, vp, {});
  let text = '';
  for (let i = 0; i < 90 && !/drag me around\.$/.test(text); i++) {
    await page.waitForTimeout(400);
    text = await page.evaluate(() => {
      const t = document.querySelector('.guide__bubble-text');
      return t ? t.textContent : '';
    });
  }
  if (!/You can drag me around\./.test(text)) {
    fail(failures, rel, '1440', 'idle hint after 10s', JSON.stringify(text));
  }
  await ctx.close();
}

/* ------------------------------------------------------------- driver */

async function main() {
  const failures = [];
  const errorPages = new Set();
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    for (const rel of TARGET) {
      const { ctx, page, errors } = await openPage(browser, rel, vp, {});
      await page.waitForTimeout(500);
      await checkBasics(page, rel, vp.name, errors, failures);
      await checkFooter(page, rel, vp.name, failures);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);
      await checkMenuAndDialog(page, rel, vp.name, failures);
      if (errors.length) errorPages.add(rel + '@' + vp.name);
      await ctx.close();
      process.stdout.write('.');
    }
    console.log('');
  }

  /* console errors: only fail when they are NEW (avatar.js is to blame) */
  for (const key of errorPages) {
    const [rel, vpName] = key.split('@');
    const vp = VIEWPORTS.find((v) => v.name === vpName);
    const base = await openPage(browser, rel, vp, { blockAvatar: true });
    await base.page.waitForTimeout(500);
    const baseErrs = base.errors.slice();
    await base.ctx.close();
    const withAvatar = await openPage(browser, rel, vp, {});
    await withAvatar.page.waitForTimeout(500);
    const newErrs = withAvatar.errors.filter((e) => !baseErrs.includes(e));
    await withAvatar.ctx.close();
    if (newErrs.length) fail(failures, rel, vpName, 'console errors', newErrs.join(' | '));
    else console.log(`  note ${key}: pre-existing console noise (${baseErrs.length})`);
  }

  /* feature tests (1440 + reduced motion + toggle + greeting + idle) */
  await checkGreeting(browser, 'index.html', failures);
  await checkInteractions(browser, failures);
  await checkCopyPaths(browser, 'index.html', '1440', failures);
  await checkCopyPaths(browser, 'contact.html', '390', failures);
  await checkToggle(browser, 'index.html', failures);
  await checkSectionLines(browser, 'work/v4startup.html', failures);
  await checkReduced(browser, 'index.html', failures);
  await checkTouchSway(browser, failures);
  await checkMotionOff(browser, failures);
  if (!QUICK) await checkIdle(browser, 'index.html', failures);

  await browser.close();

  /* asset budget */
  const avatarDir = path.join(ROOT, 'assets', 'avatar');
  let bytes = 0;
  if (fs.existsSync(avatarDir)) {
    fs.readdirSync(avatarDir).forEach((f) => { bytes += fs.statSync(path.join(avatarDir, f)).size; });
  }
  console.log(`avatar assets: ${(bytes / 1024).toFixed(1)} KB (budget 200 KB)`);
  if (bytes > 200 * 1024) fail(failures, 'assets/avatar', '-', 'over 200 KB', bytes + ' bytes');

  console.log('');
  if (failures.length) {
    console.log(`FAILURES (${failures.length}):`);
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
  console.log('ALL CHECKS PASSED');
}

main().catch((e) => { console.error(e); process.exit(1); });
