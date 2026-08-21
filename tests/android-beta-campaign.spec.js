// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('node:path');

test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'campaign behavior runs once on desktop');
});

test('first visit opens modal, dismissal is remembered, and FAB reopens it', async ({ page }) => {
    await page.goto('/support/?android-beta-preview=1');
    await page.evaluate(() => localStorage.removeItem('solfege_android_beta_modal_dismissed_at'));
    await page.reload();

    const modal = page.locator('.android-beta-modal');
    const fab = page.locator('.android-beta-fab');
    await expect(modal).toHaveClass(/is-open/, { timeout: 3000 });
    await expect(fab).toBeVisible();

    await modal.locator('.android-beta-modal__close').click();
    await expect(modal).not.toHaveClass(/is-open/);
    await page.reload();
    await page.waitForTimeout(1200);
    await expect(modal).not.toHaveClass(/is-open/);
    await expect(fab).toBeVisible();

    await fab.click();
    await expect(modal).toHaveClass(/is-open/);
    await page.keyboard.press('Escape');
    await expect(modal).not.toHaveClass(/is-open/);
    await expect(fab).toBeFocused();
});

test('campaign does not auto-open on privacy and recruitment details pages', async ({ page }) => {
    await page.goto('/privacy/?android-beta-preview=1');
    await page.evaluate(() => localStorage.removeItem('solfege_android_beta_modal_dismissed_at'));
    await page.reload();
    await page.waitForTimeout(1200);
    await expect(page.locator('.android-beta-modal')).not.toHaveClass(/is-open/);

    await page.goto('/android-beta/?android-beta-preview=1');
    await page.waitForTimeout(1200);
    await expect(page.locator('.android-beta-modal')).not.toHaveClass(/is-open/);
    await expect(page.locator('.android-beta-fab')).toBeVisible();
});

test('preview page matches the current Android build and does not block applicants', async ({ page }) => {
    await page.goto('/android-beta/?android-beta-preview=1');

    await expect(page.locator('.android-beta-app-card__icon')).toBeVisible();
    await expect(page.locator('.android-beta-screen-grid img')).toHaveCount(3);
    await expect(page.getByRole('heading', { name: 'Android版を無料で先行体験しませんか？' })).toBeVisible();
    await expect(page.getByText('開発中のため、まれに')).toBeVisible();
    await expect(page.getByText('14日間、好きなトレーニングを試す')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('今回のテスト対象外');
    await expect(page.locator('body')).not.toContainText('18歳');
    await expect(page.getByText('定員に達し次第、受付終了')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('マイク入力');
    await expect(page.locator('body')).not.toContainText('20名');
});

[
    ['/', '/faq/', '/android-beta/'],
    ['/en/', '/en/faq/', '/en/android-beta/'],
    ['/fr/', '/fr/faq/', '/fr/android-beta/'],
    ['/de/', '/de/faq/', '/de/android-beta/'],
    ['/es/', '/es/faq/', '/es/android-beta/'],
    ['/it/', '/it/faq/', '/it/android-beta/'],
    ['/ko/', '/ko/faq/', '/ko/android-beta/'],
    ['/pt-br/', '/pt-br/faq/', '/pt-br/android-beta/']
].forEach(([homePath, faqPath, expectedPath]) => {
    test(`Android beta descriptions link to ${expectedPath}`, async ({ page }) => {
        await page.goto(`${homePath}?android-beta-preview=1`);
        const homeLinks = page.locator('[data-android-beta-details]');
        await expect(homeLinks).toHaveCount(2);
        await expect(homeLinks.first()).toHaveAttribute('href', expectedPath);

        await page.goto(`${faqPath}?android-beta-preview=1`);
        const faqLink = page.locator('[data-android-beta-details]');
        await expect(faqLink).toHaveCount(1);
        await expect(faqLink).toHaveAttribute('href', expectedPath);
    });
});

test('standalone handoff preview loads CSS and images over file protocol', async ({ page }) => {
    const previewPath = path.resolve(__dirname, '..', 'android-beta-preview.html');
    await page.goto(`file://${previewPath}?android-beta-preview=1`);

    await expect(page.locator('.android-beta-hero')).toHaveCSS('display', 'grid');
    await expect(page.locator('.android-beta-app-card')).toHaveCSS('display', 'grid');
    await expect(page.locator('.android-beta-app-card__icon')).toBeVisible();
    expect(await page.locator('.android-beta-app-card__icon').evaluate((image) => image.naturalWidth)).toBe(512);
    expect(await page.evaluate(() => Array.from(document.styleSheets).some((sheet) => sheet.href?.startsWith('file:') && sheet.href.includes('/style.css')))).toBe(true);
});

[
    ['/android-beta/', 'ja', '日本語'],
    ['/en/android-beta/', 'en', 'English'],
    ['/fr/android-beta/', 'fr', 'Français'],
    ['/de/android-beta/', 'de', 'Deutsch'],
    ['/es/android-beta/', 'es', 'Español'],
    ['/it/android-beta/', 'it', 'Italiano'],
    ['/ko/android-beta/', 'ko', '한국어'],
    ['/pt-br/android-beta/', 'pt-BR', 'Português (Brasil)']
].forEach(([path, language, formLanguage]) => {
    test(`application links pass ${language} to Google Forms`, async ({ page }) => {
        await page.goto(`${path}?android-beta-preview=1`);

        const applicationLink = page.locator('[data-android-beta-apply]').first();
        await expect(applicationLink).toHaveAttribute('href', /docs\.google\.com\/forms/);
        await expect(applicationLink).toHaveAttribute('href', new RegExp(`[?&]hl=${language}(?:&|$)`));
        const target = new URL(await applicationLink.getAttribute('href'));
        expect(target.searchParams.get('entry.1788578993')).toBe(formLanguage);
    });
});
