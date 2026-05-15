/* =============================================
   Solfege PRO - Shared Language Selector (dropdown)
   Languages: ja / en / fr / de
   Per-page titles via data-title-{ja,en,fr,de} on <html>
   ============================================= */
(function() {
    var langToggle = document.getElementById('lang-toggle');
    var langText = document.getElementById('lang-text');
    if (!langToggle || !langText) return;

    var LANGS = ['ja', 'en', 'fr', 'de'];
    var LANG_LABEL = { ja: 'JA', en: 'EN', fr: 'FR', de: 'DE' };
    var LANG_NAMES = { ja: '日本語', en: 'English', fr: 'Français', de: 'Deutsch' };
    var APP_STORE_LOCALE = { ja: 'jp', en: 'us', fr: 'fr', de: 'de' };

    function isValidLang(l) { return LANGS.indexOf(l) !== -1; }

    var urlLang = new URLSearchParams(window.location.search).get('lang');
    var currentLang = isValidLang(urlLang)
        ? urlLang
        : (isValidLang(localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'ja');

    // Add chevron to button if not present
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

    // Build dropdown
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

    function syncUrlLang(lang) {
        var url = new URL(window.location.href);
        url.searchParams.set('lang', lang);
        history.replaceState(null, '', url.toString());
    }

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

    function closeMenu() {
        menu.classList.remove('open');
        langToggle.setAttribute('aria-expanded', 'false');
    }
    function openMenu() {
        menu.classList.add('open');
        langToggle.setAttribute('aria-expanded', 'true');
    }

    applyLanguage(currentLang);

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
        applyLanguage(lang);
        syncUrlLang(lang);
        closeMenu();
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
