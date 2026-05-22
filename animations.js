(function() {
    'use strict';

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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
    });

    function initRevealOnScroll() {
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
