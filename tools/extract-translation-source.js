#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const SRC_DIR = 'src';
const OUTPUT_PATH = 'data/translation-source.json';

function listHtmlFiles(dir, prefix = '') {
    return fs.readdirSync(dir, { withFileTypes: true })
        .flatMap((entry) => {
            const relative = path.posix.join(prefix, entry.name);
            if (entry.isDirectory()) return listHtmlFiles(path.join(dir, entry.name), relative);
            return entry.name.endsWith('.html') ? [relative] : [];
        })
        .filter((relative) => !relative.startsWith('_partials/'))
        .sort();
}

function expandIncludes(html) {
    return html.replace(/<!--\s*include:\s*([^\s][^>]*?\.html)\s*-->/g, (match, includePath) => {
        const filePath = path.join(SRC_DIR, includePath.trim());
        if (!fs.existsSync(filePath)) throw new Error(`Missing include: ${filePath}`);
        return expandIncludes(fs.readFileSync(filePath, 'utf8'));
    });
}

function extractEnglishSpans(html, sourcePath) {
    const startRe = /<span\s+lang="en">/g;
    const openRe = /<span\b[^>]*>/g;
    const closeRe = /<\/span>/g;
    const spans = [];
    let cursor = 0;

    while (true) {
        startRe.lastIndex = cursor;
        const start = startRe.exec(html);
        if (!start) break;

        const innerStart = start.index + start[0].length;
        let depth = 1;
        let scan = innerStart;
        let innerEnd = -1;
        let blockEnd = -1;

        while (depth > 0) {
            openRe.lastIndex = scan;
            closeRe.lastIndex = scan;
            const open = openRe.exec(html);
            const close = closeRe.exec(html);
            if (!close) throw new Error(`Unbalanced English span in ${sourcePath}`);
            if (open && open.index < close.index) {
                depth += 1;
                scan = open.index + open[0].length;
            } else {
                depth -= 1;
                if (depth === 0) {
                    innerEnd = close.index;
                    blockEnd = close.index + close[0].length;
                } else {
                    scan = close.index + close[0].length;
                }
            }
        }

        spans.push(html.slice(innerStart, innerEnd));
        cursor = blockEnd;
    }

    return spans;
}

function extractEnglishMermaidLabels(html) {
    const labels = [];
    const blockRe = /<div\s+class="mermaid-lang"\s+lang="en">([\s\S]*?)<\/div>/g;
    let block;
    while ((block = blockRe.exec(html)) !== null) {
        const labelRe = /"([^"]+)"/g;
        let label;
        while ((label = labelRe.exec(block[1])) !== null) labels.push(label[1]);
    }
    return labels;
}

function extractEnglishScriptStrings(html, sourcePath) {
    const strings = [];
    const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
    const localizedValueRe = /\b(?:en|guideEn|descEn)\s*:\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)/g;
    let script;
    while ((script = scriptRe.exec(html)) !== null) {
        let value;
        while ((value = localizedValueRe.exec(script[1])) !== null) {
            try {
                strings.push(Function(`"use strict"; return (${value[1]});`)());
            } catch (error) {
                throw new Error(`Unable to parse English script string in ${sourcePath}: ${value[1]}`);
            }
        }
    }
    return strings;
}

const metadata = JSON.parse(fs.readFileSync('data/page-metadata.json', 'utf8'));
const pages = {};
for (const sourcePath of listHtmlFiles(SRC_DIR)) {
    const html = expandIncludes(fs.readFileSync(path.join(SRC_DIR, sourcePath), 'utf8'));
    pages[sourcePath] = {
        spans: extractEnglishSpans(html, sourcePath),
        mermaid: extractEnglishMermaidLabels(html),
        script: extractEnglishScriptStrings(html, sourcePath),
        title: metadata[sourcePath]?.title?.en || '',
        description: metadata[sourcePath]?.description?.en || '',
    };
}

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify({ pages }, null, 2)}\n`);
const spanCount = Object.values(pages).reduce((sum, page) => sum + page.spans.length, 0);
const mermaidCount = Object.values(pages).reduce((sum, page) => sum + page.mermaid.length, 0);
const scriptCount = Object.values(pages).reduce((sum, page) => sum + page.script.length, 0);
console.log(`Wrote ${OUTPUT_PATH}: ${Object.keys(pages).length} pages, ${spanCount} English spans, ${mermaidCount} Mermaid labels, ${scriptCount} script strings.`);
