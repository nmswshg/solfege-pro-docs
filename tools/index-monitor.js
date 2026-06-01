#!/usr/bin/env node
/**
 * Indexation monitor — tracks how many of the site's URLs are (a) live &
 * crawlable, (b) indexed by Google, (c) indexed by Bing. Appends a dated
 * snapshot to tools/index-monitor.log so progress is visible over time.
 *
 * Google has no public "is this indexed" API without OAuth; we approximate
 * with the public `site:` query result count (best-effort, may be throttled
 * or imprecise). The authoritative source remains Google Search Console
 * (Pages report) — this script is a lightweight between-checks signal.
 *
 * Usage:
 *   node tools/index-monitor.js            # full run: liveness + site: counts
 *   node tools/index-monitor.js --live     # liveness only (fast, no scraping)
 */
const fs = require('fs');
const https = require('https');

const HOST = 'solfegepro.com';
const ORIGIN = `https://${HOST}`;
const LOG = 'tools/index-monitor.log';
const LIVE_ONLY = process.argv.includes('--live');

function get(url, headers = {}) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (indexation-monitor)', ...headers }, timeout: 15000 }, (res) => {
      // follow one redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(get(res.headers.location, headers));
      }
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }); });
  });
}

function sitemapUrls() {
  const xml = fs.readFileSync('sitemap.xml', 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function liveness(urls) {
  let ok = 0; const bad = [];
  // small concurrency
  const queue = [...urls];
  async function worker() {
    while (queue.length) {
      const u = queue.shift();
      const r = await get(u);
      if (r.status === 200) ok++; else bad.push(`${r.status} ${u}`);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  return { ok, total: urls.length, bad };
}

// Best-effort public index-count probes (no API key). Heuristic only.
//
// CRITICAL: a HTTP 200 here does NOT mean we saw real search results. Google
// serves a JS-gated interstitial ("enablejs") and both engines serve CAPTCHA
// pages with status 200. We must distinguish three states, never conflating
// "blocked/undeterminable" with "zero indexed":
//   indexed      — results page that actually mentions our host
//   none         — a real results page that says no results matched
//   undetermined — bot wall (captcha / JS interstitial); tells us nothing
// `mentionsSite` uses a bare-host match (results show "solfegepro.com/path"
// AND bare "solfegepro.com", so requiring a trailing slash missed real hits).
function classifySerp(body) {
  const blocked = /enablejs|unusual traffic|\/sorry\/|captcha|recaptcha/i.test(body);
  const noResults = /did not match any documents|no results found|没有找到|に一致する情報は見つかりません/i.test(body);
  // The query "site:HOST" is echoed verbatim on every SERP, so a bare host
  // match alone is NOT proof of indexation. Only trust mentionsSite as an
  // "indexed" signal when the page is a REAL results page (no bot wall). When a
  // captcha/JS interstitial is present, the host substring is just the echoed
  // query — report undetermined and defer to Search Console (diagnosis-discipline:
  // never present an unverifiable guess as a fact).
  const mentionsSite = new RegExp(`\\b${HOST.replace(/\./g, '\\.')}\\b`).test(body);
  let verdict;
  if (blocked) verdict = 'undetermined';        // bot wall — host match is unreliable
  else if (mentionsSite) verdict = 'indexed';   // real SERP that shows our host
  else if (noResults) verdict = 'none';         // real SERP, explicitly empty
  else verdict = 'undetermined';                // unrecognized layout
  return { mentionsSite, blocked, noResults, verdict };
}

async function googleSiteCount() {
  const r = await get(`https://www.google.com/search?q=site:${HOST}&num=20`);
  if (r.status !== 200) return { status: r.status, verdict: 'undetermined', note: 'non-200 (blocked/throttled, expected without API)' };
  const m = r.body.match(/約?\s*([\d,]+)\s*件/) || r.body.match(/About ([\d,]+) results/);
  return { status: 200, approxResults: m ? m[1] : 'unknown', ...classifySerp(r.body) };
}
async function bingSiteCount() {
  const r = await get(`https://www.bing.com/search?q=site%3A${HOST}&count=20`);
  if (r.status !== 200) return { status: r.status, verdict: 'undetermined', note: 'non-200 (blocked)' };
  const m = r.body.match(/([\d,]+)\s*件の結果/) || r.body.match(/([\d,]+) results/);
  return { status: 200, approxResults: m ? m[1] : 'unknown', ...classifySerp(r.body) };
}

(async () => {
  const stamp = new Date().toISOString();
  const urls = sitemapUrls();
  const live = await liveness(urls);
  let google = null, bing = null;
  if (!LIVE_ONLY) { google = await googleSiteCount(); bing = await bingSiteCount(); }

  const line = JSON.stringify({ stamp, sitemapUrls: urls.length, live: { ok: live.ok, total: live.total }, google, bing });
  fs.appendFileSync(LOG, line + '\n');

  console.log(`[${stamp}]`);
  console.log(`  sitemap URLs: ${urls.length}`);
  console.log(`  live & crawlable (HTTP 200): ${live.ok}/${live.total}`);
  if (live.bad.length) console.log(`  NOT 200 (${live.bad.length}): ${live.bad.slice(0, 10).join(', ')}${live.bad.length > 10 ? ' …' : ''}`);
  if (google) console.log(`  Google site:: ${google.verdict}${google.verdict === 'undetermined' ? ' (bot wall — NOT a zero-index signal; use Search Console)' : ''} ${JSON.stringify(google)}`);
  if (bing) console.log(`  Bing site::   ${bing.verdict} ${JSON.stringify(bing)}`);
  console.log(`  (appended to ${LOG})`);
})();
