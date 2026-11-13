/* Diagnostic: which tap targets does the guide avatar cover, at which
   scroll positions? Not part of the pass/fail suite — used to decide
   whether the corner placement ever blocks something important. */
const { chromium } = require('playwright');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const fileUrl = (rel) => 'file:///' + path.join(ROOT, rel).replace(/\\/g, '/');
const PAGES = ['index.html', 'contact.html', 'resume.html', 'services.html', 'work.html', 'about.html'];

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
    for (const rel of PAGES) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      const page = await ctx.newPage();
      await page.goto(fileUrl(rel), { waitUntil: 'load' });
      try {
        await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intro'), null, { timeout: 9000 });
      } catch (e) {}
      const steps = 6;
      for (let i = 0; i < steps; i++) {
        await page.evaluate((k) => {
          const max = document.body.scrollHeight - window.innerHeight;
          window.scrollTo(0, Math.round((max * k) / 5));
        }, i);
        await page.waitForTimeout(700);
        const hits = await page.evaluate(() => {
          const guide = document.querySelector('.guide');
          const out = [];
          document.querySelectorAll('a[href], button, input[type=submit], summary').forEach((el) => {
            if (el.closest('#site-menu') || el.closest('.guide')) return;
            const b = el.getBoundingClientRect();
            if (!b.width || !b.height) return;
            if (b.top < 0 || b.bottom > window.innerHeight) return;   /* on screen only */
            const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
            if (hit && guide.contains(hit)) {
              out.push((el.textContent || el.value || el.className || '').trim().slice(0, 30) +
                ' @' + Math.round(b.left) + ',' + Math.round(b.top));
            }
          });
          return out;
        });
        if (hits.length) console.log(`${vp.w} ${rel} scroll#${i}: ${hits.join(' | ')}`);
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log('done');
})();
