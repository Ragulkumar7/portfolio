const { chromium } = require('playwright');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => console.log('[page]', m.text()));
  await page.goto(url, { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intro'), null, { timeout: 9000 });
  } catch (e) {}
  await page.waitForTimeout(3500);

  await page.evaluate(() => {
    window.__log = [];
    const stage = document.querySelector('.guide__stage');
    const guide = document.querySelector('.guide');
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach((t) => {
      stage.addEventListener(t, (e) => {
        window.__log.push(t + ' ' + Math.round(e.clientX) + ',' + Math.round(e.clientY) +
          ' btn=' + e.button + ' captured=' + stage.hasPointerCapture(e.pointerId));
      });
    });
    const probe = document.elementFromPoint(
      stage.getBoundingClientRect().left + stage.offsetWidth / 2,
      stage.getBoundingClientRect().top + stage.offsetHeight / 2);
    window.__log.push('probe=' + (probe ? probe.className || probe.tagName : 'null') +
      ' suppressed=' + guide.getAttribute('data-suppressed') +
      ' box=' + JSON.stringify(stage.getBoundingClientRect()));
  });

  const box = await page.locator('.guide__stage').boundingBox();
  console.log('boundingBox', box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box.x + box.width / 2 - 8 * i, box.y + box.height / 2 - 6 * i);
    const t = await page.evaluate(() => document.querySelector('.guide__stage').style.transform);
    console.log('step', i, t);
  }
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const log = await page.evaluate(() => window.__log);
  console.log(log.join('\n'));
  console.log('final', await page.evaluate(() => document.querySelector('.guide__stage').style.transform));
  await browser.close();
})();
