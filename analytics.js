/* =============================================
   Solfege PRO Docs - GA4 Analytics
   Vendor: Google Analytics 4 (Web stream)
   Measurement ID: G-R009HVF9CD
   GDPR posture: Google Signals OFF, Ad Personalization OFF
   Note: events ALWAYS queue to window.dataLayer for inspection,
         but the external gtag.js loader only runs on the public origin
         (skipped on localhost / file:// so dev & tests don't pollute GA).
   ============================================= */
(function() {
    var GA_ID = 'G-R009HVF9CD';
    var IS_LOCAL =
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1' ||
        location.protocol === 'file:';

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;

    function getLang() {
        return document.documentElement.getAttribute('data-lang')
            || document.documentElement.lang
            || 'ja';
    }

    if (!IS_LOCAL) {
        var s = document.createElement('script');
        s.async = true;
        s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
        document.head.appendChild(s);
    }

    gtag('js', new Date());
    gtag('config', GA_ID, {
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        page_title: document.title,
        page_location: location.href,
        site_language: getLang()
    });

    // ---- Helper API ----
    function track(eventName, params) {
        params = params || {};
        if (params.site_language == null) params.site_language = getLang();
        if (params.page_path == null) params.page_path = location.pathname;
        gtag('event', eventName, params);
    }

    // ---- CTA position detection (semantic, based on ancestor class) ----
    var CTA_RULES = [
        ['sticky-cta',               'sticky_bottom'],
        ['hero-cta-group',           'hero'],
        ['hub-cta',                  'hub_main'],
        ['article-cta-subtle',       'mid_article'],
        ['article-cta-mid',          'mid_article'],
        ['article-cta',              'final_cta'],
        ['guides-back',              'guides_back'],
        ['diag-bottom-cta',          'diag_bottom'],
        ['diag-result__cta',         'diag_result'],
        ['cta',                      'cta_section'],
        ['hub-footer',               'hub_footer'],
        ['guides-footer',            'guides_footer'],
        ['article-footer',           'article_footer'],
        ['practice-footer',          'practice_footer']
    ];
    function detectCtaPosition(el) {
        for (var i = 0; i < CTA_RULES.length; i++) {
            if (el.closest('.' + CTA_RULES[i][0])) return CTA_RULES[i][1];
        }
        return 'unknown';
    }

    // ---- App Store click tracking ----
    function bindAppStoreClicks() {
        var links = document.querySelectorAll('a[href*="apps.apple.com"]');
        links.forEach(function(link) {
            if (link.dataset.gaBound === '1') return;
            link.dataset.gaBound = '1';
            link.addEventListener('click', function() {
                track('app_store_click', {
                    cta_position: detectCtaPosition(link),
                    source_page: location.pathname,
                    app_store_locale: (function() {
                        var m = link.href.match(/apps\.apple\.com\/([a-z]{2})\//);
                        return m ? m[1] : 'unknown';
                    })()
                });
            });
        });
    }

    // ---- External link tracking (papers, reference links, etc.) ----
    function bindExternalLinks() {
        var links = document.querySelectorAll('a[href^="http"]');
        links.forEach(function(link) {
            if (link.dataset.gaBound === '1') return;
            try {
                var url = new URL(link.href);
                if (url.host === location.host) return;
                if (link.href.indexOf('apps.apple.com') !== -1) return; // separate event
                if (link.href.indexOf('applemediaservices.com') !== -1) return; // App Store badges (image src already excluded by selector but be safe)
                link.dataset.gaBound = '1';
                link.addEventListener('click', function() {
                    track('external_link_click', {
                        link_url: link.href,
                        link_text: (link.textContent || '').trim().slice(0, 100)
                    });
                });
            } catch (e) { /* ignore malformed URLs */ }
        });
    }

    // ---- Language change tracking ----
    var _prevLang = null;
    function setupLangChangeTracking() {
        window.addEventListener('langchange', function() {
            var nowLang = getLang();
            if (_prevLang !== null && _prevLang !== nowLang) {
                track('lang_change', {
                    from_lang: _prevLang,
                    to_lang: nowLang
                });
            }
            _prevLang = nowLang;
        });
    }

    // ---- Scroll depth on long-form articles ----
    function setupScrollDepth() {
        if (!document.querySelector('.article-body')) return;
        var depths = [25, 50, 75, 100];
        var hit = {};
        var rafScheduled = false;
        window.addEventListener('scroll', function() {
            if (rafScheduled) return;
            rafScheduled = true;
            requestAnimationFrame(function() {
                rafScheduled = false;
                var sh = document.documentElement.scrollHeight - window.innerHeight;
                if (sh <= 0) return;
                var pct = Math.round((window.scrollY / sh) * 100);
                for (var i = 0; i < depths.length; i++) {
                    if (pct >= depths[i] && !hit[depths[i]]) {
                        hit[depths[i]] = true;
                        track('scroll_depth', { depth: depths[i] });
                    }
                }
            });
        }, { passive: true });
    }

    function init() {
        bindAppStoreClicks();
        bindExternalLinks();
        setupLangChangeTracking();
        setupScrollDepth();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for other scripts and tests
    window.SolfegeAnalytics = {
        track: track,
        gaId: GA_ID,
        isLocal: IS_LOCAL
    };
})();
