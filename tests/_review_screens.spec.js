// @ts-check
const { test } = require('@playwright/test');

for (const w of [375, 1440]) {
    test(`start-here step2 ${w}`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: 1400 });
        await page.goto('http://localhost:8888/start-here.html', { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);
        // Click first diag-option
        await page.click('.diag-option').catch(() => {});
        await page.waitForTimeout(300);
        await page.screenshot({ path: `/Users/nnnns/.claude/jobs/46864a95/review/start-here-step2__${w}.png`, fullPage: true });
    });

    test(`start-here result ${w}`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: 1400 });
        await page.goto('http://localhost:8888/start-here.html', { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);
        // Click first option in each of 3 steps to reach result
        for (let i = 0; i < 3; i++) {
            const opt = await page.$('.diag-step:not([hidden]) .diag-option');
            if (!opt) break;
            await opt.click().catch(() => {});
            await page.waitForTimeout(300);
        }
        await page.screenshot({ path: `/Users/nnnns/.claude/jobs/46864a95/review/start-here-result__${w}.png`, fullPage: true });
    });
}
