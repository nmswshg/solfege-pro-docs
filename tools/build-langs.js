#!/usr/bin/env node
/**
 * Generate language-suffixed directory output from multi-language source.
 *
 * Source files live under src/. For each source `src/<path>.html`, this
 * script generates four output files under the repo root:
 *
 *   <path>/index.html          ← Japanese (e.g. guides/interval-training/index.html)
 *   en/<path>/index.html       ← English
 *   fr/<path>/index.html       ← French
 *   de/<path>/index.html       ← German
 *
 * Special cases:
 *   - src/index.html             → index.html  (root TOP for ja)
 *                                  en/index.html, fr/index.html, de/index.html
 *   - src/guides/index.html      → guides/index.html  (ja guides listing)
 *                                  en/guides/index.html, etc.
 *
 * URLs (always end in /):
 *   src/index.html                       → /  + /en/  + /fr/  + /de/
 *   src/start-here.html                  → /start-here/  + /en/start-here/  + ...
 *   src/guides/index.html                → /guides/  + /en/guides/  + ...
 *   src/guides/interval-training.html    → /guides/interval-training/ + /en/...
 *   src/practice/training-menu/interval.html
 *                                        → /practice/training-menu/interval/
 *                                          + /en/practice/training-menu/interval/
 *
 * Plus a redirect stub layer: every OLD URL from the previous .X.html scheme
 * (foo.html / foo.en.html / foo.fr.html / foo.de.html) gets a meta-refresh
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
const LANGS_VARIANT = ['en', 'fr', 'de'];          // ja is the source-language baseline
const OG_LOCALE = { ja: 'ja_JP', en: 'en_US', fr: 'fr_FR', de: 'de_DE' };
const APP_STORE_LOCALE = { ja: 'jp', en: 'us', fr: 'fr', de: 'de' };

const SRC_DIR = 'src';
const PRICES_PATH = 'data/prices.json';
const PRICES_FALLBACK = 'data/prices.fallback.json';
const PRICES_PREV = 'data/prices.previous.json';
const TRAINING_PATH = 'data/training-names.json';
const TRAINING_FALLBACK = 'data/training-names.fallback.json';
const PAGEMETA_PATH = 'data/page-metadata.json';
const PAGEMETA_FALLBACK = 'data/page-metadata.fallback.json';

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
    p = p.replace(/(^|\/)index$/, '$1');         // drop trailing /index
    // Now p is '' (was 'index.html') or 'start-here' or 'guides' or 'guides/foo' etc.
    const langPrefix = lang === 'ja' ? '' : `/${lang}`;
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
    return lang === 'ja' ? outPath : `${lang}/${outPath}`;
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
        if (typeof entry.trial !== 'string' || !entry.trial.trim()) {
            throw new Error(`${source}: missing/empty ${lang}.trial`);
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
    const meta = loadPageMetadata();
    const entry = meta[srcPath];
    if (!entry || !entry.title || !entry.description) return html;
    const newTitle = entry.title[lang], newDesc = entry.description[lang];
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

// --------------------------------------------------------------------
// Core: transform multi-lang source → single-lang output for new URL scheme
// --------------------------------------------------------------------

function buildHreflangBlock(srcPath, currentLang) {
    const url = (l) => SITE_ORIGIN + srcPathToUrlPath(srcPath, l);
    return [
        `    <link rel="canonical" href="${url(currentLang)}">`,
        `    <link rel="alternate" hreflang="ja" href="${url('ja')}">`,
        `    <link rel="alternate" hreflang="en" href="${url('en')}">`,
        `    <link rel="alternate" hreflang="fr" href="${url('fr')}">`,
        `    <link rel="alternate" hreflang="de" href="${url('de')}">`,
        `    <link rel="alternate" hreflang="x-default" href="${url('ja')}">`,
    ].join('\n');
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

    // 6. og:locale:alternate block — rebuild with the OTHER three locales.
    const alternates = LANGS_ALL.filter((l) => l !== lang)
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

    // 9. Strip non-target <span lang="Y">...</span> blocks, unwrap target.
    for (const other of LANGS_ALL) {
        if (other === lang) continue;
        const re = new RegExp(`<span\\s+lang="${other}">[\\s\\S]*?<\\/span>`, 'g');
        out = out.replace(re, '');
    }
    const unwrapRe = new RegExp(`<span\\s+lang="${lang}">([\\s\\S]*?)<\\/span>`, 'g');
    out = out.replace(unwrapRe, '$1');

    return out;
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
    let m = oldRelPath.match(/^(.+?)\.(en|fr|de)\.html$/);
    if (m) {
        const base = m[1];           // e.g. 'guides/foo' or 'index'
        const lang = m[2];
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
        for (const lang of LANGS_ALL) {
            newOutputs.add(srcPathToOutputPath(src, lang));
        }
    }

    let stubCount = 0;
    for (const src of allSources) {
        // ja old path = the source-relative path itself (e.g. 'guides/foo.html')
        // en/fr/de old paths = '.X.html' suffix form
        const base = src.replace(/\.html$/, '');
        const oldPaths = {
            ja: src,                          // 'guides/foo.html'
            en: `${base}.en.html`,            // 'guides/foo.en.html'
            fr: `${base}.fr.html`,
            de: `${base}.de.html`,
        };
        for (const lang of LANGS_ALL) {
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

// --------------------------------------------------------------------
// Per-source processing
// --------------------------------------------------------------------

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

    // Generate all four language outputs.
    for (const lang of LANGS_ALL) {
        let out = transformToLang(raw, srcRelPath, lang);
        out = applyPageMetadata(out, srcRelPath, lang);
        const outPath = srcPathToOutputPath(srcRelPath, lang);
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

function generateSitemap(allSources) {
    const meta = loadExistingSitemapMeta();
    const today = new Date().toISOString().slice(0, 10);
    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ];
    for (const src of allSources) {
        const jaUrl = SITE_ORIGIN + srcPathToUrlPath(src, 'ja');
        const existing = meta[jaUrl] || {};
        const lastmod = existing.lastmod || today;
        const priority = existing.priority || '0.7';
        for (const lang of LANGS_ALL) {
            const url = SITE_ORIGIN + srcPathToUrlPath(src, lang);
            lines.push('  <url>');
            lines.push(`    <loc>${url}</loc>`);
            lines.push(`    <lastmod>${lastmod}</lastmod>`);
            lines.push(`    <priority>${priority}</priority>`);
            for (const altLang of LANGS_ALL) {
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
        console.log(`Building ${sources.length} source(s) × 4 langs = ${sources.length * 4} outputs.`);
        for (const src of sources) processSource(src);

        // 3. Wallpaper old URL paths with redirect stubs (idempotent).
        generateRedirectStubs(allSources);
    }

    // 4. Sitemap.
    const sitemap = generateSitemap(allSources);
    fs.writeFileSync('sitemap.xml', sitemap, 'utf8');
    console.log(`Wrote sitemap.xml (${allSources.length * 4} URLs).`);

    console.log('Done.');
}

main();
