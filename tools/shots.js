const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tools', 'shots');
const url = (rel) => 'file:///' + path.join(ROOT, rel).replace(/\\/g, '/');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const shots = [
    ['index.html', 1440, 900, 'home-hero', 0, 5000],
    ['index.html', 1440, 900, 'home-work', 0.28, 3000],
    ['index.html', 1440, 900, 'home-footer', 1, 3000],
    ['index.html', 390, 844, 'm-home-hero', 0, 5000],
    ['index.html', 390, 844, 'm-home-footer', 1, 3000],
    ['work/v4startup.html', 390, 844, 'm-case', 0, 4000],
    ['contact.html', 1440, 900, 'contact-footer', 1, 3000]
  ];
  for (const [rel, w, h, name, scroll, wait] of shots) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(url(rel), { waitUntil: 'load' });
    try {
      await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intro'), null, { timeout: 9000 });
    } catch (e) {}
    if (scroll) {
      await page.evaluate((k) => {
        const max = document.body.scrollHeight - window.innerHeight;
        window.scrollTo(0, Math.round(max * k));
      }, scroll);
    }
    await page.waitForTimeout(wait);
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('shot', name);
    await ctx.close();
  }
  await browser.close();
})();
