const { test, expect } = require('@playwright/test');

for (const prefix of ['', '/en', '/fr', '/de', '/es', '/it', '/ko', '/pt-br']) {
    for (const width of [320, 375]) {
        test(`landing stays within mobile viewport ${prefix || '/'} @${width}`, async ({ browser, baseURL }) => {
            const context = await browser.newContext({
                baseURL, viewport: { width, height: 812 },
                isMobile: true, hasTouch: true, reducedMotion: 'reduce',
            });
            try {
                const page = await context.newPage();
                await page.goto(`${prefix}/`);
                await expect(page.locator('#lang-toggle .settings-btn__globe')).toBeVisible();
                await page.evaluate(() => document.fonts.ready);
                await page.locator('#how').scrollIntoViewIfNeeded();
                await expect(page.locator('.lp-download-bar')).toBeVisible();
                const layout = await page.evaluate(() => {
                    const step = document.querySelector('.lp-story-step');
                    return {
                        viewport: innerWidth,
                        scrollWidth: document.documentElement.scrollWidth,
                        numberGap: step.querySelector('h3').getBoundingClientRect().top
                            - step.querySelector('.lp-story-step__number').getBoundingClientRect().bottom,
                    };
                });
                // Mobile browsers can expand innerWidth together with an overflowing
                // decoration. Compare with the device width, not only clientWidth.
                expect(layout.viewport).toBe(width);
                expect(layout.scrollWidth).toBeLessThanOrEqual(width);
                expect(layout.numberGap).toBeCloseTo(12, 0);
            } finally {
                await context.close();
            }
        });
    }
}
