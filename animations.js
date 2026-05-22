(function() {
    'use strict';

    // Reduced-motion handling is per-feature (informational features like the
    // reading-progress bar stay on; decorative reveals + count-ups are
    // skipped). Avoid a blanket early return.
    var REDUCED_MOTION = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var REVEAL_SELECTORS = [
        '.hero',
        '.page-header',
        '.hub-section-title',
        '.section__header',
        '.guides-subhead'
    ].join(', ');

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
        initCountUp();
        initReadingProgress();
    });

    function initRevealOnScroll() {
        if (REDUCED_MOTION) return; // decorative
        if (!('IntersectionObserver' in window)) return;

        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-revealed');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -40px 0px'
        });

        document.querySelectorAll(REVEAL_SELECTORS).forEach(function(el) {
            var rect = el.getBoundingClientRect();
            if (rect.top < window.innerHeight) {
                // Already in initial viewport: show immediately, skip animation
                // to avoid an above-the-fold flash.
                el.classList.add('reveal', 'is-revealed');
            } else {
                el.classList.add('reveal');
                observer.observe(el);
            }
        });
    }

    // D: Count-up on hero stats — only on elements explicitly tagged with
    // data-count-up. Triggers once when the element enters the viewport.
    function initCountUp() {
        if (REDUCED_MOTION) return; // decorative — static number stays visible
        if (!('IntersectionObserver' in window)) return;
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    animateCount(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });
        document.querySelectorAll('[data-count-up]').forEach(function(el) {
            observer.observe(el);
        });
    }

    function animateCount(el) {
        var attr = el.getAttribute('data-count-up');
        var target = attr !== null && attr !== ''
            ? parseInt(attr, 10)
            : parseInt(el.textContent, 10);
        if (isNaN(target)) return;
        var duration = 700;
        var startTime = null;
        function tick(now) {
            if (startTime === null) startTime = now;
            var t = Math.min(1, (now - startTime) / duration);
            // ease-out cubic
            var eased = 1 - Math.pow(1 - t, 3);
            el.textContent = String(Math.round(target * eased));
            if (t < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
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

        var ticking = false;
        function update() {
            var max = document.documentElement.scrollHeight - window.innerHeight;
            // Hide the bar if the page is too short to scroll (e.g., a
            // practice page where the user hasn't expanded any accordion
            // items yet). The bar reappears automatically once max > 0,
            // which happens after expansion thanks to the resize listener.
            if (max <= 0) {
                bar.style.opacity = '0';
                fill.style.transform = 'scaleX(0)';
                ticking = false;
                return;
            }
            bar.style.opacity = '';
            var ratio = Math.min(1, Math.max(0, window.scrollY / max));
            fill.style.transform = 'scaleX(' + ratio + ')';
            ticking = false;
        }
        function onScroll() {
            if (!ticking) {
                requestAnimationFrame(update);
                ticking = true;
            }
        }
        window.addEventListener('scroll', onScroll, { passive: true });
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
