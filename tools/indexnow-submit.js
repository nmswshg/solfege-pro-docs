#!/usr/bin/env node
/**
 * Submit all sitemap URLs to IndexNow (Bing, Yandex, Seznam, …).
 *
 * IndexNow lets search engines that support it discover/refresh URLs
 * immediately instead of waiting for a crawl. NOTE: Google does NOT
 * participate in IndexNow — Google discovery is driven by Search Console
 * (see .claude/docs/search-console-setup.md). This covers Bing & co.,
 * which matters because new domains often surface on Bing first.
 *
 * Key: the 32-hex key file must exist at the site root and be reachable at
 * https://solfegepro.com/<key>.txt (IndexNow verifies ownership that way).
 *
 * Usage: node tools/indexnow-submit.js [--dry]
 *   Reads the key from the *.txt key file at repo root (or INDEXNOW_KEY env).
 */
const fs = require('fs');
const https = require('https');

const HOST = 'solfegepro.com';
const ORIGIN = `https://${HOST}`;
const DRY = process.argv.includes('--dry');

function findKey() {
  if (process.env.INDEXNOW_KEY) return process.env.INDEXNOW_KEY.trim();
  const f = fs.readdirSync('.').find((n) => /^[0-9a-f]{32}\.txt$/.test(n));
  if (!f) throw new Error('IndexNow key file (<32hex>.txt) not found at repo root');
  return f.replace(/\.txt$/, '');
}

function sitemapUrls() {
  const xml = fs.readFileSync('sitemap.xml', 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

function postIndexNow(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      { method: 'POST', hostname: 'api.indexnow.org', path: '/indexnow',
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, body: d })); }
    );
    req.on('error', reject);
    req.write(body); req.end();
  });
}

(async () => {
  const key = findKey();
  const urlList = sitemapUrls();
  console.log(`IndexNow: ${urlList.length} URLs, key ${key.slice(0, 6)}…, keyLocation ${ORIGIN}/${key}.txt`);
  if (DRY) { console.log('--dry: not submitting. First 3:', urlList.slice(0, 3)); return; }
  const payload = { host: HOST, key, keyLocation: `${ORIGIN}/${key}.txt`, urlList };
  const r = await postIndexNow(payload);
  console.log(`IndexNow response: HTTP ${r.status} ${r.body || '(empty=accepted)'}`);
  // 200/202 = accepted. Non-2xx should fail CI so it's visible.
  if (r.status >= 300) process.exit(1);
})().catch((e) => { console.error('IndexNow submit failed:', e.message); process.exit(1); });
