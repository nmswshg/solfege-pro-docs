(function() {
    'use strict';

    var reducedMotion = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function ready(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
        } else {
            callback();
        }
    }

    ready(function() {
        initReveal();
        initBadgeFallbacks();
        initDownloadBar();
    });

    function initReveal() {
        var items = [].slice.call(document.querySelectorAll('[data-lp-reveal]'));
        if (items.length === 0) return;

        document.body.classList.add('lp-motion-ready');

        if (reducedMotion || !('IntersectionObserver' in window)) {
            items.forEach(function(item) { item.classList.add('is-visible'); });
            return;
        }

        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            });
        }, {
            threshold: 0.12,
            rootMargin: '0px 0px -44px 0px'
        });

        items.forEach(function(item) {
            var rect = item.getBoundingClientRect();
            if (rect.top < window.innerHeight * 0.96) {
                item.classList.add('is-visible');
            } else {
                observer.observe(item);
            }
        });
    }

    function initBadgeFallbacks() {
        document.querySelectorAll('a.app-store-link').forEach(function(link) {
            var img = link.querySelector('img');
            if (!img) return;
            var fallback = document.createElement('span');
            fallback.className = 'lp-badge-fallback';
            fallback.textContent = link.getAttribute('aria-label') || img.alt;
            fallback.setAttribute('aria-hidden', 'true');
            link.appendChild(fallback);
            function update() {
                var loaded = img.complete && img.naturalWidth > 0;
                link.classList.toggle('is-badge-pending', !loaded);
                fallback.hidden = loaded;
            }
            img.addEventListener('load', update);
            img.addEventListener('error', update);
            // Hidden lazy images never start loading, so these three important
            // store badges must be requested independently of intersection.
            img.loading = 'eager';
            update();
        });
    }

    function initDownloadBar() {
        var bar = document.querySelector('.lp-download-bar');
        var hero = document.querySelector('.lp-hero__actions');
        var final = document.querySelector('.lp-final');
        if (!bar || !hero || !final || !('IntersectionObserver' in window)) return;
        var heroPassed = false;
        var finalVisible = false;
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.target === hero) {
                    heroPassed = !entry.isIntersecting && entry.boundingClientRect.bottom < 0;
                } else {
                    finalVisible = entry.isIntersecting;
                }
            });
            bar.hidden = !heroPassed || finalVisible;
        }, { threshold: 0 });
        observer.observe(hero);
        observer.observe(final);
    }
})();
