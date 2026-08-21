/* =============================================
   Solfege PRO Android early-access campaign
   ---------------------------------------------
   Site-wide floating CTA + first-visit modal.
   Change FORM_URL in this file after the Google Form is ready.
   ============================================= */
(function () {
    'use strict';

    if (window.__solfegeAndroidBetaCampaignLoaded) return;
    window.__solfegeAndroidBetaCampaignLoaded = true;

    var FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSd-S0jh2KN_wTvrKdxByKjPgXOB0smX6k7BGZzqfGGGrdya5Q/viewform';
    var FORM_LANGUAGE_ENTRY = 'entry.1788578993';
    var DETAILS_PATH = '/android-beta/';
    var DISMISS_KEY = 'solfege_android_beta_modal_dismissed_at';
    var DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    var AUTO_OPEN_DELAY_MS = 900;
    var localPreview = new URLSearchParams(location.search).get('android-beta-preview') === '1';
    var isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || location.protocol === 'file:';

    // Keep automated screenshots and local development stable unless the
    // campaign is explicitly requested with ?android-beta-preview=1.
    if (isLocal && !localPreview) return;

    var COPY = {
        ja: {
            badge: '2026年秋頃リリース予定',
            title: 'Android版を無料で先行体験',
            text: '正式リリース前のAndroid版を14日間、いつもの音楽練習で無料体験できます。不具合や使いにくい点を見つけたら、気軽に教えてください。',
            apply: '無料で先行体験する',
            details: '詳しく見る',
            floating: 'Android版を先行体験',
            close: '先行体験の案内を閉じる'
        },
        en: {
            badge: 'Launching late 2026',
            title: 'Try the Android version early—free',
            text: 'Enjoy Solfege PRO for Android free for 14 days before its official release. If you notice a bug or anything awkward, just let us know.',
            apply: 'Try it free',
            details: 'Learn more',
            floating: 'Free Android preview',
            close: 'Close preview invitation'
        },
        fr: {
            badge: 'Sortie prévue fin 2026',
            title: 'Essayez la version Android gratuitement en avant-première',
            text: 'Profitez gratuitement de Solfege PRO sur Android pendant 14 jours avant sa sortie officielle. Si vous remarquez un bug ou un point gênant, dites-le-nous simplement.',
            apply: 'Essayer gratuitement',
            details: 'En savoir plus',
            floating: 'Avant-première Android',
            close: 'Fermer l’invitation à l’avant-première'
        },
        de: {
            badge: 'Veröffentlichung Ende 2026',
            title: 'Android-Version vorab kostenlos testen',
            text: 'Teste Solfege PRO für Android 14 Tage lang kostenlos vor der offiziellen Veröffentlichung. Falls dir ein Fehler oder etwas Unpraktisches auffällt, sag uns einfach Bescheid.',
            apply: 'Kostenlos testen',
            details: 'Mehr erfahren',
            floating: 'Android kostenlos testen',
            close: 'Einladung zur Vorabversion schließen'
        },
        es: {
            badge: 'Lanzamiento previsto para finales de 2026',
            title: 'Prueba gratis la versión Android antes que nadie',
            text: 'Disfruta gratis de Solfege PRO para Android durante 14 días antes de su lanzamiento oficial. Si encuentras un error o algo incómodo, solo tienes que avisarnos.',
            apply: 'Probar gratis',
            details: 'Más información',
            floating: 'Prueba Android gratis',
            close: 'Cerrar la invitación a la prueba'
        },
        it: {
            badge: 'Uscita prevista a fine 2026',
            title: 'Prova gratis in anteprima la versione Android',
            text: 'Usa gratuitamente Solfege PRO per Android per 14 giorni prima dell’uscita ufficiale. Se noti un bug o qualcosa di scomodo, faccelo sapere senza problemi.',
            apply: 'Prova gratis',
            details: 'Scopri di più',
            floating: 'Anteprima Android gratuita',
            close: 'Chiudi l’invito all’anteprima'
        },
        ko: {
            badge: '2026년 하반기 출시 예정',
            title: 'Android 버전을 무료로 먼저 체험해 보세요',
            text: '정식 출시 전에 Solfege PRO Android 버전을 14일간 무료로 이용할 수 있습니다. 오류나 불편한 점을 발견하면 부담 없이 알려 주세요.',
            apply: '무료로 체험하기',
            details: '자세히 보기',
            floating: 'Android 무료 사전 체험',
            close: '사전 체험 안내 닫기'
        },
        'pt-BR': {
            badge: 'Lançamento previsto para o fim de 2026',
            title: 'Experimente grátis a versão Android antes do lançamento',
            text: 'Use o Solfege PRO para Android gratuitamente por 14 dias antes do lançamento oficial. Se encontrar um erro ou algo desconfortável, é só nos avisar.',
            apply: 'Experimentar grátis',
            details: 'Saiba mais',
            floating: 'Prévia Android gratuita',
            close: 'Fechar convite para a prévia'
        }
    };

    function getLang() {
        var htmlLang = document.documentElement.lang || 'ja';
        if (htmlLang.toLowerCase() === 'pt-br') return 'pt-BR';
        return COPY[htmlLang] ? htmlLang : 'ja';
    }

    function localizedDetailsPath(lang) {
        if (lang === 'ja') return DETAILS_PATH;
        var suffix = lang === 'pt-BR' ? 'pt-br' : lang;
        return '/' + suffix + '/android-beta/';
    }

    function localizedFormUrl(lang) {
        if (!FORM_URL) return '';
        var googleUiLang = lang === 'pt-BR' ? 'pt-BR' : lang;
        var formLanguage = {
            ja: '日本語',
            en: 'English',
            fr: 'Français',
            de: 'Deutsch',
            es: 'Español',
            it: 'Italiano',
            ko: '한국어',
            'pt-BR': 'Português (Brasil)'
        }[lang] || '日本語';
        var url = new URL(FORM_URL);
        url.searchParams.set('usp', 'pp_url');
        url.searchParams.set('hl', googleUiLang);
        url.searchParams.set(FORM_LANGUAGE_ENTRY, formLanguage);
        return url.toString();
    }

    function track(name, params) {
        if (window.SolfegeAnalytics && window.SolfegeAnalytics.track) {
            window.SolfegeAnalytics.track(name, params || {});
        }
    }

    function isDismissedRecently() {
        try {
            var stored = Number(localStorage.getItem(DISMISS_KEY));
            return stored > 0 && Date.now() - stored < DISMISS_TTL_MS;
        } catch (e) {
            return false;
        }
    }

    function rememberDismissal() {
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
    }

    function hydrateApplyLinks(lang, copy) {
        document.querySelectorAll('[data-android-beta-apply]').forEach(function (link) {
            if (FORM_URL) {
                link.href = localizedFormUrl(lang);
                link.removeAttribute('aria-disabled');
                link.classList.remove('is-disabled');
                link.textContent = copy.apply;
            } else {
                link.href = localizedDetailsPath(lang) + '#apply';
            }
        });
    }

    function hydrateDetailsLinks(lang) {
        document.querySelectorAll('[data-android-beta-details]').forEach(function (link) {
            link.href = localizedDetailsPath(lang);
        });
    }

    function init() {
        var lang = getLang();
        var copy = COPY[lang];
        var currentPath = location.pathname.toLowerCase();
        var isExcludedFromAutoOpen = /(?:^|\/)(?:android-beta|privacy|terms)(?:\.[a-z-]+)?(?:\.html)?\/?$/.test(currentPath);
        var lastFocused = null;

        hydrateApplyLinks(lang, copy);
        hydrateDetailsLinks(lang);

        var floating = document.createElement('button');
        floating.type = 'button';
        floating.className = 'android-beta-fab';
        floating.setAttribute('aria-haspopup', 'dialog');
        floating.innerHTML = '<span class="android-beta-fab__dot" aria-hidden="true"></span>' +
            '<span class="android-beta-fab__text"></span>';
        floating.querySelector('.android-beta-fab__text').textContent = copy.floating;
        if (document.querySelector('.sticky-cta')) floating.classList.add('android-beta-fab--above-sticky');
        document.body.appendChild(floating);

        var modal = document.createElement('div');
        modal.className = 'android-beta-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'android-beta-modal-title');
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML =
            '<div class="android-beta-modal__dialog" role="document">' +
                '<button class="android-beta-modal__close" type="button"></button>' +
                '<div class="android-beta-modal__badge"></div>' +
                '<h2 class="android-beta-modal__title" id="android-beta-modal-title"></h2>' +
                '<p class="android-beta-modal__text"></p>' +
                '<div class="android-beta-modal__actions">' +
                    '<a class="android-beta-modal__primary" data-android-beta-apply></a>' +
                    '<a class="android-beta-modal__secondary"></a>' +
                '</div>' +
                '<p class="android-beta-modal__note">Android 8.0+ · 14 days · Google Play</p>' +
            '</div>';
        var closeButton = modal.querySelector('.android-beta-modal__close');
        closeButton.setAttribute('aria-label', copy.close);
        closeButton.textContent = '×';
        modal.querySelector('.android-beta-modal__badge').textContent = copy.badge;
        modal.querySelector('.android-beta-modal__title').textContent = copy.title;
        modal.querySelector('.android-beta-modal__text').textContent = copy.text;
        var primary = modal.querySelector('.android-beta-modal__primary');
        primary.textContent = FORM_URL ? copy.apply : copy.details;
        var secondary = modal.querySelector('.android-beta-modal__secondary');
        secondary.href = localizedDetailsPath(lang);
        secondary.textContent = copy.details;
        if (!FORM_URL) secondary.hidden = true;
        document.body.appendChild(modal);
        hydrateApplyLinks(lang, copy);

        function open(source) {
            if (modal.classList.contains('is-open')) return;
            lastFocused = document.activeElement;
            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('android-beta-modal-open');
            closeButton.focus();
            track('android_beta_modal_view', { source: source });
        }

        function close(reason) {
            if (!modal.classList.contains('is-open')) return;
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('android-beta-modal-open');
            rememberDismissal();
            if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
            track('android_beta_modal_dismissed', { reason: reason });
        }

        floating.addEventListener('click', function () { open('floating_button'); });
        closeButton.addEventListener('click', function () { close('close_button'); });
        modal.addEventListener('click', function (event) {
            if (event.target === modal) close('backdrop');
        });
        primary.addEventListener('click', function () {
            rememberDismissal();
            track('android_beta_cta_click', { source: 'modal', destination: FORM_URL ? 'google_form' : 'details' });
        });
        secondary.addEventListener('click', function () {
            rememberDismissal();
            track('android_beta_cta_click', { source: 'modal', destination: 'details' });
        });

        document.addEventListener('keydown', function (event) {
            if (!modal.classList.contains('is-open')) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                close('escape');
                return;
            }
            if (event.key !== 'Tab') return;
            var focusable = Array.prototype.slice.call(modal.querySelectorAll('button, a[href]:not([hidden])'));
            if (!focusable.length) return;
            var first = focusable[0];
            var last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });

        if (!isExcludedFromAutoOpen && !isDismissedRecently()) {
            window.setTimeout(function () { open('auto'); }, AUTO_OPEN_DELAY_MS);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
