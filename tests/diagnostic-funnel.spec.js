// @ts-check
// Diagnostic funnel GA4 event tracking — verifies the 6 events fired by
// start-here.html (persona → instrument → pain → complete → guide_click → restart)
// arrive with the right payload, with persona context threaded through
// downstream events.
//
// Setup: each test installs a setter trap on `window.SolfegeAnalytics` that
// captures every track() call into `window.__events__` BEFORE analytics.js
// runs. The original track still executes (preserving dataLayer behavior).

const { test, expect } = require('@playwright/test');

async function installEventCapture(page) {
    await page.addInitScript(() => {
        window.__events__ = [];
        Object.defineProperty(window, 'SolfegeAnalytics', {
            configurable: true,
            set: function (v) {
                this._sa = v;
                const original = v.track;
                v.track = function (name, params) {
                    // Call original first — it mutates params to add
                    // site_language and page_path. Capture AFTER mutation.
                    const result = original.call(v, name, params);
                    window.__events__.push({ name, params: Object.assign({}, params) });
                    return result;
                };
            },
            get: function () { return this._sa; }
        });
    });
}

async function completeFunnel(page, { persona = 'dtm', instrument = 'guitar' } = {}) {
    await page.goto('/start-here.html');
    await page.waitForSelector('#step-persona .diag-option');
    await page.click(`[data-persona="${persona}"]`);
    await page.waitForSelector('#step-instrument:not([hidden]) .diag-option');
    await page.click(`#step-instrument [data-instrument="${instrument}"]`);
    await page.waitForSelector('#step-pain:not([hidden]) .diag-option');
    await page.click('#step-pain .diag-option:first-child');
    await page.waitForSelector('#step-result:not([hidden]) .diag-result__cta');
}

test.describe('Diagnostic funnel GA4 events', () => {
    test('happy path fires persona → instrument → pain → complete in order', async ({ page }) => {
        await installEventCapture(page);
        await completeFunnel(page, { persona: 'dtm', instrument: 'guitar' });

        const events = await page.evaluate(() => window.__events__);
        const names = events.map(e => e.name);

        // Order matters — diagnostic_complete must come after pain_select
        const personaIdx = names.indexOf('diagnostic_persona_select');
        const instrumentIdx = names.indexOf('diagnostic_instrument_select');
        const painIdx = names.indexOf('diagnostic_pain_select');
        const completeIdx = names.indexOf('diagnostic_complete');

        expect(personaIdx).toBeGreaterThanOrEqual(0);
        expect(instrumentIdx).toBeGreaterThan(personaIdx);
        expect(painIdx).toBeGreaterThan(instrumentIdx);
        expect(completeIdx).toBeGreaterThan(painIdx);
    });

    test('persona context propagates to all downstream events', async ({ page }) => {
        await installEventCapture(page);
        await completeFunnel(page, { persona: 'parent', instrument: 'piano' });

        const events = await page.evaluate(() => window.__events__);
        const personasInDownstream = events
            .filter(e => ['diagnostic_instrument_select', 'diagnostic_pain_select', 'diagnostic_complete'].includes(e.name))
            .map(e => e.params.persona);

        // Every downstream event carries persona = 'parent'
        expect(personasInDownstream.length).toBeGreaterThanOrEqual(3);
        for (const persona of personasInDownstream) {
            expect(persona).toBe('parent');
        }
    });

    test('instrument context propagates to pain and complete events', async ({ page }) => {
        await installEventCapture(page);
        await completeFunnel(page, { persona: 'beginner', instrument: 'drums' });

        const events = await page.evaluate(() => window.__events__);
        const painEvent = events.find(e => e.name === 'diagnostic_pain_select');
        const completeEvent = events.find(e => e.name === 'diagnostic_complete');

        expect(painEvent.params.instrument).toBe('drums');
        expect(completeEvent.params.instrument).toBe('drums');
    });

    test('diagnostic_complete payload has all 5 fields (persona, instrument, pain_index, pain_ja, guide_path)', async ({ page }) => {
        await installEventCapture(page);
        await completeFunnel(page, { persona: 'session', instrument: 'guitar' });

        const events = await page.evaluate(() => window.__events__);
        const completeEvent = events.find(e => e.name === 'diagnostic_complete');

        expect(completeEvent).toBeDefined();
        expect(completeEvent.params).toMatchObject({
            persona: 'session',
            instrument: 'guitar'
        });
        expect(completeEvent.params.pain_index).toBeGreaterThanOrEqual(0);
        expect(typeof completeEvent.params.pain_ja).toBe('string');
        expect(completeEvent.params.pain_ja.length).toBeGreaterThan(0);
        expect(typeof completeEvent.params.guide_path).toBe('string');
        expect(completeEvent.params.guide_path.length).toBeGreaterThan(0);
    });

    test('CTA click fires diagnostic_guide_click with cta_type = "guide"', async ({ page }) => {
        await installEventCapture(page);
        await completeFunnel(page);

        // Strip hrefs so the click doesn't navigate away
        await page.evaluate(() => {
            document.querySelectorAll('.diag-result__cta').forEach(a => a.removeAttribute('href'));
        });
        await page.click('.diag-result__cta[data-cta-type="guide"]');

        const events = await page.evaluate(() => window.__events__);
        const guideClick = events.find(e => e.name === 'diagnostic_guide_click' && e.params.cta_type === 'guide');

        expect(guideClick).toBeDefined();
        expect(guideClick.params.guide_path).toBeTruthy();
        expect(guideClick.params.persona).toBe('dtm');
        expect(guideClick.params.instrument).toBe('guitar');
    });

    test('App Store CTA click fires diagnostic_guide_click with cta_type = "app"', async ({ page }) => {
        await installEventCapture(page);
        await completeFunnel(page);

        await page.evaluate(() => {
            document.querySelectorAll('.diag-result__cta').forEach(a => a.removeAttribute('href'));
        });
        await page.click('.diag-result__cta[data-cta-type="app"]');

        const events = await page.evaluate(() => window.__events__);
        const appClick = events.find(e => e.name === 'diagnostic_guide_click' && e.params.cta_type === 'app');

        expect(appClick).toBeDefined();
        expect(appClick.params.cta_type).toBe('app');
    });

    test('skip persona is recorded as "skip" and funnel continues', async ({ page }) => {
        await installEventCapture(page);
        await completeFunnel(page, { persona: 'skip', instrument: 'piano' });

        const events = await page.evaluate(() => window.__events__);
        const personaEvent = events.find(e => e.name === 'diagnostic_persona_select');
        const completeEvent = events.find(e => e.name === 'diagnostic_complete');

        expect(personaEvent.params.persona).toBe('skip');
        // skip should still propagate (not get coerced to 'unknown')
        expect(completeEvent.params.persona).toBe('skip');
    });

    test('restart clears persona and the next funnel starts fresh', async ({ page }) => {
        await installEventCapture(page);

        await page.goto('/start-here.html');
        await page.waitForSelector('#step-persona .diag-option');
        await page.click('[data-persona="exam"]');
        await page.waitForSelector('#step-instrument:not([hidden])');
        await page.click('#step-instrument [data-instrument="vocal"]');
        await page.waitForSelector('#step-pain:not([hidden])');
        await page.click('#step-pain .diag-option:first-child');
        await page.waitForSelector('#step-result:not([hidden])');

        // Restart
        await page.click('#restart-btn');
        await page.waitForFunction(() => document.getElementById('step-instrument').hidden === true);

        // Second pass with a different persona
        await page.click('[data-persona="dtm"]');
        await page.waitForSelector('#step-instrument:not([hidden])');
        await page.click('#step-instrument [data-instrument="other"]');
        await page.waitForSelector('#step-pain:not([hidden])');
        await page.click('#step-pain .diag-option:first-child');
        await page.waitForSelector('#step-result:not([hidden])');

        const events = await page.evaluate(() => window.__events__);

        // diagnostic_restart fires with the last persona ('exam')
        const restartEvent = events.find(e => e.name === 'diagnostic_restart');
        expect(restartEvent).toBeDefined();
        expect(restartEvent.params.persona_at_restart).toBe('exam');

        // Two complete cycles fired
        const completes = events.filter(e => e.name === 'diagnostic_complete');
        expect(completes.length).toBe(2);
        expect(completes[0].params.persona).toBe('exam');
        expect(completes[1].params.persona).toBe('dtm');

        // After restart, instrument event in 2nd cycle should NOT carry the
        // old persona — that would mean selectedPersona wasn't reset.
        const instrumentEvents = events.filter(e => e.name === 'diagnostic_instrument_select');
        expect(instrumentEvents.length).toBe(2);
        expect(instrumentEvents[1].params.persona).toBe('dtm');
    });

    test('changing instrument re-fires diagnostic_instrument_select', async ({ page }) => {
        await installEventCapture(page);

        await page.goto('/start-here.html');
        await page.waitForSelector('#step-persona .diag-option');
        await page.click('[data-persona="plateau"]');
        await page.waitForSelector('#step-instrument:not([hidden])');

        await page.click('#step-instrument [data-instrument="guitar"]');
        await page.waitForSelector('#step-pain:not([hidden])');

        // User changes mind, picks a different instrument
        await page.click('#step-instrument [data-instrument="piano"]');
        await page.waitForSelector('#step-pain:not([hidden])');

        const events = await page.evaluate(() => window.__events__);
        const instrumentEvents = events.filter(e => e.name === 'diagnostic_instrument_select');

        expect(instrumentEvents.length).toBe(2);
        expect(instrumentEvents[0].params.instrument).toBe('guitar');
        expect(instrumentEvents[1].params.instrument).toBe('piano');
        // Persona context preserved across instrument changes
        expect(instrumentEvents[0].params.persona).toBe('plateau');
        expect(instrumentEvents[1].params.persona).toBe('plateau');
    });

    test('events carry site_language and page_path from analytics.js helper', async ({ page }) => {
        await installEventCapture(page);
        await completeFunnel(page);

        const events = await page.evaluate(() => window.__events__);
        const completeEvent = events.find(e => e.name === 'diagnostic_complete');

        // analytics.js track() auto-attaches these. Verify the chain still applies.
        expect(completeEvent.params.site_language).toMatch(/^(ja|en|fr|de)$/);
        expect(completeEvent.params.page_path).toBe('/start-here.html');
    });

    test('pain_select event includes pain_index AND pain_ja for analysis', async ({ page }) => {
        await installEventCapture(page);
        await completeFunnel(page);

        const events = await page.evaluate(() => window.__events__);
        const painEvent = events.find(e => e.name === 'diagnostic_pain_select');

        expect(painEvent.params.pain_index).toBe(0);
        expect(typeof painEvent.params.pain_ja).toBe('string');
        expect(painEvent.params.pain_ja.length).toBeGreaterThan(2);
    });
});
