const { test, expect } = require('@playwright/test');

for (const locale of ['', 'en/', 'fr/', 'de/', 'es/', 'it/', 'ko/', 'pt-br/']) {
    test(`landing additional viewport boundaries ${locale || 'ja'}`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.route('**/api/badges/**', route => route.abort());
        await page.goto('/' + locale);
        await page.evaluate(() => document.fonts.ready);
        for (const width of [320, 780, 1920]) {
            await page.setViewportSize({ width, height: 900 });
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${locale} at ${width}`).toBe(true);
        }
    });
}

for (const width of [375, 1440]) {
    test(`landing download remains usable without badge artwork @${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.route('**/api/badges/**', route => route.abort());
        await page.goto('/');
        const heroLink = page.locator('.lp-hero__actions a.app-store-link');
        await expect(heroLink.locator('.lp-badge-fallback')).toBeVisible();
        await expect(heroLink).toHaveAttribute('href', /apps\.apple\.com\/jp\/app\/id6756626617.*ct=web_home/);
        const bar = page.locator('.lp-download-bar');
        await expect(bar).toBeHidden();
        await page.locator('#how').scrollIntoViewIfNeeded();
        await expect(bar).toBeVisible();
        await expect(bar.locator('a.app-store-link')).toBeVisible();
        await page.locator('#download').scrollIntoViewIfNeeded();
        await expect(bar).toBeHidden();
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(bar).toBeHidden();
    });

    test(`landing restores image after badge load @${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.route('**/api/badges/**', route => route.fulfill({
            path: require('path').join(__dirname, '..', 'AppIcon.png'),
            contentType: 'image/png',
        }));
        await page.goto('/en/');
        const link = page.locator('.lp-hero__actions a.app-store-link');
        await expect(link.locator('img')).toBeVisible();
        await expect(link.locator('.lp-badge-fallback')).toBeHidden();
        await expect(link).not.toHaveClass(/is-badge-pending/);
        await expect(link).toHaveAttribute('href', /apps\.apple\.com\/us\/app\/id6756626617/);
    });
}

test('landing navigation, mobile drawer and language switch remain usable', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto('/');
    await page.locator('#hamburger-btn').click();
    await expect(page.locator('#drawer')).toHaveAttribute('aria-hidden', 'false');
    await page.locator('#drawer a[href="/features/"]').click();
    await expect(page).toHaveURL(/\/features\/$/);
    await expect(page.locator('#drawer')).toHaveAttribute('aria-hidden', 'true');
    await page.goto('/');
    await page.locator('#lang-toggle').click();
    await page.getByRole('menuitemradio', { name: /Deutsch/ }).click();
    await expect(page).toHaveURL(/\/de\//);
    await expect(page.locator('h1')).toContainText('Genauer hören.');
});
