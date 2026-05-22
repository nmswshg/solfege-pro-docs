/* =============================================
   Mobile drawer toggle (shared across all pages)
   Used by hamburger-btn + .drawer + .drawer-overlay

   Source HTML ships <aside class="drawer" aria-hidden="true" inert>
   so screen readers and search engines skip the duplicate-of-nav
   links while the drawer is closed. open()/close() below flip those
   flags in sync with the visual state.
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
        drawer.setAttribute('aria-hidden', 'false');
        drawer.removeAttribute('inert');
        document.body.style.overflow = 'hidden';
    }
    function close() {
        drawer.classList.remove('active');
        overlay.classList.remove('active');
        hamburger.classList.remove('active');
        hamburger.setAttribute('aria-expanded', 'false');
        drawer.setAttribute('aria-hidden', 'true');
        drawer.setAttribute('inert', '');
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
