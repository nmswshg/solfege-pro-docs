// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * GA4 analytics behavior tests.
 *
 * Strategy:
 *  - On localhost (where these tests run), analytics.js skips loading gtag.js
 *    externally but still queues events to window.dataLayer.
 *  - We inspect window.dataLayer to verify events fire with the correct shape.
 *  - No real network requests hit GA, so test runs do not pollute production data.
 */

async function getDataLayer(page) {
    return await page.evaluate(() => {
        return (window.dataLayer || []).map(args => Array.from(args));
    });
}

test('analytics.js loads and configures GA4', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/');
    // Wait for analytics init
    await page.waitForFunction(() => window.SolfegeAnalytics != null);

    const cfg = await page.evaluate(() => ({
        gaId: window.SolfegeAnalytics.gaId,
        isLocal: window.SolfegeAnalytics.isLocal,
    }));
    expect(cfg.gaId).toBe('G-R009HVF9CD');
    expect(cfg.isLocal).toBe(true);

    const dl = await getDataLayer(page);
    // Must include a config call
    const hasConfig = dl.some(args => args[0] === 'config' && args[1] === 'G-R009HVF9CD');
    expect(hasConfig).toBe(true);
});

test('app_store_click fires on App Store link click', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/');
    await page.waitForFunction(() => window.SolfegeAnalytics != null);

    // Defuse navigation: replace the href on all App Store links so click() doesn't navigate away
    await page.evaluate(() => {
        document.querySelectorAll('a[href*="apps.apple.com"]').forEach(a => {
            a.dataset.realHref = a.href;
            a.setAttribute('href', 'javascript:void(0)');
        });
    });

    await page.locator('a[data-real-href]').first().click();

    const dl = await getDataLayer(page);
    const clickEvent = dl.find(args =>
        args[0] === 'event' && args[1] === 'app_store_click'
    );
    expect(clickEvent).toBeDefined();
    const params = clickEvent[2];
    expect(params).toHaveProperty('cta_position');
    expect(params).toHaveProperty('source_page', '/');
    expect(params).toHaveProperty('site_language');
});

test('app_store_click detects cta_position from ancestor class', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/guides/practice-spacing.html');
    await page.waitForFunction(() => window.SolfegeAnalytics != null);

    // Defuse navigation
    await page.evaluate(() => {
        document.querySelectorAll('a[href*="apps.apple.com"]').forEach(a => {
            a.dataset.realHref = a.href;
            a.setAttribute('href', 'javascript:void(0)');
        });
    });

    // Click mid_article (article-cta-subtle)
    const midCta = page.locator('.article-cta-subtle a[data-real-href]').first();
    await midCta.click();
    let dl = await getDataLayer(page);
    let ev = dl.filter(a => a[0] === 'event' && a[1] === 'app_store_click').pop();
    expect(ev[2].cta_position).toBe('mid_article');

    // Click final CTA (article-cta)
    const finalCta = page.locator('.article-cta a[data-real-href]').first();
    await finalCta.click();
    dl = await getDataLayer(page);
    ev = dl.filter(a => a[0] === 'event' && a[1] === 'app_store_click').pop();
    expect(ev[2].cta_position).toBe('final_cta');
});

test('lang_change fires when user switches languages', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/?lang=ja');
    await page.waitForFunction(() => window.SolfegeAnalytics != null);

    // open dropdown and pick fr
    await page.locator('#lang-toggle').click();
    await page.locator('#lang-menu [data-lang="fr"]').click();

    const dl = await getDataLayer(page);
    const ev = dl.find(a => a[0] === 'event' && a[1] === 'lang_change');
    expect(ev).toBeDefined();
    expect(ev[2].from_lang).toBe('ja');
    expect(ev[2].to_lang).toBe('fr');
});

test('initial lang_change is NOT fired on page load', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/?lang=fr');
    await page.waitForFunction(() => window.SolfegeAnalytics != null);

    const dl = await getDataLayer(page);
    const langEvents = dl.filter(a => a[0] === 'event' && a[1] === 'lang_change');
    expect(langEvents.length).toBe(0);
});

test('external_link_click does NOT fire for App Store badges (handled separately)', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/');
    await page.waitForFunction(() => window.SolfegeAnalytics != null);

    await page.evaluate(() => {
        document.querySelectorAll('a[href*="apps.apple.com"]').forEach(a => {
            a.dataset.realHref = a.href;
            a.setAttribute('href', 'javascript:void(0)');
        });
    });
    await page.locator('a[data-real-href]').first().click();

    const dl = await getDataLayer(page);
    const external = dl.filter(a => a[0] === 'event' && a[1] === 'external_link_click');
    expect(external.length).toBe(0);
});
