/* =============================================
   Solfege PRO - Shared Language Selector (dropdown)
   Languages: ja / en / fr / de
   Per-page titles via data-title-{ja,en,fr,de} on <html>

   URL convention (path-based, since 2026-05-23):
     ja: /guides/foo.html             (no suffix — 従来通り)
     en: /guides/foo.en.html
     fr: /guides/foo.fr.html
     de: /guides/foo.de.html

   Switching language navigates to the new URL (full page load); each
   .X.html is a pre-built single-language file. The on-load detector
   reads the URL suffix to decide which lang the current page is.

   Backward compat: visits to /foo.html?lang=X are redirected once to
   /foo.X.html so old bookmarks / search results don't get stuck.
   ============================================= */
(function() {
    var LANGS = ['ja', 'en', 'fr', 'de'];
    var LANG_LABEL = { ja: 'JA', en: 'EN', fr: 'FR', de: 'DE' };
    var LANG_NAMES = { ja: '日本語', en: 'English', fr: 'Français', de: 'Deutsch' };
    var APP_STORE_LOCALE = { ja: 'jp', en: 'us', fr: 'fr', de: 'de' };

    function isValidLang(l) { return LANGS.indexOf(l) !== -1; }

    /**
     * Inspect a pathname and return { lang, basePath }, where basePath
     * is the pathname with the lang suffix stripped (always ending in .html
     * for an article, or "/" for a directory index).
     *
     * Examples:
     *   /guides/foo.html      → { lang: 'ja', basePath: '/guides/foo.html' }
     *   /guides/foo.en.html   → { lang: 'en', basePath: '/guides/foo.html' }
     *   /guides/              → { lang: 'ja', basePath: '/guides/' }
     *   /guides/index.fr.html → { lang: 'fr', basePath: '/guides/index.html' }
     */
    function parsePath(pathname) {
        var m = pathname.match(/^(.+?)\.(en|fr|de)\.html$/);
        if (m) return { lang: m[2], basePath: m[1] + '.html' };
        return { lang: 'ja', basePath: pathname };
    }

    /**
     * Construct a pathname for `targetLang` from a basePath that ends in .html
     * or a directory ("/"). Directories are treated as the underlying index.html.
     */
    function pathForLang(basePath, targetLang) {
        if (basePath.slice(-1) === '/') {
            // Trailing slash directory → operate on index.html
            return targetLang === 'ja'
                ? basePath
                : basePath + 'index.' + targetLang + '.html';
        }
        if (targetLang === 'ja') return basePath;
        return basePath.replace(/\.html$/, '.' + targetLang + '.html');
    }

    // -----------------------------------------------------------------
    // Backward compat: rewrite /foo.html?lang=X → /foo.X.html (once).
    // Only do this if the suffix file is likely to exist (= we're on the
    // bare .html source page, not already on a .X.html variant).
    //
    // Sets a sessionStorage marker before redirecting so analytics on the
    // landed page knows NOT to fire a spurious lang_change event — the
    // user is being moved to their requested lang, not switching from one.
    // -----------------------------------------------------------------
    (function maybeRedirectLegacyQuery() {
        var q = new URLSearchParams(window.location.search).get('lang');
        if (!isValidLang(q)) return;
        var parsed = parsePath(window.location.pathname);
        // If already on a .X.html page, just drop the redundant ?lang=.
        if (parsed.lang !== 'ja' || q === 'ja') {
            var u = new URL(window.location.href);
            u.searchParams.delete('lang');
            history.replaceState(null, '', u.toString());
            return;
        }
        // Otherwise navigate to the .X.html sibling.
        try { sessionStorage.setItem('_analytics_redirect_target', q); } catch (e) {}
        var target = pathForLang(parsed.basePath, q);
        var u2 = new URL(window.location.href);
        u2.pathname = target;
        u2.searchParams.delete('lang');
        window.location.replace(u2.toString());
    })();

    var langToggle = document.getElementById('lang-toggle');
    var langText = document.getElementById('lang-text');
    if (!langToggle || !langText) return;

    var pageInfo = parsePath(window.location.pathname);
    var currentLang = pageInfo.lang;
    localStorage.setItem('lang', currentLang);

    // Chevron
    if (!langToggle.querySelector('.settings-btn__chevron')) {
        var chev = document.createElement('span');
        chev.className = 'settings-btn__chevron';
        chev.setAttribute('aria-hidden', 'true');
        chev.textContent = '▾';
        langToggle.appendChild(chev);
    }

    langToggle.setAttribute('aria-haspopup', 'listbox');
    langToggle.setAttribute('aria-expanded', 'false');
    langToggle.setAttribute('aria-controls', 'lang-menu');
    langToggle.setAttribute('title', 'Select language');

    var menu = document.createElement('ul');
    menu.id = 'lang-menu';
    menu.className = 'lang-menu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', 'Select language');
    LANGS.forEach(function(l) {
        var li = document.createElement('li');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lang-menu__item';
        btn.setAttribute('data-lang', l);
        btn.setAttribute('role', 'option');
        btn.textContent = LANG_NAMES[l];
        li.appendChild(btn);
        menu.appendChild(li);
    });
    langToggle.parentNode.insertBefore(menu, langToggle.nextSibling);

    function applyMermaidLang(lang) {
        document.querySelectorAll('.mermaid-lang').forEach(function(el) {
            if (el.getAttribute('lang') === lang) {
                el.classList.remove('mermaid-hidden');
            } else {
                el.classList.add('mermaid-hidden');
            }
        });
    }

    function updateActiveItem(lang) {
        menu.querySelectorAll('.lang-menu__item').forEach(function(item) {
            var isActive = item.getAttribute('data-lang') === lang;
            item.classList.toggle('is-active', isActive);
            item.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    }

    function applyLanguage(lang) {
        document.documentElement.setAttribute('data-lang', lang);
        document.documentElement.lang = lang;
        langText.textContent = LANG_LABEL[lang];
        localStorage.setItem('lang', lang);
        currentLang = lang;

        var storeLocale = APP_STORE_LOCALE[lang];
        document.querySelectorAll('a[href*="apps.apple.com"]').forEach(function(a) {
            a.href = 'https://apps.apple.com/' + storeLocale + '/app/id6756626617';
        });

        var ds = document.documentElement.dataset;
        var titleByLang = { ja: ds.titleJa, en: ds.titleEn, fr: ds.titleFr, de: ds.titleDe };
        if (titleByLang[lang]) {
            document.title = titleByLang[lang];
        }

        applyMermaidLang(lang);
        updateActiveItem(lang);
        window.dispatchEvent(new Event('langchange'));
    }

    /**
     * Rewrite internal links (same-origin, http(s)/relative) so that
     * navigating from /foo.en.html → /related-article keeps the user
     * in their current language (→ /related-article.en.html).
     *
     * Skipped:
     *   - External links
     *   - Fragment links (#anchor)
     *   - Links that already have a .X.html suffix
     *   - Non-html links (assets, downloads)
     */
    function rewriteInternalLinks(lang) {
        if (lang === 'ja') return; // ja URLs are bare .html; no rewrite needed.
        var links = document.querySelectorAll('a[href]');
        links.forEach(function(a) {
            var href = a.getAttribute('href');
            if (!href) return;
            // External / mailto / tel / fragment / javascript:
            if (/^(https?:|mailto:|tel:|javascript:|#)/i.test(href)) {
                // Allow same-origin absolute URLs; reject true externals.
                if (/^https?:/i.test(href)) {
                    try {
                        var u = new URL(href);
                        if (u.origin !== window.location.origin) return;
                    } catch (e) { return; }
                } else {
                    return;
                }
            }
            // Resolve to absolute against the document, then operate on pathname.
            var abs;
            try { abs = new URL(href, window.location.href); }
            catch (e) { return; }
            // Skip if not an html page (assets, .png, etc.)
            if (abs.pathname.match(/\.(png|jpe?g|svg|gif|ico|css|js|pdf|xml|txt|webp)$/i)) return;
            var parsed = parsePath(abs.pathname);
            // Already on the right lang — nothing to rewrite.
            if (parsed.lang === lang) return;
            // Compute the lang-suffixed version of the link's basePath.
            var target = pathForLang(parsed.basePath, lang);
            abs.pathname = target;
            a.setAttribute('href', abs.pathname + abs.search + abs.hash);
        });
    }

    function closeMenu() {
        menu.classList.remove('open');
        langToggle.setAttribute('aria-expanded', 'false');
    }
    function openMenu() {
        menu.classList.add('open');
        langToggle.setAttribute('aria-expanded', 'true');
    }

    applyLanguage(currentLang);
    rewriteInternalLinks(currentLang);

    langToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        if (menu.classList.contains('open')) closeMenu();
        else openMenu();
    });

    menu.addEventListener('click', function(e) {
        var item = e.target.closest('.lang-menu__item');
        if (!item) return;
        var lang = item.getAttribute('data-lang');
        if (!isValidLang(lang)) return;
        // Path-based: navigate to the sibling lang file.
        var current = parsePath(window.location.pathname);
        var target = pathForLang(current.basePath, lang);
        if (target === window.location.pathname) {
            closeMenu();
            return;
        }
        var u = new URL(window.location.href);
        u.pathname = target;
        u.searchParams.delete('lang');
        window.location.href = u.toString();
    });

    document.addEventListener('click', function(e) {
        if (!menu.contains(e.target) && !langToggle.contains(e.target)) {
            closeMenu();
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && menu.classList.contains('open')) {
            closeMenu();
            langToggle.focus();
        }
    });
})();
