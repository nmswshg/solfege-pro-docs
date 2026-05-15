/* =============================================
   Solfege PRO - Practice Page JavaScript
   Accordion, TOC, Expand All, Language Toggle
   ============================================= */

document.addEventListener('DOMContentLoaded', function() {

    /* =============================================
       1. Accordion Functionality
       ============================================= */
    var questionCards = document.querySelectorAll('.question-card');

    questionCards.forEach(function(card) {
        var header = card.querySelector('.question-card__header');

        // Add toggle icon if not present
        if (!header.querySelector('.question-card__toggle')) {
            var toggle = document.createElement('span');
            toggle.className = 'question-card__toggle';
            toggle.innerHTML = '\u25BC';
            header.appendChild(toggle);
        }

        header.addEventListener('click', function() {
            card.classList.toggle('expanded');
        });
    });

    /* =============================================
       2. Expand/Collapse All
       ============================================= */
    var expandAllBtns = document.querySelectorAll('.expand-all-btn');
    var currentLangGetter = function() {
        return document.documentElement.getAttribute('data-lang') || 'ja';
    };

    var EXPAND_LABEL = {
        ja: '\u3059\u3079\u3066\u958b\u304f',
        en: 'Expand All',
        fr: 'Tout d\u00e9velopper',
        de: 'Alle aufklappen'
    };
    var COLLAPSE_LABEL = {
        ja: '\u3059\u3079\u3066\u9589\u3058\u308b',
        en: 'Collapse All',
        fr: 'Tout r\u00e9duire',
        de: 'Alle zuklappen'
    };

    expandAllBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var section = btn.closest('.section') || document.querySelector('.practice-body');
            var cards = section.querySelectorAll('.question-card');
            var allExpanded = Array.from(cards).every(function(card) {
                return card.classList.contains('expanded');
            });

            cards.forEach(function(card) {
                if (allExpanded) {
                    card.classList.remove('expanded');
                } else {
                    card.classList.add('expanded');
                }
            });

            var lang = currentLangGetter();
            btn.textContent = allExpanded ? EXPAND_LABEL[lang] : COLLAPSE_LABEL[lang];
        });
    });

    /* =============================================
       3. Section TOC Click Handler
       ============================================= */
    var tocItems = document.querySelectorAll('.section-toc__item');
    tocItems.forEach(function(item) {
        item.addEventListener('click', function() {
            var targetId = item.dataset.target;
            var targetCard = document.getElementById(targetId);
            if (targetCard) {
                targetCard.classList.add('expanded');
                targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    /* =============================================
       4. Language Selector (dropdown \u2014 ja / en / fr / de)
       ============================================= */
    var langToggle = document.getElementById('lang-toggle');
    var langText = document.getElementById('lang-text');
    var LANGS = ['ja', 'en', 'fr', 'de'];
    var LANG_LABEL = { ja: 'JA', en: 'EN', fr: 'FR', de: 'DE' };
    var LANG_NAMES = { ja: '\u65e5\u672c\u8a9e', en: 'English', fr: 'Fran\u00e7ais', de: 'Deutsch' };
    var APP_STORE_LOCALE = { ja: 'jp', en: 'us', fr: 'fr', de: 'de' };

    function isValidLang(l) { return LANGS.indexOf(l) !== -1; }

    var urlLang = new URLSearchParams(window.location.search).get('lang');
    var currentLang = isValidLang(urlLang)
        ? urlLang
        : (isValidLang(localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'ja');

    if (langToggle && langText) {
        // Add chevron to button
        if (!langToggle.querySelector('.settings-btn__chevron')) {
            var chev = document.createElement('span');
            chev.className = 'settings-btn__chevron';
            chev.setAttribute('aria-hidden', 'true');
            chev.textContent = '\u25be';
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
    }

    function syncUrlLang(lang) {
        var url = new URL(window.location.href);
        url.searchParams.set('lang', lang);
        history.replaceState(null, '', url.toString());
    }

    function updateActiveItem(lang) {
        if (!langToggle) return;
        document.querySelectorAll('.lang-menu__item').forEach(function(item) {
            var isActive = item.getAttribute('data-lang') === lang;
            item.classList.toggle('is-active', isActive);
            item.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    }

    function applyLanguage(lang) {
        document.documentElement.setAttribute('data-lang', lang);
        document.documentElement.lang = lang;
        if (langText) langText.textContent = LANG_LABEL[lang];
        localStorage.setItem('lang', lang);
        currentLang = lang;
        var storeLocale = APP_STORE_LOCALE[lang];
        document.querySelectorAll('a[href*="apps.apple.com"]').forEach(function(a){
            a.href = 'https://apps.apple.com/' + storeLocale + '/app/id6756626617';
        });

        // Update expand/collapse button text
        expandAllBtns.forEach(function(btn) {
            var section = btn.closest('.section') || document.querySelector('.practice-body');
            var cards = section.querySelectorAll('.question-card');
            var allExpanded = Array.from(cards).every(function(card) {
                return card.classList.contains('expanded');
            });
            btn.textContent = allExpanded ? COLLAPSE_LABEL[lang] : EXPAND_LABEL[lang];
        });

        // Update page title if data attribute present
        var ds = document.documentElement.dataset;
        var titleByLang = { ja: ds.titleJa, en: ds.titleEn, fr: ds.titleFr, de: ds.titleDe };
        if (titleByLang[lang]) {
            document.title = titleByLang[lang];
        }

        updateActiveItem(lang);
        window.dispatchEvent(new Event('langchange'));
    }

    function closeMenu() {
        var m = document.getElementById('lang-menu');
        if (m) m.classList.remove('open');
        if (langToggle) langToggle.setAttribute('aria-expanded', 'false');
    }
    function openMenu() {
        var m = document.getElementById('lang-menu');
        if (m) m.classList.add('open');
        if (langToggle) langToggle.setAttribute('aria-expanded', 'true');
    }

    applyLanguage(currentLang);

    if (langToggle) {
        langToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            var m = document.getElementById('lang-menu');
            if (m && m.classList.contains('open')) closeMenu();
            else openMenu();
        });
    }

    var menuEl = document.getElementById('lang-menu');
    if (menuEl) {
        menuEl.addEventListener('click', function(e) {
            var item = e.target.closest('.lang-menu__item');
            if (!item) return;
            var lang = item.getAttribute('data-lang');
            if (!isValidLang(lang)) return;
            applyLanguage(lang);
            syncUrlLang(lang);
            closeMenu();
        });
    }

    document.addEventListener('click', function(e) {
        var m = document.getElementById('lang-menu');
        if (m && !m.contains(e.target) && langToggle && !langToggle.contains(e.target)) {
            closeMenu();
        }
    });

    document.addEventListener('keydown', function(e) {
        var m = document.getElementById('lang-menu');
        if (e.key === 'Escape' && m && m.classList.contains('open')) {
            closeMenu();
            if (langToggle) langToggle.focus();
        }
    });
});
