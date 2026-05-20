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

    // ===== Phase 2: PERSONA_PAINS resolver behaviour =====
    // These tests poke at the IIFE-scoped resolvePains() via window injection
    // of a controlled PERSONA_PAINS shape. They guard the lookup precedence:
    //   PERSONA_PAINS[persona][instrument]
    //     → PERSONA_PAINS[persona].any
    //     → PAINS[instrument] (Phase 1 fallback)
    //
    // The resolver itself is closed over by the IIFE so we can't call it
    // directly from outside. We exercise it indirectly by selecting the
    // persona, then the instrument, then asserting which pain set rendered.

    test('plateau persona falls through to PAINS[instrument] (Phase 1)', async ({ page }) => {
        await installEventCapture(page);
        await page.goto('/start-here.html');
        await page.click('[data-persona="plateau"]');
        await page.waitForSelector('#step-instrument:not([hidden])');
        await page.click('#step-instrument [data-instrument="piano"]');
        await page.waitForSelector('#step-pain:not([hidden]) .diag-option');

        // Compare the rendered first pain to PAINS.piano[0].ja (from start-here.html
        // around line 410: '譜面がないと弾けない').
        const firstPainText = await page.locator('#step-pain .diag-option:first-child .diag-option__title span[lang="ja"]').textContent();
        expect(firstPainText).toBe('譜面がないと弾けない');
    });

    test('skip persona falls through to PAINS[instrument] (Phase 1)', async ({ page }) => {
        await installEventCapture(page);
        await page.goto('/start-here.html');
        await page.click('[data-persona="skip"]');
        await page.waitForSelector('#step-instrument:not([hidden])');
        await page.click('#step-instrument [data-instrument="guitar"]');
        await page.waitForSelector('#step-pain:not([hidden]) .diag-option');

        // PAINS.guitar[0].ja = 'セッションで頭が真っ白になる'
        const firstPainText = await page.locator('#step-pain .diag-option:first-child .diag-option__title span[lang="ja"]').textContent();
        expect(firstPainText).toBe('セッションで頭が真っ白になる');
    });

    test('always renders exactly 4 pain options regardless of persona', async ({ page }) => {
        // Phase 1 (no PERSONA_PAINS data) — every persona × instrument that has
        // a PAINS entry has 3 or 4 options. We assert "at least 3" to remain
        // compatible with both phases. After Phase 2 content lands, all sets
        // should be 4.
        await installEventCapture(page);
        await page.goto('/start-here.html');
        await page.click('[data-persona="plateau"]');
        await page.waitForSelector('#step-instrument:not([hidden])');
        await page.click('#step-instrument [data-instrument="other"]');
        await page.waitForSelector('#step-pain:not([hidden]) .diag-option');

        const count = await page.locator('#step-pain .diag-option').count();
        expect(count).toBeGreaterThanOrEqual(3);
        expect(count).toBeLessThanOrEqual(4);
    });

    // ===== Phase 2-full: persona-specific pain content =====
    // These tests verify that PERSONA_PAINS data is actually wired through —
    // i.e. selecting a different persona changes the pain set rendered,
    // not just the analytics tag.

    async function selectPersonaAndInstrument(page, persona, instrument) {
        await page.goto('/start-here.html');
        await page.click(`[data-persona="${persona}"]`);
        // After persona click, either Step 2 (normal personas) becomes visible,
        // or Step 3 appears directly (instrument-agnostic personas like dtm /
        // exam / no-instrument — Step 2 is bypassed).
        await page.waitForSelector('#step-instrument:not([hidden]) .diag-option, #step-pain:not([hidden]) .diag-option');
        const step2Visible = await page.locator('#step-instrument:not([hidden])').count() > 0;
        if (step2Visible) {
            await page.click(`#step-instrument [data-instrument="${instrument}"]`);
        }
        await page.waitForSelector('#step-pain:not([hidden]) .diag-option');
    }

    async function getPainTitles(page) {
        return await page.locator('#step-pain .diag-option .diag-option__title span[lang="ja"]').allTextContents();
    }

    test('parent persona × piano shows parent-specific pains (not the plateau set)', async ({ page }) => {
        await installEventCapture(page);
        await selectPersonaAndInstrument(page, 'parent', 'piano');
        const parentPiano = await getPainTitles(page);

        await selectPersonaAndInstrument(page, 'plateau', 'piano');
        const plateauPiano = await getPainTitles(page);

        // Sets must differ — Phase 2 is what makes them link
        expect(parentPiano.join('|')).not.toBe(plateauPiano.join('|'));
        // Parent set should mention the child somewhere
        expect(parentPiano.join(' ')).toMatch(/子供|家|家庭/);
    });

    test('dtm persona uses the `any` set — same pains regardless of instrument', async ({ page }) => {
        await installEventCapture(page);
        await selectPersonaAndInstrument(page, 'dtm', 'guitar');
        const dtmGuitar = await getPainTitles(page);

        await selectPersonaAndInstrument(page, 'dtm', 'piano');
        const dtmPiano = await getPainTitles(page);

        // Same `any` set — instrument is irrelevant
        expect(dtmGuitar.sort()).toEqual(dtmPiano.sort());
        expect(dtmGuitar.length).toBe(4);
    });

    test('exam persona uses the `any` set (instrument-agnostic theory exams)', async ({ page }) => {
        await installEventCapture(page);
        await selectPersonaAndInstrument(page, 'exam', 'vocal');
        const examVocal = await getPainTitles(page);

        await selectPersonaAndInstrument(page, 'exam', 'wind');
        const examWind = await getPainTitles(page);

        expect(examVocal.sort()).toEqual(examWind.sort());
        expect(examVocal.length).toBe(4);
    });

    test('no-instrument persona uses the `any` set (instrument-agnostic spare time)', async ({ page }) => {
        await installEventCapture(page);
        await selectPersonaAndInstrument(page, 'no-instrument', 'guitar');
        const noInstGuitar = await getPainTitles(page);

        await selectPersonaAndInstrument(page, 'no-instrument', 'drums');
        const noInstDrums = await getPainTitles(page);

        expect(noInstGuitar.sort()).toEqual(noInstDrums.sort());
        expect(noInstGuitar.length).toBe(4);
    });

    test('beginner persona shows instrument-specific pain sets (guitar ≠ piano)', async ({ page }) => {
        await installEventCapture(page);
        await selectPersonaAndInstrument(page, 'beginner', 'guitar');
        const beginnerGuitar = await getPainTitles(page);

        await selectPersonaAndInstrument(page, 'beginner', 'piano');
        const beginnerPiano = await getPainTitles(page);

        expect(beginnerGuitar.length).toBe(4);
        expect(beginnerPiano.length).toBe(4);
        // Different instruments → different pain sets
        expect(beginnerGuitar.sort()).not.toEqual(beginnerPiano.sort());
    });

    test('session persona shows instrument-specific pain sets (guitar ≠ drums)', async ({ page }) => {
        await installEventCapture(page);
        await selectPersonaAndInstrument(page, 'session', 'guitar');
        const sessionGuitar = await getPainTitles(page);

        await selectPersonaAndInstrument(page, 'session', 'drums');
        const sessionDrums = await getPainTitles(page);

        expect(sessionGuitar.length).toBe(4);
        expect(sessionDrums.length).toBe(4);
        expect(sessionGuitar.sort()).not.toEqual(sessionDrums.sort());
    });

    test('Step 4 guide matches the persona-aware pain clicked at Step 3 (regression)', async ({ page }) => {
        // Bug found 2026-05-21: showResult was reading PAINS[instrument]
        // directly instead of going through resolvePains. That meant a
        // parent × piano user would see parent-specific pains at Step 3 but
        // be sent to the PAINS.piano guide at Step 4 (and GA4 would log
        // PAINS pain_ja / guide_path, not the parent ones).
        await installEventCapture(page);
        await selectPersonaAndInstrument(page, 'parent', 'piano');

        // Capture the parent-specific pain_ja shown at Step 3 (first option).
        const step3Title = await page.locator('#step-pain .diag-option:first-child .diag-option__title span[lang="ja"]').textContent();

        await page.click('#step-pain .diag-option:first-child');
        await page.waitForSelector('#step-result:not([hidden])');

        // diagnostic_complete must carry the SAME pain_ja shown at Step 3.
        const events = await page.evaluate(() => window.__events__);
        const completeEvent = events.find(e => e.name === 'diagnostic_complete');
        expect(completeEvent.params.pain_ja).toBe(step3Title);

        // And the rendered guide title at Step 4 should not be the plateau
        // (PAINS) guide for the same pain index. Sanity: parent.piano[0]
        // points to one of the parent-friendly guides.
        const step4Title = await page.locator('#step-result .diag-result__title').textContent();
        // Parent persona guides include 子供 / 家庭 / 親 themes — assert the
        // resolved guide title is not the PAINS.piano[0] title ("ピアノ Q1").
        expect(step4Title).not.toBe('ピアノ Q1');
        expect(completeEvent.params.guide_path).not.toBe('practice/piano.html#piano-q1');
    });

    // ===== Phase 2-fix: Step 2 bypass for instrument-agnostic personas =====
    // dtm / exam / no-instrument all key their pains under `any` only.
    // Going through Step 2 (instrument) adds no information for these users,
    // so the persona click takes them straight to Step 3.

    test('dtm persona bypasses Step 2 — Step 3 appears directly', async ({ page }) => {
        await installEventCapture(page);
        await page.goto('/start-here.html');
        await page.click('[data-persona="dtm"]');
        await page.waitForSelector('#step-pain:not([hidden]) .diag-option');

        // Step 2 must remain hidden after persona click for dtm
        const step2Hidden = await page.locator('#step-instrument[hidden]').count();
        expect(step2Hidden).toBe(1);

        // A diagnostic_step2_skipped event should have fired
        const events = await page.evaluate(() => window.__events__);
        const skipEvent = events.find(e => e.name === 'diagnostic_step2_skipped');
        expect(skipEvent).toBeDefined();
        expect(skipEvent.params.persona).toBe('dtm');
    });

    test('exam persona bypasses Step 2', async ({ page }) => {
        await installEventCapture(page);
        await page.goto('/start-here.html');
        await page.click('[data-persona="exam"]');
        await page.waitForSelector('#step-pain:not([hidden]) .diag-option');

        const step2Hidden = await page.locator('#step-instrument[hidden]').count();
        expect(step2Hidden).toBe(1);
    });

    test('no-instrument persona bypasses Step 2', async ({ page }) => {
        await installEventCapture(page);
        await page.goto('/start-here.html');
        await page.click('[data-persona="no-instrument"]');
        await page.waitForSelector('#step-pain:not([hidden]) .diag-option');

        const step2Hidden = await page.locator('#step-instrument[hidden]').count();
        expect(step2Hidden).toBe(1);
    });

    test('parent persona does NOT bypass Step 2 (instrument-specific)', async ({ page }) => {
        await installEventCapture(page);
        await page.goto('/start-here.html');
        await page.click('[data-persona="parent"]');
        await page.waitForSelector('#step-instrument:not([hidden]) .diag-option');

        // Step 2 must be visible
        const step2Hidden = await page.locator('#step-instrument[hidden]').count();
        expect(step2Hidden).toBe(0);

        // No skip event should fire for parent
        const events = await page.evaluate(() => window.__events__);
        const skipEvent = events.find(e => e.name === 'diagnostic_step2_skipped');
        expect(skipEvent).toBeUndefined();
    });

    test('plateau persona does NOT bypass Step 2 (falls through to PAINS)', async ({ page }) => {
        await installEventCapture(page);
        await page.goto('/start-here.html');
        await page.click('[data-persona="plateau"]');
        await page.waitForSelector('#step-instrument:not([hidden]) .diag-option');

        const step2Hidden = await page.locator('#step-instrument[hidden]').count();
        expect(step2Hidden).toBe(0);
    });

    test('dtm bypass flow still fires diagnostic_complete with instrument=any', async ({ page }) => {
        await installEventCapture(page);
        await page.goto('/start-here.html');
        await page.click('[data-persona="dtm"]');
        await page.waitForSelector('#step-pain:not([hidden]) .diag-option');
        await page.click('#step-pain .diag-option:first-child');
        await page.waitForSelector('#step-result:not([hidden])');

        const events = await page.evaluate(() => window.__events__);
        const completeEvent = events.find(e => e.name === 'diagnostic_complete');
        expect(completeEvent).toBeDefined();
        expect(completeEvent.params.persona).toBe('dtm');
        expect(completeEvent.params.instrument).toBe('any');
        // diagnostic_instrument_select must NOT fire for the bypass flow
        const instrumentEvent = events.find(e => e.name === 'diagnostic_instrument_select');
        expect(instrumentEvent).toBeUndefined();
    });

    // ===== Phase 2-fix: parent persona Step 2 wording =====

    test('parent persona shows "お子様の楽器を選ぶ" at Step 2', async ({ page }) => {
        await installEventCapture(page);
        await page.goto('/start-here.html');
        await page.click('[data-persona="parent"]');
        await page.waitForSelector('#step-instrument:not([hidden])');

        // parent variant should be visible, default variant hidden
        const parentVariantVisible = await page.locator('.step2-title-variant[data-variant="parent"]:not([hidden]) span[lang="ja"]').textContent();
        expect(parentVariantVisible).toBe('お子様の楽器を選ぶ');

        const defaultHidden = await page.locator('.step2-title-variant[data-variant="default"][hidden]').count();
        expect(defaultHidden).toBe(1);
    });

    test('non-parent personas show default "楽器を選ぶ" at Step 2', async ({ page }) => {
        await installEventCapture(page);
        await page.goto('/start-here.html');
        await page.click('[data-persona="plateau"]');
        await page.waitForSelector('#step-instrument:not([hidden])');

        const defaultVisible = await page.locator('.step2-title-variant[data-variant="default"]:not([hidden]) span[lang="ja"]').textContent();
        expect(defaultVisible).toBe('楽器を選ぶ');

        const parentHidden = await page.locator('.step2-title-variant[data-variant="parent"][hidden]').count();
        expect(parentHidden).toBe(1);
    });

    // ===== Phase 2-followup: persona+instrument breadcrumb at Step 3 / Step 4 =====

    test('Step 3 shows the persona and instrument breadcrumb', async ({ page }) => {
        await installEventCapture(page);
        await selectPersonaAndInstrument(page, 'parent', 'piano');

        // Persona chip visible with the JA label "子供のサポート"
        const personaText = await page.locator('#pain-context-persona span[lang="ja"]').first().textContent();
        expect(personaText).toContain('子供のサポート');

        // Instrument chip visible with "ピアノ"
        const instrumentText = await page.locator('#pain-context-instrument span[lang="ja"]').first().textContent();
        expect(instrumentText).toContain('ピアノ');

        // The context container is not hidden
        const ctxHidden = await page.locator('#pain-context[hidden]').count();
        expect(ctxHidden).toBe(0);
    });

    test('Step 3 breadcrumb hides the instrument chip for instrument-agnostic personas', async ({ page }) => {
        // dtm bypasses Step 2; instrument=='any' should drop the instrument chip
        await installEventCapture(page);
        await page.goto('/start-here.html');
        await page.click('[data-persona="dtm"]');
        await page.waitForSelector('#step-pain:not([hidden]) .diag-option');

        const personaText = await page.locator('#pain-context-persona span[lang="ja"]').first().textContent();
        expect(personaText).toContain('DTM');

        const instrumentChipHidden = await page.locator('#pain-context-instrument[hidden]').count();
        expect(instrumentChipHidden).toBe(1);
    });

    test('Step 4 result intro line shows the persona + instrument selection', async ({ page }) => {
        await installEventCapture(page);
        await selectPersonaAndInstrument(page, 'parent', 'piano');
        await page.click('#step-pain .diag-option:first-child');
        await page.waitForSelector('#step-result:not([hidden]) .diag-result__intro');

        const introJa = await page.locator('.diag-result__intro span[lang="ja"]').textContent();
        expect(introJa).toContain('子供のサポート');
        expect(introJa).toContain('ピアノ');
    });

    test('Step 4 intro line for instrument-agnostic persona shows only persona', async ({ page }) => {
        await installEventCapture(page);
        await page.goto('/start-here.html');
        await page.click('[data-persona="dtm"]');
        await page.waitForSelector('#step-pain:not([hidden]) .diag-option');
        await page.click('#step-pain .diag-option:first-child');
        await page.waitForSelector('#step-result:not([hidden]) .diag-result__intro');

        const introJa = await page.locator('.diag-result__intro span[lang="ja"]').textContent();
        expect(introJa).toContain('DTM');
        // No instrument name should appear (Step 2 was skipped)
        expect(introJa).not.toContain('ピアノ');
        expect(introJa).not.toContain('ギター');
    });

    test('switching parent → plateau swaps title back to default', async ({ page }) => {
        await installEventCapture(page);
        await page.goto('/start-here.html');
        await page.click('[data-persona="parent"]');
        await page.waitForSelector('.step2-title-variant[data-variant="parent"]:not([hidden])');

        // Switch personas without restart
        await page.click('[data-persona="plateau"]');
        await page.waitForSelector('.step2-title-variant[data-variant="default"]:not([hidden])');

        const parentHidden = await page.locator('.step2-title-variant[data-variant="parent"][hidden]').count();
        expect(parentHidden).toBe(1);
    });

    test('switching from parent (Step 2 shown) to dtm hides Step 2', async ({ page }) => {
        // Without restarting, the user picks parent then re-picks dtm.
        // Step 2 should hide when dtm is selected.
        await installEventCapture(page);
        await page.goto('/start-here.html');
        await page.click('[data-persona="parent"]');
        await page.waitForSelector('#step-instrument:not([hidden])');

        // Now switch to dtm without restart
        await page.click('[data-persona="dtm"]');
        await page.waitForSelector('#step-pain:not([hidden]) .diag-option');

        const step2Hidden = await page.locator('#step-instrument[hidden]').count();
        expect(step2Hidden).toBe(1);
    });

    test('selecting parent then changing to dtm rerenders a fresh dtm pain set', async ({ page }) => {
        // The user could click persona, instrument, see pains, then go back and
        // pick a different persona. We don't currently expose a "back" UI to
        // step-persona, but restart does that — verify it works end-to-end.
        await installEventCapture(page);
        await selectPersonaAndInstrument(page, 'parent', 'guitar');
        const parentGuitar = await getPainTitles(page);

        await page.click('#step-pain .diag-option:first-child');
        await page.waitForSelector('#step-result:not([hidden])');
        await page.click('#restart-btn');
        await page.waitForFunction(() => document.getElementById('step-instrument').hidden === true);

        await page.click('[data-persona="dtm"]');
        await page.waitForSelector('#step-instrument:not([hidden])');
        await page.click('#step-instrument [data-instrument="guitar"]');
        await page.waitForSelector('#step-pain:not([hidden])');
        const dtmGuitar = await getPainTitles(page);

        expect(parentGuitar.sort()).not.toEqual(dtmGuitar.sort());
    });
});
