const { test } = require('@playwright/test');
test('en page without JS — count visible mermaid-lang blocks', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 800 }, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8888/guides/bpm-60-wall.en.html');
  await page.waitForTimeout(500);
  // Count mermaid-lang elements that are NOT display:none
  const counts = await page.$$eval('.mermaid-lang', els =>
    els.map(el => ({
      lang: el.getAttribute('lang'),
      visible: window.getComputedStyle(el).display !== 'none'
    }))
  );
  console.log('JS-disabled .en.html mermaid-lang visibility:', JSON.stringify(counts));
  await page.screenshot({ path: '/Users/nnnns/.claude/jobs/46864a95/review2/_nojs_en.png', fullPage: false });
  await ctx.close();
});
