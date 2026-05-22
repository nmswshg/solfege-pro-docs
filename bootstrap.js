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
        'animations.js?v=1'
    ];

    function computePrefix() {
        var segments = location.pathname.split('/').filter(Boolean);
        // If the last segment looks like a file (has an extension), drop it.
        if (segments.length && /\.[^/]+$/.test(segments[segments.length - 1])) {
            segments.pop();
        }
        return segments.length ? '../'.repeat(segments.length) : '';
    }

    var prefix = computePrefix();
    SCRIPTS.forEach(function(src) {
        var s = document.createElement('script');
        s.src = prefix + src;
        document.head.appendChild(s);
    });
})();
