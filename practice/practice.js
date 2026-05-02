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
            if (allExpanded) {
                btn.textContent = lang === 'ja' ? '\u3059\u3079\u3066\u958b\u304f' : 'Expand All';
            } else {
                btn.textContent = lang === 'ja' ? '\u3059\u3079\u3066\u9589\u3058\u308b' : 'Collapse All';
            }
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
       4. Language Toggle (with ?lang= URL param)
       ============================================= */
    var langToggle = document.getElementById('lang-toggle');
    var langText = document.getElementById('lang-text');
    var urlLang = new URLSearchParams(window.location.search).get('lang');
    var currentLang = (urlLang === 'ja' || urlLang === 'en') ? urlLang : (localStorage.getItem('lang') || 'ja');

    function syncUrlLang(lang) {
        var url = new URL(window.location.href);
        url.searchParams.set('lang', lang);
        history.replaceState(null, '', url.toString());
    }

    function applyLanguage(lang) {
        document.documentElement.setAttribute('data-lang', lang);
        document.documentElement.lang = lang;
        langText.textContent = lang === 'ja' ? 'EN' : 'JA';
        localStorage.setItem('lang', lang);
        currentLang = lang;
        document.querySelectorAll('a[href*="apps.apple.com"]').forEach(function(a){a.href='https://apps.apple.com/'+(lang==='ja'?'jp':'us')+'/app/id6756626617';});

        // Update expand/collapse button text
        expandAllBtns.forEach(function(btn) {
            var section = btn.closest('.section') || document.querySelector('.practice-body');
            var cards = section.querySelectorAll('.question-card');
            var allExpanded = Array.from(cards).every(function(card) {
                return card.classList.contains('expanded');
            });
            if (allExpanded) {
                btn.textContent = lang === 'ja' ? '\u3059\u3079\u3066\u9589\u3058\u308b' : 'Collapse All';
            } else {
                btn.textContent = lang === 'ja' ? '\u3059\u3079\u3066\u958b\u304f' : 'Expand All';
            }
        });

        // Update page title if data attribute present
        var titleJa = document.documentElement.dataset.titleJa;
        var titleEn = document.documentElement.dataset.titleEn;
        if (titleJa && titleEn) {
            document.title = lang === 'ja' ? titleJa : titleEn;
        }
    }

    applyLanguage(currentLang);

    langToggle.addEventListener('click', function() {
        var newLang = currentLang === 'ja' ? 'en' : 'ja';
        applyLanguage(newLang);
        syncUrlLang(newLang);
    });
});
