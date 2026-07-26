/* =============================================
   Tap-timing consistency test (guides/rhythm-training.html only)
   ---------------------------------------------
   Measures the ONE thing a browser can honestly measure about a
   player's timing: the STANDARD DEVIATION of their taps against a
   steady click.

   Why SD and not "you are 20ms late": a browser cannot know its own
   input latency or its audio output latency (speaker / wired /
   Bluetooth all differ by tens of milliseconds), so any absolute
   early/late figure would be a guess. A constant unknown offset
   shifts every deviation by the same amount and therefore does NOT
   change their standard deviation — so SD is measurable here and the
   mean offset is not. The page already says this in prose (the
   "Visualize Your Timing Tendency" section) and cites Repp 2005 and
   Wing & Kristofferson 1973 for reporting variability rather than a
   single offset.

   This file is loaded ONLY by the rhythm-training source page, not by
   bootstrap.js — the other 171 output files must not pay for it.

   It writes DIGITS ONLY into the DOM. Every word the reader sees lives
   in the page as the usual four <span lang="…"> variants, so the
   language-purity build/check is untouched.
   ============================================= */
(function () {
    'use strict';

    var root = document.querySelector('[data-tap-test]');
    if (!root) return;

    var BPM = 100;
    var INTERVAL = 60000 / BPM;   // 600ms — the app's default rhythm tempo
    var COUNT_IN = 4;             // audible clicks before taps are counted
    var WARMUP_TAPS = 4;          // discarded: sensorimotor sync needs a few beats to lock on
    var TARGET_TAPS = 24;         // n=24 keeps the SD's own error near ±29%
    var CLAMP_MS = 60;            // strip half-width; ticks are clamped to it

    var el = {
        start:    root.querySelector('[data-tt="start"]'),
        stop:     root.querySelector('[data-tt="stop"]'),
        tap:      root.querySelector('[data-tt="tap"]'),
        again:    root.querySelector('[data-tt="again"]'),
        progress: root.querySelector('[data-tt="progress"]'),
        total:    root.querySelector('[data-tt="total"]'),
        sd:       root.querySelector('[data-tt="sd"]'),
        low:      root.querySelector('[data-tt="low"]'),
        high:     root.querySelector('[data-tt="high"]'),
        n:        root.querySelector('[data-tt="n"]'),
        strip:    root.querySelector('[data-tt="strip"]'),
        bpm:      root.querySelector('[data-tt="bpm"]')
    };

    root.querySelectorAll('[data-tt="total"]').forEach(function (n) {
        n.textContent = String(TARGET_TAPS);
    });
    if (el.bpm) el.bpm.textContent = String(BPM);

    // The page ships data-state="nojs" so a reader without JS sees an honest
    // note instead of a button that does nothing. Flipping it here is the
    // whole "JS is available" signal.
    setInitialState();

    function setInitialState() {
        var AC = window.AudioContext || window.webkitAudioContext;
        root.setAttribute('data-state', AC ? 'idle' : 'unsupported');
    }

    var ctx = null;
    var schedulerId = null;
    var nextClickTime = 0;        // AudioContext time of the next click
    var clickIndex = 0;
    var taps = [];                // performance.now() timestamps
    var running = false;

    function setState(s) {
        root.setAttribute('data-state', s);
    }

    // ---- audio ---------------------------------------------------
    function click(when, accent) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.frequency.value = accent ? 1320 : 880;
        // Short percussive envelope. Ramps, not instant steps, so it
        // does not click-pop on the way in or out.
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.32, when + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(when);
        osc.stop(when + 0.06);
    }

    // Lookahead scheduler: setInterval is far too jittery to place notes
    // directly, so it only queues clicks that fall inside the next 150ms
    // and the Web Audio clock does the accurate placement.
    function schedule() {
        while (nextClickTime < ctx.currentTime + 0.15) {
            click(nextClickTime, clickIndex % COUNT_IN === 0);
            nextClickTime += INTERVAL / 1000;
            clickIndex++;
        }
    }

    // ---- statistics ----------------------------------------------
    // Deviations are taken modulo the click interval, which makes them
    // independent of where the grid's origin sits in the performance
    // clock — exactly the constant offset we cannot know. Centring on
    // the median before re-wrapping keeps a distribution that straddles
    // the wrap point from inflating the SD.
    function deviations(times) {
        var raw = times.map(function (t) {
            var m = ((t % INTERVAL) + INTERVAL) % INTERVAL;
            return m > INTERVAL / 2 ? m - INTERVAL : m;
        });
        var sorted = raw.slice().sort(function (a, b) { return a - b; });
        var mid = sorted.length % 2
            ? sorted[(sorted.length - 1) / 2]
            : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
        return raw.map(function (d) {
            var c = d - mid;
            while (c > INTERVAL / 2) c -= INTERVAL;
            while (c < -INTERVAL / 2) c += INTERVAL;
            return c;
        });
    }

    function stdDev(values) {
        var n = values.length;
        if (n < 2) return 0;
        var mean = values.reduce(function (a, b) { return a + b; }, 0) / n;
        var ss = values.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0);
        return Math.sqrt(ss / (n - 1));   // sample SD
    }

    // ---- flow ----------------------------------------------------
    function begin() {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { setState('unsupported'); return; }
        if (!ctx) ctx = new AC();
        // Created inside a real user gesture, so this resolves; iOS also
        // needs the resume() even on a fresh context.
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume();

        taps = [];
        clickIndex = 0;
        nextClickTime = ctx.currentTime + 0.12;
        running = true;
        if (el.strip) el.strip.innerHTML = '';
        if (el.progress) el.progress.textContent = '0';
        setState('running');
        if (el.tap) el.tap.focus();
        schedulerId = setInterval(schedule, 25);
        schedule();
    }

    function stopAudio() {
        running = false;
        if (schedulerId) { clearInterval(schedulerId); schedulerId = null; }
        if (ctx && ctx.suspend) { try { ctx.suspend(); } catch (e) {} }
    }

    function abort() {
        stopAudio();
        taps = [];
        setState('idle');
        if (el.start) el.start.focus();
    }

    function onTap() {
        if (!running) return;
        taps.push(performance.now());
        var measured = taps.length - WARMUP_TAPS;
        if (el.progress) el.progress.textContent = String(Math.max(0, measured));
        if (measured >= TARGET_TAPS) finish();
    }

    function finish() {
        stopAudio();
        var measured = taps.slice(WARMUP_TAPS);
        var devs = deviations(measured);
        var sd = stdDev(devs);

        // The SD of a sample is itself an estimate. Its relative standard
        // error is ~1/sqrt(2(n-1)); ±1.96 of that is the 95% band. At
        // n=24 that is about ±29%, which is far too wide to hide behind a
        // single number — so the range is shown, not just the point value.
        var rel = 1.96 / Math.sqrt(2 * (measured.length - 1));
        if (el.sd) el.sd.textContent = String(Math.round(sd));
        if (el.low) el.low.textContent = String(Math.max(0, Math.round(sd * (1 - rel))));
        if (el.high) el.high.textContent = String(Math.round(sd * (1 + rel)));
        if (el.n) el.n.textContent = String(measured.length);

        if (el.strip) {
            el.strip.innerHTML = '';
            devs.forEach(function (d) {
                var tick = document.createElement('span');
                tick.className = 'tt-tick';
                // Clamped: an unbounded left% on a 200ms-off tap would push
                // the document wider than the viewport, which is exactly the
                // horizontal-overflow failure the responsive sweep exists to
                // catch. The strip also has overflow: clip as a second guard.
                var pct = 50 + (Math.max(-CLAMP_MS, Math.min(CLAMP_MS, d)) / CLAMP_MS) * 50;
                tick.style.left = pct + '%';
                el.strip.appendChild(tick);
            });
        }
        setState('done');
        if (el.again) el.again.focus();
    }

    // ---- wiring --------------------------------------------------
    if (el.start) el.start.addEventListener('click', begin);
    if (el.again) el.again.addEventListener('click', begin);
    if (el.stop) el.stop.addEventListener('click', abort);

    if (el.tap) {
        // pointerdown, not click: it fires at physical contact rather than
        // after the release, which is what the reader is trying to time.
        el.tap.addEventListener('pointerdown', function (e) {
            e.preventDefault();   // also suppresses the synthetic click
            onTap();
        });
        // Keyboard equivalent. `click` is deliberately not bound, so a
        // Space/Enter press cannot be counted twice.
        el.tap.addEventListener('keydown', function (e) {
            if (e.key === ' ' || e.key === 'Enter' || e.key === 'Spacebar') {
                e.preventDefault();
                if (!e.repeat) onTap();
            }
        });
    }

    // Leaving the page mid-run must not keep a metronome alive.
    window.addEventListener('pagehide', stopAudio);
    document.addEventListener('visibilitychange', function () {
        if (document.hidden && running) abort();
    });
})();
