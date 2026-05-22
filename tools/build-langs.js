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

// Where to look for source files (relative to repo root).
const SOURCE_DIRS = ['.', 'guides', 'practice', 'practice/training-menu'];
const GENERATED_RE = /\.(en|fr|de)\.html$/;
// Skip these (no lang content — pure assets / redirects).
const SKIP_FILES = new Set();

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
    const raw = fs.readFileSync(sourcePath, 'utf8');

    // Migrate hreflang format in source (idempotent).
    const migrated = migrateHreflang(raw);
    if (migrated !== raw) {
        fs.writeFileSync(sourcePath, migrated, 'utf8');
        console.log(`  [migrated source hreflang] ${sourcePath}`);
    }

    // Generate per-lang variants from the (now-migrated) source.
    for (const lang of LANGS) {
        const variantPath = sourcePath.replace(/\.html$/, `.${lang}.html`);
        const variant = transformToLang(migrated, lang);
        fs.writeFileSync(variantPath, variant, 'utf8');
    }
}

// -----------------------------------------------------------------
// Sitemap generation — emit ja URL + 3 lang variants per source page
// with xhtml:link hreflang annotations.
// -----------------------------------------------------------------

const SITE_ORIGIN = 'https://nmswshg.github.io/solfege-pro-docs';

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
        ? filtered.filter((f) => fs.existsSync(f) && !GENERATED_RE.test(f))
        : allSources;

    if (!onlySitemap) {
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
