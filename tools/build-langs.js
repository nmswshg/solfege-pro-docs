#!/usr/bin/env node
/**
 * Generate single-language HTML variants from multi-language source files.
 *
 * For each source `foo.html` (multi-lang, containing <span lang="ja|en|fr|de">
 * blocks), writes three new files alongside it:
 *
 *   foo.en.html   — only English content, <html lang="en">, English title, etc.
 *   foo.fr.html   — French
 *   foo.de.html   — German
 *
 * The source `foo.html` is left as-is and serves as the Japanese URL
 * (project policy: 日本語だけ従来通り — ja URL stays at its current path).
 *
 * Side effect: source file's hreflang block is migrated from `?lang=X` query
 * format to `.X.html` suffix format once (idempotent on subsequent runs).
 *
 * Usage:
 *   node tools/build-langs.js          # build all sources
 *   node tools/build-langs.js path1 ..  # build only the named source files
 *
 * Re-running is safe: variant files are overwritten each time, source
 * hreflang migration is idempotent.
 */

const fs = require('fs');
const path = require('path');

const LANGS = ['en', 'fr', 'de'];
const OG_LOCALE = { ja: 'ja_JP', en: 'en_US', fr: 'fr_FR', de: 'de_DE' };
// App Store storefront locales — must match the URL's user lang so the
// pricing the reviewer lands on is in their currency, not whatever
// Apple's geo-redirect happens to pick.
const APP_STORE_LOCALE = { ja: 'jp', en: 'us', fr: 'fr', de: 'de' };

// -----------------------------------------------------------------
// Price string synchronisation.
//
// data/prices.json is the user-edited source of truth for subscription
// pricing per locale (4 langs × { price, trial }).
// data/prices.fallback.json is the immutable last-resort safety net.
// data/prices.previous.json is build-managed: it records what literal
// strings are currently substituted into source HTML, so the build can
// do find/replace when prices.json changes.
//
// On each build:
//   1. Load prices.json (or fall back to prices.fallback.json).
//   2. Sanity-check (non-empty strings per lang).
//   3. Diff against prices.previous.json. For each changed field,
//      literal-replace the old value with the new value in EVERY source
//      HTML file. Source then has current values; variants get them
//      automatically because they're regenerated from source.
//   4. Save prices.previous.json = prices.json.
//
// Security note: nothing in this pipeline contacts external services or
// reads secrets. Future automation (App Store Connect API) would write
// prices.json BEFORE invoking this build — secrets stay in CI env.
// -----------------------------------------------------------------

const PRICES_PATH    = 'data/prices.json';
const PRICES_FALLBACK = 'data/prices.fallback.json';
const PRICES_PREV    = 'data/prices.previous.json';

function loadPrices() {
    // Try the authoritative file first.
    try {
        const raw = JSON.parse(fs.readFileSync(PRICES_PATH, 'utf8'));
        sanityCheckPrices(raw, PRICES_PATH);
        return raw;
    } catch (e) {
        console.warn(`[prices] WARNING: ${PRICES_PATH} unusable (${e.message}). Using fallback.`);
    }
    // Last-resort fallback (hardcoded original values).
    const raw = JSON.parse(fs.readFileSync(PRICES_FALLBACK, 'utf8'));
    sanityCheckPrices(raw, PRICES_FALLBACK);
    return raw;
}

function sanityCheckPrices(data, source) {
    for (const lang of ['ja', 'en', 'fr', 'de']) {
        const entry = data[lang];
        if (!entry || typeof entry.price !== 'string' || !entry.price.trim()) {
            throw new Error(`${source}: missing/empty ${lang}.price`);
        }
        if (typeof entry.trial !== 'string' || !entry.trial.trim()) {
            throw new Error(`${source}: missing/empty ${lang}.trial`);
        }
        // Bounds-ish check: reject suspiciously long strings (> 80 chars)
        // — guards against API returning HTML / error payload.
        if (entry.price.length > 80 || entry.trial.length > 80) {
            throw new Error(`${source}: ${lang} field suspiciously long`);
        }
    }
    return data;
}

function loadPrev() {
    try {
        return JSON.parse(fs.readFileSync(PRICES_PREV, 'utf8'));
    } catch (e) {
        // First run with no previous snapshot — treat as identical so we
        // don't accidentally find/replace anything.
        console.warn(`[prices] no previous snapshot; skipping find/replace this run`);
        return null;
    }
}

/**
 * Update price/trial strings in every source HTML by literal find/replace
 * from the previous snapshot to the current values. Returns the list of
 * source files that were modified.
 */
function syncPriceStringsToSources(allSources, currentPrices) {
    const prev = loadPrev();
    if (!prev) {
        // First run — write snapshot but don't replace anything in HTML.
        writeSnapshot(currentPrices);
        return [];
    }

    const replacements = [];
    for (const lang of ['ja', 'en', 'fr', 'de']) {
        const fromPrice = prev[lang]?.price;
        const toPrice   = currentPrices[lang].price;
        const fromTrial = prev[lang]?.trial;
        const toTrial   = currentPrices[lang].trial;
        if (fromPrice && fromPrice !== toPrice) {
            replacements.push({ from: fromPrice, to: toPrice, lang, kind: 'price' });
        }
        if (fromTrial && fromTrial !== toTrial) {
            replacements.push({ from: fromTrial, to: toTrial, lang, kind: 'trial' });
        }
    }

    if (replacements.length === 0) {
        // No price change; nothing to do.
        return [];
    }

    console.log(`[prices] ${replacements.length} field(s) changed; updating source HTML:`);
    for (const r of replacements) {
        console.log(`  ${r.lang}.${r.kind}: "${r.from}" → "${r.to}"`);
    }

    const modified = [];
    for (const src of allSources) {
        const raw = fs.readFileSync(src, 'utf8');
        let out = raw;
        for (const r of replacements) {
            // Literal replace (split/join — safe with any special characters).
            out = out.split(r.from).join(r.to);
        }
        if (out !== raw) {
            fs.writeFileSync(src, out, 'utf8');
            modified.push(src);
        }
    }
    console.log(`[prices] rewrote ${modified.length} source file(s).`);

    writeSnapshot(currentPrices);
    return modified;
}

function writeSnapshot(currentPrices) {
    // Preserve the _comment_ field if present.
    const out = {
        _comment_: 'Build-managed snapshot of what\'s currently substituted into source HTML. Updated automatically by tools/build-langs.js after each successful build. Compares against prices.json to know what literal strings to find/replace in source HTML when prices change. DO NOT edit by hand.',
        ja: currentPrices.ja,
        en: currentPrices.en,
        fr: currentPrices.fr,
        de: currentPrices.de,
    };
    fs.writeFileSync(PRICES_PREV, JSON.stringify(out, null, 2) + '\n', 'utf8');
}

// -----------------------------------------------------------------
// Training-name normalisation.
//
// data/training-names.json holds the canonical training/feature/setting
// names sourced from the actual app's Localizable.strings, plus the list
// of legacy aliases that should normalise to canonical. The build walks
// every <span lang="X">...</span> in source HTML and replaces any alias
// with canonical[X], so a JA span no longer contains "Interval Training"
// (it becomes "インターバル認識"), and EN/FR/DE spans converge on the
// single canonical form per language.
//
// Algorithm:
//   1. Load training-names.json (fallback to training-names.fallback.json).
//   2. Build a flat alias list, sorted by length DESC, so longer aliases
//      match first ("Interval Training" before "Interval").
//   3. For each source HTML, regex-find every <span lang="X">...</span>,
//      and within the body, word-boundary find/replace each alias with
//      canonical[X] for that lang.
//   4. Idempotent — running again after normalisation is a no-op.
// -----------------------------------------------------------------

const TRAINING_PATH     = 'data/training-names.json';
const TRAINING_FALLBACK = 'data/training-names.fallback.json';

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
        if (!entry.canonical || !entry.aliases) {
            throw new Error(`${source}: ${key} missing canonical/aliases`);
        }
        for (const lang of ['ja', 'en', 'fr', 'de']) {
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

/**
 * Escape regex metacharacters in a literal alias.
 */
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildAliasIndex(trainingNames) {
    // Flatten to a single list with alias → canonical mapping, sorted by
    // alias length DESC so longer phrases match first.
    const list = [];
    for (const [key, entry] of Object.entries(trainingNames)) {
        if (key.startsWith('_')) continue;
        for (const alias of entry.aliases) {
            list.push({
                alias,
                key,
                canonical: entry.canonical,
                regex: new RegExp(`\\b${escapeRegex(alias)}\\b`, 'g'),
            });
        }
    }
    list.sort((a, b) => b.alias.length - a.alias.length);
    return list;
}

function normalizeSpanBody(body, lang, aliasIndex) {
    let out = body;
    for (const entry of aliasIndex) {
        out = out.replace(entry.regex, entry.canonical[lang]);
    }
    if (lang === 'fr') {
        out = fixFrenchArticleAgreement(out);
    }
    return out;
}

/**
 * French article agreement: when an alias-substitution drops a feminine
 * noun (Reconnaissance, Formation, Lecture) after a masculine article
 * (Le/Du) or naive elision (L'), fix the article to match. Mechanical
 * substitution doesn't know noun gender; this post-step corrects the
 * most common cases. Conservative — only fixes patterns we generate.
 */
function fixFrenchArticleAgreement(text) {
    // Feminine training nouns we know we substitute.
    const FEM_WORDS = ['Reconnaissance', 'Formation', 'Lecture'];
    let out = text;
    for (const w of FEM_WORDS) {
        // Le Reconnaissance → La Reconnaissance
        out = out.replace(new RegExp(`\\bLe\\s+${w}\\b`, 'g'), `La ${w}`);
        // L'Reconnaissance → La Reconnaissance (no elision before consonant)
        out = out.replace(new RegExp(`\\bL'${w}\\b`, 'g'), `La ${w}`);
        // du Reconnaissance → de la Reconnaissance
        out = out.replace(new RegExp(`\\bdu\\s+${w}\\b`, 'g'), `de la ${w}`);
        // au Reconnaissance → à la Reconnaissance
        out = out.replace(new RegExp(`\\bau\\s+${w}\\b`, 'g'), `à la ${w}`);
    }
    return out;
}

// -----------------------------------------------------------------
// Page-metadata substitution (SEO).
//
// data/page-metadata.json holds short, SERP-friendly title + meta
// description per page per language. This pass is part of the variant-
// generation step (transformToLang): when generating foo.en.html, look
// up that page's en title/description and inject into <title>,
// data-title-en, <meta name=description>, og:title, og:description,
// twitter:title, twitter:description. ja URL (source HTML) is also
// updated so the bare /foo.html serves the right ja metadata.
//
// Falls back to existing HTML values when the page or lang is missing
// from the JSON (graceful degradation).
// -----------------------------------------------------------------

const PAGEMETA_PATH     = 'data/page-metadata.json';
const PAGEMETA_FALLBACK = 'data/page-metadata.fallback.json';

let _pageMetaCache = null;
function loadPageMetadata() {
    if (_pageMetaCache) return _pageMetaCache;
    try {
        const data = JSON.parse(fs.readFileSync(PAGEMETA_PATH, 'utf8'));
        _pageMetaCache = data;
        return data;
    } catch (e) {
        console.warn(`[page-metadata] WARNING: ${PAGEMETA_PATH} unusable (${e.message}). Using fallback.`);
    }
    _pageMetaCache = JSON.parse(fs.readFileSync(PAGEMETA_FALLBACK, 'utf8'));
    return _pageMetaCache;
}

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Strip a "<title> | suffix" trailing part to get the bare title
 * (used for og:title / twitter:title where the site name is implicit).
 */
function stripSiteSuffix(title) {
    const idx = title.lastIndexOf(' | ');
    return idx === -1 ? title : title.slice(0, idx);
}

/**
 * Apply page-metadata overrides for a specific lang. Mutates the HTML
 * string by replacing title/description/og/twitter fields.
 */
function applyPageMetadata(html, sourcePath, lang) {
    const meta = loadPageMetadata();
    const entry = meta[sourcePath];
    if (!entry || !entry.title || !entry.description) return html;
    const newTitle = entry.title[lang];
    const newDesc  = entry.description[lang];
    if (!newTitle || !newDesc) return html;

    let out = html;
    const titleEsc = escapeHtml(newTitle);
    const descEsc  = escapeHtml(newDesc);
    const bareTitleEsc = escapeHtml(stripSiteSuffix(newTitle));

    // <title>
    out = out.replace(/<title>[^<]*<\/title>/, `<title>${titleEsc}</title>`);
    // data-title-<lang> attr on <html>
    out = out.replace(
        new RegExp(`data-title-${lang}="[^"]*"`),
        `data-title-${lang}="${titleEsc}"`,
    );
    // <meta name="description">
    out = out.replace(
        /<meta name="description" content="[^"]*">/,
        `<meta name="description" content="${descEsc}">`,
    );
    // <meta property="og:title">
    out = out.replace(
        /<meta property="og:title" content="[^"]*">/,
        `<meta property="og:title" content="${bareTitleEsc}">`,
    );
    // <meta property="og:description">
    out = out.replace(
        /<meta property="og:description" content="[^"]*">/,
        `<meta property="og:description" content="${descEsc}">`,
    );
    // <meta name="twitter:title">
    out = out.replace(
        /<meta name="twitter:title" content="[^"]*">/,
        `<meta name="twitter:title" content="${bareTitleEsc}">`,
    );
    // <meta name="twitter:description">
    out = out.replace(
        /<meta name="twitter:description" content="[^"]*">/,
        `<meta name="twitter:description" content="${descEsc}">`,
    );
    return out;
}

function syncTrainingNamesInSources(allSources) {
    let trainingNames;
    try {
        trainingNames = loadTrainingNames();
    } catch (e) {
        console.error(`[training-names] ERROR: ${e.message}. Skipping normalisation.`);
        return [];
    }
    const aliasIndex = buildAliasIndex(trainingNames);
    if (aliasIndex.length === 0) return [];

    const spanRe = /(<span\s+lang="(ja|en|fr|de)">)([\s\S]*?)(<\/span>)/g;
    const modified = [];
    for (const src of allSources) {
        const raw = fs.readFileSync(src, 'utf8');
        const out = raw.replace(spanRe, (m, open, lang, body, close) => {
            const newBody = normalizeSpanBody(body, lang, aliasIndex);
            return open + newBody + close;
        });
        if (out !== raw) {
            fs.writeFileSync(src, out, 'utf8');
            modified.push(src);
        }
    }
    if (modified.length > 0) {
        console.log(`[training-names] normalised ${modified.length} source file(s)`);
    }
    return modified;
}

// Where to look for source files (relative to repo root).
const SOURCE_DIRS = ['.', 'guides', 'practice', 'practice/training-menu'];
const GENERATED_RE = /\.(en|fr|de)\.html$/;
// Skip these (no lang content / no variant should be generated).
// 404.html is served as-is by GitHub Pages for any 404 across the whole
// site — language variants would never be served, and the multi-lang
// spans inside it already do the job.
const SKIP_FILES = new Set(['404.html']);

function listSources() {
    const files = [];
    for (const dir of SOURCE_DIRS) {
        if (!fs.existsSync(dir)) continue;
        for (const name of fs.readdirSync(dir)) {
            if (!name.endsWith('.html')) continue;
            if (GENERATED_RE.test(name)) continue;
            const full = path.join(dir, name);
            if (SKIP_FILES.has(full)) continue;
            const stat = fs.statSync(full);
            if (!stat.isFile()) continue;
            files.push(full);
        }
    }
    return files;
}

/**
 * Migrate hreflang URLs from `?lang=X` to `.X.html` suffix. Idempotent.
 * Applies to both the source file (in place) and to lang variants (in output).
 */
function migrateHreflang(html) {
    let out = html;

    // Case 1: page URLs ending in .html
    //   hreflang="X" href="...foo.html?lang=X"
    //     → ja: hreflang="ja" href="...foo.html"
    //     → en/fr/de: hreflang="X" href="...foo.X.html"
    out = out.replace(
        /<link rel="alternate" hreflang="(ja|en|fr|de)" href="([^"]+?)\.html\?lang=\1">/g,
        (_, lang, base) =>
            lang === 'ja'
                ? `<link rel="alternate" hreflang="ja" href="${base}.html">`
                : `<link rel="alternate" hreflang="${lang}" href="${base}.${lang}.html">`,
    );

    // Case 2: directory URLs ending in /
    //   hreflang="X" href="...guides/?lang=X"
    //     → ja: hreflang="ja" href="...guides/"
    //     → en/fr/de: hreflang="X" href="...guides/index.X.html"
    out = out.replace(
        /<link rel="alternate" hreflang="(ja|en|fr|de)" href="([^"]+?\/)\?lang=\1">/g,
        (_, lang, base) =>
            lang === 'ja'
                ? `<link rel="alternate" hreflang="ja" href="${base}">`
                : `<link rel="alternate" hreflang="${lang}" href="${base}index.${lang}.html">`,
    );

    // x-default → bare URL (ja). Handles both .html and / endings.
    out = out.replace(
        /<link rel="alternate" hreflang="x-default" href="([^"]+?)(\.html|\/)(?:\?lang=[a-z]{2})?">/g,
        '<link rel="alternate" hreflang="x-default" href="$1$2">',
    );

    return out;
}

/**
 * Strip a "<title> | suffix" trailing part to get the bare title.
 * Used for og:title / twitter:title where the site name is implied.
 */
function stripTitleSuffix(title) {
    const idx = title.lastIndexOf(' | ');
    return idx === -1 ? title : title.slice(0, idx);
}

/**
 * Rewrite a multi-lang HTML into a single-lang variant for `targetLang`.
 */
function transformToLang(html, targetLang) {
    let out = html;

    // 1. <html lang="ja" ...> → <html lang="en" ...>
    out = out.replace(/<html\s+lang="ja"/, `<html lang="${targetLang}"`);

    // 2. <title> ← data-title-<lang>
    const titleMatch = out.match(new RegExp(`data-title-${targetLang}="([^"]*)"`));
    let langTitle = null;
    if (titleMatch) {
        langTitle = titleMatch[1];
        out = out.replace(/<title>[^<]*<\/title>/, `<title>${langTitle}</title>`);
    }

    // 3. canonical: /foo.html → /foo.<lang>.html
    //                /guides/  → /guides/index.<lang>.html
    out = out.replace(
        /<link rel="canonical" href="([^"]+?)\.html">/,
        `<link rel="canonical" href="$1.${targetLang}.html">`,
    );
    out = out.replace(
        /<link rel="canonical" href="([^"]+?\/)">/,
        `<link rel="canonical" href="$1index.${targetLang}.html">`,
    );

    // 4. og:url: same treatment
    out = out.replace(
        /<meta property="og:url" content="([^"]+?)\.html">/,
        `<meta property="og:url" content="$1.${targetLang}.html">`,
    );
    out = out.replace(
        /<meta property="og:url" content="([^"]+?\/)">/,
        `<meta property="og:url" content="$1index.${targetLang}.html">`,
    );

    // 5. og:locale: ja_JP → <target>
    out = out.replace(
        /<meta property="og:locale" content="ja_JP">/,
        `<meta property="og:locale" content="${OG_LOCALE[targetLang]}">`,
    );

    // 6. og:locale:alternate — rebuild so it lists the 3 OTHER locales.
    //    Match the entire alternate block and replace.
    const alternates = ['ja', 'en', 'fr', 'de']
        .filter((l) => l !== targetLang)
        .map((l) => `    <meta property="og:locale:alternate" content="${OG_LOCALE[l]}">`)
        .join('\n');
    // Replace any contiguous block of og:locale:alternate lines.
    // (Use [a-zA-Z_]+ because locale codes are like "en_US", "fr_FR".)
    out = out.replace(
        /(?:[ \t]*<meta property="og:locale:alternate" content="[a-zA-Z_]+">[ \t]*\r?\n)+/,
        alternates + '\n',
    );

    // 7. og:title / twitter:title ← bare title (no " | site" suffix) if we have it
    if (langTitle) {
        const bare = stripTitleSuffix(langTitle).replace(/"/g, '&quot;');
        out = out.replace(
            /<meta property="og:title" content="[^"]*">/,
            `<meta property="og:title" content="${bare}">`,
        );
        out = out.replace(
            /<meta name="twitter:title" content="[^"]*">/,
            `<meta name="twitter:title" content="${bare}">`,
        );
    }

    // 8a. App Store URL locale: /jp/ → /<target locale>/.
    out = out.replace(
        /apps\.apple\.com\/jp\//g,
        `apps.apple.com/${APP_STORE_LOCALE[targetLang]}/`,
    );

    // 8. Strip <span lang="Y">...</span> blocks where Y ≠ targetLang.
    //    Then unwrap the target lang's spans (keep inner content).
    for (const otherLang of ['ja', 'en', 'fr', 'de']) {
        if (otherLang === targetLang) continue;
        const stripRe = new RegExp(
            `<span\\s+lang="${otherLang}">[\\s\\S]*?<\\/span>`,
            'g',
        );
        out = out.replace(stripRe, '');
    }
    const unwrapRe = new RegExp(
        `<span\\s+lang="${targetLang}">([\\s\\S]*?)<\\/span>`,
        'g',
    );
    out = out.replace(unwrapRe, '$1');

    return out;
}

function processSource(sourcePath) {
    let raw = fs.readFileSync(sourcePath, 'utf8');

    // Migrate hreflang format in source (idempotent).
    const migrated = migrateHreflang(raw);
    if (migrated !== raw) {
        raw = migrated;
        console.log(`  [migrated source hreflang] ${sourcePath}`);
    }

    // Apply page-metadata overrides for the ja URL (source serves as ja).
    const jaUpdated = applyPageMetadata(raw, sourcePath, 'ja');
    if (jaUpdated !== raw) {
        raw = jaUpdated;
    }

    if (raw !== fs.readFileSync(sourcePath, 'utf8')) {
        fs.writeFileSync(sourcePath, raw, 'utf8');
    }

    // Generate per-lang variants from the (now-updated) source.
    for (const lang of LANGS) {
        const variantPath = sourcePath.replace(/\.html$/, `.${lang}.html`);
        let variant = transformToLang(raw, lang);
        // Apply page-metadata overrides for this variant's lang.
        variant = applyPageMetadata(variant, sourcePath, lang);
        fs.writeFileSync(variantPath, variant, 'utf8');
    }
}

// -----------------------------------------------------------------
// Sitemap generation — emit ja URL + 3 lang variants per source page
// with xhtml:link hreflang annotations.
// -----------------------------------------------------------------

const SITE_ORIGIN = 'https://solfegepro.com';

/**
 * Map a source path → SITE_ORIGIN URL for ja.
 * Returns the bare URL with no lang suffix.
 * (Index files are normalised to their directory.)
 */
function sourceToJaUrl(sourcePath) {
    let rel = sourcePath.replace(/^\.\//, '');
    // /index.html → /
    rel = rel.replace(/(^|\/)index\.html$/, '$1');
    return SITE_ORIGIN + (rel === '' ? '/' : '/' + rel);
}

function jaUrlToVariantUrl(jaUrl, lang) {
    if (lang === 'ja') return jaUrl;
    // /foo.html → /foo.<lang>.html
    if (/\.html$/.test(jaUrl)) {
        return jaUrl.replace(/\.html$/, '.' + lang + '.html');
    }
    // Directory → /index.<lang>.html
    if (jaUrl.endsWith('/')) {
        return jaUrl + 'index.' + lang + '.html';
    }
    return jaUrl;
}

/**
 * Parse the existing sitemap (if any) to preserve <lastmod>/<priority>
 * per URL. Returns { 'url': { lastmod, priority } }.
 */
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

function generateSitemap(sources) {
    const meta = loadExistingSitemapMeta();
    const today = new Date().toISOString().slice(0, 10);
    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ];

    for (const src of sources) {
        const jaUrl = sourceToJaUrl(src);
        const entry = meta[jaUrl] || {};
        const lastmod = entry.lastmod || today;
        const priority = entry.priority || '0.7';

        for (const lang of ['ja', 'en', 'fr', 'de']) {
            const url = jaUrlToVariantUrl(jaUrl, lang);
            lines.push('  <url>');
            lines.push(`    <loc>${url}</loc>`);
            lines.push(`    <lastmod>${lastmod}</lastmod>`);
            lines.push(`    <priority>${priority}</priority>`);
            for (const altLang of ['ja', 'en', 'fr', 'de']) {
                const altUrl = jaUrlToVariantUrl(jaUrl, altLang);
                lines.push(
                    `    <xhtml:link rel="alternate" hreflang="${altLang}" href="${altUrl}"/>`,
                );
            }
            lines.push(
                `    <xhtml:link rel="alternate" hreflang="x-default" href="${jaUrl}"/>`,
            );
            lines.push('  </url>');
        }
    }

    lines.push('</urlset>');
    return lines.join('\n') + '\n';
}

function main() {
    process.chdir(path.resolve(__dirname, '..'));

    const argv = process.argv.slice(2);
    const onlySitemap = argv.includes('--sitemap-only');
    const filtered = argv.filter((a) => !a.startsWith('--'));
    const allSources = listSources();
    const sources = filtered.length > 0
        ? filtered.filter((f) => fs.existsSync(f) && !GENERATED_RE.test(f) && !SKIP_FILES.has(f))
        : allSources;

    if (!onlySitemap) {
        // Phase 1a: sync price strings from data/prices.json into ALL source HTML
        // (not just the staged subset) so the ja URL — which serves source —
        // also reflects the latest prices. Variants get them automatically
        // because they're regenerated from the (now-updated) source.
        try {
            const currentPrices = loadPrices();
            syncPriceStringsToSources(allSources, currentPrices);
        } catch (e) {
            console.error(`[prices] ERROR: ${e.message}. Skipping price sync; HTML keeps existing values.`);
        }

        // Phase 1b: normalise training/feature/setting names per <span lang="X">
        // context, using data/training-names.json. Replaces legacy aliases like
        // "Interval Training" with the lang-appropriate canonical (e.g.
        // "インターバル認識" inside a ja span).
        try {
            syncTrainingNamesInSources(allSources);
        } catch (e) {
            console.error(`[training-names] ERROR: ${e.message}. Skipping normalisation.`);
        }

        console.log(`Building ${sources.length} source files × 3 langs = ${sources.length * 3} variants.`);
        for (const src of sources) {
            processSource(src);
        }
    }

    // Sitemap always rebuilt from the FULL source list to avoid losing
    // entries when a partial build is requested.
    const sitemap = generateSitemap(allSources);
    fs.writeFileSync('sitemap.xml', sitemap, 'utf8');
    console.log(`Wrote sitemap.xml (${allSources.length * 4} URLs).`);
    console.log(`Done.`);
}

main();
