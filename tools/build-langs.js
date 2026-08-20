#!/usr/bin/env node
/**
 * Generate language-suffixed directory output from multi-language source.
 *
 * Source files live under src/. For each source `src/<path>.html`, this
 * script generates eight output files under the repo root:
 *
 *   <path>/index.html          ← Japanese (e.g. guides/interval-training/index.html)
 *   en/<path>/index.html       ← English
 *   fr/<path>/index.html       ← French
 *   de/<path>/index.html       ← German
 *   es/<path>/index.html       ← Spanish
 *   it/<path>/index.html       ← Italian
 *   ko/<path>/index.html       ← Korean
 *   pt-br/<path>/index.html    ← Brazilian Portuguese
 *
 * Special cases:
 *   - src/index.html             → index.html  (root TOP for ja)
 *                                  and each other localized root
 *   - src/guides/index.html      → guides/index.html  (ja guides listing)
 *                                  en/guides/index.html, etc.
 *
 * URLs (always end in /):
 *   src/index.html                       → / + all seven localized roots
 *   src/start-here.html                  → /start-here/  + /en/start-here/  + ...
 *   src/guides/index.html                → /guides/  + /en/guides/  + ...
 *   src/guides/interval-training.html    → /guides/interval-training/ + /en/...
 *   src/practice/training-menu/interval.html
 *                                        → /practice/training-menu/interval/
 *                                          + /en/practice/training-menu/interval/
 *
 * Plus a redirect stub layer: every OLD URL from the previous .X.html scheme
 * (foo.html / foo.en.html / foo.fr.html / foo.de.html, etc.) gets a meta-refresh
 * stub pointing to the new directory URL, so any inbound links / Google's
 * indexed pages don't 404.
 *
 * The script also keeps the existing data/ JSON pipelines intact:
 *   - data/prices.json          → in-place price string sync in src/
 *   - data/training-names.json  → in-place training-name normalisation in src/
 *   - data/page-metadata.json   → per-page title + description override
 *
 * Re-running is fully idempotent.
 */

const fs = require('fs');
const path = require('path');

// --------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------

const SITE_ORIGIN = 'https://solfegepro.com';
const LANGS_ALL = ['ja', 'en', 'fr', 'de'];
const ADDITIONAL_LANGS = ['es', 'it', 'ko', 'pt-BR'];
const KNOWN_LANGS = [...LANGS_ALL, ...ADDITIONAL_LANGS];
const URL_LANG_PREFIX = { ja: '', en: 'en', fr: 'fr', de: 'de', es: 'es', it: 'it', ko: 'ko', 'pt-BR': 'pt-br' };
const OG_LOCALE = { ja: 'ja_JP', en: 'en_US', fr: 'fr_FR', de: 'de_DE', es: 'es_ES', it: 'it_IT', ko: 'ko_KR', 'pt-BR': 'pt_BR' };
const APP_STORE_LOCALE = { ja: 'jp', en: 'us', fr: 'fr', de: 'de', es: 'es', it: 'it', ko: 'kr', 'pt-BR': 'br' };
const APP_STORE_BADGE_LOCALE = { ja: 'ja-jp', en: 'en-us', fr: 'fr-fr', de: 'de-de', es: 'es-es', it: 'it-it', ko: 'ko-kr', 'pt-BR': 'pt-br' };
const APP_STORE_BADGE_ALT = {
    ja: 'App Storeからダウンロード', en: 'Download on the App Store', fr: "Télécharger dans l’App Store", de: 'Laden im App Store',
    es: 'Descargar en el App Store', it: 'Scarica sull’App Store', ko: 'App Store에서 다운로드', 'pt-BR': 'Baixar na App Store',
};
const PRICE_CURRENCY = { ja: 'JPY', en: 'USD', fr: 'EUR', de: 'EUR', es: 'EUR', it: 'EUR', ko: 'KRW', 'pt-BR': 'BRL' };

function langsForSource(srcPath) {
    return KNOWN_LANGS;
}

// ---- App Store campaign attribution (pt / ct / mt) ----------------------
// Every App Store href in generated OUTPUT html gets Apple campaign params
// appended at build time (?pt=...&ct=...&mt=8). Source files under src/
// stay param-free; the ct section is derived from the OUTPUT file path.
// APP_STORE_PT is Apple's provider token — a PUBLIC value that appears in
// marketing URLs (not a secret). Rotate it here, in this one constant.
// ct naming is FIXED by the iOS repo's campaign ledger (musicman-tool-kit
// .claude analytics docs): web_home / web_start / web_guides / web_manual /
// web_practice / web_support. Do NOT invent new ct values here.
const APP_STORE_PT = '6749158383';
const APP_STORE_MT = '8';

const SRC_DIR = 'src';
const PRICES_PATH = 'data/prices.json';
const PRICES_FALLBACK = 'data/prices.fallback.json';
const PRICES_PREV = 'data/prices.previous.json';
const TRAINING_PATH = 'data/training-names.json';
const TRAINING_FALLBACK = 'data/training-names.fallback.json';
const PAGEMETA_PATH = 'data/page-metadata.json';
const PAGEMETA_FALLBACK = 'data/page-metadata.fallback.json';
const ACCESSIBILITY_TRANSLATIONS_PATH = 'data/accessibility-translations.json';
const PAGE_TRANSLATION_PATHS = {
    es: 'data/page-translations-es.json',
    it: 'data/page-translations-it.json',
    ko: 'data/page-translations-ko.json',
    'pt-BR': 'data/page-translations-pt-br.json',
};

// --------------------------------------------------------------------
// Source discovery
// --------------------------------------------------------------------

/**
 * List every source HTML file under src/, returning relative paths
 * (e.g. 'index.html', 'guides/foo.html', 'practice/training-menu/interval.html').
 */
function listSources() {
    const files = [];
    function walk(dir, rel) {
        if (!fs.existsSync(dir)) return;
        for (const name of fs.readdirSync(dir)) {
            // Skip include-only partials: they are inlined via the
            // `<!-- include: _partials/NAME.html -->` directive and must NOT
            // emit standalone output pages (no _partials/.../index.html).
            if (name === '_partials') continue;
            const full = path.join(dir, name);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) {
                walk(full, rel ? path.join(rel, name) : name);
            } else if (name.endsWith('.html')) {
                files.push(rel ? path.join(rel, name) : name);
            }
        }
    }
    walk(SRC_DIR, '');
    return files.sort();
}

// --------------------------------------------------------------------
// URL / path mapping (the heart of the new scheme)
// --------------------------------------------------------------------

/**
 * Map a source-relative path (e.g. 'guides/foo.html') to the public URL
 * that serves it for the given language.
 *
 * Examples:
 *   'index.html', 'ja'                              → '/'
 *   'index.html', 'en'                              → '/en/'
 *   'start-here.html', 'ja'                         → '/start-here/'
 *   'start-here.html', 'fr'                         → '/fr/start-here/'
 *   'guides/index.html', 'ja'                       → '/guides/'
 *   'guides/index.html', 'en'                       → '/en/guides/'
 *   'guides/interval-training.html', 'ja'           → '/guides/interval-training/'
 *   'guides/interval-training.html', 'de'           → '/de/guides/interval-training/'
 *   'practice/training-menu/interval.html', 'ja'    → '/practice/training-menu/interval/'
 */
function srcPathToUrlPath(srcPath, lang) {
    let p = srcPath;
    p = p.replace(/\.html$/, '');                // drop extension
    p = p.replace(/\/index$/, '').replace(/^index$/, ''); // drop trailing /index AND its slash (guides/index -> guides; index -> '')
    // Now p is '' (was 'index.html') or 'start-here' or 'guides' or 'guides/foo' etc.
    const prefix = URL_LANG_PREFIX[lang];
    if (prefix === undefined) throw new Error(`Unsupported language: ${lang}`);
    const langPrefix = prefix ? `/${prefix}` : '';
    if (p === '') return `${langPrefix}/`;
    return `${langPrefix}/${p}/`;
}

/**
 * Map a source-relative path to the output FS path (relative to repo root)
 * where the variant for the given language should be written.
 *
 * Examples:
 *   'index.html', 'ja'                              → 'index.html'
 *   'index.html', 'en'                              → 'en/index.html'
 *   'start-here.html', 'ja'                         → 'start-here/index.html'
 *   'guides/index.html', 'ja'                       → 'guides/index.html'
 *   'guides/foo.html', 'ja'                         → 'guides/foo/index.html'
 *   'practice/training-menu/interval.html', 'en'    → 'en/practice/training-menu/interval/index.html'
 */
function srcPathToOutputPath(srcPath, lang) {
    let outPath;
    if (srcPath === 'index.html') {
        outPath = 'index.html';
    } else if (srcPath.endsWith('/index.html')) {
        outPath = srcPath; // keep guides/index.html as-is
    } else {
        outPath = srcPath.replace(/\.html$/, '/index.html');
    }
    const prefix = URL_LANG_PREFIX[lang];
    if (prefix === undefined) throw new Error(`Unsupported language: ${lang}`);
    return lang === 'ja' ? outPath : `${prefix}/${outPath}`;
}

function ensureDir(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

// --------------------------------------------------------------------
// Prices sync (unchanged behaviour, but now operates on src/)
// --------------------------------------------------------------------

function loadPrices() {
    try {
        const raw = JSON.parse(fs.readFileSync(PRICES_PATH, 'utf8'));
        sanityCheckPrices(raw, PRICES_PATH);
        return raw;
    } catch (e) {
        console.warn(`[prices] WARNING: ${PRICES_PATH} unusable (${e.message}). Using fallback.`);
    }
    const raw = JSON.parse(fs.readFileSync(PRICES_FALLBACK, 'utf8'));
    sanityCheckPrices(raw, PRICES_FALLBACK);
    return raw;
}

function sanityCheckPrices(data, source) {
    for (const lang of LANGS_ALL) {
        const entry = data[lang];
        if (!entry || typeof entry.price !== 'string' || !entry.price.trim()) {
            throw new Error(`${source}: missing/empty ${lang}.price`);
        }
        // trial may be EMPTY: the monthly introductory offer was permanently
        // removed on 2026-07-07 (app-side owner decision), so an empty string
        // is the expected steady state. It must still be a string.
        if (typeof entry.trial !== 'string') {
            throw new Error(`${source}: missing ${lang}.trial (string, may be empty)`);
        }
        if (entry.price.length > 80 || entry.trial.length > 80) {
            throw new Error(`${source}: ${lang} field suspiciously long`);
        }
    }
    return data;
}

function loadPricesPrev() {
    try {
        return JSON.parse(fs.readFileSync(PRICES_PREV, 'utf8'));
    } catch (e) {
        return null;
    }
}

function writePricesSnapshot(currentPrices) {
    const out = {
        _comment_: "Build-managed snapshot of what's currently substituted into src/ HTML. DO NOT edit by hand.",
        ja: currentPrices.ja, en: currentPrices.en, fr: currentPrices.fr, de: currentPrices.de,
    };
    fs.writeFileSync(PRICES_PREV, JSON.stringify(out, null, 2) + '\n', 'utf8');
}

function syncPriceStringsToSources(sourceFsPaths, currentPrices) {
    const prev = loadPricesPrev();
    if (!prev) { writePricesSnapshot(currentPrices); return; }
    const replacements = [];
    for (const lang of LANGS_ALL) {
        const fromP = prev[lang]?.price, toP = currentPrices[lang].price;
        const fromT = prev[lang]?.trial, toT = currentPrices[lang].trial;
        if (fromP && fromP !== toP) replacements.push({ from: fromP, to: toP });
        if (fromT && fromT !== toT) replacements.push({ from: fromT, to: toT });
    }
    if (replacements.length === 0) return;
    console.log(`[prices] ${replacements.length} string(s) changed; updating src/ HTML`);
    for (const src of sourceFsPaths) {
        const raw = fs.readFileSync(src, 'utf8');
        let out = raw;
        for (const r of replacements) out = out.split(r.from).join(r.to);
        if (out !== raw) fs.writeFileSync(src, out, 'utf8');
    }
    writePricesSnapshot(currentPrices);
}

// --------------------------------------------------------------------
// Training-name normalisation
// --------------------------------------------------------------------

function loadTrainingNames() {
    try {
        const data = JSON.parse(fs.readFileSync(TRAINING_PATH, 'utf8'));
        sanityCheckTrainingNames(data, TRAINING_PATH);
        return data;
    } catch (e) {
        console.warn(`[training-names] WARNING: ${TRAINING_PATH} unusable (${e.message}). Using fallback.`);
    }
    const data = JSON.parse(fs.readFileSync(TRAINING_FALLBACK, 'utf8'));
    sanityCheckTrainingNames(data, TRAINING_FALLBACK);
    return data;
}

function sanityCheckTrainingNames(data, source) {
    for (const [key, entry] of Object.entries(data)) {
        if (key.startsWith('_')) continue;
        if (!entry.canonical || !entry.aliases) throw new Error(`${source}: ${key} missing canonical/aliases`);
        for (const lang of LANGS_ALL) {
            if (typeof entry.canonical[lang] !== 'string' || !entry.canonical[lang].trim()) {
                throw new Error(`${source}: ${key}.canonical.${lang} missing/empty`);
            }
        }
        if (!Array.isArray(entry.aliases) || entry.aliases.length === 0) {
            throw new Error(`${source}: ${key}.aliases must be non-empty array`);
        }
    }
    return data;
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function buildAliasIndex(trainingNames) {
    const list = [];
    for (const [key, entry] of Object.entries(trainingNames)) {
        if (key.startsWith('_')) continue;
        for (const alias of entry.aliases) {
            list.push({ alias, canonical: entry.canonical, regex: new RegExp(`\\b${escapeRegex(alias)}\\b`, 'g') });
        }
    }
    list.sort((a, b) => b.alias.length - a.alias.length);
    return list;
}

function fixFrenchArticleAgreement(text) {
    const FEM = ['Reconnaissance', 'Formation', 'Lecture'];
    let out = text;
    for (const w of FEM) {
        out = out.replace(new RegExp(`\\bLe\\s+${w}\\b`, 'g'), `La ${w}`);
        out = out.replace(new RegExp(`\\bL'${w}\\b`, 'g'), `La ${w}`);
        out = out.replace(new RegExp(`\\bdu\\s+${w}\\b`, 'g'), `de la ${w}`);
        out = out.replace(new RegExp(`\\bau\\s+${w}\\b`, 'g'), `à la ${w}`);
    }
    return out;
}

function normalizeSpanBody(body, lang, aliasIndex) {
    let out = body;
    for (const entry of aliasIndex) out = out.replace(entry.regex, entry.canonical[lang]);
    if (lang === 'fr') out = fixFrenchArticleAgreement(out);
    return out;
}

function syncTrainingNamesInSources(sourceFsPaths) {
    let trainingNames;
    try { trainingNames = loadTrainingNames(); }
    catch (e) { console.error(`[training-names] ERROR: ${e.message}`); return; }
    const aliasIndex = buildAliasIndex(trainingNames);
    if (aliasIndex.length === 0) return;
    const spanRe = /(<span\s+lang="(ja|en|fr|de)">)([\s\S]*?)(<\/span>)/g;
    let modified = 0;
    for (const src of sourceFsPaths) {
        const raw = fs.readFileSync(src, 'utf8');
        const out = raw.replace(spanRe, (m, open, lang, body, close) => open + normalizeSpanBody(body, lang, aliasIndex) + close);
        if (out !== raw) { fs.writeFileSync(src, out, 'utf8'); modified++; }
    }
    if (modified > 0) console.log(`[training-names] normalised ${modified} source file(s)`);
}

// --------------------------------------------------------------------
// Page metadata (title + description override)
// --------------------------------------------------------------------

let _pageMetaCache = null;
const _pageTranslationsCache = {};
function loadPageTranslations(lang) {
    if (_pageTranslationsCache[lang]) return _pageTranslationsCache[lang];
    const translationPath = PAGE_TRANSLATION_PATHS[lang];
    if (!translationPath) throw new Error(`No translation data path for ${lang}`);
    const data = JSON.parse(fs.readFileSync(translationPath, 'utf8'));
    if (!data.pages || typeof data.pages !== 'object') {
        throw new Error(`${translationPath}: missing pages object`);
    }
    _pageTranslationsCache[lang] = data.pages;
    return _pageTranslationsCache[lang];
}

function loadPageMetadata() {
    if (_pageMetaCache) return _pageMetaCache;
    try {
        _pageMetaCache = JSON.parse(fs.readFileSync(PAGEMETA_PATH, 'utf8'));
        return _pageMetaCache;
    } catch (e) {
        console.warn(`[page-metadata] WARNING: ${PAGEMETA_PATH} unusable. Using fallback.`);
    }
    _pageMetaCache = JSON.parse(fs.readFileSync(PAGEMETA_FALLBACK, 'utf8'));
    return _pageMetaCache;
}

function escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function stripSiteSuffix(t) { const i = t.lastIndexOf(' | '); return i === -1 ? t : t.slice(0, i); }

function applyPageMetadata(html, srcPath, lang) {
    const translatedEntry = ADDITIONAL_LANGS.includes(lang)
        ? loadPageTranslations(lang)[srcPath]
        : null;
    const meta = loadPageMetadata();
    const entry = meta[srcPath];
    if (!translatedEntry && (!entry || !entry.title || !entry.description)) return html;
    const newTitle = translatedEntry?.title || entry.title[lang];
    const newDesc = translatedEntry?.description || entry.description[lang];
    if (!newTitle || !newDesc) return html;
    let out = html;
    const titleEsc = escapeHtml(newTitle);
    const descEsc = escapeHtml(newDesc);
    const bareTitleEsc = escapeHtml(stripSiteSuffix(newTitle));
    out = out.replace(/<title>[^<]*<\/title>/, `<title>${titleEsc}</title>`);
    out = out.replace(new RegExp(`data-title-${lang}="[^"]*"`), `data-title-${lang}="${titleEsc}"`);
    out = out.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${descEsc}">`);
    out = out.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${bareTitleEsc}">`);
    out = out.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${descEsc}">`);
    out = out.replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${bareTitleEsc}">`);
    out = out.replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${descEsc}">`);
    return out;
}

/**
 * Localize the Article JSON-LD for the output language and repair @id.
 * The source ships a single ja JSON-LD block per article; without this the
 * non-Japanese builds emit Japanese headline/description/publisher and a dead
 * legacy `.html` @id. Headline/description come from the per-lang
 * page-metadata (same source as <title>/<meta description>); the publisher/
 * author Organization name is romanized for non-ja; mainEntityOfPage.@id is
 * rebuilt from the page's own canonical directory URL (fixes the stale .html
 * for every language, ja included). JA headline/description are left as the
 * hand-authored source values (they don't leak) — only @id + names change.
 */
function localizeJsonLd(html, srcPath, lang) {
    const brand = lang === 'ja' ? 'ソルフェージュPRO' : 'Solfege PRO';
    const entry = loadPageMetadata()[srcPath];
    const translatedEntry = ADDITIONAL_LANGS.includes(lang) ? loadPageTranslations(lang)[srcPath] : null;
    const localizedTitle = translatedEntry?.title || entry?.title?.[lang];
    const localizedDescription = translatedEntry?.description || entry?.description?.[lang];
    const canonicalId = SITE_ORIGIN + srcPathToUrlPath(srcPath, lang);
    const ldRe = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
    return html.replace(ldRe, (block, json) => {
        let obj;
        try { obj = JSON.parse(json); } catch (e) { return block; } // leave malformed alone
        const visit = (node) => {
            if (!node || typeof node !== 'object') return;
            const type = node['@type'];
            if (type === 'Article' || type === 'BlogPosting') {
                if (lang !== 'ja' && localizedTitle) node.headline = stripSiteSuffix(localizedTitle);
                if (lang !== 'ja' && localizedDescription) node.description = localizedDescription;
                if (node.mainEntityOfPage && typeof node.mainEntityOfPage === 'object') node.mainEntityOfPage['@id'] = canonicalId;
            }
            if (type === 'Organization' && typeof node.name === 'string') node.name = brand;
            if (type === 'WebSite') {
                node.name = brand;
                node.url = canonicalId;
                node.inLanguage = lang;
            }
            if (type === 'SoftwareApplication') {
                node.name = brand;
                node.url = canonicalId;
                node.inLanguage = lang;
                node.downloadUrl = `https://apps.apple.com/${APP_STORE_LOCALE[lang]}/app/id6756626617`;
                if (localizedDescription) node.description = localizedDescription;
                if (node.offers && typeof node.offers === 'object') {
                    node.offers.priceCurrency = PRICE_CURRENCY[lang];
                }
            }
            for (const k of Object.keys(node)) {
                const v = node[k];
                if (Array.isArray(v)) v.forEach(visit);
                else if (v && typeof v === 'object') visit(v);
            }
        };
        if (Array.isArray(obj)) obj.forEach(visit); else visit(obj);
        return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
    });
}

// Per-language label for the "Guides" breadcrumb crumb (mirrors the guides
// index <title>, suffix stripped). Source of truth is data-title on
// src/guides/index.html; hard-coded here to avoid a second file read per page.
const GUIDES_CRUMB = { ja: '練習ガイド一覧', en: 'Training Guides', fr: "Guides d'entraînement", de: 'Übungsleitfäden', es: 'Guías de práctica', it: 'Guide pratiche', ko: '연습 가이드', 'pt-BR': 'Guias de prática' };
const HOME_CRUMB = { ja: 'ホーム', en: 'Home', fr: 'Accueil', de: 'Startseite', es: 'Inicio', it: 'Home', ko: '홈', 'pt-BR': 'Início' };
const MANUAL_CRUMB = { ja: '設定マニュアル', en: 'Manual', fr: 'Manuel', de: 'Handbuch', es: 'Manual', it: 'Manuale', ko: '매뉴얼', 'pt-BR': 'Manual' };

// Inject a BreadcrumbList JSON-LD (Home > Guides > <article>) into guide article
// pages. Only article pages under guides/ (NOT the guides index itself, NOT
// practice pages which have a different hierarchy). The leaf name is the page's
// already-localized <title> with the site suffix stripped, so it tracks
// page-metadata.json automatically. Idempotent: keyed off the @type so a second
// run replaces rather than duplicates. Returns html unchanged for non-targets.
function injectBreadcrumbJsonLd(html, srcPath, lang) {
    // Guides and manual article pages get a Home > Section > Leaf breadcrumb.
    // Section-index pages (guides/index, manual/index) are excluded.
    const isGuide = srcPath.startsWith('guides/') && srcPath !== 'guides/index.html';
    const isManual = srcPath.startsWith('manual/') && srcPath !== 'manual/index.html';
    if (!isGuide && !isManual) return html;
    if (html.includes('"BreadcrumbList"')) return html; // already present (defensive)

    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    if (!titleMatch) return html;
    const leaf = stripSiteSuffix(titleMatch[1]);

    const sectionIndex = isManual ? 'manual/index.html' : 'guides/index.html';
    const sectionName = isManual ? MANUAL_CRUMB[lang] : GUIDES_CRUMB[lang];
    const homeUrl = SITE_ORIGIN + srcPathToUrlPath('index.html', lang);
    const sectionUrl = SITE_ORIGIN + srcPathToUrlPath(sectionIndex, lang);
    const selfUrl = SITE_ORIGIN + srcPathToUrlPath(srcPath, lang);

    const breadcrumb = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: HOME_CRUMB[lang], item: homeUrl },
            { '@type': 'ListItem', position: 2, name: sectionName, item: sectionUrl },
            { '@type': 'ListItem', position: 3, name: leaf, item: selfUrl },
        ],
    };
    const script = `<script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>`;

    // Insert right before </head> so it sits with the other structured data.
    if (html.includes('</head>')) return html.replace('</head>', `    ${script}\n</head>`);
    return html;
}

// --------------------------------------------------------------------
// Core: transform multi-lang source → single-lang output for new URL scheme
// --------------------------------------------------------------------

// Native language names for the on-page language switcher.
const LANG_NATIVE = { ja: '日本語', en: 'English', fr: 'Français', de: 'Deutsch', es: 'Español', it: 'Italiano', ko: '한국어', 'pt-BR': 'Português (Brasil)' };
const LANG_SHORT = { ja: 'JA', en: 'EN', fr: 'FR', de: 'DE', es: 'ES', it: 'IT', ko: 'KO', 'pt-BR': 'PT-BR' };

// Shared primary navigation. Source pages historically copied this markup,
// which let old and new menus drift apart. The build now replaces every page's
// desktop nav and mobile drawer from this single definition.
const NAV_COPY = {
    ja: { about: 'ソルフェージュPROとは？', training: 'トレーニング', guides: '練習ガイド', manual: 'マニュアル', menu: 'メニュー', close: 'メニューを閉じる', open: 'メニューを開く', language: '言語を選択', primary: 'メインメニュー' },
    en: { about: 'About Solfege PRO', training: 'Trainings', guides: 'Practice Guides', manual: 'Manual', menu: 'Menu', close: 'Close menu', open: 'Open menu', language: 'Select language', primary: 'Main menu' },
    fr: { about: 'Découvrir Solfege PRO', training: 'Entraînements', guides: 'Guides pratiques', manual: 'Manuel', menu: 'Menu', close: 'Fermer le menu', open: 'Ouvrir le menu', language: 'Choisir la langue', primary: 'Menu principal' },
    de: { about: 'Über Solfege PRO', training: 'Trainings', guides: 'Übungsleitfäden', manual: 'Handbuch', menu: 'Menü', close: 'Menü schließen', open: 'Menü öffnen', language: 'Sprache wählen', primary: 'Hauptmenü' },
    es: { about: 'Acerca de Solfege PRO', training: 'Entrenamientos', guides: 'Guías de práctica', manual: 'Manual', menu: 'Menú', close: 'Cerrar menú', open: 'Abrir menú', language: 'Seleccionar idioma', primary: 'Menú principal' },
    it: { about: 'Informazioni su Solfege PRO', training: 'Allenamenti', guides: 'Guide pratiche', manual: 'Manuale', menu: 'Menu', close: 'Chiudi menu', open: 'Apri menu', language: 'Seleziona lingua', primary: 'Menu principale' },
    ko: { about: 'Solfege PRO 소개', training: '훈련', guides: '연습 가이드', manual: '매뉴얼', menu: '메뉴', close: '메뉴 닫기', open: '메뉴 열기', language: '언어 선택', primary: '기본 메뉴' },
    'pt-BR': { about: 'Sobre o Solfege PRO', training: 'Treinos', guides: 'Guias de prática', manual: 'Manual', menu: 'Menu', close: 'Fechar menu', open: 'Abrir menu', language: 'Selecionar idioma', primary: 'Menu principal' },
};

function localizedNavUrl(basePath, lang) {
    const prefix = lang === 'ja' ? '' : `/${URL_LANG_PREFIX[lang]}`;
    if (basePath === '/') return `${prefix}/`;
    return `${prefix}${basePath}`;
}

function activeNavSection(srcPath) {
    if (srcPath === 'index.html') return 'about';
    if (srcPath === 'features.html' || srcPath === 'free-vs-pro.html' || srcPath === 'pricing.html') return 'training';
    if (srcPath === 'manual/index.html' || srcPath.startsWith('manual/')) return 'manual';
    if (srcPath === 'start-here.html' || srcPath === 'guides/index.html' || srcPath.startsWith('guides/') || srcPath === 'practice/index.html' || srcPath.startsWith('practice/')) return 'guides';
    return null;
}

function buildSharedNavigation(srcPath, lang) {
    const copy = NAV_COPY[lang];
    const active = activeNavSection(srcPath);
    const items = [
        { key: 'about', path: '/', label: copy.about },
        { key: 'training', path: '/features/', label: copy.training },
        { key: 'guides', path: '/guides/', label: copy.guides },
        { key: 'manual', path: '/manual/', label: copy.manual },
    ];
    const link = (item, className) => {
        const isActive = active === item.key;
        return `<a href="${localizedNavUrl(item.path, lang)}" class="${className}${isActive ? ' active' : ''}"${isActive ? ' aria-current="page"' : ''}>${item.label}</a>`;
    };
    const desktopItems = items.map((item) => `                <li>${link(item, 'nav__link')}</li>`).join('\n');
    const drawerItems = items.map((item) => `            <li>${link(item, 'drawer__link')}</li>`).join('\n');
    const homeUrl = localizedNavUrl('/', lang);
    const brand = lang === 'ja' ? 'ソルフェージュPRO' : 'Solfege PRO';
    const languageItems = langsForSource(srcPath).map((itemLang) => {
        const isCurrent = itemLang === lang;
        const currentClass = isCurrent ? ' is-active' : '';
        const currentAttrs = isCurrent ? ' aria-current="page" aria-checked="true"' : ' aria-checked="false"';
        return `                    <li role="none"><a class="lang-menu__item${currentClass}" href="${srcPathToUrlPath(srcPath, itemLang)}" hreflang="${itemLang}" lang="${itemLang}" data-lang="${itemLang}" role="menuitemradio"${currentAttrs}><span>${LANG_NATIVE[itemLang]}</span><span class="lang-menu__check" aria-hidden="true">✓</span></a></li>`;
    }).join('\n');
    const nav = `    <nav class="nav" aria-label="${copy.primary}">
        <div class="nav__container">
            <a href="${homeUrl}" class="nav__logo" aria-label="${brand}">
                <img src="/AppIcon.png" alt="" class="nav__logo-icon" width="32" height="32">
                <span class="nav__logo-text">${brand}</span>
            </a>
            <ul class="nav__list">
${desktopItems}
            </ul>
            <div class="nav__settings">
                <button class="settings-btn" id="lang-toggle" title="${copy.language}" aria-label="${copy.language}: ${LANG_NATIVE[lang]}" aria-haspopup="menu" aria-expanded="false" aria-controls="lang-menu" disabled>
                    <svg class="settings-btn__globe" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"></path></svg>
                    <span id="lang-text">${LANG_SHORT[lang]}</span>
                    <span class="settings-btn__chevron" aria-hidden="true">▾</span>
                </button>
                <ul class="lang-menu" id="lang-menu" role="menu" aria-label="${copy.language}">
${languageItems}
                </ul>
                <button class="hamburger-btn" id="hamburger-btn" aria-label="${copy.open}" aria-expanded="false" aria-controls="drawer">
                    <span class="hamburger-btn__line"></span><span class="hamburger-btn__line"></span><span class="hamburger-btn__line"></span>
                </button>
            </div>
        </div>
    </nav>`;
    const drawer = `    <div class="drawer-overlay" id="drawer-overlay"></div>
    <aside class="drawer" id="drawer" aria-label="${copy.menu}" aria-hidden="true" inert>
        <div class="drawer__header">
            <span class="drawer__title">${copy.menu}</span>
            <button class="drawer__close" id="drawer-close" aria-label="${copy.close}">×</button>
        </div>
        <ul class="drawer__list">
${drawerItems}
        </ul>
    </aside>`;
    return { nav, drawer };
}

function applySharedNavigation(html, srcPath, lang) {
    const shared = buildSharedNavigation(srcPath, lang);
    let out = html.replace(/<nav class="nav"(?:\s[^>]*)?>[\s\S]*?<\/nav>/, shared.nav);
    out = out.replace(/<div class="drawer-overlay" id="drawer-overlay"><\/div>\s*<aside class="drawer"[\s\S]*?<\/aside>/, shared.drawer);
    return out;
}

function buildHreflangBlock(srcPath, currentLang) {
    const url = (l) => SITE_ORIGIN + srcPathToUrlPath(srcPath, l);
    return [
        `    <link rel="canonical" href="${url(currentLang)}">`,
        ...langsForSource(srcPath).map((l) => `    <link rel="alternate" hreflang="${l}" href="${url(l)}">`),
        `    <link rel="alternate" hreflang="x-default" href="${url('ja')}">`,
    ].join('\n');
}

// Optional site-wide config (Search Console verification token, etc.).
// Reads data/site-config.json if present; absent/empty → no-op (safe default).
let _siteConfigCache;
function loadSiteConfig() {
    if (_siteConfigCache !== undefined) return _siteConfigCache;
    try { _siteConfigCache = JSON.parse(fs.readFileSync('data/site-config.json', 'utf8')); }
    catch (e) { _siteConfigCache = {}; }
    return _siteConfigCache;
}

// Inject the Google Search Console verification meta tag into <head> if a
// token is configured. Idempotent: never inserts twice.
function injectVerificationMeta(html) {
    const cfg = loadSiteConfig();
    const token = cfg.googleSiteVerification;
    if (!token || /name="google-site-verification"/.test(html)) return html;
    const tag = `    <meta name="google-site-verification" content="${token}">`;
    return html.replace(/(<meta name="theme-color"[^>]*>)/, `$1\n${tag}`);
}

function injectPageTranslations(html, srcPath, lang) {
    if (!ADDITIONAL_LANGS.includes(lang)) return html;
    const translationPath = PAGE_TRANSLATION_PATHS[lang];
    const page = loadPageTranslations(lang)[srcPath];
    if (!page || !Array.isArray(page.spans)) {
        throw new Error(`${translationPath}: missing pages.${srcPath}.spans`);
    }

    let index = 0;
    let cursor = 0;
    let out = '';
    const startRe = /<span\s+lang="en">/g;
    const openRe = /<span\b[^>]*>/g;
    const closeRe = /<\/span>/g;

    while (true) {
        startRe.lastIndex = cursor;
        const start = startRe.exec(html);
        if (!start) break;
        out += html.slice(cursor, start.index);

        let depth = 1;
        let scan = start.index + start[0].length;
        let blockEnd = -1;
        while (depth > 0) {
            openRe.lastIndex = scan;
            closeRe.lastIndex = scan;
            const open = openRe.exec(html);
            const close = closeRe.exec(html);
            if (!close) throw new Error(`Unbalanced English span in ${srcPath}`);
            if (open && open.index < close.index) {
                depth += 1;
                scan = open.index + open[0].length;
            } else {
                depth -= 1;
                blockEnd = close.index + close[0].length;
                scan = blockEnd;
            }
        }

        const originalBlock = html.slice(start.index, blockEnd);
        const translated = page.spans[index++];
        if (translated === undefined) {
            throw new Error(`${translationPath}: too few span translations for ${srcPath}`);
        }
        out += `${originalBlock}<span lang="${lang}">${translated}</span>`;
        cursor = blockEnd;
    }
    out += html.slice(cursor);

    if (index !== page.spans.length) {
        throw new Error(`${translationPath}: ${srcPath} has ${page.spans.length} translations for ${index} English spans`);
    }

    const mermaidTranslations = page.mermaid || [];
    let mermaidIndex = 0;
    out = out.replace(/<div\s+class="mermaid-lang"\s+lang="en">[\s\S]*?<\/div>/g, (englishBlock) => {
        let localizedBlock = englishBlock.replace('lang="en"', `lang="${lang}"`);
        // The extraction source intentionally starts at the contents of the
        // container, so it includes <pre class="mermaid"> but excludes the
        // outer class/lang attributes. Consume that class token to stay aligned
        // with translation-source.json, while preserving the CSS/JS hook.
        const innerStart = localizedBlock.indexOf('>') + 1;
        const innerEnd = localizedBlock.lastIndexOf('</div>');
        const inner = localizedBlock.slice(innerStart, innerEnd).replace(/"([^"]+)"/g, (quoted, originalLabel) => {
            const translated = mermaidTranslations[mermaidIndex++];
            if (translated === undefined) {
                throw new Error(`${translationPath}: too few Mermaid translations for ${srcPath}`);
            }
            if (originalLabel === 'mermaid') return quoted;
            return `"${translated.replace(/"/g, '&quot;')}"`;
        });
        localizedBlock = localizedBlock.slice(0, innerStart) + inner + localizedBlock.slice(innerEnd);
        return `${englishBlock}${localizedBlock}`;
    });
    if (mermaidIndex !== mermaidTranslations.length) {
        throw new Error(`${translationPath}: ${srcPath} has ${mermaidTranslations.length} Mermaid translations for ${mermaidIndex} labels`);
    }

    const scriptTranslations = page.script || [];
    const propertySuffix = { es: 'Es', it: 'It', ko: 'Ko', 'pt-BR': 'PtBr' }[lang];
    let scriptIndex = 0;
    const localizedValueRe = /\b(en|guideEn|descEn)\s*:\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)/g;
    out = out.replace(localizedValueRe, (englishProperty, propertyName) => {
        const translated = scriptTranslations[scriptIndex++];
        if (translated === undefined) {
            throw new Error(`${translationPath}: too few script translations for ${srcPath}`);
        }
        const localizedProperty = propertyName === 'en'
            ? JSON.stringify(lang)
            : `${propertyName.slice(0, -2)}${propertySuffix}`;
        return `${englishProperty}, ${localizedProperty}: ${JSON.stringify(translated)}`;
    });
    if (scriptIndex !== scriptTranslations.length) {
        throw new Error(`${translationPath}: ${srcPath} has ${scriptTranslations.length} script translations for ${scriptIndex} strings`);
    }
    return out;
}

let _accessibilityTranslationsCache;
function loadAccessibilityTranslations() {
    if (_accessibilityTranslationsCache) return _accessibilityTranslationsCache;
    _accessibilityTranslationsCache = JSON.parse(fs.readFileSync(ACCESSIBILITY_TRANSLATIONS_PATH, 'utf8'));
    return _accessibilityTranslationsCache;
}

function localizeAccessibilityAttributes(html, lang) {
    if (!ADDITIONAL_LANGS.includes(lang)) return html;
    const translations = loadAccessibilityTranslations()[lang] || {};
    let out = html;
    for (const [source, localized] of Object.entries(translations)) {
        for (const attribute of ['alt', 'title', 'aria-label']) {
            const originalAttribute = `${attribute}="${source}"`;
            const localizedAttribute = `${attribute}="${escapeHtml(localized)}"`;
            out = out.split(originalAttribute).join(localizedAttribute);
        }
    }
    return out;
}

function applyOfficialAppStoreBadges(html, lang) {
    const locale = APP_STORE_BADGE_LOCALE[lang];
    const alt = escapeHtml(APP_STORE_BADGE_ALT[lang]);
    const src = `https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/${locale}`;
    return html.replace(
        /<a\b([^>]*\bhref="https:\/\/apps\.apple\.com\/[^"]+"[^>]*)>([\s\S]*?)<\/a>/g,
        (match, attrs, body) => {
            let nextAttrs = attrs;
            if (/\baria-label="[^"]*"/.test(nextAttrs)) {
                nextAttrs = nextAttrs.replace(/\baria-label="[^"]*"/, `aria-label="${alt}"`);
            } else {
                nextAttrs += ` aria-label="${alt}"`;
            }
            if (/<img\b/i.test(body)) {
                const localizedBody = body
                    .replace(/https:\/\/tools\.applemediaservices\.com\/api\/badges\/download-on-the-app-store\/black\/[a-z]{2}(?:-[a-z]{2})?/g, src)
                    .replace(/(<img\b[^>]*\balt=")[^"]*(")/i, `$1${alt}$2`);
                return `<a${nextAttrs}>${localizedBody}</a>`;
            }
            if (/\bclass="[^"]*"/.test(nextAttrs)) {
                nextAttrs = nextAttrs.replace(/\bclass="([^"]*)"/, (m, classes) => `class="${classes} app-store-link"`);
            } else {
                nextAttrs += ' class="app-store-link"';
            }
            return `<a${nextAttrs}><img src="${src}" class="app-store-link__img" alt="${alt}" loading="lazy"></a>`;
        },
    );
}

function transformToLang(html, srcPath, lang) {
    let out = html;

    // 1. <html lang="ja" ...> → <html lang="X" ...>
    out = out.replace(/<html\s+lang="ja"/, `<html lang="${lang}"`);

    // 2. <title> ← data-title-<lang>
    const titleMatch = out.match(new RegExp(`data-title-${lang}="([^"]*)"`));
    if (titleMatch) {
        out = out.replace(/<title>[^<]*<\/title>/, `<title>${titleMatch[1]}</title>`);
    }

    // 3. Replace the canonical + hreflang block with the new directory URLs.
    const newBlock = buildHreflangBlock(srcPath, lang);
    // Match canonical line + any contiguous hreflang lines that follow.
    const canonHrefRe = /[ \t]*<link rel="canonical"[^>]+>[\s\n]*(?:[ \t]*<link rel="alternate" hreflang="[^"]+"[^>]+>[\s\n]*)+/;
    if (canonHrefRe.test(out)) {
        out = out.replace(canonHrefRe, newBlock + '\n');
    }

    // 4. og:url → new URL
    const currentUrl = SITE_ORIGIN + srcPathToUrlPath(srcPath, lang);
    out = out.replace(/<meta property="og:url" content="[^"]+">/, `<meta property="og:url" content="${currentUrl}">`);

    // 5. og:locale
    out = out.replace(/<meta property="og:locale" content="ja_JP">/, `<meta property="og:locale" content="${OG_LOCALE[lang]}">`);

    // 5b. og:site_name — romanize the brand for non-ja outputs.
    out = out.replace(/<meta property="og:site_name" content="[^"]*">/, `<meta property="og:site_name" content="${lang === 'ja' ? 'ソルフェージュPRO' : 'Solfege PRO'}">`);

    // 5c. Search Console verification meta (no-op unless a token is configured).
    out = injectVerificationMeta(out);

    // 6. og:locale:alternate block — rebuild with every other locale.
    const alternates = langsForSource(srcPath).filter((l) => l !== lang)
        .map((l) => `    <meta property="og:locale:alternate" content="${OG_LOCALE[l]}">`)
        .join('\n');
    out = out.replace(
        /(?:[ \t]*<meta property="og:locale:alternate" content="[a-zA-Z_]+">[ \t]*\r?\n)+/,
        alternates + '\n',
    );

    // 7. og:title / twitter:title — strip the " | Solfege PRO" suffix
    if (titleMatch) {
        const bare = stripSiteSuffix(titleMatch[1]).replace(/"/g, '&quot;');
        out = out.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${bare}">`);
        out = out.replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${bare}">`);
    }

    // 8. App Store URL locale
    out = out.replace(/apps\.apple\.com\/jp\//g, `apps.apple.com/${APP_STORE_LOCALE[lang]}/`);

    // 8b. Source files may use ../ for direct file:// previews. Published
    // output always uses root-relative URLs so every language depth resolves
    // the shared assets consistently.
    out = out.replace(
        /(href|src)="\.\.\/(favicon\.ico|favicon-96x96\.png|apple-touch-icon\.png|style\.css|guides\/article\.css|AppIcon\.png|bootstrap\.js)([^\"]*)"/g,
        '$1="/$2$3"',
    );

    // 9. Strip non-target <span lang="Y">...</span> blocks, unwrap target.
    //    CRITICAL: must handle NESTED <span> (e.g. <span lang="en">text
    //    <span class="highlight">...</span> more text</span>). A lazy
    //    regex `[\s\S]*?</span>` would stop at the FIRST </span> (the
    //    highlight one) and leak the trailing content into every other
    //    language variant. Use a depth-tracking parser instead.
    out = stripOrUnwrapLangSpans(out, lang);

    // 10. Strip non-target <div class="mermaid-lang" lang="Y">...</div>
    //     blocks. These contain Mermaid source for each language; without
    //     stripping, the JA page's HTML includes the EN/FR/DE mermaid
    //     definitions as visible text (CSS hides them at render time but
    //     crawlers still see them).
    out = stripOtherLangMermaid(out, lang);

    // 11. Localize the Article JSON-LD (headline/description/publisher) and
    //     repair mainEntityOfPage.@id to this language's canonical dir URL.
    out = localizeJsonLd(out, srcPath, lang);

    // 12. Inject BreadcrumbList JSON-LD on guide article pages (Home > Guides >
    //     article). No-op for non-guide / index pages.
    out = injectBreadcrumbJsonLd(out, srcPath, lang);

    // 12b. Replace copied legacy headers with the site-wide current menu.
    out = applySharedNavigation(out, srcPath, lang);

    // 12c. Translate user-facing values embedded in otherwise immutable tags
    //      (primarily product-screenshot alt text).
    out = localizeAccessibilityAttributes(out, lang);

    // 12d. Every App Store destination uses Apple's official, localized badge.
    out = applyOfficialAppStoreBadges(out, lang);

    // Removing a non-target language can leave indentation-only lines behind.
    // Keep generated HTML free of trailing whitespace so release diffs and
    // pre-commit checks remain deterministic.
    out = out.replace(/^[ \t]+$/gm, '');

    return out;
}

/**
 * Walk `html` and process every <span lang="X">...balanced spans...</span>
 * block: drop the whole block if X != targetLang, otherwise unwrap (replace
 * with inner content).
 *
 * Depth tracking handles arbitrary nested <span> tags inside the lang span.
 */
function stripOrUnwrapLangSpans(html, targetLang) {
    const langSpanRe = /<span\s+lang="(ja|en|fr|de|es|it|ko|pt-BR)">/g;
    const openSpanRe = /<span\b[^>]*>/g;
    const closeSpanRe = /<\/span>/g;
    let result = '';
    let cursor = 0;

    while (true) {
        langSpanRe.lastIndex = cursor;
        const m = langSpanRe.exec(html);
        if (!m) {
            result += html.slice(cursor);
            break;
        }
        // Append everything before this lang-span tag.
        result += html.slice(cursor, m.index);
        const spanLang = m[1];
        const innerStart = m.index + m[0].length;

        // Find matching </span> at depth 0, starting with depth = 1 (we
        // just opened the lang-span itself).
        let depth = 1;
        let scan = innerStart;
        let innerEnd = -1, blockEnd = -1;
        while (depth > 0) {
            openSpanRe.lastIndex = scan;
            closeSpanRe.lastIndex = scan;
            const next_open = openSpanRe.exec(html);
            const next_close = closeSpanRe.exec(html);
            if (!next_close) {
                // Unbalanced — bail out, leave the rest as-is.
                throw new Error(`Unbalanced <span lang="${spanLang}"> in source — no matching </span>`);
            }
            if (next_open && next_open.index < next_close.index) {
                // Encountered a nested <span...>, deepen.
                depth++;
                scan = next_open.index + next_open[0].length;
            } else {
                // Encountered a </span>, pop one level.
                depth--;
                if (depth === 0) {
                    innerEnd = next_close.index;
                    blockEnd = next_close.index + next_close[0].length;
                } else {
                    scan = next_close.index + next_close[0].length;
                }
            }
        }

        const inner = html.slice(innerStart, innerEnd);
        if (spanLang === targetLang) {
            // Unwrap.
            result += inner;
        }
        // else: drop the entire block.

        cursor = blockEnd;
        langSpanRe.lastIndex = cursor;
    }
    return result;
}

/**
 * Drop every <div class="mermaid-lang" lang="Y">...</div> whose Y is not
 * targetLang. Uses depth-tracking on <div> tags to handle the nested
 * <pre class="mermaid"> inside (Mermaid source itself contains no <div>,
 * but pre tags and others may be present in the future).
 */
function stripOtherLangMermaid(html, targetLang) {
    const containerRe = /<div\s+class="mermaid-lang"\s+lang="(ja|en|fr|de|es|it|ko|pt-BR)">/g;
    const openDivRe = /<div\b[^>]*>/g;
    const closeDivRe = /<\/div>/g;
    let result = '';
    let cursor = 0;

    while (true) {
        containerRe.lastIndex = cursor;
        const m = containerRe.exec(html);
        if (!m) {
            result += html.slice(cursor);
            break;
        }
        const blockLang = m[1];
        const innerStart = m.index + m[0].length;

        let depth = 1;
        let scan = innerStart;
        let blockEnd = -1;
        while (depth > 0) {
            openDivRe.lastIndex = scan;
            closeDivRe.lastIndex = scan;
            const next_open = openDivRe.exec(html);
            const next_close = closeDivRe.exec(html);
            if (!next_close) {
                throw new Error(`Unbalanced <div class="mermaid-lang" lang="${blockLang}"> — no matching </div>`);
            }
            if (next_open && next_open.index < next_close.index) {
                depth++;
                scan = next_open.index + next_open[0].length;
            } else {
                depth--;
                if (depth === 0) {
                    blockEnd = next_close.index + next_close[0].length;
                } else {
                    scan = next_close.index + next_close[0].length;
                }
            }
        }

        if (blockLang === targetLang) {
            result += html.slice(cursor, blockEnd);
        } else {
            result += html.slice(cursor, m.index);
        }
        cursor = blockEnd;
    }
    return result;
}

// --------------------------------------------------------------------
// Old URL → new URL redirect stub generation
// --------------------------------------------------------------------

/**
 * Map an OLD URL path (e.g. 'guides/foo.html' or 'guides/foo.en.html')
 * to its NEW URL path (e.g. '/guides/foo/' or '/en/guides/foo/').
 *
 * Returns null if the path doesn't fit the OLD scheme.
 */
function oldPathToNewUrlPath(oldRelPath) {
    // Handle the suffix forms first.
    let m = oldRelPath.match(/^(.+?)\.(en|fr|de|es|it|ko|pt-br)\.html$/);
    if (m) {
        const base = m[1];           // e.g. 'guides/foo' or 'index'
        const lang = m[2] === 'pt-br' ? 'pt-BR' : m[2];
        const srcPath = base === 'index' ? 'index.html' : `${base}.html`;
        // index files (foo/index.html) → already handled correctly because base wouldn't end with /index
        if (base.endsWith('/index')) {
            return srcPathToUrlPath(base + '.html', lang);
        }
        return srcPathToUrlPath(srcPath, lang);
    }
    // Bare .html — ja version.
    if (oldRelPath.endsWith('.html') && oldRelPath !== '404.html') {
        return srcPathToUrlPath(oldRelPath, 'ja');
    }
    return null;
}

function buildRedirectStub(newUrlPath) {
    const fullUrl = SITE_ORIGIN + newUrlPath;
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="robots" content="noindex, follow">
    <meta http-equiv="refresh" content="0; url=${fullUrl}">
    <link rel="canonical" href="${fullUrl}">
    <title>Redirecting…</title>
</head>
<body>
    <p>This page has moved to <a href="${fullUrl}">${fullUrl}</a>.</p>
    <script>window.location.replace(${JSON.stringify(fullUrl)});</script>
</body>
</html>
`;
}

/**
 * For every source file, write redirect stubs at the OLD URL paths that
 * Google may have indexed (the .X.html scheme used before this refactor):
 *
 *   src/guides/foo.html →
 *     guides/foo.html       (ja stub → /guides/foo/)
 *     guides/foo.en.html    (en stub → /en/guides/foo/)
 *     guides/foo.fr.html    (fr stub → /fr/guides/foo/)
 *     guides/foo.de.html    (de stub → /de/guides/foo/)
 *
 * Skip writing a stub when the OLD path collides with a NEW output path
 * (e.g. index.html and guides/index.html stay as real content for both
 * the new and old URL — they were already at the same path).
 *
 * Idempotent.
 */
function generateRedirectStubs(allSources) {
    // The set of NEW output paths — collision check.
    const newOutputs = new Set();
    for (const src of allSources) {
        for (const lang of KNOWN_LANGS) {
            newOutputs.add(srcPathToOutputPath(src, lang));
        }
    }

    let stubCount = 0;
    for (const src of allSources) {
        // ja old path = the source-relative path itself (e.g. 'guides/foo.html')
        // All non-Japanese old paths use the '.X.html' suffix form.
        const base = src.replace(/\.html$/, '');
        const oldPaths = Object.fromEntries(KNOWN_LANGS.map((lang) => [
            lang,
            lang === 'ja' ? src : `${base}.${URL_LANG_PREFIX[lang]}.html`,
        ]));
        for (const lang of KNOWN_LANGS) {
            const oldRel = oldPaths[lang];
            if (newOutputs.has(oldRel)) continue;  // index.html collision, skip
            const newUrl = srcPathToUrlPath(src, lang);
            ensureDir(oldRel);
            fs.writeFileSync(oldRel, buildRedirectStub(newUrl), 'utf8');
            stubCount++;
        }
    }
    if (stubCount > 0) console.log(`[redirects] wrote ${stubCount} stub(s) at old URL paths`);
}

// `/app/` was the temporary LP location. The canonical product page is now
// the localized site root. GitHub Pages cannot emit server-side 301s, so use
// the strongest static-host-compatible redirect signals: noindex, canonical,
// meta refresh, and location.replace. Keep both directory and legacy .html
// forms working.
function generateAppToRootRedirects() {
    let count = 0;
    for (const lang of KNOWN_LANGS) {
        const target = srcPathToUrlPath('index.html', lang);
        const prefix = URL_LANG_PREFIX[lang];
        const directoryOutput = lang === 'ja' ? 'app/index.html' : `${prefix}/app/index.html`;
        const legacyOutput = lang === 'ja' ? 'app.html' : `app.${prefix}.html`;
        for (const output of [directoryOutput, legacyOutput]) {
            ensureDir(output);
            fs.writeFileSync(output, buildRedirectStub(target), 'utf8');
            count++;
        }
    }
    console.log(`[redirects] wrote ${count} app-to-root redirect(s)`);
}

// --------------------------------------------------------------------
// Per-source processing
// --------------------------------------------------------------------

/**
 * Expand `<!-- include: _partials/NAME.html -->` directives by inlining the
 * raw contents of src/<directive path>. Runs BEFORE any per-language transform
 * (span-stripping), so a partial's own four-lang spans are stripped to the
 * target language exactly like inline page content. Missing includes fail
 * loudly (throw with the path) rather than silently leaving the directive.
 */
function expandIncludes(html) {
    const includeRe = /<!--\s*include:\s*([^\s][^>]*?\.html)\s*-->/g;
    return html.replace(includeRe, (m, includePath) => {
        const partialFsPath = path.join(SRC_DIR, includePath.trim());
        if (!fs.existsSync(partialFsPath)) {
            throw new Error(`include directive references missing partial: ${partialFsPath}`);
        }
        return fs.readFileSync(partialFsPath, 'utf8');
    });
}

// --------------------------------------------------------------------
// App Store link tagging (campaign attribution)
// --------------------------------------------------------------------

/**
 * Derive the Apple campaign token (ct) from an OUTPUT file path
 * (repo-root-relative, e.g. 'en/guides/foo/index.html'). The language
 * prefix is irrelevant to the section, so strip it first.
 */
function appStoreCtForOutput(outPath) {
    const p = outPath.replace(/^(en|fr|de|es|it|ko|pt-br)\//, '');
    if (p.startsWith('start-here/')) return 'web_start';
    if (p.startsWith('guides/')) return 'web_guides';
    if (p.startsWith('manual/')) return 'web_manual';
    if (p.startsWith('practice/')) return 'web_practice';
    if (p.startsWith('support/') || p.startsWith('privacy/') || p.startsWith('terms/')) return 'web_support';
    return 'web_home'; // root index pages (and 404-class pages)
}

const appStoreTagStats = { tagged: 0, skipped: 0 };

/**
 * Append ?pt=<provider>&ct=<section>&mt=8 to every App Store href
 * (any storefront) in an output HTML string. Only touches href
 * attributes — JSON-LD `sameAs` etc. stay canonical/param-free. A link
 * that already carries query params (unexpected: sources are param-free)
 * is left unchanged with a warning.
 */
function tagAppStoreLinks(html, outPath) {
    const ct = appStoreCtForOutput(outPath);
    const params = `?pt=${APP_STORE_PT}&amp;ct=${ct}&amp;mt=${APP_STORE_MT}`;
    return html.replace(
        /href="(https:\/\/apps\.apple\.com\/[a-z]{2}\/app\/[^"]*)"/g,
        (m, url) => {
            if (url.includes('?')) {
                console.warn(`[appstore] WARN: link already has query params, left unchanged in ${outPath}: ${url}`);
                appStoreTagStats.skipped++;
                return m;
            }
            appStoreTagStats.tagged++;
            return `href="${url}${params}"`;
        },
    );
}

function processSource(srcRelPath) {
    const srcFsPath = path.join(SRC_DIR, srcRelPath);
    let raw = fs.readFileSync(srcFsPath, 'utf8');

    // Apply page metadata to source itself so the source <title> reflects
    // current JSON values (for consistency when editing the source by hand).
    const jaUpdated = applyPageMetadata(raw, srcRelPath, 'ja');
    if (jaUpdated !== raw) {
        raw = jaUpdated;
        fs.writeFileSync(srcFsPath, raw, 'utf8');
    }

    // Inline shared partials BEFORE any per-language transform runs (and after
    // the source write-back above, so the directive stays in the source file),
    // so a partial's four-lang spans get stripped to the target language like
    // inline page content.
    raw = expandIncludes(raw);

    // Every public page ships in all eight supported app languages.
    for (const lang of langsForSource(srcRelPath)) {
        const outPath = srcPathToOutputPath(srcRelPath, lang);
        const localizedRaw = injectPageTranslations(raw, srcRelPath, lang);
        let out = transformToLang(localizedRaw, srcRelPath, lang);
        out = applyPageMetadata(out, srcRelPath, lang);
        out = tagAppStoreLinks(out, outPath);
        ensureDir(outPath);
        fs.writeFileSync(outPath, out, 'utf8');
    }
}

// --------------------------------------------------------------------
// Sitemap generation (new URL format)
// --------------------------------------------------------------------

function loadExistingSitemapMeta() {
    const meta = {};
    if (!fs.existsSync('sitemap.xml')) return meta;
    const xml = fs.readFileSync('sitemap.xml', 'utf8');
    const urlRe = /<url>([\s\S]*?)<\/url>/g;
    let m;
    while ((m = urlRe.exec(xml)) !== null) {
        const block = m[1];
        const loc = (block.match(/<loc>([^<]+)<\/loc>/) || [])[1];
        if (!loc) continue;
        const lastmod = (block.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1];
        const priority = (block.match(/<priority>([^<]+)<\/priority>/) || [])[1];
        meta[loc] = { lastmod, priority };
    }
    return meta;
}

// Per-page sitemap <lastmod>: derive from the source file's last git commit
// date — deterministic and checkout-stable. mtime is NOT usable: a fresh clone
// / CI checkout resets every file's mtime to the checkout instant, collapsing
// all <lastmod> to the build day (and re-stamping every URL on every CI build,
// which Google reads as low-signal noise). A source with uncommitted changes
// (being published in this build) gets today's date; a clean source gets its
// last commit date. All eight language variants share one source date by design.
function sourceLastmod(src) {
    const today = new Date().toISOString().slice(0, 10);
    const rel = path.join(SRC_DIR, src);
    try {
        const dirty = execSync(`git status --porcelain -- "${rel}"`, { encoding: 'utf8' }).trim();
        if (dirty) return today;
        const committed = execSync(`git log -1 --format=%cs -- "${rel}"`, { encoding: 'utf8' }).trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(committed) ? committed : today;
    } catch (e) {
        return today;
    }
}

function generateSitemap(allSources) {
    const meta = loadExistingSitemapMeta();
    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ];
    for (const src of allSources) {
        const jaUrl = SITE_ORIGIN + srcPathToUrlPath(src, 'ja');
        const existing = meta[jaUrl] || {};
        const lastmod = sourceLastmod(src);
        const priority = existing.priority || '0.7';
        for (const lang of langsForSource(src)) {
            const url = SITE_ORIGIN + srcPathToUrlPath(src, lang);
            lines.push('  <url>');
            lines.push(`    <loc>${url}</loc>`);
            lines.push(`    <lastmod>${lastmod}</lastmod>`);
            lines.push(`    <priority>${priority}</priority>`);
            for (const altLang of langsForSource(src)) {
                const altUrl = SITE_ORIGIN + srcPathToUrlPath(src, altLang);
                lines.push(`    <xhtml:link rel="alternate" hreflang="${altLang}" href="${altUrl}"/>`);
            }
            lines.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${jaUrl}"/>`);
            lines.push('  </url>');
        }
    }
    lines.push('</urlset>');
    return lines.join('\n') + '\n';
}

// --------------------------------------------------------------------
// Main
// --------------------------------------------------------------------

function main() {
    process.chdir(path.resolve(__dirname, '..'));

    const argv = process.argv.slice(2);
    const onlySitemap = argv.includes('--sitemap-only');
    const filtered = argv.filter((a) => !a.startsWith('--'));
    const allSources = listSources();

    // When called with explicit args (pre-commit hook with staged file names),
    // accept either src/foo.html or foo.html and normalize to src-relative.
    let sources;
    if (filtered.length > 0) {
        sources = filtered.map((a) => a.startsWith('src/') ? a.slice(4) : a).filter((s) => allSources.includes(s));
    } else {
        sources = allSources;
    }

    if (!onlySitemap) {
        // 1a. Price string sync (operates on src/ files only).
        try {
            const currentPrices = loadPrices();
            const srcFsPaths = allSources.map((s) => path.join(SRC_DIR, s));
            syncPriceStringsToSources(srcFsPaths, currentPrices);
        } catch (e) {
            console.error(`[prices] ERROR: ${e.message}`);
        }

        // 1b. Training-name normalisation (also src/).
        try {
            const srcFsPaths = allSources.map((s) => path.join(SRC_DIR, s));
            syncTrainingNamesInSources(srcFsPaths);
        } catch (e) {
            console.error(`[training-names] ERROR: ${e.message}`);
        }

        // 2. Build the new directory structure.
        const outputCount = sources.reduce((sum, src) => sum + langsForSource(src).length, 0);
        console.log(`Building ${sources.length} source(s) = ${outputCount} localized outputs.`);
        for (const src of sources) processSource(src);
        console.log(`[appstore] tagged ${appStoreTagStats.tagged} link(s) with pt/ct/mt`
            + (appStoreTagStats.skipped ? ` (${appStoreTagStats.skipped} left unchanged — pre-existing query params)` : ''));

        // 3. Wallpaper old URL paths with redirect stubs (idempotent).
        generateRedirectStubs(allSources);
        generateAppToRootRedirects();
    }

    // 4. Sitemap.
    const sitemap = generateSitemap(allSources);
    fs.writeFileSync('sitemap.xml', sitemap, 'utf8');
    const sitemapUrlCount = allSources.reduce((sum, src) => sum + langsForSource(src).length, 0);
    console.log(`Wrote sitemap.xml (${sitemapUrlCount} URLs).`);

    console.log('Done.');
}

main();
