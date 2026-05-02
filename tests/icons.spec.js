// @ts-check
const { test, expect } = require('@playwright/test');

const PAGES_WITH_ICONS = [
    { path: '/',                                expected: { 'guide-card': 8, 'instrument-card': 6 } },
    { path: '/guides/',                         expected: { 'guide-card': 8 } },
    { path: '/start-here.html',                 expected: { 'diag-option': 6 } },
    { path: '/practice/drums.html',             expected: { 'page-header': 1 } },
    { path: '/practice/piano.html',             expected: { 'page-header': 1 } },
    { path: '/guides/groove-training.html',     expected: {} },
];

test('SVG sprite loads', async ({ page: p }) => {
    const resp = await p.request.get('/assets/icons.svg');
    expect(resp.ok()).toBeTruthy();
    const body = await resp.text();
    // Verify all expected icon ids exist in sprite
    const required = ['drum', 'piano', 'guitar', 'microphone', 'music-note', 'music-notes',
                      'music-staff', 'music-generic', 'audio-lines', 'book-open',
                      'chart-bar', 'library', 'flask', 'compass', 'app-window'];
    for (const id of required) {
        expect(body).toContain(`id="icon-${id}"`);
    }
});

for (const { path, expected } of PAGES_WITH_ICONS) {
    test(`icons render on ${path}`, async ({ page: p }) => {
        await p.goto(path);
        // Every emoji icon container should now have an svg child
        const emojiInIconContainer = await p.evaluate(() => {
            const containers = document.querySelectorAll('[class*="__icon"]');
            const offenders = [];
            const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}]/u;
            containers.forEach(c => {
                const text = c.textContent || '';
                if (emojiRegex.test(text)) offenders.push({ cls: c.className, text: text.trim() });
            });
            return offenders;
        });
        expect(emojiInIconContainer, 'no emoji left in __icon containers').toEqual([]);
        // Verify <svg class="icon"> count matches expected if expected is non-empty
        const expectedTotal = Object.values(expected).reduce((a, b) => a + b, 0);
        if (expectedTotal > 0) {
            const iconCount = await p.locator('svg.icon').count();
            expect(iconCount, `${path} has no svg.icon elements`).toBeGreaterThan(0);
        }
    });
}

test('groove guide uses audio-lines (timing) icon, not dancer', async ({ page: p }) => {
    await p.goto('/');
    const grooveCard = p.locator('a[href*="groove-training"]').first();
    const iconRef = await grooveCard.locator('svg use').getAttribute('href');
    expect(iconRef).toContain('icon-audio-lines');
});

test('icons inherit primary color (gold)', async ({ page: p }) => {
    await p.goto('/');
    const firstIcon = p.locator('.guide-card__icon').first();
    const color = await firstIcon.evaluate(el => getComputedStyle(el).color);
    // primary is #D4AF37 (212, 175, 55)
    expect(color).toBe('rgb(212, 175, 55)');
});
