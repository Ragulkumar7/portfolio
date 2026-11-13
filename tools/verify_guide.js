/* Verify the dithered guide avatar (PASS 1) across every page at 1440 / 390.
   node tools/verify_guide.js [--quick]

   PASS 1 scope: markup + zones (nose/body/hair/eyes) + anchor travel +
   avoidance (rect-intersection) + reduced motion + coarse pointer +
   the shared on/off toggle. PASS 2 concerns are checked only where they
   already exist in PASS 1. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const QUICK = process.argv.includes('--quick');

function listPages(dir, prefix, out) {
  fs.readdirSync(dir).forEach((name) => {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (name === 'assets' || name === 'tools' || name === 'node_modules') return;
      listPages(full, prefix + name + '/', out);
    } else if (name.endsWith('.html')) {
      out.push(prefix + name);
    }
  });
  return out;
}

const PAGES = listPages(ROOT, '', []).sort();
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 }
];

const fileUrl = (rel) => 'file:///' + path.join(ROOT, rel).replace(/\\/g, '/');
const fail = (list, rel, vp, check, detail) =>
  list.push(`[${vp}] ${rel} :: ${check}${detail ? ' — ' + detail : ''}`);

async function waitForIntro(page) {
  try {
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intro'), null, { timeout: 9000 });
  } catch (e) { /* intro never ran */ }
}

async function openPage(browser, rel, vp, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    reducedMotion: opts.reduced ? 'reduce' : 'no-preference',
    hasTouch: !!opts.touch,
    isMobile: !!opts.touch
  });
  if (opts.blockAvatar) await ctx.route('**/js/avatar.js', (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(fileUrl(rel), { waitUntil: 'load' });
  await waitForIntro(page);
  /* wait for the entrance to finish so checks see the settled anchor state */
  if (!opts.blockAvatar) {
    try {
      await page.waitForFunction(
        () => { const g = document.querySelector('#guide'); return g && g.hasAttribute('data-entered'); },
        null, { timeout: 8000 }
      );
    } catch (e) { /* guide never settled — later checks report it */ }
  }
  await page.waitForTimeout(250);
  return { ctx, page, errors };
}

/* --------------------------------------------------------- basics ---- */

async function checkBasics(page, rel, vp, failures) {
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    const g = document.querySelector('#guide');
    const stage = document.querySelector('.guide__stage');
    const bubble = document.querySelector('.guide__bubble');
    const close = document.querySelector('.guide__close');
    const head = document.querySelector('.header');
    const menu = document.querySelector('#site-menu');
    const transition = document.querySelector('.transition');
    const cursor = document.querySelector('.cursor-ring');
    const rect = (el) => (el ? el.getBoundingClientRect() : null);
    const overlap = (a, b) => a && b &&
      !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    return {
      hasGuide: !!g,
      hidden: g ? (getComputedStyle(g).visibility !== 'visible' || getComputedStyle(g).display === 'none') : null,
      hScroll: doc.scrollWidth - window.innerWidth,
      bodyScroll: document.body.scrollWidth - window.innerWidth,
      ariaGuide: g ? g.getAttribute('aria-hidden') : null,
      ariaStage: stage ? stage.getAttribute('aria-hidden') : null,
      pointerNone: g ? getComputedStyle(g).pointerEvents === 'none' : null,
      stagePointer: stage ? getComputedStyle(stage).pointerEvents : null,
      closeFocusable: close ? close.tagName === 'BUTTON' : null,
      zGuide: g ? getComputedStyle(g).zIndex : null,
      zMenu: menu ? getComputedStyle(menu).zIndex : null,
      zHeader: head ? getComputedStyle(head).zIndex : null,
      zTransition: transition ? getComputedStyle(transition).zIndex : null,
      zCursor: cursor ? getComputedStyle(cursor).zIndex : null,
      headerOverlap: g && !getComputedStyle(g).visibility === 'hidden' ? false : overlap(rect(g), rect(head)),
      footerBtn: (() => {
        const b = document.querySelector('[data-guide-toggle]');
        return b ? { text: b.textContent.trim(), pressed: b.getAttribute('aria-pressed') } : null;
      })()
    };
  });

  if (!m.hasGuide) { fail(failures, rel, vp.name, 'guide markup missing'); return; }
  if (m.hScroll > 1) fail(failures, rel, vp.name, 'horizontal scroll', `+${m.hScroll}px`);
  if (m.bodyScroll > 1) fail(failures, rel, vp.name, 'body horizontal scroll', `+${m.bodyScroll}px`);
  if (m.ariaGuide !== 'true') fail(failures, rel, vp.name, 'guide aria-hidden', String(m.ariaGuide));
  if (m.ariaStage !== 'true') fail(failures, rel, vp.name, 'stage aria-hidden', String(m.ariaStage));
  if (m.pointerNone !== true) fail(failures, rel, vp.name, 'container pointer-events', m.pointerNone);
  if (m.stagePointer !== 'auto') fail(failures, rel, vp.name, 'stage pointer-events', m.stagePointer);
  if (!m.closeFocusable) fail(failures, rel, vp.name, 'close button not a <button>');
  const zG = parseInt(m.zGuide, 10), zM = parseInt(m.zMenu, 10), zH = parseInt(m.zHeader, 10);
  if (!(zG < zM && zG < zH)) fail(failures, rel, vp.name, 'z-index order', `guide ${m.zGuide}, menu ${m.zMenu}, header ${m.zHeader}`);
  if (!(zG < parseInt(m.zTransition, 10))) fail(failures, rel, vp.name, 'below the page transition', `guide ${m.zGuide}, transition ${m.zTransition}`);
  if (!(zG < parseInt(m.zCursor, 10))) fail(failures, rel, vp.name, 'below the cursor', `guide ${m.zGuide}, cursor ${m.zCursor}`);
  if (m.headerOverlap) fail(failures, rel, vp.name, 'overlaps the header');
  if (!m.footerBtn) fail(failures, rel, vp.name, 'footer Guide toggle missing');
  else if (m.footerBtn.text !== 'Guide: on') fail(failures, rel, vp.name, 'footer toggle label', m.footerBtn.text);
}

/* rect-intersection: the avatar (and the bubble when open) must clear
   every link / button / input / the header. The guide's own controls
   (its close button) are exempt; a fully hidden guide covers nothing. */

async function checkRect(page, rel, vp, failures, label) {
  const m = await page.evaluate(() => {
    const guide = document.querySelector('#guide');
    if (!guide) return { missing: true };
    const cs = getComputedStyle(guide);
    if (cs.visibility === 'hidden' || cs.display === 'none') return { hidden: true };
    const stage = document.querySelector('.guide__stage');
    const bubble = document.querySelector('.guide__bubble');
    const bcs = bubble ? getComputedStyle(bubble) : null;
    const bubbleOpen = !!(bubble && bubble.hasAttribute('data-open') && parseFloat(bcs.opacity) > 0.05);
    const rects = [];
    if (stage) rects.push({ name: 'avatar', r: stage.getBoundingClientRect() });
    if (bubble && bubbleOpen) rects.push({ name: 'bubble', r: bubble.getBoundingClientRect() });
    const overlap = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    const ptIn = (r, x, y) => x > r.left && x < r.right && y > r.top && y < r.bottom;
    const hitTestable = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') return false;
      let n = el.parentElement;
      while (n && n !== document.documentElement) { if (n.hasAttribute('inert')) return false; n = n.parentElement; }
      return true;
    };
    const hits = [];
    const els = [...document.querySelectorAll('a[href], button, input, select, textarea, .header')];
    const isHeader = (el) => el.classList.contains('header');
    for (const el of els) {
      if (guide.contains(el)) continue;                 /* exempt: own controls */
      if (!hitTestable(el)) continue;                   /* closed menu overlay, etc. */
      if (!el.getClientRects().length) continue;
      const er = el.getBoundingClientRect();
      if (er.width < 4 || er.height < 4) continue;      /* visually-hidden placeholder */
      if (er.bottom <= 0 || er.top >= window.innerHeight) continue;
      const who = ((el.textContent || '').trim().slice(0, 22) || el.className || el.tagName) + '';
      if (isHeader(el)) {
        /* the header must never be intersected at all */
        for (const rr of rects) if (overlap(rr.r, er)) hits.push(who + '×' + rr.name);
      } else {
        /* links/buttons/inputs: their clickable centre must stay clear */
        const cx = er.left + er.width / 2, cy = er.top + er.height / 2;
        if (cy <= 0 || cy >= window.innerHeight) continue;
        for (const rr of rects) if (ptIn(rr.r, cx, cy)) hits.push(who + ' centre×' + rr.name);
      }
    }
    const sb = stage ? stage.getBoundingClientRect() : null;
    const inside = sb ? (sb.left >= -1 && sb.right <= window.innerWidth + 1 &&
      sb.top >= -1 && sb.bottom <= window.innerHeight + 1) : false;
    return { hits, inside, sb: sb ? { l: Math.round(sb.left), r: Math.round(sb.right), t: Math.round(sb.top), b: Math.round(sb.bottom) } : null };
  });

  if (m.missing) { fail(failures, rel, vp, label || 'rect', 'guide missing'); return; }
  if (m.hidden) return;                                  /* blocked → covers nothing */
  if (m.hits && m.hits.length) fail(failures, rel, vp, label || 'rect-intersection', m.hits.join(', '));
  if (m.inside === false) fail(failures, rel, vp, label || 'inside viewport', JSON.stringify(m.sb));
}

/* ----------------------------------------------------------- zones ---- */
/* viewBox points for each PASS 1 zone, mapped through the stage box */

const ZONES = [
  { zone: 'nose', vx: 100, vy: 117, state: 'cough' },
  { zone: 'body', vx: 100, vy: 200, state: 'giggle' },
  { zone: 'head', vx: 70, vy: 135, state: 'pat' },
  { zone: 'hair', vx: 100, vy: 60, state: 'pat' },
  { zone: 'eyes', vx: 100, vy: 105, state: 'flinch' }
];

async function checkZones(browser, failures) {
  const rel = 'index.html';
  const vp = { name: '1440', width: 1440, height: 900 };
  const { ctx, page, errors } = await openPage(browser, rel, vp, {});
  await page.waitForTimeout(700);

  /* make sure we are at the hero (side=right, no flip) so viewBox
     coordinates map straight through the stage box */
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);

  const box = await page.locator('.guide__stage').boundingBox();
  if (!box) { fail(failures, rel, vp.name, 'zones', 'stage has no box'); await ctx.close(); return; }

  async function clickAt(vx, vy) {
    /* re-measure each time: the avoidance keeps nudging the cluster a few px */
    const b = await page.locator('.guide__stage').boundingBox();
    const x = b.x + (vx / 200) * b.width;
    const y = b.y + (vy / 220) * b.height;
    await page.mouse.move(x, y);
    await page.waitForTimeout(60);
    await page.mouse.click(x, y);
  }

  for (const z of ZONES) {
    await clickAt(z.vx, z.vy);
    await page.waitForTimeout(140);
    const st = await page.evaluate(() => document.querySelector('#guide').getAttribute('data-state'));
    if (st !== z.state) {
      fail(failures, rel, vp.name, `zone ${z.zone} → state`, `got "${st}" want "${z.state}"`);
    }
    /* return to idle */
    const wait = z.state === 'cough' ? 900 : z.state === 'pat' ? 800 : z.state === 'flinch' ? 550 : 900;
    await page.waitForTimeout(wait);
    const back = await page.evaluate(() => document.querySelector('#guide').getAttribute('data-state'));
    if (back !== null && back !== '') {
      fail(failures, rel, vp.name, `zone ${z.zone} → idle`, `stuck on "${back}"`);
    }
  }

  if (errors.length) fail(failures, rel, vp.name, 'console errors (zones)', errors.join(' | '));
  await ctx.close();
}

/* --------------------------------------------------------- anchors ---- */

const HOME_ANCHORS = [
  { sel: '.hero', side: 'right', size: '300' },
  { sel: '.selected-work', side: 'right', size: '150' },
  { sel: '.statement', side: 'left', size: '150' },
  { sel: '.service-tiles', side: 'right', size: '150' },
  { sel: '.footer', side: 'right', size: '150' }
];

async function checkAnchors(browser, failures) {
  const rel = 'index.html';
  for (const vp of VIEWPORTS) {
    const { ctx, page, errors } = await openPage(browser, rel, vp, {});
    for (const a of HOME_ANCHORS) {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
      }, a.sel);
      await page.waitForTimeout(1250);
      const st = await page.evaluate(() => {
        const g = document.querySelector('#guide');
        if (!g) return { missing: true };
        const cs = getComputedStyle(g);
        return {
          side: g.getAttribute('data-side'),
          size: g.style.getPropertyValue('--guide-size-base').replace('px', ''),
          hidden: cs.visibility === 'hidden' || cs.display === 'none',
          suppressed: g.getAttribute('data-suppressed'),
          blocked: g.getAttribute('data-suppressed') === 'blocked'
        };
      });
      if (st.missing) { fail(failures, rel, vp.name, 'anchor ' + a.sel, 'guide missing'); continue; }
      if (st.hidden) {
        fail(failures, rel, vp.name, 'anchor ' + a.sel, 'guide hidden (suppressed=' + st.suppressed + ')');
        continue;
      }
      if (st.side !== a.side) fail(failures, rel, vp.name, 'anchor ' + a.sel, `side "${st.side}" want "${a.side}"`);
      if (st.size !== a.size) fail(failures, rel, vp.name, 'anchor ' + a.sel, `size ${st.size} want ${a.size}`);
      await checkRect(page, rel, vp.name, failures, 'anchor ' + a.sel + ' rect');
    }
    if (errors.length) fail(failures, rel, vp.name, 'console errors (anchors)', errors.join(' | '));
    await ctx.close();
    process.stdout.write('.');
  }
  console.log('');
}

/* ---------------------------------------------------- reduced motion --- */

async function checkReduced(browser, failures) {
  const rel = 'index.html';
  const vp = { name: '390-r', width: 390, height: 844 };
  const { ctx, page, errors } = await openPage(browser, rel, vp, { reduced: true });
  await page.waitForTimeout(1200);
  const a = await page.evaluate(() => {
    const stage = document.querySelector('.guide__stage');
    const head = document.querySelector('#av-head');
    const eyes = document.querySelector('#av-eyes-open');
    const g = document.querySelector('#guide');
    return {
      stageAnim: stage ? getComputedStyle(stage).animationName : null,
      headAnim: head ? getComputedStyle(head).animationName : null,
      headTf: head ? head.style.transform : null,
      eyesTf: eyes ? eyes.style.transform : null,
      guideTf: g ? g.style.transform : null,
      visible: g ? getComputedStyle(g).visibility === 'visible' : false
    };
  });
  if (!a.visible) fail(failures, rel, vp.name, 'reduced', 'guide not visible');
  if (a.stageAnim && a.stageAnim !== 'none') fail(failures, rel, vp.name, 'reduced: stage animating', a.stageAnim);
  if (a.headAnim && a.headAnim !== 'none') fail(failures, rel, vp.name, 'reduced: head keyframes running', a.headAnim);
  if (a.headTf) fail(failures, rel, vp.name, 'reduced: head tracking', a.headTf);
  if (a.eyesTf) fail(failures, rel, vp.name, 'reduced: eye tracking', a.eyesTf);
  const t1 = a.guideTf;
  await page.waitForTimeout(600);
  const t2 = await page.evaluate(() => document.querySelector('#guide').style.transform);
  if (t1 !== t2) fail(failures, rel, vp.name, 'reduced: guide transform animates', `${t1} → ${t2}`);

  /* a line must still appear (the bubble still works) */
  await page.evaluate(() => document.querySelector('.selected-work').scrollIntoView({ block: 'center' }));
  let line = '';
  for (let i = 0; i < 25 && !line; i++) {
    await page.waitForTimeout(200);
    line = await page.evaluate(() => {
      const b = document.querySelector('.guide__bubble');
      const t = document.querySelector('.guide__bubble-text');
      return b && b.hasAttribute('data-open') && t ? t.textContent : '';
    });
  }
  if (!line) fail(failures, rel, vp.name, 'reduced: no section line', JSON.stringify(line));
  if (errors.length) fail(failures, rel, vp.name, 'reduced console errors', errors.join(' | '));
  await ctx.close();
}

/* ---------------------------------------------------- coarse pointer --- */

async function checkCoarse(browser, failures) {
  const rel = 'index.html';
  const vp = { name: '390-touch', width: 390, height: 844 };
  const { ctx, page, errors } = await openPage(browser, rel, vp, { touch: true });
  await page.waitForTimeout(1400);

  /* avatar present + a tap on the body zone giggles */
  const box = await page.locator('.guide__stage').boundingBox();
  if (!box) {
    fail(failures, rel, vp.name, 'touch: stage has no box');
  } else {
    const x = box.x + (100 / 200) * box.width;
    const y = box.y + (200 / 220) * box.height;
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(200);
    const st = await page.evaluate(() => document.querySelector('#guide').getAttribute('data-state'));
    if (st !== 'giggle') fail(failures, rel, vp.name, 'touch tap → giggle', `got "${st}"`);
  }

  /* the page must still scroll (touch-action not locked) */
  const before = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.scrollY);
  if (after <= before) fail(failures, rel, vp.name, 'touch: page did not scroll', `${before} → ${after}`);
  if (errors.length) fail(failures, rel, vp.name, 'touch console errors', errors.join(' | '));
  await ctx.close();
}

/* ----------------------------------------------------- on/off toggle --- */

async function checkToggle(browser, failures) {
  const rel = 'index.html';
  const vp = { name: '1440', width: 1440, height: 900 };
  const { ctx, page } = await openPage(browser, rel, vp, {});
  await page.waitForTimeout(600);
  const read = () => page.evaluate(() => {
    const g = document.querySelector('#guide');
    const b = document.querySelector('[data-guide-toggle]');
    let stored = null;
    try { stored = localStorage.getItem('guide:enabled'); } catch (e) { stored = 'ERR'; }
    return {
      off: g ? g.classList.contains('guide--off') : null,
      displayed: g ? getComputedStyle(g).display : null,
      label: b ? b.textContent.trim() : null,
      pressed: b ? b.getAttribute('aria-pressed') : null,
      stored
    };
  });

  let s = await read();
  if (s.off || s.displayed === 'none') fail(failures, rel, vp.name, 'toggle: starts on', JSON.stringify(s));

  await page.click('[data-guide-toggle]');
  await page.waitForTimeout(250);
  s = await read();
  if (!s.off || s.displayed !== 'none') fail(failures, rel, vp.name, 'toggle: off not applied', JSON.stringify(s));
  if (s.stored !== '0') fail(failures, rel, vp.name, 'toggle: off not persisted', String(s.stored));
  if (s.label !== 'Guide: off') fail(failures, rel, vp.name, 'toggle: off label', s.label);

  await page.reload({ waitUntil: 'load' });
  await waitForIntro(page);
  await page.waitForTimeout(400);
  s = await read();
  if (!s.off || s.displayed !== 'none') fail(failures, rel, vp.name, 'toggle: off lost after reload', JSON.stringify(s));

  await page.click('[data-guide-toggle]');
  await page.waitForTimeout(250);
  s = await read();
  if (s.off) fail(failures, rel, vp.name, 'toggle: re-enable failed', JSON.stringify(s));
  if (s.stored !== '1') fail(failures, rel, vp.name, 'toggle: re-enable not persisted', String(s.stored));
  await ctx.close();
}

/* ------------------------------------------------------------ size ---- */

function reportSize() {
  const js = fs.statSync(path.join(ROOT, 'js', 'avatar.js')).size;
  const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
  const a = css.indexOf('marker: guide-avatar START');
  const b = css.indexOf('marker: guide-avatar END');
  const region = a >= 0 && b > a ? css.slice(a, b + 'marker: guide-avatar END'.length) : '';
  const cssBytes = Buffer.byteLength(region, 'utf8');
  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  console.log(`avatar JS:  ${kb(js).padStart(9)}  (${js} bytes)`);
  console.log(`avatar CSS: ${kb(cssBytes).padStart(9)}  (${cssBytes} bytes)`);
  console.log(`avatar total: ${kb(js + cssBytes)}`);
}

/* ---------------------------------------------------------- driver ---- */

async function main() {
  const failures = [];
  const errorPages = new Set();
  const browser = await chromium.launch();
  const targets = QUICK
    ? PAGES.filter((p) => ['index.html', 'contact.html', 'certificates.html', 'work/v4startup.html'].includes(p))
    : PAGES;

  for (const vp of VIEWPORTS) {
    for (const rel of targets) {
      const { ctx, page, errors } = await openPage(browser, rel, vp, {});
      await page.waitForTimeout(550);
      await checkBasics(page, rel, vp, failures);
      await checkRect(page, rel, vp.name, failures);
      if (errors.length) errorPages.add(rel + '@' + vp.name);
      await ctx.close();
      process.stdout.write('.');
    }
    console.log('');
  }

  /* console errors: only NEW ones (avatar.js to blame) are failures */
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

  console.log('zones…');
  await checkZones(browser, failures);
  console.log('anchors…');
  await checkAnchors(browser, failures);
  console.log('reduced…');
  await checkReduced(browser, failures);
  console.log('coarse…');
  await checkCoarse(browser, failures);
  console.log('toggle…');
  await checkToggle(browser, failures);

  await browser.close();
  console.log('');
  reportSize();
  console.log('');
  if (failures.length) {
    console.log(`FAILURES (${failures.length}):`);
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
  console.log('ALL CHECKS PASSED');
}

main().catch((e) => { console.error(e); process.exit(1); });
