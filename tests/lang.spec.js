// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Language dropdown selector across all 18 converted pages.
 * Button shows current lang label (JA/EN/FR/DE); click opens dropdown;
 * click an item selects that language.
 */
const PAGES = [
    '/',
    '/start-here.html',
    '/guides/',
    '/guides/rhythm-training.html',
    '/guides/practice-spacing.html',
    '/guides/eye-hand-span.html',
    '/guides/bpm-60-wall.html',
    '/guides/mental-practice.html',
    '/guides/absolute-pitch-adult.html',
    '/guides/groove-training.html',
    '/guides/interval-training.html',
    '/guides/ear-training-chords.html',
    '/guides/ear-training-scales.html',
    '/guides/ear-training-progressions.html',
    '/guides/chord-function-curriculum.html',
    '/guides/sight-reading.html',
    '/guides/fretboard-training.html',
    '/practice/features.html',
    '/practice/training-menu.html',
    '/practice/training-menu/interval.html',
    '/practice/wind.html',
    '/practice/piano.html',
    '/practice/vocal.html',
    '/practice/drums.html',
    '/practice/guitar-bass.html',
];

for (const path of PAGES) {
    test(`dropdown selects each language — ${path}`, async ({ page, viewport }) => {
        test.skip(!viewport || viewport.width <= 768, 'desktop only');
        await page.goto(path + '?lang=ja');
        const btn = page.locator('#lang-toggle');
        const txt = page.locator('#lang-text');
        const menu = page.locator('#lang-menu');

        // Initial: ja -> button shows current lang 'JA'
        await expect(page.locator('html')).toHaveAttribute('data-lang', 'ja');
        await expect(txt).toHaveText('JA');

        // Dropdown injected, hidden by default
        await expect(menu).toBeAttached();
        await expect(menu).not.toHaveClass(/open/);

        // Click button -> menu opens
        await btn.click();
        await expect(menu).toHaveClass(/open/);
        await expect(btn).toHaveAttribute('aria-expanded', 'true');

        // Select English
        await menu.locator('[data-lang="en"]').click();
        await expect(page.locator('html')).toHaveAttribute('data-lang', 'en');
        await expect(txt).toHaveText('EN');
        await expect(menu).not.toHaveClass(/open/);

        // Open again and select Français
        await btn.click();
        await menu.locator('[data-lang="fr"]').click();
        await expect(page.locator('html')).toHaveAttribute('data-lang', 'fr');
        await expect(txt).toHaveText('FR');

        // Open again and select Deutsch
        await btn.click();
        await menu.locator('[data-lang="de"]').click();
        await expect(page.locator('html')).toHaveAttribute('data-lang', 'de');
        await expect(txt).toHaveText('DE');

        // Open again and select 日本語
        await btn.click();
        await menu.locator('[data-lang="ja"]').click();
        await expect(page.locator('html')).toHaveAttribute('data-lang', 'ja');
        await expect(txt).toHaveText('JA');
    });
}

test('?lang=fr URL param applies on load', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/?lang=fr');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'fr');
    await expect(page.locator('#lang-text')).toHaveText('FR');
});

test('?lang=de URL param applies on load', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/?lang=de');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'de');
    await expect(page.locator('#lang-text')).toHaveText('DE');
});

test('dropdown closes when clicking outside', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/');
    const btn = page.locator('#lang-toggle');
    const menu = page.locator('#lang-menu');
    await btn.click();
    await expect(menu).toHaveClass(/open/);
    // click outside (on the body)
    await page.locator('body').click({ position: { x: 10, y: 400 } });
    await expect(menu).not.toHaveClass(/open/);
});

test('Escape closes dropdown', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/');
    const btn = page.locator('#lang-toggle');
    const menu = page.locator('#lang-menu');
    await btn.click();
    await expect(menu).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await expect(menu).not.toHaveClass(/open/);
});

test('active item highlighted', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/?lang=fr');
    await page.locator('#lang-toggle').click();
    const activeItem = page.locator('#lang-menu .lang-menu__item.is-active');
    await expect(activeItem).toHaveCount(1);
    await expect(activeItem).toHaveAttribute('data-lang', 'fr');
});

/**
 * Every page declares all 4 hreflang links.
 */
for (const path of PAGES) {
    test(`hreflang fr & de present — ${path}`, async ({ page, viewport }) => {
        test.skip(!viewport || viewport.width <= 768, 'desktop only');
        await page.goto(path);
        await expect(page.locator('link[rel="alternate"][hreflang="fr"]')).toHaveCount(1);
        await expect(page.locator('link[rel="alternate"][hreflang="de"]')).toHaveCount(1);
    });
}
