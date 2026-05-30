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

    // ---- First-touch traffic-source classification ----------------------
    // Answers "did this visitor arrive from search, from X, from the app,
    // or direct?" GA4 has native channel grouping, but (a) in-app webviews
    // and App Store browser hand-offs usually arrive with NO referrer and
    // get bucketed as "direct" unless the link is UTM-tagged, and (b) we
    // want the entry source stamped on every downstream event (esp.
    // app_store_click) so installs can be attributed by acquisition source.
    // NOTE: the search *query* is never available client-side (Google
    // strips it) — that lives only in Google Search Console.
    var SEARCH_ENGINES = /(^|\.)(google|bing|yahoo|duckduckgo|ecosia|naver|baidu|yandex|brave|kagi)\.[a-z.]+$/;
    var SOCIAL_HOSTS = {
        'x.com': 'x', 'twitter.com': 'x', 't.co': 'x', 'mobile.twitter.com': 'x',
        'facebook.com': 'facebook', 'm.facebook.com': 'facebook', 'l.facebook.com': 'facebook',
        'instagram.com': 'instagram', 'l.instagram.com': 'instagram',
        'reddit.com': 'reddit', 'out.reddit.com': 'reddit',
        'youtube.com': 'youtube', 'm.youtube.com': 'youtube',
        'linkedin.com': 'linkedin', 'lnkd.in': 'linkedin',
        'pinterest.com': 'pinterest', 'pinterest.jp': 'pinterest',
        'note.com': 'note', 'b.hatena.ne.jp': 'hatena', 'line.me': 'line'
    };
    function getQueryParam(name) {
        var m = location.search.match(new RegExp('[?&]' + name + '=([^&#]*)'));
        return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
    }
    function classifyTrafficSource() {
        var utmSource = getQueryParam('utm_source');
        var utmMedium = getQueryParam('utm_medium');
        var utmCampaign = getQueryParam('utm_campaign');
        var ref = '';
        try { ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; } catch (e) {}
        var here = location.hostname.replace(/^www\./, '');
        var seMatch = ref ? ref.match(SEARCH_ENGINES) : null;   // [2] = engine name, robust to search.* subdomains
        var source, medium;
        if (utmSource) {                                   // explicit tag wins (app / x / newsletter ...)
            source = utmSource; medium = utmMedium || 'referral';
        } else if (!ref) {
            source = 'direct'; medium = 'none';            // app webviews land here unless UTM-tagged
        } else if (ref === here) {
            source = 'internal'; medium = 'internal';
        } else if (seMatch) {
            source = seMatch[2]; medium = 'organic';
        } else if (SOCIAL_HOSTS[ref]) {
            source = SOCIAL_HOSTS[ref]; medium = 'social';
        } else {
            source = ref; medium = 'referral';
        }
        return { traffic_source: source, traffic_medium: medium, traffic_campaign: utmCampaign, referrer_host: ref };
    }
    // First-touch is captured once per session and reused on later pages.
    var FIRST_TOUCH_KEY = '_sp_first_touch';
    function getFirstTouch() {
        try {
            var stored = sessionStorage.getItem(FIRST_TOUCH_KEY);
            if (stored) return JSON.parse(stored);
        } catch (e) {}
        var c = classifyTrafficSource();
        try { sessionStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(c)); } catch (e) {}
        return c;
    }

    if (!IS_LOCAL) {
        var s = document.createElement('script');
        s.async = true;
        s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
        document.head.appendChild(s);
    }

    // Resolve first-touch before configuring GA so it rides on page_view and
    // can be registered as a custom dimension. Detect whether THIS hit is the
    // session's first, so traffic_entry fires exactly once per session.
    var _hadFirstTouch = false;
    try { _hadFirstTouch = !!sessionStorage.getItem(FIRST_TOUCH_KEY); } catch (e) {}
    var FIRST_TOUCH = getFirstTouch();

    gtag('js', new Date());
    gtag('config', GA_ID, {
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        page_title: document.title,
        page_location: location.href,
        site_language: getLang(),
        traffic_source: FIRST_TOUCH.traffic_source,
        traffic_medium: FIRST_TOUCH.traffic_medium,
        traffic_campaign: FIRST_TOUCH.traffic_campaign
    });

    // ---- Helper API ----
    function track(eventName, params) {
        params = params || {};
        if (params.site_language == null) params.site_language = getLang();
        if (params.page_path == null) params.page_path = location.pathname;
        if (params.first_touch_source == null) {
            var ft = getFirstTouch();
            params.first_touch_source = ft.traffic_source;
            params.first_touch_medium = ft.traffic_medium;
        }
        gtag('event', eventName, params);
    }

    // Landing-page-only entry event (search vs X vs app vs direct breakdown).
    if (!_hadFirstTouch) {
        track('traffic_entry', {
            traffic_source: FIRST_TOUCH.traffic_source,
            traffic_medium: FIRST_TOUCH.traffic_medium,
            traffic_campaign: FIRST_TOUCH.traffic_campaign,
            referrer_host: FIRST_TOUCH.referrer_host,
            landing_path: location.pathname
        });
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
    // Since 2026-05-23 lang switching is path-based: changing language
    // means navigating to /foo.X.html (full page load), not a same-page
    // toggle. So we detect changes across navigation via sessionStorage —
    // compare the page's current lang to the value stored on the previous
    // page in this session. Same-page langchange events (legacy) also
    // still flow through, for safety.
    function setupLangChangeTracking() {
        try {
            var currentLang = getLang();
            var storedPrev = sessionStorage.getItem('_analytics_prev_lang');
            if (storedPrev && storedPrev !== currentLang) {
                // About to fire lang_change — but if a redirect marker
                // is present, this transition was triggered by lang-toggle
                // migrating a legacy ?lang= URL (not a user switch). Drop.
                // The marker is only consumed in this branch so it survives
                // the unrelated analytics init that runs on the source page
                // before window.location.replace takes effect.
                var redirectTarget = sessionStorage.getItem('_analytics_redirect_target');
                if (redirectTarget) {
                    sessionStorage.removeItem('_analytics_redirect_target');
                } else {
                    track('lang_change', {
                        from_lang: storedPrev,
                        to_lang: currentLang,
                    });
                }
            }
            sessionStorage.setItem('_analytics_prev_lang', currentLang);
        } catch (e) { /* sessionStorage unavailable — silent */ }

        // Same-page langchange (kept for completeness / legacy callers).
        var _prevLang = getLang();
        window.addEventListener('langchange', function() {
            var nowLang = getLang();
            if (_prevLang !== nowLang) {
                track('lang_change', {
                    from_lang: _prevLang,
                    to_lang: nowLang,
                });
                try { sessionStorage.setItem('_analytics_prev_lang', nowLang); } catch (e) {}
            }
            _prevLang = nowLang;
        });
    }

    // ---- Scroll depth on long-form content pages ----
    // Originally guides/.article-body only; broadened to cover practice/*
    // (.practice-body, .menu-hub) and the new menu detail pages
    // (.menu-detail) so we can see read-through on those long Q&A and
    // reference articles too.
    function setupScrollDepth() {
        if (!document.querySelector('.article-body, .practice-body, .menu-hub, .menu-detail')) return;
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

    // ---- App Store badge impression tracking ----
    // Pairs with app_store_click so we can compute CTR (% of visitors who
    // saw the badge and clicked through). Fires once per badge per session
    // when at least 50% of the badge is visible.
    function setupAppStoreViewTracking() {
        if (!('IntersectionObserver' in window)) return;
        var links = document.querySelectorAll('a[href*="apps.apple.com"]');
        if (links.length === 0) return;
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    track('app_store_view', {
                        cta_position: detectCtaPosition(entry.target),
                        source_page: location.pathname
                    });
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });
        links.forEach(function(link) { observer.observe(link); });
    }

    // ---- Canonical pricing-line impression tracking ----
    // Detects the "月額 980 円" / "JPY 980/month" disclosure paragraphs
    // (added across the site as the canonical subscription wording) and
    // fires a pricing_view event when one becomes ~50% visible. Lets us
    // measure how often the price is actually seen before App Store
    // click-through. Content-based detection (no markup change required).
    function setupPricingViewTracking() {
        if (!('IntersectionObserver' in window)) return;
        var matcher = /(?:980\s*円|JPY\s*980|980\s*JPY)/;
        var candidates = [];
        document.querySelectorAll('p').forEach(function(p) {
            var text = (p.textContent || '');
            if (text.length > 0 && matcher.test(text)) candidates.push(p);
        });
        if (candidates.length === 0) return;
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    track('pricing_view', {
                        cta_position: detectCtaPosition(entry.target),
                        source_page: location.pathname
                    });
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });
        candidates.forEach(function(el) { observer.observe(el); });
    }

    function init() {
        bindAppStoreClicks();
        bindExternalLinks();
        setupLangChangeTracking();
        setupScrollDepth();
        setupAppStoreViewTracking();
        setupPricingViewTracking();
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
        isLocal: IS_LOCAL,
        firstTouch: FIRST_TOUCH,
        classifyTrafficSource: classifyTrafficSource
    };
})();
