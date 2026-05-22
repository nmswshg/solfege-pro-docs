/* =============================================
   Solfege PRO - Practice Page Features
   ---------------------------------------------
   Page-specific UI behavior for practice/*.html:
     1. Accordion (.question-card open/close)
     2. Expand/Collapse All (.expand-all-btn)
     3. Section TOC click → expand + scroll into view (.section-toc__item)

   The language dropdown that used to live in practice.js has been
   removed — lang-toggle.js (loaded via bootstrap.js) is now the
   single source of truth across the entire site. The EXPAND/COLLAPSE
   button label sync to the active language is now driven by listening
   for the `langchange` custom event that lang-toggle.js dispatches.
   ============================================= */
document.addEventListener('DOMContentLoaded', function() {

    /* ---- 1. Accordion ---- */
    var questionCards = document.querySelectorAll('.question-card');
    questionCards.forEach(function(card) {
        var header = card.querySelector('.question-card__header');
        if (!header) return;
        if (!header.querySelector('.question-card__toggle')) {
            var toggle = document.createElement('span');
            toggle.className = 'question-card__toggle';
            toggle.innerHTML = '▼';
            header.appendChild(toggle);
        }
        header.addEventListener('click', function() {
            card.classList.toggle('expanded');
        });
    });

    /* ---- 2. Expand/Collapse All ---- */
    var expandAllBtns = document.querySelectorAll('.expand-all-btn');
    var EXPAND_LABEL = {
        ja: 'すべて開く',
        en: 'Expand All',
        fr: 'Tout développer',
        de: 'Alle aufklappen'
    };
    var COLLAPSE_LABEL = {
        ja: 'すべて閉じる',
        en: 'Collapse All',
        fr: 'Tout réduire',
        de: 'Alle zuklappen'
    };
    function currentLang() {
        return document.documentElement.getAttribute('data-lang') || 'ja';
    }

    expandAllBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var section = btn.closest('.section') || document.querySelector('.practice-body');
            if (!section) return;
            var cards = section.querySelectorAll('.question-card');
            var allExpanded = Array.from(cards).every(function(card) {
                return card.classList.contains('expanded');
            });
            cards.forEach(function(card) {
                if (allExpanded) card.classList.remove('expanded');
                else card.classList.add('expanded');
            });
            var lang = currentLang();
            btn.textContent = allExpanded ? EXPAND_LABEL[lang] : COLLAPSE_LABEL[lang];
        });
    });

    // Keep the expand/collapse button text in sync with language switches.
    function refreshExpandLabels() {
        var lang = currentLang();
        expandAllBtns.forEach(function(btn) {
            var section = btn.closest('.section') || document.querySelector('.practice-body');
            if (!section) return;
            var cards = section.querySelectorAll('.question-card');
            var allExpanded = cards.length > 0 && Array.from(cards).every(function(card) {
                return card.classList.contains('expanded');
            });
            btn.textContent = allExpanded ? COLLAPSE_LABEL[lang] : EXPAND_LABEL[lang];
        });
    }
    window.addEventListener('langchange', refreshExpandLabels);
    refreshExpandLabels();

    /* ---- 3. Section TOC ---- */
    document.querySelectorAll('.section-toc__item').forEach(function(item) {
        item.addEventListener('click', function() {
            var targetId = item.dataset.target;
            var targetCard = targetId && document.getElementById(targetId);
            if (targetCard) {
                targetCard.classList.add('expanded');
                targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
});
