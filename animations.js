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
        initCountUp();
        initReadingProgress();
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

    // D: Count-up on hero stats — only on elements explicitly tagged with
    // data-count-up. Triggers once when the element enters the viewport.
    function initCountUp() {
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
        var article = document.querySelector('.article-body');
        if (!article) return;
        // Only show on pages tall enough to actually scroll the article.
        if (article.offsetHeight < window.innerHeight * 1.5) return;

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
            var ratio = max > 0
                ? Math.min(1, Math.max(0, window.scrollY / max))
                : 0;
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
