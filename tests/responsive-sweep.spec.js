// @ts-check
/**
 * Responsive layout regression sweep.
 *
 * Walks every article page across 12 viewport widths (including the
 * boundary widths 720/740/760/765/768/770/780 that catch dead zones
 * between media-query breakpoints) and asserts:
 *
 *   1. No horizontal overflow on the document.
 *   2. If a .cycle-diagram is present, the ::after arrow content
 *      matches flex-direction (→ for row, ↓ for column).
 *
 * Required reading: CLAUDE.md "CRITICAL: Responsive layout discipline"
 * and .claude/rules/responsive-layout-discipline.md.
 *
 * Run: npm run check-layout
 */
const { test, expect } = require('@playwright/test');

const PAGES = [
    // guides/ — long-form articles with diagrams
    '/guides/interval-training.html',
    '/guides/fretboard-training.html',
    '/guides/ear-training-chords.html',
    '/guides/ear-training-progressions.html',
    '/guides/ear-training-scales.html',
    '/guides/rhythm-training.html',
    '/guides/groove-training.html',
    '/guides/sight-reading.html',
    '/guides/chord-function-curriculum.html',
    '/guides/index.html',
    // practice/ — menu hubs
    '/practice/drums.html',
    '/practice/guitar-bass.html',
    '/practice/piano.html',
    '/practice/training-menu.html',
    '/practice/training-menu/interval.html',
    '/practice/features.html',
    // entry / top
    '/',
    '/start-here.html',
];

// Boundary widths matter — 720/740/760/765/768/770/780 catch dead zones
// between media-query breakpoints. Do NOT trim this list.
const WIDTHS = [375, 480, 600, 720, 740, 760, 765, 768, 770, 800, 1024, 1440];

test.describe.configure({ mode: 'parallel' });

for (const path of PAGES) {
    for (const w of WIDTHS) {
        test(`responsive ${path} @${w}px`, async ({ page }) => {
            await page.setViewportSize({ width: w, height: 900 });
            await page.goto(path);
            // Let lazy-loaded scripts settle (bootstrap.js inject).
            await page.waitForTimeout(150);

            const result = await page.evaluate(() => {
                const docOverflow =
                    document.documentElement.scrollWidth >
                    document.documentElement.clientWidth;
                const cycle = document.querySelector('.cycle-diagram');
                let cycleArrows = null;
                let cycleDir = null;
                if (cycle) {
                    cycleDir = window.getComputedStyle(cycle).flexDirection;
                    const steps = [
                        ...cycle.querySelectorAll('.cycle-step'),
                    ];
                    cycleArrows = steps.slice(0, -1).map((s) =>
                        window
                            .getComputedStyle(s, '::after')
                            .getPropertyValue('content')
                            .replace(/"/g, ''),
                    );
                }
                return { docOverflow, cycleDir, cycleArrows };
            });

            // Rule 1: never produce horizontal overflow.
            expect(
                result.docOverflow,
                `Horizontal overflow at ${path} @${w}px — violates Hard rule #2/#3`,
            ).toBe(false);

            // Rule 5: arrow direction must match flex-direction.
            if (result.cycleArrows) {
                const expected = result.cycleDir === 'column' ? '↓' : '→';
                for (const arrow of result.cycleArrows) {
                    expect(
                        arrow,
                        `cycle-diagram arrow "${arrow}" doesn't match flex-direction "${result.cycleDir}" at ${path} @${w}px — violates Hard rule #5`,
                    ).toBe(expected);
                }
            }
        });
    }
}
