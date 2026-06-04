/* =============================================
   Solfege PRO Docs - Shared script bootstrap
   ---------------------------------------------
   Loads the four site-wide scripts (analytics, lang-toggle, drawer,
   animations) regardless of which directory the host HTML lives in.
   Each page just needs a single tag:

       <script src="bootstrap.js" defer></script>
       <script src="../bootstrap.js" defer></script>
       <script src="../../bootstrap.js" defer></script>

   This script computes the path-prefix back to the project root from
   the current document URL and injects each shared script with that
   prefix, so new pages or subdirectories don't have to be added to
   every HTML file by hand.

   bootstrap.js itself is intended to be loaded with `defer` so it
   runs after the document is parsed. The four injected scripts are
   plain (non-defer) <script> tags appended to <head>; the browser
   downloads them in parallel and each is independently idempotent,
   so execution order doesn't matter.
   ============================================= */
(function() {
    var SCRIPTS = [
        'analytics.js?v=1',
        'lang-toggle.js?v=2',
        'drawer.js?v=1',
        'animations.js?v=2',
        'reading-cta-modal.js?v=3'
    ];

    // Resolve each shared script RELATIVE TO bootstrap.js itself, not to
    // the document. This is the only way the loader works both on the
    // GitHub Pages origin and when the same file is opened locally via
    // `file://` (where location.pathname is a full filesystem path).
    // `document.currentScript` is the <script> tag currently executing,
    // which is bootstrap.js's own tag during this synchronous IIFE.
    var self = document.currentScript;
    var baseHref = self && self.src
        ? self.src.substring(0, self.src.lastIndexOf('/') + 1)
        : '';

    SCRIPTS.forEach(function(src) {
        var s = document.createElement('script');
        s.src = baseHref + src;
        document.head.appendChild(s);
    });
})();
