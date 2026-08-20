#!/usr/bin/env node

const fs = require('fs');

const SOURCE_PATH = 'data/translation-source.json';
const TRANSLATION_PATHS = {
    es: 'data/page-translations-es.json',
    it: 'data/page-translations-it.json',
    ko: 'data/page-translations-ko.json',
    'pt-BR': 'data/page-translations-pt-br.json',
};
const source = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8')).pages;
const accessibilityTranslations = JSON.parse(fs.readFileSync('data/accessibility-translations.json', 'utf8'));
let fatalCount = 0;
let warningCount = 0;

const accessibilitySourceValues = [...new Set(Object.values(source).flatMap((page) =>
    page.spans.flatMap((value) => [...value.matchAll(/\b(?:alt|title|aria-label)="([^"]*[A-Za-z][^"]*)"/g)].map((match) => match[1])),
))];

function fatal(lang, page, message) {
    console.error(`[ERROR] ${lang} ${page}: ${message}`);
    fatalCount += 1;
}

function warn(lang, page, message) {
    if (warningCount < 80) console.warn(`[WARN] ${lang} ${page}: ${message}`);
    warningCount += 1;
}

function matches(value, regex) {
    return value.match(regex) || [];
}

for (const [lang, translationPath] of Object.entries(TRANSLATION_PATHS)) {
    const accessibilityKeys = Object.keys(accessibilityTranslations[lang] || {});
    if (JSON.stringify(accessibilityKeys) !== JSON.stringify(accessibilitySourceValues)) {
        fatal(lang, '-', `accessibility translation keys/order differ: expected ${accessibilitySourceValues.length}`);
    }
    for (const sourceValue of accessibilitySourceValues) {
        if (!accessibilityTranslations[lang]?.[sourceValue]?.trim()) {
            fatal(lang, '-', `missing accessibility translation: ${sourceValue}`);
        }
    }
    if (!fs.existsSync(translationPath)) {
        fatal(lang, '-', `missing ${translationPath}`);
        continue;
    }
    const translated = JSON.parse(fs.readFileSync(translationPath, 'utf8')).pages;
    const sourceKeys = Object.keys(source);
    const translatedKeys = Object.keys(translated || {});
    if (JSON.stringify(sourceKeys) !== JSON.stringify(translatedKeys)) {
        fatal(lang, '-', `page keys/order differ: source=${sourceKeys.length}, translated=${translatedKeys.length}`);
    }

    for (const pagePath of sourceKeys) {
        const originalPage = source[pagePath];
        const localizedPage = translated?.[pagePath];
        if (!localizedPage) {
            fatal(lang, pagePath, 'missing page');
            continue;
        }
        for (const field of ['spans', 'mermaid', 'script']) {
            const originals = originalPage[field] || [];
            const localizations = localizedPage[field] || [];
            if (originals.length !== localizations.length) {
                fatal(lang, pagePath, `${field} count ${localizations.length}, expected ${originals.length}`);
                continue;
            }
            originals.forEach((original, index) => {
                const localized = localizations[index];
                if (typeof localized !== 'string' || !localized.trim()) {
                    fatal(lang, pagePath, `${field}[${index}] is empty`);
                    return;
                }
                const originalTags = matches(original, /<[^>]+>/g);
                const localizedTags = matches(localized, /<[^>]+>/g);
                if (JSON.stringify(originalTags) !== JSON.stringify(localizedTags)) {
                    fatal(lang, pagePath, `${field}[${index}] HTML tags/attributes changed`);
                }
                const originalUrls = matches(original, /https?:\/\/[^\s<"]+/g);
                const localizedUrls = matches(localized, /https?:\/\/[^\s<"]+/g);
                if (JSON.stringify(originalUrls) !== JSON.stringify(localizedUrls)) {
                    fatal(lang, pagePath, `${field}[${index}] URL changed`);
                }
                const brandCount = matches(original, /Solfege PRO/g).length;
                if (matches(localized, /Solfege PRO/g).length !== brandCount) {
                    fatal(lang, pagePath, `${field}[${index}] Solfege PRO changed`);
                }
                const visibleOriginal = original.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                if (original === localized && matches(visibleOriginal, /[A-Za-z]{3,}/g).length >= 5) {
                    warn(lang, pagePath, `${field}[${index}] may be untranslated: ${original.slice(0, 90)}`);
                }
                if (lang === 'ko' && matches(visibleOriginal, /[A-Za-z]{3,}/g).length >= 5 && !/[가-힣]/.test(localized)) {
                    warn(lang, pagePath, `${field}[${index}] contains no Hangul: ${localized.slice(0, 90)}`);
                }
            });
        }
        for (const field of ['title', 'description']) {
            const original = originalPage[field] || '';
            const localized = localizedPage[field];
            if (typeof localized !== 'string' || !localized.trim()) {
                fatal(lang, pagePath, `${field} is empty`);
                continue;
            }
            const brandCount = matches(original, /Solfege PRO/g).length;
            if (matches(localized, /Solfege PRO/g).length !== brandCount) {
                fatal(lang, pagePath, `${field}: Solfege PRO changed`);
            }
        }
        if (localizedPage.title?.length > 85) warn(lang, pagePath, `title is long (${localizedPage.title.length})`);
        if (localizedPage.description?.length > 190) warn(lang, pagePath, `description is long (${localizedPage.description.length})`);
    }
    console.log(`[OK] ${lang}: ${translatedKeys.length} pages checked`);
}

console.log(`Validation complete: errors=${fatalCount}, warnings=${warningCount}`);
if (fatalCount) process.exit(1);
