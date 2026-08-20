// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Directory-based per-language URLs (since 2026-05-26):
 *   ja: /, /start-here/, /guides/foo/, /practice/foo/
 *   en: /en/, /en/start-here/, /en/guides/foo/
 *   fr: /fr/...
 *   de: /de/...
 *   es: /es/...  it: /it/...  ko: /ko/...  pt-BR: /pt-br/...
 *
 * Old URLs (foo.html, foo.X.html) serve meta-refresh redirect stubs.
 * Legacy ?lang=X query is auto-redirected by lang-toggle.js.
 */

const translationSource = require('../data/translation-source.json');

function sourcePathToJaPath(sourcePath) {
    if (sourcePath === 'index.html') return '/';
    return `/${sourcePath.replace(/index\.html$/, '').replace(/\.html$/, '/')}`;
}

// The translation source is extracted from every public source page. Deriving
// this list prevents a newly added page from silently shipping in only four
// languages because a hand-maintained test list was not updated.
const PAGES = Object.keys(translationSource.pages).map(sourcePathToJaPath);

/**
 * Convert a ja path to its /lang/ prefixed equivalent.
 */
function pathForLang(jaPath, lang) {
    if (lang === 'ja') return jaPath;
    const prefix = lang === 'pt-BR' ? 'pt-br' : lang;
    if (jaPath === '/') return `/${prefix}/`;
    return `/${prefix}${jaPath}`;
}

const ALL_LANGS = ['ja', 'en', 'fr', 'de', 'es', 'it', 'ko', 'pt-BR'];
const LANG_LABEL = { ja: 'JA', en: 'EN', fr: 'FR', de: 'DE', es: 'ES', it: 'IT', ko: 'KO', 'pt-BR': 'PT-BR' };

// -----------------------------------------------------------------
// 1. Each per-language URL serves a single-lang page in that lang.
// -----------------------------------------------------------------
for (const path of PAGES) {
    for (const lang of ALL_LANGS) {
        test(`URL serves ${lang} — ${pathForLang(path, lang)}`, async ({ page, viewport }) => {
            test.skip(!viewport || viewport.width <= 768, 'desktop only');
            await page.goto(pathForLang(path, lang));
            await expect(page.locator('html')).toHaveAttribute('data-lang', lang);
            await expect(page.locator('#lang-text')).toHaveText(LANG_LABEL[lang]);
            await expect(page.locator('footer a[href*="apps.apple.com"]')).toHaveCount(0);
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
    await expect(menu.locator('[data-lang]')).toHaveCount(8);
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
    await menu.locator('[data-lang="es"]').click();
    await page.waitForURL('**/es/guides/interval-training/');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'es');

    await btn.click();
    await menu.locator('[data-lang="it"]').click();
    await page.waitForURL('**/it/guides/interval-training/');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'it');

    await btn.click();
    await menu.locator('[data-lang="ko"]').click();
    await page.waitForURL('**/ko/guides/interval-training/');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'ko');

    await btn.click();
    await menu.locator('[data-lang="pt-BR"]').click();
    await page.waitForURL('**/pt-br/guides/interval-training/');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'pt-BR');

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
    await expect(activeItem).toHaveAttribute('aria-current', 'page');
    await expect(activeItem).toHaveAttribute('aria-checked', 'true');
});

test('language menu uses crawlable links and no duplicate footer switcher', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/ko/terms/');
    const links = page.locator('#lang-menu a[data-lang]');
    await expect(links).toHaveCount(8);
    await expect(page.locator('#lang-toggle')).toHaveAttribute('aria-label', /한국어/);
    await expect(page.locator('body > nav[aria-label="Language"]')).toHaveCount(0);
});

// -----------------------------------------------------------------
// 5. hreflang block — all 8 langs present, pointing to new path-based URLs.
// -----------------------------------------------------------------
for (const path of PAGES) {
    test(`hreflang all 8 languages point to directory URLs — ${path}`, async ({ page, viewport }) => {
        test.skip(!viewport || viewport.width <= 768, 'desktop only');
        await page.goto(path);
        for (const lang of ALL_LANGS) {
            const link = page.locator(`link[rel="alternate"][hreflang="${lang}"]`);
            await expect(link).toHaveCount(1);
            const href = await link.getAttribute('href');
            // No legacy patterns
            expect(href).not.toMatch(/\?lang=/);
            expect(href).not.toMatch(/\.(en|fr|de|es|it|ko|pt-br)\.html$/);
            // Must be directory URL ending in /
            expect(href).toMatch(/\/$/);
            // Non-ja must have /lang/ prefix in the path
            if (lang !== 'ja') {
                const prefix = lang === 'pt-BR' ? 'pt-br' : lang;
                expect(href).toMatch(new RegExp(`/${prefix}/`));
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

// -----------------------------------------------------------------
// 7. The former /app/ LP is consolidated into each localized root.
// -----------------------------------------------------------------
for (const lang of ALL_LANGS) {
    test(`/app/ redirect signals point to the ${lang} root`, async ({ page, viewport }) => {
        test.skip(!viewport || viewport.width <= 768, 'desktop only');
        const prefix = lang === 'ja' ? '' : `/${lang === 'pt-BR' ? 'pt-br' : lang}`;
        const target = `https://solfegepro.com${prefix}/`;
        const response = await page.request.get(`${prefix}/app/`);
        const html = await response.text();
        expect(html).toContain('<meta name="robots" content="noindex, follow">');
        expect(html).toContain(`<link rel="canonical" href="${target}">`);
        expect(html).toContain(`url=${target}`);
        expect(html).toContain(`location.replace("${target}")`);
    });
}

// -----------------------------------------------------------------
// 8. Root SEO signals and SoftwareApplication data stay localized.
// -----------------------------------------------------------------
const ROOT_SEO = {
    ja: { path: '/', locale: 'jp', currency: 'JPY' },
    en: { path: '/en/', locale: 'us', currency: 'USD' },
    fr: { path: '/fr/', locale: 'fr', currency: 'EUR' },
    de: { path: '/de/', locale: 'de', currency: 'EUR' },
    es: { path: '/es/', locale: 'es', currency: 'EUR' },
    it: { path: '/it/', locale: 'it', currency: 'EUR' },
    ko: { path: '/ko/', locale: 'kr', currency: 'KRW' },
    'pt-BR': { path: '/pt-br/', locale: 'br', currency: 'BRL' },
};

for (const [lang, expected] of Object.entries(ROOT_SEO)) {
    test(`root canonical and SoftwareApplication are localized — ${lang}`, async ({ page, viewport }) => {
        test.skip(!viewport || viewport.width <= 768, 'desktop only');
        await page.goto(expected.path);
        const canonical = `https://solfegepro.com${expected.path}`;
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical);
        const description = await page.locator('meta[name="description"]').getAttribute('content');
        expect(description?.trim().length).toBeGreaterThan(40);
        await expect(page.locator('h1')).toHaveCount(1);

        const graph = await page.locator('script[type="application/ld+json"]').evaluateAll((scripts) =>
            scripts.map((script) => JSON.parse(script.textContent || '{}')).find((data) => Array.isArray(data['@graph'])),
        );
        const app = graph['@graph'].find((node) => node['@type'] === 'SoftwareApplication');
        expect(app.url).toBe(canonical);
        expect(app.inLanguage).toBe(lang);
        expect(app.downloadUrl).toContain(`apps.apple.com/${expected.locale}/`);
        expect(app.offers.priceCurrency).toBe(expected.currency);
    });
}

test('sitemap promotes roots and excludes the retired /app/ URLs', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    const response = await page.request.get('/sitemap.xml');
    const xml = await response.text();
    expect((xml.match(/<loc>/g) || []).length).toBe(PAGES.length * ALL_LANGS.length);
    expect(xml).toContain('<loc>https://solfegepro.com/</loc>');
    expect(xml).toContain('<loc>https://solfegepro.com/en/</loc>');
    expect(xml).toContain('<loc>https://solfegepro.com/es/</loc>');
    expect(xml).toContain('<loc>https://solfegepro.com/it/</loc>');
    expect(xml).toContain('<loc>https://solfegepro.com/ko/</loc>');
    expect(xml).toContain('<loc>https://solfegepro.com/pt-br/</loc>');
    expect(xml).toContain('<loc>https://solfegepro.com/practice/</loc>');
    expect(xml).not.toContain('solfegepro.com/app/');
    expect(xml).not.toContain('solfegepro.com/en/app/');
});
