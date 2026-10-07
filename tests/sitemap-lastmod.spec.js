const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { sourceLastmod } = require('../tools/content-lastmod');

test('sitemap dates ignore committed and uncommitted loader cache bumps', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'solfege-content-date-'));
    const relativePath = 'src/index.html';
    const file = path.join(cwd, relativePath);
    const today = '2026-10-08';
    function git(args, date) {
        return execFileSync('git', args, {
            cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) },
        });
    }
    function write(version, title = 'Practice') {
        fs.writeFileSync(file, `<h1>${title}</h1><script src="/bootstrap.js?v=${version}"></script>`);
    }
    function commit(date) {
        git(['add', relativePath]);
        git(['commit', '-qm', 'fixture'], `${date}T12:00:00+00:00`);
    }
    function date() { return sourceLastmod(relativePath, { cwd, today }); }
    try {
        git(['init', '-q']);
        git(['config', 'user.name', 'Fixture']);
        git(['config', 'user.email', 'fixture@example.invalid']);
        fs.mkdirSync(path.dirname(file));
        write(1); commit('2026-08-01');
        expect(date()).toBe('2026-08-01');
        write(2); commit('2026-09-01');
        write(3); commit('2026-10-01');
        expect(date()).toBe('2026-08-01');
        write(4);
        expect(date()).toBe('2026-08-01');
        git(['add', relativePath]);
        expect(date()).toBe('2026-08-01');
        write(4, 'A new practice plan');
        expect(date()).toBe(today);
        commit('2026-10-07');
        expect(date()).toBe('2026-10-07');
        write(5, 'A new practice plan');
        expect(date()).toBe('2026-10-07');
        // A commit after midnight in Japan still belongs to the previous UTC day.
        write(5, 'A timezone-aware practice plan');
        git(['add', relativePath]);
        git(['commit', '-qm', 'timezone fixture'], '2026-10-08T01:00:00+09:00');
        expect(date()).toBe('2026-10-07');
        expect(sourceLastmod('src/new.html', { cwd, today })).toBe(today);
    } finally {
        fs.rmSync(cwd, { recursive: true, force: true });
    }
});
