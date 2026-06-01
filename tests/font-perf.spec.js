// Font-loading performance harness (measurement-driven, not guess-driven).
//
// Compares the CURRENT served pages against whatever the local server returns,
// under a cold cache + throttled-network profile, capturing the metrics that the
// font strategy actually trades off:
//   - FCP  (First Contentful Paint)  — when any text/paint first appears
//   - LCP  (Largest Contentful Paint)
//   - CLS  (Cumulative Layout Shift) — font swap can nudge this
//   - fontsReadyMs — document.fonts.ready relative to navigationStart
//   - renderBlockingFontCss — was the Google Fonts CSS request render-blocking?
//
// Run against a baseline build, then against the async-swap build, and diff the
// JSON. This is the LOG that decides whether async-swap is a real UX win.
//
// Usage:
//   BASE_URL=http://localhost:8890 LABEL=baseline npx playwright test tests/font-perf.spec.js --project=desktop
const { test, expect } = require('@playwright/test');
const fs = require('fs');

const BASE = process.env.BASE_URL || 'http://localhost:8890';
const LABEL = process.env.LABEL || 'run';
const OUT = process.env.OUT || `/tmp/font-perf-${LABEL}.json`;

// Representative pages: JP-heavy home, a guide article, and the German stress page.
const PAGES = [
  { name: 'home-ja', url: '/' },
  { name: 'guide-ja', url: '/guides/interval-training/' },
  { name: 'home-de', url: '/de/' },
  { name: 'guide-de', url: '/de/guides/interval-training/' },
];

// Slow-3G-ish throttling so the font round-trip actually matters (on localhost
// with no throttle the difference is invisible — which would be a misleading LOG).
const NET = { downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 };

test.describe('font performance', () => {
  const results = [];

  for (const p of PAGES) {
    test(`${LABEL} ${p.name}`, async ({ page, browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const fresh = await ctx.newPage();

      // Apply CPU+network throttle via CDP (Chromium only).
      const client = await ctx.newCDPSession(fresh);
      await client.send('Network.enable');
      await client.send('Network.emulateNetworkConditions', { offline: false, ...NET });
      await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

      // Track whether the Google Fonts CSS was requested with render-blocking priority.
      let fontCssRenderBlocking = null;
      let fontCssStartMs = null;
      fresh.on('request', (req) => {
        if (req.url().includes('fonts.googleapis.com/css')) {
          fontCssStartMs = Date.now();
        }
      });

      await fresh.goto(BASE + p.url, { waitUntil: 'load', timeout: 60000 });

      // Give paint + font swap time to settle, then read the Performance API.
      const metrics = await fresh.evaluate(async () => {
        const out = {};
        const paints = performance.getEntriesByType('paint');
        const fcp = paints.find((e) => e.name === 'first-contentful-paint');
        out.fcpMs = fcp ? Math.round(fcp.startTime) : null;

        // LCP via buffered observer
        out.lcpMs = await new Promise((res) => {
          let last = null;
          try {
            new PerformanceObserver((list) => { for (const e of list.getEntries()) last = e; })
              .observe({ type: 'largest-contentful-paint', buffered: true });
          } catch (e) {}
          setTimeout(() => res(last ? Math.round(last.startTime) : null), 500);
        });

        // CLS
        out.cls = await new Promise((res) => {
          let sum = 0;
          try {
            new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) sum += e.value; })
              .observe({ type: 'layout-shift', buffered: true });
          } catch (e) {}
          setTimeout(() => res(Math.round(sum * 1000) / 1000), 500);
        });

        // Fonts ready time
        const t0 = performance.timeOrigin;
        await document.fonts.ready;
        out.fontsReadyMs = Math.round(performance.now());
        out.fontFamiliesLoaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`);

        // Was the Google Fonts CSS a render-blocking <link rel=stylesheet>?
        const links = [...document.querySelectorAll('link')];
        const gf = links.find((l) => (l.href || '').includes('fonts.googleapis.com/css'));
        out.googleFontsLinkRel = gf ? gf.getAttribute('rel') : null;
        out.googleFontsLinkMedia = gf ? gf.getAttribute('media') : null;
        out.hasPreload = links.some((l) => l.rel === 'preload' && (l.href || '').includes('fonts.googleapis.com'));
        return out;
      });

      metrics.page = p.name;
      metrics.label = LABEL;
      // worker-safe: append one JSON line per page to a shared .ndjson
      fs.appendFileSync(OUT, JSON.stringify(metrics) + '\n');
      console.log(`[${LABEL}] ${p.name}: FCP=${metrics.fcpMs}ms LCP=${metrics.lcpMs}ms CLS=${metrics.cls} fontsReady=${metrics.fontsReadyMs}ms rel=${metrics.googleFontsLinkRel} media=${metrics.googleFontsLinkMedia} preload=${metrics.hasPreload}`);
      await ctx.close();
    });
  }
});
