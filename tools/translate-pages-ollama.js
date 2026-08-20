#!/usr/bin/env node

const fs = require('fs');

const [lang, languageName, outputPath] = process.argv.slice(2);
if (!lang || !languageName || !outputPath) {
    console.error('Usage: node tools/translate-pages-ollama.js <lang> <language name> <output path>');
    process.exit(1);
}

const SOURCE_PATH = 'data/translation-source.json';
const LEGAL_PATH = 'data/legal-page-translations.json';
const CACHE_PATH = `/private/tmp/solfege-translation-cache-${lang}.json`;
const MODEL = process.env.OLLAMA_TRANSLATION_MODEL || 'llama3:latest';
const source = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
const legal = JSON.parse(fs.readFileSync(LEGAL_PATH, 'utf8'));
const cache = fs.existsSync(CACHE_PATH) ? JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) : {};

function maskHtml(value) {
    const tags = [];
    const text = value.replace(/<[^>]+>/g, (tag) => {
        const token = `__HTML_${tags.length}__`;
        tags.push(tag);
        return token;
    });
    return { text, tags };
}

function restoreHtml(value, tags) {
    let restored = value;
    tags.forEach((tag, index) => {
        restored = restored.replaceAll(`__HTML_${index}__`, tag);
    });
    if (/__HTML_\d+__/.test(restored)) throw new Error('Unresolved HTML placeholder');
    tags.forEach((tag) => {
        if (!restored.includes(tag)) throw new Error(`Missing HTML tag: ${tag}`);
    });
    return restored;
}

function seedLegalTranslations() {
    for (const sourcePath of ['terms.html', 'privacy.html']) {
        const sourcePage = source.pages[sourcePath];
        const translatedPage = legal[lang]?.[sourcePath];
        if (!sourcePage || !translatedPage) continue;
        sourcePage.spans.forEach((value, index) => {
            if (translatedPage.spans[index]) cache[value] = translatedPage.spans[index];
        });
        if (sourcePage.title && translatedPage.title) cache[sourcePage.title] = translatedPage.title;
        if (sourcePage.description && translatedPage.description) cache[sourcePage.description] = translatedPage.description;
    }
}

function collectUniqueStrings() {
    const values = [];
    for (const page of Object.values(source.pages)) {
        values.push(...page.spans, ...(page.mermaid || []), ...(page.script || []), page.title, page.description);
    }
    return [...new Set(values.filter(Boolean))];
}

function makeBatches(values) {
    const batches = [];
    let batch = [];
    let chars = 0;
    for (const value of values) {
        const next = value.length;
        if (batch.length && (batch.length >= 24 || chars + next > 6000)) {
            batches.push(batch);
            batch = [];
            chars = 0;
        }
        batch.push(value);
        chars += next;
    }
    if (batch.length) batches.push(batch);
    return batches;
}

async function translateBatch(values, attempt = 1) {
    const masked = values.map((sourceText, id) => {
        const { text, tags } = maskHtml(sourceText);
        return { id, text, tags, sourceText };
    });
    const payload = masked.map(({ id, text }) => ({ id, text }));
    const prompt = [
        `Translate every item from English into ${languageName} for the Solfege PRO music-training website.`,
        'Use natural, concise product and educational language suitable for native speakers.',
        'Keep “Solfege PRO” unchanged. Preserve musical meaning and established terminology.',
        'Tokens such as __HTML_0__ are immutable HTML placeholders: copy every token exactly once and in the same logical position.',
        'Preserve URLs, code, note names, numbers, units, and placeholders unless normal locale formatting clearly requires punctuation changes.',
        'Return JSON only in this exact shape: {"items":[{"id":0,"text":"..."}]}. Include every id exactly once.',
        JSON.stringify({ items: payload }),
    ].join('\n');

    const response = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: MODEL,
            stream: false,
            format: 'json',
            options: { temperature: 0.1, num_ctx: 8192 },
            messages: [
                { role: 'system', content: 'You are a meticulous professional localization translator. Output valid JSON only.' },
                { role: 'user', content: prompt },
            ],
        }),
    });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
    const body = await response.json();
    const parsed = JSON.parse(body.message.content);
    if (!Array.isArray(parsed.items) || parsed.items.length !== masked.length) {
        throw new Error(`Expected ${masked.length} translated items, got ${parsed.items?.length}`);
    }

    const byId = new Map(parsed.items.map((item) => [item.id, item.text]));
    return masked.map(({ id, tags, sourceText }) => {
        const translated = byId.get(id);
        if (typeof translated !== 'string' || !translated.trim()) throw new Error(`Missing translation for id ${id}`);
        try {
            return restoreHtml(translated.trim(), tags);
        } catch (error) {
            if (attempt >= 3 || values.length === 1) throw error;
            return null;
        }
    });
}

async function translateValues(values) {
    try {
        const result = await translateBatch(values);
        if (!result.includes(null)) return result;
    } catch (error) {
        if (values.length === 1) throw error;
        console.warn(`Retrying smaller batch after: ${error.message}`);
    }
    const midpoint = Math.ceil(values.length / 2);
    return [
        ...(await translateValues(values.slice(0, midpoint))),
        ...(await translateValues(values.slice(midpoint))),
    ];
}

function writeCache() {
    fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`);
}

function buildOutput() {
    const pages = {};
    for (const [sourcePath, page] of Object.entries(source.pages)) {
        pages[sourcePath] = {
            spans: page.spans.map((value) => cache[value]),
            mermaid: (page.mermaid || []).map((value) => cache[value]),
            script: (page.script || []).map((value) => cache[value]),
            title: cache[page.title] || '',
            description: cache[page.description] || '',
        };
    }
    fs.writeFileSync(outputPath, `${JSON.stringify({ pages }, null, 2)}\n`);
}

async function main() {
    seedLegalTranslations();
    const pending = collectUniqueStrings().filter((value) => !cache[value]);
    const batches = makeBatches(pending);
    console.log(`[${lang}] ${pending.length} unique strings pending in ${batches.length} batches using ${MODEL}.`);

    for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        const translations = await translateValues(batch);
        batch.forEach((value, itemIndex) => { cache[value] = translations[itemIndex]; });
        writeCache();
        console.log(`[${lang}] batch ${index + 1}/${batches.length}; cache=${Object.keys(cache).length}`);
    }

    buildOutput();
    console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
