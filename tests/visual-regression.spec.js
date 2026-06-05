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
                await page.setViewportSize({ width: vp.width, height: 900 });
                await page.goto(lang.prefix + path, { waitUntil: 'networkidle' });
                // Wait for web fonts so text metrics (and wrapping) are stable.
                await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true));
                await page.waitForTimeout(250);

                const slug = path === '/' ? 'home' : path.replace(/^\/|\/$/g, '').replace(/\//g, '-');
                await expect(page).toHaveScreenshot(`${lang.name}__${slug}__${vp.name}.png`, {
                    fullPage: true,
                    animations: 'disabled',
                    // Small tolerance absorbs sub-pixel anti-aliasing noise
                    // without hiding real layout shifts.
                    maxDiffPixelRatio: 0.01,
                });
            });
        }
    }
}
