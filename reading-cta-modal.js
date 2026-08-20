/* =============================================
   Reading-completion download modal.

   Fires when the reader reaches the end of a guide article — the moment of peak
   intent. Restrained, brand-styled, fully keyboard-accessible.

   Frequency policy (deliberately NOT "once forever", NOT "every time"):
   - On dismiss (Esc/×/backdrop) we set a 7-DAY cooldown — quiet for a reader
     browsing several articles in one sitting, but re-surfaces for a returning
     visitor who still hasn't downloaded.
   - On App Store badge CLICK we suppress PERMANENTLY — someone who acted on it
     (likely downloaded) should never see it again.
   - QA/measurement override: append ?ctatest=1 to force the modal every time,
     ignoring cooldown + suppression and persisting NO state.
   Rationale: every-visit interstitials erode the premium feel and risk Google's
   intrusive-interstitial penalty; once-forever throws away returning intent.

   Loaded site-wide by bootstrap.js; self-guards to guides only.
   ============================================= */
(function () {
    'use strict';

    var COOLDOWN_KEY = 'sp_reading_modal_until_v2'; // timestamp: don't show before this
    var SUPPRESS_KEY = 'sp_reading_modal_off_v2';   // '1' = permanently off (clicked through)
    var COOLDOWN_DAYS = 7;
    var APP_ID = 'id6756626617';

    // Test override: append ?ctatest=1 to any guide URL to force the modal every
    // time (ignores cooldown + permanent suppression, and writes no state). Lets
    // us QA the copy/animation repeatedly and gather show/click telemetry without
    // changing the production frequency policy for real visitors.
    var TEST_MODE = /[?&]ctatest=1\b/.test(location.search);

    function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }

    // Only on guide articles. Trigger element = the end-of-article zone. Use the
    // methodology endnote: it is present on every guide (23/23), sits at the very
    // end (after References), and — unlike .article-related / .article-cta — is
    // NOT a scroll-reveal target, so it is never held at opacity:0 when the
    // IntersectionObserver evaluates it. (id="references" exists on only ~10/23
    // guides, so it is not reliable as the primary trigger.)
    var body = document.querySelector('.article-body');
    var trigger = document.querySelector('.article-endnote')
        || document.getElementById('references')
        || document.querySelector('.article-related');
    if (!body || !trigger) return;

    // Frequency gating (skipped entirely in TEST_MODE so QA always sees it).
    if (!TEST_MODE) {
        // Permanently suppressed (clicked through before)? Never show again.
        if (lsGet(SUPPRESS_KEY) === '1') return;
        // Within the dismiss cooldown window? Stay quiet until it expires.
        var until = parseInt(lsGet(COOLDOWN_KEY) || '0', 10);
        if (until && Date.now() < until) return;
    }

    // Per-language copy. The page's active language is whatever the lang-toggle
    // logic exposes via <html lang> (build emits one lang per output file).
    var documentLang = document.documentElement.getAttribute('lang') || 'ja';
    var lang = documentLang.toLowerCase() === 'pt-br' ? 'pt' : documentLang.slice(0, 2);
    var COPY = {
        ja: { title: 'ここまで読んでいただきありがとうございます', text: '読むだけでなく、実際に耳と指で試すと定着します。Solfege PRO なら、この記事の内容をそのまま日々の練習に落とし込めます。', price: '月額 980 円', store: 'jp', badge: 'ja-jp', alt: 'App Storeで入手', close: '閉じる' },
        en: { title: 'Thanks for reading to the end', text: 'Reading helps — but it sticks when you actually train your ear and hands. Solfege PRO turns what you just read into daily practice.', price: '¥980/month', store: 'us', badge: 'en-us', alt: 'Download on the App Store', close: 'Close' },
        fr: { title: "Merci d'avoir lu jusqu'au bout", text: "Lire aide — mais cela s'ancre quand on entraîne vraiment l'oreille et les mains. Solfege PRO transforme cette lecture en pratique quotidienne.", price: "¥980/mois", store: 'fr', badge: 'fr-fr', alt: "Télécharger dans l'App Store", close: 'Fermer' },
        de: { title: 'Danke fürs Lesen bis zum Ende', text: 'Lesen hilft — aber es bleibt, wenn du Ohr und Hände wirklich trainierst. Solfege PRO macht aus dem Gelesenen tägliche Übung.', price: '¥980/Monat', store: 'de', badge: 'de-de', alt: 'Laden im App Store', close: 'Schließen' },
        es: { title: 'Gracias por leer hasta el final', text: 'Leer ayuda, pero el aprendizaje se consolida cuando entrenas de verdad el oído y las manos. Solfege PRO convierte lo que acabas de leer en práctica diaria.', price: 'Plan mensual', store: 'es', badge: 'es-es', alt: 'Descargar en el App Store', close: 'Cerrar' },
        it: { title: 'Grazie per aver letto fino alla fine', text: 'Leggere aiuta, ma ciò che impari si consolida quando alleni davvero orecchio e mani. Solfege PRO trasforma ciò che hai appena letto in pratica quotidiana.', price: 'Piano mensile', store: 'it', badge: 'it-it', alt: 'Scarica sull’App Store', close: 'Chiudi' },
        ko: { title: '끝까지 읽어 주셔서 감사합니다', text: '읽는 것에서 그치지 않고 귀와 손으로 직접 훈련하면 배운 내용이 더 오래 남습니다. Solfege PRO로 방금 읽은 내용을 매일의 연습으로 이어 보세요.', price: '월간 요금제', store: 'kr', badge: 'ko-kr', alt: 'App Store에서 다운로드', close: '닫기' },
        pt: { title: 'Obrigado por ler até o final', text: 'Ler ajuda, mas o aprendizado se consolida quando você realmente treina o ouvido e as mãos. O Solfege PRO transforma o que você acabou de ler em prática diária.', price: 'Plano mensal', store: 'br', badge: 'pt-br', alt: 'Baixar na App Store', close: 'Fechar' }
    };
    var c = COPY[lang] || COPY.ja;

    var lastFocus = null;
    var modal = null;

    function build() {
        modal = document.createElement('div');
        modal.className = 'rc-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'rc-modal-title');
        modal.innerHTML =
            '<div class="rc-modal__dialog">' +
            '<button class="rc-modal__close" type="button" aria-label="' + c.close + '">×</button>' +
            '<div class="rc-modal__title" id="rc-modal-title"></div>' +
            '<div class="rc-modal__text"></div>' +
            '<a class="rc-modal__badge app-store-link" href="https://apps.apple.com/' + c.store + '/app/' + APP_ID + '">' +
            '<img src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/' + c.badge + '" alt="" width="120" height="40">' +
            '</a>' +
            '<div class="rc-modal__price"></div>' +
            '</div>';
        // Set text via textContent (avoid any injection from copy strings).
        modal.querySelector('.rc-modal__title').textContent = c.title;
        modal.querySelector('.rc-modal__text').textContent = c.text;
        modal.querySelector('.rc-modal__price').textContent = c.price;
        modal.querySelector('.rc-modal__badge img').setAttribute('alt', c.alt);
        document.body.appendChild(modal);

        modal.querySelector('.rc-modal__close').addEventListener('click', close);
        modal.addEventListener('mousedown', function (e) { if (e.target === modal) close(); });
        // Clicking the App Store badge = intent acted on → suppress permanently
        // (but never persist state in TEST_MODE).
        modal.querySelector('.rc-modal__badge').addEventListener('click', function () {
            if (!TEST_MODE) lsSet(SUPPRESS_KEY, '1');
            if (window.spTrack) { try { window.spTrack('reading_modal_click', { lang: lang }); } catch (e) {} }
        });
        document.addEventListener('keydown', onKey);
    }

    function open() {
        if (modal) return;
        lastFocus = document.activeElement;
        build();
        // Force reflow so the open transition runs.
        // eslint-disable-next-line no-unused-expressions
        modal.offsetHeight;
        modal.classList.add('is-open');
        var first = modal.querySelector('.rc-modal__badge');
        if (first) first.focus();
        if (window.spTrack) { try { window.spTrack('reading_modal_shown', { lang: lang }); } catch (e) {} }
    }

    function close() {
        if (!modal) return;
        // Start the cooldown (unless already permanently suppressed, or in TEST_MODE).
        if (!TEST_MODE && lsGet(SUPPRESS_KEY) !== '1') {
            lsSet(COOLDOWN_KEY, String(Date.now() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000));
        }
        modal.classList.remove('is-open');
        document.removeEventListener('keydown', onKey);
        var m = modal; modal = null;
        setTimeout(function () { if (m && m.parentNode) m.parentNode.removeChild(m); }, 320);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function onKey(e) {
        if (e.key === 'Escape') { close(); return; }
        if (e.key !== 'Tab' || !modal) return;
        // Focus trap across the two focusables (badge link + close button).
        var f = modal.querySelectorAll('a[href], button');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    // Trigger when the References heading scrolls into view = the reader has
    // reached the end of the substantive content.
    if ('IntersectionObserver' in window) {
        var obs = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) { obs.disconnect(); open(); }
            });
        }, { rootMargin: '0px 0px -10% 0px', threshold: 0 });
        obs.observe(trigger);
    }
})();
