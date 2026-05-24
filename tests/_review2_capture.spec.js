// Independent re-review screenshot capture
// 8 pages × 4 viewports + interval-training in en/fr/de @ 1440
const { test, expect } = require('@playwright/test');
const path = require('path');

const OUT = '/Users/nnnns/.claude/jobs/46864a95/review2';
const BASE = 'http://localhost:8888';

const PAGES = [
  ['top',                  '/'],
  ['start-here',           '/start-here.html'],
  ['guides-index',         '/guides/'],
  ['interval-training',    '/guides/interval-training.html'],
  ['ear-training-chords',  '/guides/ear-training-chords.html'],
  ['fretboard-training',   '/guides/fretboard-training.html'],
  ['training-menu',        '/practice/training-menu.html'],
  ['404',                  '/404.html'],
];
const WIDTHS = [375, 768, 1024, 1440];

for (const [name, url] of PAGES) {
  for (const w of WIDTHS) {
    test(`${name} @ ${w}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.goto(BASE + url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      // Only fullpage for narrow widths (otherwise too big); for wide capture ATF.
      const full = w <= 768;
      await page.screenshot({
        path: path.join(OUT, `${name}_${w}${full ? '_full' : ''}.png`),
        fullPage: full,
      });
      await ctx.close();
    });
  }
}

// Lang variants of interval-training @ 1440 (ATF only)
for (const lang of ['en', 'fr', 'de']) {
  test(`interval-training-${lang} @ 1440`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/guides/interval-training.${lang}.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `interval-training-${lang}_1440.png`), fullPage: false });
    await ctx.close();
  });
}
