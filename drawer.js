/* =============================================
   Mobile drawer toggle (shared across all pages)
   Used by hamburger-btn + .drawer + .drawer-overlay
   ============================================= */
(function () {
    'use strict';

    var hamburger = document.getElementById('hamburger-btn');
    var drawer = document.getElementById('drawer');
    var overlay = document.getElementById('drawer-overlay');
    var closeBtn = document.getElementById('drawer-close');
    if (!hamburger || !drawer || !overlay) return;

    function open() {
        drawer.classList.add('active');
        overlay.classList.add('active');
        hamburger.classList.add('active');
        hamburger.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
    }
    function close() {
        drawer.classList.remove('active');
        overlay.classList.remove('active');
        hamburger.classList.remove('active');
        hamburger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
    }

    hamburger.addEventListener('click', function () {
        if (drawer.classList.contains('active')) close(); else open();
    });
    overlay.addEventListener('click', close);
    if (closeBtn) closeBtn.addEventListener('click', close);

    // Close drawer when a drawer link is clicked
    drawer.querySelectorAll('.drawer__link').forEach(function (link) {
        link.addEventListener('click', close);
    });

    // Close on Escape
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && drawer.classList.contains('active')) close();
    });
})();
