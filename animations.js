(function() {
    'use strict';

    // Reduced-motion handling is per-feature (informational features like the
    // reading-progress bar stay on; decorative reveals are skipped). Avoid a
    // blanket early return.
    var REDUCED_MOTION = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var REVEAL_SELECTORS = [
        '.hero',
        '.page-header',
        '.hub-section-title',
        '.section__header',
        '.guides-subhead',
        // Block-level reveals: the related/CTA blocks settle in as you reach
        // them. (Deliberately NOT article-body h2 — revealing body headings on
        // long mobile pages risks a heading sitting at opacity:0 if observed
        // mid-scroll, which hurts readability; structural headings should never
        // animate out.)
        '.article-related',
        '.article-cta',
        '.article-cta-subtle',
        // Card grids: reveal cards (staggered via --reveal-delay below).
        '.guide-card',
        '.article-related__link'
    ].join(', ');

    // Cards that are laid out in grids and should arrive as a ROW, not as N
    // independent elements. Stagger is per-row and inversely proportional to
    // element size (large cards get a longer beat than small links).
    // MUST be declared above the ready() call below: bootstrap.js injects this
    // file dynamically, so the document is usually already parsed and ready()
    // runs its callback SYNCHRONOUSLY. `var` hoists the binding but not the
    // assignment, so declaring these after the call left them undefined during
    // init and silently skipped every row (measured 2026-07-25).
    // Apple's two stagger scales, verbatim: ~150ms between large cards, ~50ms
    // between small pills. Stagger is inversely proportional to element size —
    // a flat value makes big cards feel rushed and small ones feel sluggish.
    var GRID_ITEM_SELECTOR = '.guide-card, .article-related__link';
    var STAGGER_MS = { '.guide-card': 150, '.article-related__link': 90 };

    var ready = function(cb) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', cb, { once: true });
        } else {
            cb();
        }
    };

    ready(function() {
        initRevealOnScroll();
        initStickyCtaReveal();
        initReadingProgress();
    });

    // Release the compositor layer once the entrance is over, and drop the
    // animation so the element's own declared styles — crucially :hover — take
    // over again. Promotion is a loan, not a gift.
    function settleOnFinish(el) {
        var done = false;
        function settle() {
            if (done) return;
            done = true;
            el.classList.add('is-settled');
        }
        el.addEventListener('animationend', function(e) {
            // Two animations run (fade + rise); only the longer one means done.
            if (e.animationName === 'reveal-fade') settle();
        });
        // Guard: if the element is in a background tab or the animation is
        // interrupted, animationend may never fire.
        setTimeout(settle, 2200);
    }

    function initRevealOnScroll() {
        if (REDUCED_MOTION) return; // decorative
        if (!('IntersectionObserver' in window)) return;

        // Groups keyed by "anchor element" — the observed element — mapping to
        // the full set of elements that should reveal together with it.
        var groupFor = new WeakMap();

        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (!entry.isIntersecting) return;
                var group = groupFor.get(entry.target) || [entry.target];
                group.forEach(function(member) {
                    member.classList.add('is-revealed');
                    settleOnFinish(member);
                });
                observer.unobserve(entry.target);
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -40px 0px'
        });

        var all = [].slice.call(document.querySelectorAll(REVEAL_SELECTORS));

        // Bucket grid items by (parent, row). offsetTop is quantised to absorb
        // sub-pixel differences between cards of unequal text length that are
        // nonetheless on the same visual row. On mobile the grids collapse to a
        // single column, so each bucket holds one card and this degrades to
        // per-element reveal — which is the correct behaviour there anyway.
        var buckets = [];
        var bucketOf = new WeakMap();
        all.forEach(function(el) {
            if (!el.matches(GRID_ITEM_SELECTOR) || !el.parentElement) return;
            var row = Math.round(el.offsetTop / 8);
            var found = null;
            for (var i = 0; i < buckets.length; i++) {
                if (buckets[i].parent === el.parentElement && buckets[i].row === row) {
                    found = buckets[i];
                    break;
                }
            }
            if (!found) {
                found = { parent: el.parentElement, row: row, items: [] };
                buckets.push(found);
            }
            found.items.push(el);
            bucketOf.set(el, found);
        });

        buckets.forEach(function(bucket) {
            var step = STAGGER_MS[bucket.items[0].matches('.guide-card') ? '.guide-card' : '.article-related__link'];
            bucket.items.forEach(function(el, idx) {
                el.style.setProperty('--reveal-delay', Math.min(idx, 3) * step + 'ms');
            });
        });

        all.forEach(function(el) {
            var bucket = bucketOf.get(el);
            // A row reveals from its FIRST member's position, so the whole row
            // arrives as one gesture instead of each card popping on its own.
            var anchor = bucket ? bucket.items[0] : el;
            var rect = anchor.getBoundingClientRect();

            if (rect.top < window.innerHeight) {
                // Already in the initial viewport: show immediately and skip the
                // animation. This is also the LCP guard — Chrome excludes
                // opacity:0 elements from LCP, so nothing above the fold may
                // start hidden.
                el.classList.add('reveal', 'is-revealed', 'is-settled');
                return;
            }
            el.classList.add('reveal');
            if (el === anchor) {
                if (bucket) groupFor.set(anchor, bucket.items);
                observer.observe(anchor);
            }
        });
    }

    // E: Reading progress bar — auto-injected on pages that include
    // an article body. Disabled for short pages where there's nothing
    // to scroll through.
    function initReadingProgress() {
        // Match the same long-form-content selector that analytics.js uses
        // for scroll_depth so the bar appears on every page where read-
        // through is being tracked (guides + practice + menu-detail).
        if (!document.querySelector('.article-body, .practice-body, .menu-hub, .menu-detail')) return;

        var bar = document.createElement('div');
        bar.className = 'reading-progress';
        bar.setAttribute('aria-hidden', 'true');
        var fill = document.createElement('div');
        fill.className = 'reading-progress__fill';
        bar.appendChild(fill);
        document.body.appendChild(bar);

        // When the CSS `scroll(root block)` timeline is actually in force, the
        // fill is driven on the compositor and this JS must not fight it. The
        // check mirrors the CSS gate exactly (@supports AND not reduced-motion),
        // because under reduced motion that CSS block is absent and the JS path
        // is still the one doing the work.
        var CSS_DRIVEN = !REDUCED_MOTION &&
            window.CSS && CSS.supports &&
            CSS.supports('animation-timeline', 'scroll()');

        var ticking = false;
        function update() {
            var max = document.documentElement.scrollHeight - window.innerHeight;
            // Hide the bar if the page is too short to scroll (e.g., a
            // practice page where the user hasn't expanded any accordion
            // items yet). The bar reappears automatically once max > 0,
            // which happens after expansion thanks to the resize listener.
            if (max <= 0) {
                bar.style.opacity = '0';
                // CSS_DRIVEN: don't write transform — an inline style would beat
                // the animation. Hiding the whole bar is enough, and an inactive
                // scroll timeline leaves the fill at its from-state anyway.
                if (!CSS_DRIVEN) fill.style.transform = 'scaleX(0)';
                ticking = false;
                return;
            }
            bar.style.opacity = '';
            if (!CSS_DRIVEN) {
                var ratio = Math.min(1, Math.max(0, window.scrollY / max));
                fill.style.transform = 'scaleX(' + ratio + ')';
            }
            ticking = false;
        }
        function onScroll() {
            if (!ticking) {
                requestAnimationFrame(update);
                ticking = true;
            }
        }
        // The scrollability check (max <= 0) still has to run on resize and after
        // accordion expansion — the CSS timeline cannot express "hide the bar on a
        // page that doesn't scroll". But the per-frame scroll listener is only
        // needed when JS owns the fill.
        if (!CSS_DRIVEN) {
            window.addEventListener('scroll', onScroll, { passive: true });
        }
        window.addEventListener('resize', onScroll, { passive: true });
        // Re-evaluate height after accordion expansion or other DOM mutations
        // by hooking into the click handlers practice-features.js wires up.
        document.addEventListener('click', function() { onScroll(); }, { passive: true });
        update();
    }

    function initStickyCtaReveal() {
        var stickyCta = document.querySelector('.sticky-cta');
        if (!stickyCta) return;

        var sentinel = document.querySelector('.page-header, .hero, header');
        if (!sentinel) return;

        if (!('IntersectionObserver' in window)) return;

        // Start hidden; reveal once the sentinel scrolls mostly out of view.
        stickyCta.classList.add('sticky-cta--hidden');

        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.intersectionRatio < 0.15) {
                    stickyCta.classList.remove('sticky-cta--hidden');
                } else {
                    stickyCta.classList.add('sticky-cta--hidden');
                }
            });
        }, {
            threshold: [0, 0.15, 0.5]
        });

        observer.observe(sentinel);
    }
})();
