const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Loader cache versions do not change a page's indexable content. Ignore
// those bumps both before and after commit, without relying on checkout mtime.
function content(html) {
    return html.replace(/(bootstrap\.js\?v=)\d+/g, '$1');
}

function sourceLastmod(relativePath, options = {}) {
    const cwd = options.cwd || process.cwd();
    const today = options.today || new Date().toISOString().slice(0, 10);
    function git(args) {
        return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    }
    try {
        const current = content(fs.readFileSync(path.resolve(cwd, relativePath), 'utf8'));
        if (current !== content(git(['show', `HEAD:${relativePath}`]))) return today;
        const history = git(['log', '--format=%H%x09%ct', '--', relativePath]).trim().split('\n');
        let lastmod = today;
        for (const row of history) {
            const [revision, timestamp] = row.split('\t');
            if (!revision || !/^\d+$/.test(timestamp)) break;
            const date = new Date(Number(timestamp) * 1000).toISOString().slice(0, 10);
            if (content(git(['show', `${revision}:${relativePath}`])) !== current) break;
            lastmod = date;
        }
        return lastmod;
    } catch (_) {
        return today;
    }
}

module.exports = { sourceLastmod };
