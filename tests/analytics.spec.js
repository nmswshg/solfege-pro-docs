// @ts-check
const { test, expect } = require('@playwright/test');

const WEB_GA_ID = 'G-R009HVF9CD';
const APP_GA_ID = 'G-0364FGYZ1J';

test('deployment guard rejects app property tags in HTML and other scripts', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const { execFileSync, spawnSync } = require('child_process');
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'solfege-analytics-guard-'));
    const repoRoot = path.join(__dirname, '..');

    try {
        fs.mkdirSync(path.join(fixture, 'tools'));
        for (const file of ['analytics.js', 'bootstrap.js', 'index.html', 'tools/check-analytics-property.sh']) {
            fs.copyFileSync(path.join(repoRoot, file), path.join(fixture, file));
        }
        execFileSync('git', ['init', '-q', fixture]);
        execFileSync('git', ['add', '.'], { cwd: fixture });

        function check() {
            return spawnSync('bash', ['tools/check-analytics-property.sh'], {
                cwd: fixture,
                encoding: 'utf8',
            });
        }

        expect(check().status).toBe(0);

        for (const [file, body] of [
            ['index.html', `<script>gtag('config', '${APP_GA_ID}');</script>`],
            ['other-tag.js', `gtag('config', '${APP_GA_ID}');`],
            ['src/new-page.html', `<script src="https://www.googletagmanager.com/gtag/js?id=${APP_GA_ID}"></script>`],
        ]) {
            const target = path.join(fixture, file);
            const original = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, original + '\n' + body);
            execFileSync('git', ['add', file], { cwd: fixture });
            const result = check();
            expect(result.status, result.stderr).toBe(1);
            expect(result.stderr).toContain(file + ':');
            fs.writeFileSync(target, original);
            expect(check().status).toBe(0);
        }

        fs.mkdirSync(path.join(fixture, 'tests'));
        fs.writeFileSync(path.join(fixture, 'tests', 'forbidden-id.js'), `const forbidden = '${APP_GA_ID}';`);
        execFileSync('git', ['add', 'tests/forbidden-id.js'], { cwd: fixture });
        expect(check().status).toBe(0);
    } finally {
        fs.rmSync(fixture, { recursive: true, force: true });
    }
});

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

async function preventAppStoreNavigation(page) {
    await page.evaluate(() => {
        document.querySelectorAll('a[href*="apps.apple.com"]').forEach(a => {
            a.addEventListener('click', event => event.preventDefault());
        });
    });
}

test('analytics.js sends only to the dedicated Web property', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/');
    // Wait for analytics init
    await page.waitForFunction(() => window.SolfegeAnalytics != null);

    const cfg = await page.evaluate(() => ({
        gaId: window.SolfegeAnalytics.gaId,
        isLocal: window.SolfegeAnalytics.isLocal,
    }));
    expect(cfg.gaId).toBe(WEB_GA_ID);
    expect(cfg.gaId).not.toBe(APP_GA_ID);
    expect(cfg.isLocal).toBe(true);

    const dl = await getDataLayer(page);
    // Must include a config call
    const webConfigs = dl.filter(args => args[0] === 'config' && args[1] === WEB_GA_ID);
    const appConfigs = dl.filter(args => args[0] === 'config' && args[1] === APP_GA_ID);
    expect(webConfigs).toHaveLength(1);
    expect(appConfigs).toHaveLength(0);
    for (const event of dl.filter(args => args[0] === 'event')) {
        expect(event[2].send_to).toBe(WEB_GA_ID);
    }
});

test('LP section reach records each heading once, including tall mobile sections', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/en/');
    await page.waitForFunction(() => window.SolfegeAnalytics != null);

    async function sectionEvents() {
        return (await getDataLayer(page)).filter(a => a[0] === 'event' && a[1] === 'lp_section_view').map(a => a[2]);
    }
    await expect.poll(async () => (await sectionEvents()).map(e => e.section_id)).toContain('hero');
    const ids = ['hero', 'how', 'training', 'cycle', 'access', 'resources', 'download'];
    for (const id of ids) {
        await page.locator(`[data-lp-section="${id}"]`).locator('h1, h2').first().scrollIntoViewIfNeeded();
        await expect.poll(async () => (await sectionEvents()).map(e => e.section_id)).toContain(id);
    }
    await page.locator('[data-lp-section="how"] h2').scrollIntoViewIfNeeded();
    const events = await sectionEvents();
    expect(events.filter(e => e.section_id === 'how')).toHaveLength(1);
    for (const id of ids) {
        expect(events.filter(e => e.section_id === id)).toHaveLength(1);
    }
    for (const event of events) {
        expect(event.send_to).toBe(WEB_GA_ID);
        expect(event.site_language).toBe('en');
        expect(event.landing_version).toBe('dark-2026-10');
        expect(event.section_index).toBe(ids.indexOf(event.section_id));
    }

    await page.goto('/en/support/');
    await page.waitForFunction(() => window.SolfegeAnalytics != null);
    expect(await sectionEvents()).toHaveLength(0);
});

test.describe('LP section views during smooth navigation', () => {
    test.use({ viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });

    async function sectionIds(page) {
        return (await getDataLayer(page)).filter(a => a[0] === 'event' && a[1] === 'lp_section_view').map(a => a[2].section_id);
    }

    test('sticky download jump does not count sections passed in motion', async ({ page }) => {
        await page.goto('/en/');
        await page.waitForFunction(() => window.SolfegeAnalytics != null);
        await expect.poll(() => sectionIds(page)).toEqual(['hero']);
        await page.evaluate(() => window.scrollTo({ top: 1000, behavior: 'instant' }));
        const download = page.locator('.lp-download-bar__name');
        await expect(download).toBeVisible();
        await page.waitForTimeout(750);
        const before = await sectionIds(page);
        await download.click();
        await expect.poll(() => sectionIds(page)).toContain('download');
        expect((await sectionIds(page)).filter(id => !before.includes(id))).toEqual(['download']);
    });

    test('direct download hash does not count sections passed on initial scroll', async ({ page }) => {
        await page.goto('/en/#download');
        await page.waitForFunction(() => window.SolfegeAnalytics != null);
        await expect.poll(() => sectionIds(page)).toContain('download');
        expect(await sectionIds(page)).toEqual(['download']);
    });

    test('short landscape download entry records only its destination', async ({ page }) => {
        await page.setViewportSize({ width: 740, height: 360 });
        await page.goto('/en/#download');
        await page.waitForFunction(() => window.SolfegeAnalytics != null);
        await expect.poll(() => sectionIds(page)).toEqual(['download']);
    });

    test('continuous scrolling records reached sections without a pause', async ({ page }) => {
        await page.goto('/en/');
        await page.waitForFunction(() => window.SolfegeAnalytics != null);
        await expect.poll(() => sectionIds(page)).toEqual(['hero']);
        await page.evaluate(async () => {
            const end = document.documentElement.scrollHeight - window.innerHeight;
            for (let top = 0; top < end; top += 160) {
                window.scrollTo({ top, behavior: 'instant' });
                await new Promise(resolve => setTimeout(resolve, 80));
            }
            window.scrollTo({ top: end, behavior: 'instant' });
        });
        await expect.poll(() => sectionIds(page)).toEqual(['hero', 'how', 'training', 'cycle', 'access', 'resources', 'download']);
    });

    test('reload inside a tall section records that section without earlier sections', async ({ page }) => {
        await page.goto('/en/');
        await page.waitForFunction(() => window.SolfegeAnalytics != null);
        await page.locator('[data-lp-section="training"]').evaluate(section => {
            window.scrollTo({ top: scrollY + section.getBoundingClientRect().top + 600, behavior: 'instant' });
        });
        await expect.poll(() => page.locator('[data-lp-section="training"] h2').evaluate(heading => heading.getBoundingClientRect().bottom)).toBeLessThan(72);
        await page.reload();
        await page.waitForFunction(() => window.SolfegeAnalytics != null);
        await expect.poll(() => sectionIds(page)).toEqual(['training']);
    });
});

test('app_store_click fires on App Store link click', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/');
    await page.waitForFunction(() => window.SolfegeAnalytics != null);

    await preventAppStoreNavigation(page);

    await page.locator('a[href*="apps.apple.com"]').first().click();

    const dl = await getDataLayer(page);
    const clickEvent = dl.find(args =>
        args[0] === 'event' && args[1] === 'app_store_click'
    );
    expect(clickEvent).toBeDefined();
    const params = clickEvent[2];
    expect(params).toHaveProperty('cta_position', 'hero');
    expect(params).toHaveProperty('source_page', '/');
    expect(params).toHaveProperty('site_language');
    expect(params).toHaveProperty('app_store_locale', 'jp');
    expect(params).toHaveProperty('app_store_campaign', 'web_home');
});

test('app_store_click detects cta_position from ancestor class', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/guides/practice-spacing/');
    await page.waitForFunction(() => window.SolfegeAnalytics != null);

    await preventAppStoreNavigation(page);

    // Explicit data attribute takes precedence over class fallbacks.
    const topCta = page.locator('[data-cta-position="article_top"]');
    await topCta.click();
    let dl = await getDataLayer(page);
    let ev = dl.filter(a => a[0] === 'event' && a[1] === 'app_store_click').pop();
    expect(ev[2].cta_position).toBe('article_top');

    // Click mid_article (article-cta-subtle)
    const midCta = page.locator('.article-cta-subtle a[href*="apps.apple.com"]').first();
    await midCta.click();
    dl = await getDataLayer(page);
    ev = dl.filter(a => a[0] === 'event' && a[1] === 'app_store_click').pop();
    expect(ev[2].cta_position).toBe('mid_article');

    // Click final CTA (article-cta)
    const finalCta = page.locator('.article-cta a[href*="apps.apple.com"]').first();
    await finalCta.click();
    dl = await getDataLayer(page);
    ev = dl.filter(a => a[0] === 'event' && a[1] === 'app_store_click').pop();
    expect(ev[2].cta_position).toBe('final_cta');
});

test('landing App Store CTAs report hero, sticky and final positions', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.goto('/');
    await page.waitForFunction(() => window.SolfegeAnalytics != null);
    await preventAppStoreNavigation(page);

    const cases = [
        ['hero', '.lp-hero__actions a[href*="apps.apple.com"]'],
        ['sticky', '.lp-download-bar a[href*="apps.apple.com"]'],
        ['final', '.lp-final a[href*="apps.apple.com"]'],
    ];

    for (const [expected, selector] of cases) {
        await page.locator(selector).evaluate(link => link.click());
        const dl = await getDataLayer(page);
        const ev = dl.filter(a => a[0] === 'event' && a[1] === 'app_store_click').pop();
        expect(ev[2].cta_position).toBe(expected);
        expect(ev[2].app_store_campaign).toBe('web_home');
    }
});

test('landing App Store views use the same CTA positions', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width <= 768, 'desktop only');
    await page.addInitScript(() => {
        window.__testObservers = [];
        window.IntersectionObserver = class {
            constructor(callback) {
                this.callback = callback;
                this.targets = [];
                window.__testObservers.push(this);
            }
            observe(target) { this.targets.push(target); }
            unobserve(target) { this.targets = this.targets.filter(item => item !== target); }
            disconnect() { this.targets = []; }
        };
        window.__intersectTarget = target => {
            window.__testObservers.forEach(observer => {
                if (observer.targets.includes(target)) {
                    observer.callback([{ target, isIntersecting: true }], observer);
                }
            });
        };
    });
    await page.goto('/');
    await page.waitForFunction(() => window.SolfegeAnalytics != null);

    const cases = [
        ['hero', '.lp-hero__actions a[href*="apps.apple.com"]'],
        ['sticky', '.lp-download-bar a[href*="apps.apple.com"]'],
        ['final', '.lp-final a[href*="apps.apple.com"]'],
    ];

    for (const [expected, selector] of cases) {
        await page.locator(selector).evaluate(target => window.__intersectTarget(target));
        const dl = await getDataLayer(page);
        const ev = dl.filter(a => a[0] === 'event' && a[1] === 'app_store_view').pop();
        expect(ev[2].cta_position).toBe(expected);
        expect(ev[2].app_store_campaign).toBe('web_home');
    }
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

    await preventAppStoreNavigation(page);
    await page.locator('a[href*="apps.apple.com"]').first().click();

    const dl = await getDataLayer(page);
    const external = dl.filter(a => a[0] === 'event' && a[1] === 'external_link_click');
    expect(external.length).toBe(0);
});
