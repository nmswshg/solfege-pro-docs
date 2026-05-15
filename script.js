/* =============================================
   Solfege PRO - Practice Guide JavaScript
   ============================================= */

document.addEventListener('DOMContentLoaded', function() {

    /* =============================================
       1. Scroll Spy - Navigation Active State
       ============================================= */
    const navLinks = document.querySelectorAll('.nav__link');
    const drawerLinks = document.querySelectorAll('.drawer__link');
    const sections = document.querySelectorAll('.section');

    function updateActiveNav() {
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (window.scrollY >= sectionTop - 100) {
                current = section.getAttribute('id');
            }
        });

        // Update desktop nav links
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === '#' + current) {
                link.classList.add('active');
            }
        });

        // Update drawer links
        drawerLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === '#' + current) {
                link.classList.add('active');
            }
        });
    }

    window.addEventListener('scroll', updateActiveNav);
    updateActiveNav();

    /* =============================================
       2. Side Drawer (Mobile Menu)
       ============================================= */
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const drawer = document.getElementById('drawer');
    const drawerOverlay = document.getElementById('drawer-overlay');
    const drawerClose = document.getElementById('drawer-close');

    function openDrawer() {
        drawer.classList.add('active');
        drawerOverlay.classList.add('active');
        hamburgerBtn.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeDrawer() {
        drawer.classList.remove('active');
        drawerOverlay.classList.remove('active');
        hamburgerBtn.classList.remove('active');
        document.body.style.overflow = '';
    }

    hamburgerBtn.addEventListener('click', () => {
        if (drawer.classList.contains('active')) {
            closeDrawer();
        } else {
            openDrawer();
        }
    });

    drawerClose.addEventListener('click', closeDrawer);
    drawerOverlay.addEventListener('click', closeDrawer);

    // Close drawer when clicking a link
    drawerLinks.forEach(link => {
        link.addEventListener('click', () => {
            closeDrawer();
        });
    });

    // Close drawer on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && drawer.classList.contains('active')) {
            closeDrawer();
        }
    });

    /* =============================================
       3. Accordion Functionality
       ============================================= */
    const questionCards = document.querySelectorAll('.question-card');

    questionCards.forEach(card => {
        const header = card.querySelector('.question-card__header');

        // Add toggle icon if not present
        if (!header.querySelector('.question-card__toggle')) {
            const toggle = document.createElement('span');
            toggle.className = 'question-card__toggle';
            toggle.innerHTML = '▼';
            header.appendChild(toggle);
        }

        header.addEventListener('click', () => {
            card.classList.toggle('expanded');
        });
    });

    /* =============================================
       4. Expand/Collapse All Functionality
       ============================================= */
    const expandAllBtns = document.querySelectorAll('.expand-all-btn');
    const currentLangGetter = () => document.documentElement.getAttribute('data-lang') || 'ja';

    const EXPAND_LABEL = {
        ja: 'すべて開く',
        en: 'Expand All',
        fr: 'Tout développer',
        de: 'Alle aufklappen'
    };
    const COLLAPSE_LABEL = {
        ja: 'すべて閉じる',
        en: 'Collapse All',
        fr: 'Tout réduire',
        de: 'Alle zuklappen'
    };

    expandAllBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.closest('.section');
            const cards = section.querySelectorAll('.question-card');
            const allExpanded = Array.from(cards).every(card => card.classList.contains('expanded'));

            cards.forEach(card => {
                if (allExpanded) {
                    card.classList.remove('expanded');
                } else {
                    card.classList.add('expanded');
                }
            });

            // Update button text based on language
            const lang = currentLangGetter();
            btn.textContent = allExpanded ? EXPAND_LABEL[lang] : COLLAPSE_LABEL[lang];
        });
    });

    /* =============================================
       5. Section TOC Click Handler
       ============================================= */
    const tocItems = document.querySelectorAll('.section-toc__item');
    tocItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.dataset.target;
            const targetCard = document.getElementById(targetId);
            if (targetCard) {
                targetCard.classList.add('expanded');
                targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    /* =============================================
       6. Language Toggle (ja → en → fr → de cycle, with ?lang= URL param support)
       ============================================= */
    const langToggle = document.getElementById('lang-toggle');
    const langText = document.getElementById('lang-text');
    const LANG_CYCLE = ['ja', 'en', 'fr', 'de'];
    const LANG_LABEL = { ja: 'JA', en: 'EN', fr: 'FR', de: 'DE' };
    const APP_STORE_LOCALE = { ja: 'jp', en: 'us', fr: 'fr', de: 'de' };
    const TITLE_LABEL = {
        ja: 'ソルフェージュPRO 練習ガイド',
        en: 'Solfege PRO - Practice Guide',
        fr: 'Solfege PRO - Guide d\'entraînement',
        de: 'Solfege PRO - Übungsleitfaden'
    };

    function isValidLang(l) { return LANG_CYCLE.indexOf(l) !== -1; }

    // Priority: URL param > localStorage > default 'ja'
    const urlLang = new URLSearchParams(window.location.search).get('lang');
    let currentLang = isValidLang(urlLang)
        ? urlLang
        : (isValidLang(localStorage.getItem('lang')) ? localStorage.getItem('lang') : 'ja');

    function syncUrlLang(lang) {
        const url = new URL(window.location.href);
        url.searchParams.set('lang', lang);
        history.replaceState(null, '', url.toString());
    }

    function nextLang(lang) {
        const idx = LANG_CYCLE.indexOf(lang);
        return LANG_CYCLE[(idx + 1) % LANG_CYCLE.length];
    }

    function applyLanguage(lang) {
        document.documentElement.setAttribute('data-lang', lang);
        document.documentElement.lang = lang;
        // Button shows the *next* language (click to switch to it)
        langText.textContent = LANG_LABEL[nextLang(lang)];
        document.title = TITLE_LABEL[lang];
        localStorage.setItem('lang', lang);
        currentLang = lang;
        const storeLocale = APP_STORE_LOCALE[lang];
        document.querySelectorAll('a[href*="apps.apple.com"]').forEach(function(a){
            a.href = 'https://apps.apple.com/' + storeLocale + '/app/id6756626617';
        });

        // Update expand/collapse buttons text
        expandAllBtns.forEach(btn => {
            const section = btn.closest('.section');
            const cards = section.querySelectorAll('.question-card');
            const allExpanded = Array.from(cards).every(card => card.classList.contains('expanded'));
            btn.textContent = allExpanded ? COLLAPSE_LABEL[lang] : EXPAND_LABEL[lang];
        });
    }

    // Apply saved language on load
    applyLanguage(currentLang);

    langToggle.addEventListener('click', () => {
        const newLang = nextLang(currentLang);
        applyLanguage(newLang);
        syncUrlLang(newLang);
    });
});
