// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Directory-based per-language URLs (since 2026-05-26):
 *   ja: /, /start-here/, /guides/foo/, /practice/foo/
 *   en: /en/, /en/start-here/, /en/guides/foo/
 *   fr: /fr/...
 *   de: /de/...
 *
 * Old URLs (foo.html, foo.X.html) serve meta-refresh redirect stubs.
 * Legacy ?lang=X query is auto-redirected by lang-toggle.js.
 */

const PAGES = [
    '/',
    '/start-here/',
    '/guides/',
    '/guides/rhythm-training/',
    '/guides/practice-spacing/',
    '/guides/eye-hand-span/',
    '/guides/bpm-60-wall/',
    '/guides/mental-practice/',
    '/guides/absolute-pitch-adult/',
    '/guides/groove-training/',
    '/guides/interval-training/',
    '/guides/ear-training-chords/',
    '/guides/ear-training-scales/',
    '/guides/ear-training-progressions/',
    '/guides/chord-function-curriculum/',
    '/guides/sight-reading/',
    '/guides/fretboard-training/',
    '/practice/features/',
    '/practice/training-menu/',
    '/practice/training-menu/interval/',
    '/practice/wind/',
    '/practice/piano/',
    '/practice/vocal/',
    '/practice/drums/',
    '/practice/guitar-bass/',
];

/**
 * Convert a ja path to its /lang/ prefixed equivalent.
 */
function pathForLang(jaPath, lang) {
    if (lang === 'ja') return jaPath;
    if (jaPath === '/') return `/${lang}/`;
    return `/${lang}${jaPath}`;
}

// -----------------------------------------------------------------
// 1. Each per-language URL serves a single-lang page in that lang.
// -----------------------------------------------------------------
for (const path of PAGES) {
    for (const lang of ['ja', 'en', 'fr', 'de']) {
        test(`URL serves ${lang} — ${pathForLang(path, lang)}`, async ({ page, viewport }) => {
            test.skip(!viewport || viewport.width <= 768, 'desktop only');
            await page.goto(pathForLang(path, lang));
            await expect(page.locator('html')).toHaveAttribute('data-lang', lang);
            await expect(page.locator('#lang-text')).toHaveText(lang.toUpperCase());
        });
    }
}

// -----------------------------------------------------------------
// 2. Dropdown click navigates to the sibling lang URL.
// -----------------------------------------------------------------
test('dropdown click navigates to sibling lang URL', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/guides/interval-training/');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'ja');

    const btn = page.locator('#lang-toggle');
    const menu = page.locator('#lang-menu');

    await btn.click();
    await menu.locator('[data-lang="en"]').click();
    await page.waitForURL('**/en/guides/interval-training/');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'en');

    await btn.click();
    await menu.locator('[data-lang="fr"]').click();
    await page.waitForURL('**/fr/guides/interval-training/');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'fr');

    await btn.click();
    await menu.locator('[data-lang="de"]').click();
    await page.waitForURL('**/de/guides/interval-training/');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'de');

    await btn.click();
    await menu.locator('[data-lang="ja"]').click();
    await page.waitForURL('**/guides/interval-training/');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'ja');
});

// -----------------------------------------------------------------
// 3. Legacy ?lang=X auto-redirects to the path-based URL.
// -----------------------------------------------------------------
test('legacy ?lang=fr on bare URL redirects to /fr/.../', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/guides/interval-training/?lang=fr');
    await page.waitForURL('**/fr/guides/interval-training/');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'fr');
});

test('legacy ?lang=de on root redirects to /de/', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/?lang=de');
    await page.waitForURL('**/de/');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'de');
});

// -----------------------------------------------------------------
// 4. UX bits: dropdown open/close, active highlighting.
// -----------------------------------------------------------------
test('dropdown closes when clicking outside', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/');
    const btn = page.locator('#lang-toggle');
    const menu = page.locator('#lang-menu');
    await btn.click();
    await expect(menu).toHaveClass(/open/);
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

test('active item highlighted matches current URL lang', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/fr/');
    await page.locator('#lang-toggle').click();
    const activeItem = page.locator('#lang-menu .lang-menu__item.is-active');
    await expect(activeItem).toHaveCount(1);
    await expect(activeItem).toHaveAttribute('data-lang', 'fr');
});

// -----------------------------------------------------------------
// 5. hreflang block — all 4 langs present, pointing to new path-based URLs.
// -----------------------------------------------------------------
for (const path of PAGES) {
    test(`hreflang ja/en/fr/de point to directory URLs — ${path}`, async ({ page, viewport }) => {
        test.skip(!viewport || viewport.width <= 768, 'desktop only');
        await page.goto(path);
        for (const lang of ['ja', 'en', 'fr', 'de']) {
            const link = page.locator(`link[rel="alternate"][hreflang="${lang}"]`);
            await expect(link).toHaveCount(1);
            const href = await link.getAttribute('href');
            // No legacy patterns
            expect(href).not.toMatch(/\?lang=/);
            expect(href).not.toMatch(/\.(en|fr|de)\.html$/);
            // Must be directory URL ending in /
            expect(href).toMatch(/\/$/);
            // Non-ja must have /lang/ prefix in the path
            if (lang !== 'ja') {
                expect(href).toMatch(new RegExp(`/${lang}/`));
            }
        }
    });
}

// -----------------------------------------------------------------
// 6. Old URL redirect stubs (meta-refresh) point to new URLs.
// -----------------------------------------------------------------
test('old .html URLs serve a redirect stub pointing to new directory URL', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    // Visit old URL directly via fetch (don't wait for meta refresh redirect)
    const response = await page.request.get('/guides/interval-training.html');
    const html = await response.text();
    expect(html).toMatch(/meta http-equiv="refresh"[^>]*url=https:\/\/solfegepro\.com\/guides\/interval-training\//);
});

test('old .en.html URLs redirect to /en/.../', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    const response = await page.request.get('/guides/interval-training.en.html');
    const html = await response.text();
    expect(html).toMatch(/url=https:\/\/solfegepro\.com\/en\/guides\/interval-training\//);
});
