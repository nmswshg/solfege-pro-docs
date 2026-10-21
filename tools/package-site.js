#!/usr/bin/env node
'use strict';

// Package the committed site separately from authoring sources and developer files.
// Local content edits still use `npm run build` before they are committed.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const publicDirectories = new Set([
    'assets', 'guides', 'manual', 'practice',
    'en', 'fr', 'de', 'es', 'it', 'ko', 'pt-br',
    'android-beta', 'app', 'faq', 'features', 'free-vs-pro', 'pricing',
    'privacy', 'release-history', 'start-here', 'support', 'terms',
]);
const rootScripts = new Set([
    'analytics.js', 'android-beta-campaign.js', 'animations.js', 'app-lp.js',
    'bootstrap.js', 'drawer.js', 'lang-toggle.js', 'reading-cta-modal.js',
    'tap-tempo.js',
]);
const rootFiles = new Set([
    '_redirects', 'robots.txt', 'sitemap.xml',
    'eb43a1325afb8eaa79a4ee9dff5a6d14.txt',
]);
const assetExtensions = new Set([
    '.html', '.css', '.js', '.png', '.webp', '.svg', '.ico',
    '.jpg', '.jpeg', '.gif', '.avif', '.woff', '.woff2', '.mp3', '.wav', '.ogg',
]);

const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(Boolean).filter(file => {
        const parts = file.split('/');
        if (parts.some(part => part.startsWith('.'))) return false;
        const extension = path.extname(file);
        if (parts.length > 1) {
            return publicDirectories.has(parts[0]) && assetExtensions.has(extension);
        }
        if (file.endsWith('-preview.html')) return false;
        return rootFiles.has(file) || rootScripts.has(file)
            || ['.html', '.css', '.png', '.webp', '.svg', '.ico'].includes(extension);
    });

// Fail before replacing the output if a publish would exceed the Pages Free limits.
if (files.length > 20000) throw new Error('Cloudflare Pages Free allows 20,000 files.');
for (const file of files) {
    const stat = fs.lstatSync(path.join(root, file));
    if (!stat.isFile()) throw new Error(`Refusing to publish a non-regular file: ${file}`);
    if (stat.size > 25 * 1024 * 1024) throw new Error(`File exceeds 25 MiB: ${file}`);
}
for (const required of ['index.html', '404.html', 'sitemap.xml', 'robots.txt']) {
    if (!files.includes(required)) throw new Error(`Missing required public file: ${required}`);
}

fs.rmSync(output, { recursive: true, force: true });
for (const file of files) {
    const target = path.join(output, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, file), target);
}
console.log(`Packaged ${files.length} public files in dist/ (no sources, tests, or build data).`);
