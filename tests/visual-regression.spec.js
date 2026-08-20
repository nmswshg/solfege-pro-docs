// @ts-check
/**
 * Visual (screenshot) regression sweep.
 *
 * Complements responsive-sweep.spec.js: that sweep catches *measurable*
 * breakage (horizontal overflow, cycle-arrow direction) programmatically;
 * THIS sweep catches the *visual* breakage those checks can't see —
 * misaligned grids, broken/squished images, font/CLS shifts, spacing
 * regressions, decoration that lands in the wrong place, etc.
 *
 * Baselines live in tests/visual-regression.spec.js-snapshots/ and are
 * committed. Workflow:
 *   npm run test:visual          # compare against committed baselines (CI/pre-commit)
 *   npm run test:visual:update   # accept intentional visual changes (regenerate baselines)
 *
 * Coverage = representative layouts × {mobile, tablet, desktop} × {ja, de}.
 * German (/de) is included as the worst-case text-length stress (long
 * compound words are what broke chord-function-curriculum at 375px).
 * Required reading: CLAUDE.md "CRITICAL: Responsive layout discipline".
 */
const { test, expect } = require('@playwright/test');

// Diverse layouts: home, hub, guide-with-table, guide-with-cycle-diagram,
// practice hub, and a preset/menu page (chips + tables).
const PAGES = [
    '/',
    '/start-here/',
    '/support/',
    '/privacy/',
    '/terms/',
    '/pricing/',
    '/features/',
    '/free-vs-pro/',
    '/faq/',
    '/release-history/',
    '/guides/interval-training/',
    '/guides/chord-function-curriculum/',
    '/guides/ear-training-progressions/',
    '/practice/piano/',
    '/practice/training-menu/interval/',
    '/manual/',
    '/manual/chord/',
];

const VIEWPORTS = [
    { name: 'mobile', width: 375 },
    { name: 'tablet', width: 768 },
    { name: 'desktop', width: 1440 },
];

// ja baseline + German (longest text → best layout stress case).
const LANGS = [
    { name: 'ja', prefix: '' },
    { name: 'de', prefix: '/de' },
];

// This spec drives its own viewport, so run it once (desktop project only) —
// otherwise every config project would regenerate a parallel set of baselines.
test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'visual regression runs once, on the desktop project');
});

test.describe.configure({ mode: 'parallel' });

for (const lang of LANGS) {
    for (const path of PAGES) {
        for (const vp of VIEWPORTS) {
            test(`visual ${lang.name} ${path} @${vp.name}`, async ({ page }) => {
                // Reduced motion is REQUIRED, not cosmetic: scroll reveals are
                // driven by IntersectionObserver, and `fullPage: true` captures
                // below-fold content WITHOUT scrolling — so every .reveal target
                // below the fold used to be photographed at opacity 0. That left
                // whole sections unverified (e.g. the 9 guide cards on the home
                // page). Under prefers-reduced-motion the reveal path is skipped
                // entirely, so the settled layout is what gets captured.
                await page.emulateMedia({ reducedMotion: 'reduce' });
                await page.setViewportSize({ width: vp.width, height: 900 });
                await page.goto(lang.prefix + path, { waitUntil: 'networkidle' });
                // Wait for web fonts so text metrics (and wrapping) are stable.
                await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true));
                await page.waitForTimeout(250);

                const slug = path === '/' ? 'home' : path.replace(/^\/|\/$/g, '').replace(/\//g, '-');
                await expect(page).toHaveScreenshot(`${lang.name}__${slug}__${vp.name}.png`, {
                    fullPage: true,
                    animations: 'disabled',
                    // Absolute pixel budget, NOT a ratio. These are full-page
                    // shots up to ~3000px tall, so maxDiffPixelRatio: 0.01 granted
                    // a ~43,000-pixel budget — while the actual signal for a
                    // text-level regression is ~16 pixels. Measured 2026-07-25: a
                    // stale "1週間無料トライアル" price line and a "7 Features" badge
                    // both PASSED against a HEAD that renders "月額 980 円" / "8".
                    // Noise floor was then measured at exactly 0 differing pixels
                    // across all 54 shots, because the per-pixel `threshold`
                    // (default 0.2, YIQ) already absorbs anti-aliasing variation.
                    // So 0 is the correct budget: AA is handled per pixel, and
                    // this number only has to cover *content* drift. If a Chromium
                    // or font-stack upgrade shifts rendering globally, regenerate
                    // with `npm run test:visual:update` after eyeballing the diff.
                    maxDiffPixels: 0,
                });
            });
        }
    }
}

/**
 * Component baseline: the tap-timing widget on guides/rhythm-training.
 *
 * This one is captured as an ELEMENT, not fullPage, and deliberately so.
 * That page renders four Mermaid diagrams from a CDN module, and their
 * async layout makes the document height wobble by up to ~9px between
 * loads (measured 2026-07-26: five loads gave 11320/11329/11320/11320/11320,
 * versus a spread of exactly 0 on interval-training). A full-page baseline
 * there is therefore permanently flaky at maxDiffPixels: 0 — but the widget
 * itself is static markup and screenshots cleanly.
 *
 * The idle state is what gets captured: the measurement is user-initiated,
 * so there is nothing running at rest.
 */
for (const lang of LANGS) {
    for (const vp of VIEWPORTS) {
        test(`visual ${lang.name} tap-test widget @${vp.name}`, async ({ page }) => {
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await page.setViewportSize({ width: vp.width, height: 900 });
            await page.goto(lang.prefix + '/guides/rhythm-training/', { waitUntil: 'networkidle' });
            await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true));
            await page.waitForTimeout(250);

            const widget = page.locator('.tap-test');
            await expect(widget).toHaveScreenshot(`${lang.name}__tap-test__${vp.name}.png`, {
                animations: 'disabled',
                maxDiffPixels: 0,
            });
        });
    }
}
