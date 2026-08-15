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
        initStoryStage();
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

    function initStoryStage() {
        var steps = [].slice.call(document.querySelectorAll('[data-story-step]'));
        var screens = [].slice.call(document.querySelectorAll('[data-story-screen]'));
        if (steps.length === 0 || screens.length === 0) return;

        function activate(index) {
            steps.forEach(function(step) {
                step.classList.toggle('is-active', Number(step.getAttribute('data-story-step')) === index);
            });
            screens.forEach(function(screen) {
                screen.classList.toggle('is-active', Number(screen.getAttribute('data-story-screen')) === index);
            });
        }

        activate(0);
        if (!('IntersectionObserver' in window)) return;

        var observer = new IntersectionObserver(function(entries) {
            var visible = entries.filter(function(entry) { return entry.isIntersecting; });
            if (visible.length === 0) return;
            visible.sort(function(a, b) { return b.intersectionRatio - a.intersectionRatio; });
            activate(Number(visible[0].target.getAttribute('data-story-step')));
        }, {
            threshold: [0.2, 0.4, 0.6, 0.8],
            rootMargin: '-28% 0px -38% 0px'
        });

        steps.forEach(function(step) { observer.observe(step); });
    }
})();
