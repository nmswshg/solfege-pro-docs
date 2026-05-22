// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Path-based language URLs (since 2026-05-23):
 *   ja: /foo.html         (no suffix — 従来通り)
 *   en: /foo.en.html
 *   fr: /foo.fr.html
 *   de: /foo.de.html
 *
 * The legacy ?lang=X query is auto-redirected to the new URL on page load.
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

/**
 * Convert a ja path to its .X.html variant. Handles trailing-slash directories
 * (treated as /index.X.html).
 */
function pathForLang(jaPath, lang) {
    if (lang === 'ja') return jaPath;
    if (jaPath.endsWith('/')) return jaPath + 'index.' + lang + '.html';
    return jaPath.replace(/\.html$/, '.' + lang + '.html');
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
    await page.goto('/guides/interval-training.html'); // start on ja
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'ja');

    const btn = page.locator('#lang-toggle');
    const menu = page.locator('#lang-menu');

    // ja → en
    await btn.click();
    await menu.locator('[data-lang="en"]').click();
    await page.waitForURL('**/guides/interval-training.en.html');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'en');

    // en → fr
    await btn.click();
    await menu.locator('[data-lang="fr"]').click();
    await page.waitForURL('**/guides/interval-training.fr.html');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'fr');

    // fr → de
    await btn.click();
    await menu.locator('[data-lang="de"]').click();
    await page.waitForURL('**/guides/interval-training.de.html');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'de');

    // de → ja (drops the suffix)
    await btn.click();
    await menu.locator('[data-lang="ja"]').click();
    await page.waitForURL('**/guides/interval-training.html');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'ja');
});

// -----------------------------------------------------------------
// 3. Legacy ?lang=X auto-redirects to the path-based URL.
// -----------------------------------------------------------------
test('legacy ?lang=fr on bare URL redirects to .fr.html', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/guides/interval-training.html?lang=fr');
    await page.waitForURL('**/guides/interval-training.fr.html');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'fr');
});

test('legacy ?lang=de on root redirects to /index.de.html', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/?lang=de');
    await page.waitForURL('**/index.de.html');
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
    await page.goto('/index.fr.html');
    await page.locator('#lang-toggle').click();
    const activeItem = page.locator('#lang-menu .lang-menu__item.is-active');
    await expect(activeItem).toHaveCount(1);
    await expect(activeItem).toHaveAttribute('data-lang', 'fr');
});

// -----------------------------------------------------------------
// 5. hreflang block — all 4 langs present, pointing to path-based URLs.
// -----------------------------------------------------------------
for (const path of PAGES) {
    test(`hreflang ja/en/fr/de point to path-based URLs — ${path}`, async ({ page, viewport }) => {
        test.skip(!viewport || viewport.width <= 768, 'desktop only');
        await page.goto(path);
        for (const lang of ['ja', 'en', 'fr', 'de']) {
            const link = page.locator(`link[rel="alternate"][hreflang="${lang}"]`);
            await expect(link).toHaveCount(1);
            const href = await link.getAttribute('href');
            // Must NOT contain ?lang= (legacy format)
            expect(href).not.toMatch(/\?lang=/);
            // Must be path-based: bare .html for ja, .X.html for others, or trailing /
            if (lang === 'ja') {
                expect(href).toMatch(/(?:\.html|\/)$/);
            } else {
                expect(href).toMatch(new RegExp(`\\.(${lang}\\.html|/)$`));
            }
        }
    });
}
