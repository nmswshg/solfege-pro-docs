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
            if (allExpanded) {
                btn.textContent = lang === 'ja' ? 'すべて開く' : 'Expand All';
            } else {
                btn.textContent = lang === 'ja' ? 'すべて閉じる' : 'Collapse All';
            }
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
       6. Language Toggle
       ============================================= */
    const langToggle = document.getElementById('lang-toggle');
    const langText = document.getElementById('lang-text');
    let currentLang = localStorage.getItem('lang') || 'ja';

    function applyLanguage(lang) {
        document.documentElement.setAttribute('data-lang', lang);
        langText.textContent = lang === 'ja' ? 'EN' : 'JA';
        document.title = lang === 'ja' ? 'ソルフェージュPRO 練習ガイド' : 'Solfege PRO - Practice Guide';
        localStorage.setItem('lang', lang);
        currentLang = lang;

        // Update expand/collapse buttons text
        expandAllBtns.forEach(btn => {
            const section = btn.closest('.section');
            const cards = section.querySelectorAll('.question-card');
            const allExpanded = Array.from(cards).every(card => card.classList.contains('expanded'));
            if (allExpanded) {
                btn.textContent = lang === 'ja' ? 'すべて閉じる' : 'Collapse All';
            } else {
                btn.textContent = lang === 'ja' ? 'すべて開く' : 'Expand All';
            }
        });
    }

    // Apply saved language on load
    applyLanguage(currentLang);

    langToggle.addEventListener('click', () => {
        const newLang = currentLang === 'ja' ? 'en' : 'ja';
        applyLanguage(newLang);
    });
});
