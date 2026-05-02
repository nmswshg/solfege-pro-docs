// @ts-check
const { test, expect } = require('@playwright/test');

const PAGES = [
    { path: '/',                                    activeIdx: 0, name: 'TOP' },
    { path: '/start-here.html',                     activeIdx: 2, name: 'start-here' },
    { path: '/guides/',                             activeIdx: 1, name: 'guides-index' },
    { path: '/guides/groove-training.html',         activeIdx: 1, name: 'guide-article' },
    { path: '/practice/drums.html',                 activeIdx: 0, name: 'practice' },
];
const NAV_LABELS_JA = ['練習ガイド', 'ガイド一覧', 'どこから始める？'];

/**
 * Desktop nav (>= 769px): nav__list visible, hamburger hidden.
 */
for (const page of PAGES) {
    test(`desktop nav visible — ${page.name}`, async ({ page: p, viewport }) => {
        test.skip(!viewport || viewport.width <= 768, 'desktop only');
        await p.goto(page.path);
        const navList = p.locator('.nav__list');
        const hamburger = p.locator('#hamburger-btn');
        await expect(navList).toBeVisible();
        await expect(hamburger).toBeHidden();
        // 3 nav__link items
        await expect(p.locator('.nav__list .nav__link')).toHaveCount(3);
        // active state
        const links = await p.locator('.nav__list .nav__link').all();
        for (let i = 0; i < links.length; i++) {
            if (i === page.activeIdx) {
                await expect(links[i]).toHaveClass(/active/);
            } else {
                await expect(links[i]).not.toHaveClass(/active/);
            }
        }
    });
}

/**
 * Mobile nav (<= 768px): hamburger visible, nav__list hidden, drawer toggles.
 */
for (const page of PAGES) {
    test(`mobile drawer toggle — ${page.name}`, async ({ page: p, viewport }) => {
        test.skip(!viewport || viewport.width > 768, 'mobile only');
        await p.goto(page.path);
        const navList = p.locator('.nav__list');
        const hamburger = p.locator('#hamburger-btn');
        const drawer = p.locator('#drawer');
        const overlay = p.locator('#drawer-overlay');

        // initial state
        await expect(hamburger).toBeVisible();
        await expect(navList).toBeHidden();
        // drawer offscreen (right: -280px) — element exists but not visible
        await expect(drawer).not.toHaveClass(/active/);

        // open
        await hamburger.click();
        await expect(drawer).toHaveClass(/active/);
        await expect(overlay).toHaveClass(/active/);

        // 3 drawer links present
        await expect(p.locator('.drawer__list .drawer__link')).toHaveCount(3);

        // close via dedicated close button (overlay click area is too small at 320px)
        await p.locator('#drawer-close').click();
        await expect(drawer).not.toHaveClass(/active/);
    });
}

/**
 * iPhone SE (320px): nav must not horizontally overflow.
 */
test.describe('iPhone SE — no horizontal overflow', () => {
    test.use({ viewport: { width: 320, height: 568 } });
    for (const page of PAGES) {
        test(`no horizontal overflow — ${page.name}`, async ({ page: p }) => {
            await p.goto(page.path);
            const docWidth = await p.evaluate(() => document.documentElement.scrollWidth);
            const winWidth = await p.evaluate(() => window.innerWidth);
            expect(docWidth, `${page.name} horizontal overflow at 320px`).toBeLessThanOrEqual(winWidth + 1);
        });
    }
});

/**
 * Cross-page nav consistency: HTML structure of <nav> identical (modulo href/active).
 */
test('nav HTML structurally identical across pages', async ({ page: p }) => {
    const navs = [];
    for (const pg of PAGES) {
        await p.goto(pg.path);
        const html = await p.locator('nav.nav').innerHTML();
        const norm = html
            .replace(/href="[^"]*"/g, 'href="*"')
            .replace(/src="[^"]*"/g, 'src="*"')
            .replace(/\s+active(?=")/g, '')
            .replace(/\s+/g, ' ').trim();
        navs.push(norm);
    }
    const unique = new Set(navs);
    expect(unique.size, 'navs differ across pages').toBe(1);
});
