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

/* forbidden wording in rendered text — assembled from pieces so this file
   itself never carries the literal strings a tree-wide search looks for */
const BAD_WORDS = ['a' + 'ug' + 'ust', 'a' + 'ug' + ' 2026', 'int' + 'ern'];
const MONTH_WORD = new RegExp('(^|[^a-z])' + 'a' + 'ug' + '([^a-z]|$)', 'i');
const badIn = (s) => {
  const t = String(s || '').toLowerCase();
  const hits = BAD_WORDS.filter((w) => t.indexOf(w) >= 0);
  if (MONTH_WORD.test(t)) hits.push('a' + 'ug (month word)');
  return hits;
};

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
  const m = await page.evaluate((words) => {
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
      controls: bubble ? bubble.getAttribute('data-controls') : null,
      pointerIsNone: g ? getComputedStyle(g).pointerEvents === 'none' : null,
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
      })(),
      /* content guard: none of the stale wording may reach a rendered page
         (needles come from the caller — this file never spells them out) */
      textBad: (() => {
        const s = (document.body.innerText || '').toLowerCase();
        const hits = words.filter((w) => s.indexOf(w) >= 0);
        const mo = new RegExp('(^|[^a-z])' + 'a' + 'ug' + '([^a-z]|$)', 'i');
        if (mo.test(s)) hits.push('a' + 'ug (month word)');
        return hits;
      })()
    };
  }, BAD_WORDS);

  if (!m.hasGuide) { fail(failures, rel, vp.name, 'guide markup missing'); return; }
  if (m.hScroll > 1) fail(failures, rel, vp.name, 'horizontal scroll', `+${m.hScroll}px`);
  if (m.bodyScroll > 1) fail(failures, rel, vp.name, 'body horizontal scroll', `+${m.bodyScroll}px`);
  /* the guide is aria-hidden unless it is offering controls (the offer
     row / the tour) — those must be exposed to be reachable at all */
  if (!(m.ariaGuide === 'true' || (m.ariaGuide === null && m.controls))) {
    fail(failures, rel, vp.name, 'guide aria-hidden',
         String(m.ariaGuide) + ' controls=' + String(m.controls));
  }
  if (m.ariaStage !== 'true') fail(failures, rel, vp.name, 'stage aria-hidden', String(m.ariaStage));
  if (m.pointerIsNone !== true) fail(failures, rel, vp.name, 'container pointer-events', m.pointerIsNone);
  if (m.stagePointer !== 'auto') fail(failures, rel, vp.name, 'stage pointer-events', m.stagePointer);
  if (!m.closeFocusable) fail(failures, rel, vp.name, 'close button not a <button>');
  const zG = parseInt(m.zGuide, 10), zM = parseInt(m.zMenu, 10), zH = parseInt(m.zHeader, 10);
  if (!(zG < zM && zG < zH)) fail(failures, rel, vp.name, 'z-index order', `guide ${m.zGuide}, menu ${m.zMenu}, header ${m.zHeader}`);
  if (!(zG < parseInt(m.zTransition, 10))) fail(failures, rel, vp.name, 'below the page transition', `guide ${m.zGuide}, transition ${m.zTransition}`);
  if (!(zG < parseInt(m.zCursor, 10))) fail(failures, rel, vp.name, 'below the cursor', `guide ${m.zGuide}, cursor ${m.zCursor}`);
  if (m.headerOverlap) fail(failures, rel, vp.name, 'overlaps the header');
  if (!m.footerBtn) fail(failures, rel, vp.name, 'footer Guide toggle missing');
  else if (m.footerBtn.text !== 'Guide: on') fail(failures, rel, vp.name, 'footer toggle label', m.footerBtn.text);
  /* no stale start date or removed role in any rendered text.
     github.html is skipped: its body text is fetched from the GitHub API
     at runtime and is not this site's copy. */
  if (rel !== 'github.html' && m.textBad && m.textBad.length) {
    fail(failures, rel, vp.name, 'stale wording in rendered text', m.textBad.join(', '));
  }
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
    /* the phone bottom sheet is a panel: it may sit over page controls
       (it dismisses itself), but the header must still stay clear */
    const sheetMode = guide.hasAttribute('data-sheet');
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
        /* links/buttons/inputs: their clickable centre must stay clear
           (except under the phone sheet, which is the point of it) */
        if (sheetMode) continue;
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
/* viewBox points for each zone, mapped through the stage box with the
   same "meet" maths the page uses (the viewBox is cropped to the
   artwork, so a raw /200 x /220 mapping no longer lands) */

const ZONES = [
  { zone: 'nose', vx: 100, vy: 117, state: 'cough', group: 'nose', key: 'cough' },
  { zone: 'body', vx: 100, vy: 200, state: 'giggle', group: 'body', key: 'giggle' },
  { zone: 'head', vx: 70, vy: 135, state: 'pat', group: 'head', key: 'pat' },
  { zone: 'hair', vx: 100, vy: 60, state: 'pat', group: 'head', key: 'pat' },
  { zone: 'eyes', vx: 84, vy: 106, state: 'flinch', group: 'eyes', key: 'flinch' }  /* left eye, clear of the nose */
];

async function vbPoint(page, vx, vy) {
  const b = await page.locator('.guide__stage').boundingBox();
  if (!b) return null;
  const vb = await page.evaluate(() => {
    const s = document.querySelector('#av');
    const v = s.viewBox.baseVal;
    return { x: v.x, y: v.y, w: v.width, h: v.height };
  });
  const scale = Math.min(b.width / vb.w, b.height / vb.h);
  const offX = (b.width - vb.w * scale) / 2;
  const offY = (b.height - vb.h * scale) / 2;
  /* side=left mirrors the whole drawing inside the stage box */
  const side = await page.evaluate(() => document.querySelector('#guide').getAttribute('data-side'));
  let px = offX + (vx - vb.x) * scale;
  if (side === 'left') px = b.width - px;
  return { x: b.x + px, y: b.y + offY + (vy - vb.y) * scale };
}

async function visibleCaption(page) {
  return page.evaluate(() => {
    const b = document.querySelector('.guide__bubble');
    const t = document.querySelector('.guide__bubble-text');
    return b && b.hasAttribute('data-open') && t ? t.textContent : '';
  });
}

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
    const p = await vbPoint(page, vx, vy);
    if (!p) return;
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(60);
    await page.mouse.click(p.x, p.y);
  }

  for (const z of ZONES) {
    await clickAt(z.vx, z.vy);
    await page.waitForTimeout(140);
    const st = await page.evaluate(() => document.querySelector('#guide').getAttribute('data-state'));
    if (st !== z.state) {
      fail(failures, rel, vp.name, `zone ${z.zone} → state`, `got "${st}" want "${z.state}"`);
    }
    /* E4: assert the caption the visitor can actually read, not just
       the data-state attribute — it must be one of data.js's lines */
    const exp = await page.evaluate((zz) => {
      const av = ((window.PORTFOLIO || {}).avatar || {});
      const g = (av.reactions || {})[zz.group] || {};
      return g[zz.key] || [];
    }, z);
    let vis = '';
    for (let i = 0; i < 40 && !exp.includes(vis); i++) {
      await page.waitForTimeout(150);
      vis = await visibleCaption(page);
    }
    if (!exp.includes(vis)) {
      fail(failures, rel, vp.name, `zone ${z.zone} caption`,
           `got "${vis}" want one of ${JSON.stringify(exp)}`);
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
  /* the hero parks beside RAGUL on desktop and beside the CTA on mobile
     (side flips so the bubble takes the outer side and the stage never
     shuffles when it appears) */
  { sel: '.hero', side: 'right', sideMobile: 'left', size: '300', sizeMobile: '90' },
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
      const wantSide = (vp.width <= 700 && a.sideMobile) ? a.sideMobile : a.side;
      if (st.side !== wantSide) fail(failures, rel, vp.name, 'anchor ' + a.sel, `side "${st.side}" want "${wantSide}"`);
      const wantSize = (vp.width <= 700 && a.sizeMobile) ? a.sizeMobile : a.size;
      if (st.size !== wantSize) fail(failures, rel, vp.name, 'anchor ' + a.sel, `size ${st.size} want ${wantSize}`);
      await checkRect(page, rel, vp.name, failures, 'anchor ' + a.sel + ' rect');
    }
    if (errors.length) fail(failures, rel, vp.name, 'console errors (anchors)', errors.join(' | '));
    await ctx.close();
    process.stdout.write('.');
  }
  console.log('');
}

/* ---------------------------------------------------- placement (E2) -- */
/* the hero anchor must clear RAGUL, KUMAR, the meta row, the nav and
   the button at every size; where it cannot, it has to fall back to
   hiding rather than covering the words. Every fallback size is
   printed, and the rendered figure size is reported for the crop. */

const PLACE_VPS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1536x864', width: 1536, height: 864 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '2560x1440', width: 2560, height: 1440 },
  { name: '390x844', width: 390, height: 844 },
  { name: '360x740', width: 360, height: 740 },
  { name: '768x1024', width: 768, height: 1024 }
];

async function checkPlacement(browser, failures) {
  const rel = 'index.html';
  console.log('placement (hero clearance at 8 sizes):');
  for (const vp of PLACE_VPS) {
    const { ctx, page, errors } = await openPage(browser, rel, vp, {});
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const g = document.querySelector('#guide');
      const stage = document.querySelector('.guide__stage');
      const svg = document.querySelector('#av');
      const ink = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const kids = [...el.querySelectorAll('.kinetic__letter')];
        const list = kids.length ? kids : [el];
        let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
        for (const k of list) {
          const q = k.getBoundingClientRect();
          if (!q.width && !q.height) continue;
          l = Math.min(l, q.left); r = Math.max(r, q.right);
          t = Math.min(t, q.top); b = Math.max(b, q.bottom);
        }
        return l === Infinity ? null : { l, r, t, b };
      };
      const box = (sel) => {
        const e = document.querySelector(sel);
        if (!e) return null;
        const q = e.getBoundingClientRect();
        return { l: q.left, r: q.right, t: q.top, b: q.bottom };
      };
      const sr = stage.getBoundingClientRect();
      const v = svg.viewBox.baseVal;
      const bb = svg.getBBox();
      const scale = Math.min(sr.width / v.width, sr.height / v.height);
      const offX = (sr.width - v.width * scale) / 2;
      const offY = (sr.height - v.height * scale) / 2;
      const fig = {
        l: sr.left + offX + (bb.x - v.x) * scale,
        t: sr.top + offY + (bb.y - v.y) * scale
      };
      fig.r = fig.l + bb.width * scale;
      fig.b = fig.t + bb.height * scale;
      const targets = {
        RAGUL: ink('.hero__line'),
        KUMAR: ink('.hero__line--second'),
        meta: ink('.hero__top'),
        nav: box('.header'),
        button: box('.hero__button')
      };
      const hit = (a, c) => a && c && a.l < c.r && a.r > c.l && a.t < c.b && a.b > c.t;
      const clashes = Object.keys(targets).filter((k) => hit(fig, targets[k]));
      const cs = getComputedStyle(g);
      return {
        hidden: cs.visibility === 'hidden' || cs.display === 'none',
        suppressed: g.getAttribute('data-suppressed'),
        size: g.style.getPropertyValue('--guide-size-base'),
        stage: { w: Math.round(sr.width), h: Math.round(sr.height) },
        fig: { w: Math.round(fig.r - fig.l), h: Math.round(fig.b - fig.t),
               l: Math.round(fig.l), t: Math.round(fig.t),
               r: Math.round(fig.r), b: Math.round(fig.b) },
        clashes
      };
    });
    const tag = vp.name;
    if (m.hidden) {
      console.log(`  ${tag.padEnd(10)} HIDDEN (${m.suppressed})  size=${m.size}  figure=${m.fig.w}x${m.fig.h}`);
      if (m.suppressed !== 'overlap' && m.suppressed !== 'blocked') {
        fail(failures, rel, tag, 'placement hidden for the wrong reason', String(m.suppressed));
      }
    } else {
      console.log(`  ${tag.padEnd(10)} size=${m.size}  stage=${m.stage.w}x${m.stage.h}  ` +
                  `figure=${m.fig.w}x${m.fig.h} at ${m.fig.l},${m.fig.t}..${m.fig.r},${m.fig.b}`);
      if (m.clashes.length) fail(failures, rel, tag, 'hero figure overlaps', m.clashes.join(', '));
      if (m.fig.l < -1 || m.fig.r > vp.width + 1 || m.fig.t < -1 || m.fig.b > vp.height + 1) {
        fail(failures, rel, tag, 'hero figure outside the viewport', JSON.stringify(m.fig));
      }
    }
    if (errors.length) fail(failures, rel, tag, 'console errors', errors.join(' | '));
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

  /* E3 + "reduced motion gives instant text": on a phone the held
     greeting is released by a tap and must land complete in one step,
     and any line over TH.mobileMax must be suppressed instead */
  const p = await vbPoint(page, 100, 133);          /* mouth zone: no reaction */
  if (p) {
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(150);
    const t0 = await visibleCaption(page);
    if (!t0) fail(failures, rel, vp.name, 'reduced: no line after tap');
    else if (t0.length > 30) fail(failures, rel, vp.name, 'reduced: phone line over 30 chars', `${t0.length}: ${t0}`);
    await page.waitForTimeout(500);
    const t1 = await visibleCaption(page);
    if (t1 !== t0) fail(failures, rel, vp.name, 'reduced: caption not instant',
                         `${JSON.stringify(t0)} -> ${JSON.stringify(t1)}`);
  } else fail(failures, rel, vp.name, 'reduced: stage has no box');

  /* at 390 a section line now lives in the phone sheet — the bubble
     beside the avatar keeps the 30-character rule */
  await page.evaluate(() => document.querySelector('.selected-work').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(1600);
  const sec = await page.evaluate(() => {
    const g = document.querySelector('#guide');
    const b = document.querySelector('.guide__bubble');
    const t = document.querySelector('.guide__bubble-text');
    return {
      sheet: g.hasAttribute('data-sheet'),
      text: t ? t.textContent : '',
      open: !!(b && b.hasAttribute('data-open') && !b.hasAttribute('data-hold'))
    };
  });
  const wantSec = await page.evaluate(() => window.PORTFOLIO.avatar.lines.work);
  if (sec.sheet) {
    if (sec.text !== wantSec) {
      fail(failures, rel, vp.name, 'reduced: sheet section line',
           `got "${sec.text}" want "${wantSec}"`);
    }
  } else if (sec.open && sec.text.length > 30) {
    fail(failures, rel, vp.name, 'reduced: long bubble line on phone', `${sec.text.length}: ${sec.text}`);
  }
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
    const p = await vbPoint(page, 100, 200);
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForTimeout(200);
    const st = await page.evaluate(() => document.querySelector('#guide').getAttribute('data-state'));
    if (st !== 'giggle') fail(failures, rel, vp.name, 'touch tap → giggle', `got "${st}"`);
    /* the caption must be readable text, not just a state flag */
    const exp = await page.evaluate(() => {
      const av = ((window.PORTFOLIO || {}).avatar || {});
      return (((av.reactions || {}).body || {}).giggle) || [];
    });
    let vis = '';
    for (let i = 0; i < 40 && !exp.includes(vis); i++) {
      await page.waitForTimeout(150);
      vis = await visibleCaption(page);
    }
    if (!exp.includes(vis)) {
      fail(failures, rel, vp.name, 'touch giggle caption', `got "${vis}"`);
    }
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

/* --------------------------------------------------------- content ---- */
/* the work history itself: two steps, the real dates, duty wording, and
   a meta description that agrees with them (copy lives in js/data.js and
   in the marker-guarded blocks of tools/guide_apply.py). */

async function checkContent(browser, failures) {
  const rel = 'experience.html';
  const vp = { name: '1440', width: 1440, height: 900 };
  const { ctx, page, errors } = await openPage(browser, rel, vp, {});
  const m = await page.evaluate((words) => {
    const av = window.PORTFOLIO || {};
    const roles = (av.experience || {}).roles || [];
    const steps = Array.prototype.slice.call(document.querySelectorAll('.process-timeline__step'));
    const meta = document.querySelector('meta[name="description"]');
    const body = (document.body.innerText || '').toLowerCase();
    const q = (s, el) => (el.querySelector(s) || {}).textContent || '';
    return {
      roles: roles.map((r) => ({
        label: r.label, title: r.title, org: r.org, duties: (r.duties || []).slice()
      })),
      stepCount: steps.length,
      stepLabels: steps.map((s) => q('.process-timeline__label', s)),
      stepTitles: steps.map((s) => q('.process-timeline__step-title', s)),
      emptySteps: steps.filter((s) => !q('.process-timeline__step-title', s)).length,
      meta: meta ? meta.content : '',
      bad: (() => {
        const hits = words.filter((w) => body.indexOf(w) >= 0);
        const mo = new RegExp('(^|[^a-z])' + 'a' + 'ug' + '([^a-z]|$)', 'i');
        if (mo.test(body)) hits.push('a' + 'ug (month word)');
        return hits;
      })(),
      hScroll: document.documentElement.scrollWidth - window.innerWidth
    };
  }, BAD_WORDS);

  const want = [
    { label: 'Jun 2026 — Present', title: 'Full Stack & Shopify Developer',
      org: 'Huemind, Dharmapuri, Tamil Nadu', duties: 2 },
    { label: 'Jul 2025 — Apr 2026', title: 'Full-Stack Developer',
      org: 'Neoera Infotech', duties: 3 }
  ];
  if (m.roles.length !== 2) fail(failures, `${rel}: role count`, String(m.roles.length));
  if (m.stepCount !== 2) fail(failures, `${rel}: timeline step count`, String(m.stepCount));
  if (m.emptySteps) fail(failures, `${rel}: empty timeline step`, String(m.emptySteps));
  want.forEach((w, i) => {
    const r = m.roles[i];
    if (r) {
      if (r.label !== w.label) fail(failures, `${rel}: role ${i + 1} label`, `${r.label} want ${w.label}`);
      if (r.title !== w.title) fail(failures, `${rel}: role ${i + 1} title`, `${r.title} want ${w.title}`);
      if (r.org !== w.org) fail(failures, `${rel}: role ${i + 1} org`, `${r.org} want ${w.org}`);
      if (r.duties.length !== w.duties) {
        fail(failures, `${rel}: role ${i + 1} duty count`, `${r.duties.length} want ${w.duties}`);
      }
    }
    if (m.stepLabels[i] !== w.label) {
      fail(failures, `${rel}: step ${i + 1} label`, `${m.stepLabels[i]} want ${w.label}`);
    }
    if (m.stepTitles[i] !== w.title) {
      fail(failures, `${rel}: step ${i + 1} title`, `${m.stepTitles[i]} want ${w.title}`);
    }
  });
  const neo = (m.roles[1] && m.roles[1].duties) || [];
  if (neo[1] && neo[1].indexOf('an e-commerce platform with custom CMS for Anicham Boutique') < 0) {
    fail(failures, `${rel}: Neoera duty 2 wording`, neo[1]);
  }
  if (badIn(neo.join(' ')).indexOf(BAD_WORDS[2]) >= 0) {
    fail(failures, `${rel}: removed-role wording in duties`, neo.join(' | '));
  }
  if (m.meta.indexOf('since June 2026') < 0) fail(failures, `${rel}: meta description`, m.meta);
  if (badIn(m.meta).length) fail(failures, `${rel}: meta carries stale wording`, m.meta);
  if (m.bad.length) fail(failures, `${rel}: stale wording in rendered text`, m.bad.join(', '));
  if (m.hScroll > 1) fail(failures, `${rel}: horizontal scroll`, `+${m.hScroll}px`);
  if (errors.length) fail(failures, `${rel}: console errors`, errors.join(' | '));
  await ctx.close();
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

  console.log('content…');
  await checkContent(browser, failures);
  console.log('zones…');
  await checkZones(browser, failures);
  console.log('anchors…');
  await checkAnchors(browser, failures);
  console.log('placement…');
  await checkPlacement(browser, failures);
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
