#!/usr/bin/env python3
"""
Find non-target-lang text leaking into language-specific output HTML.

For each output file (ja, en, fr, de), scan the visible body text and flag
substantial blocks of "other-language" content. Allowed exceptions:
- Academic citations / book titles (in <em>, <cite>, <i>)
- Brand names (Solfege PRO)
- Music notation (T/SD/D, I-IV-V, Major7, BPM, Hz)
- URL / domain references
- code, pre blocks
- attribute values (e.g. data-title-X, lang=, alt=, content=)
"""
import os, re, json
from collections import defaultdict

# Resolve repo root from this script's location (tools/<this>.py → ..).
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Detect substantial blocks of each language in body text
# Japanese: Hiragana (U+3040-309F), Katakana (U+30A0-30FF), CJK Unified (U+4E00-9FFF)
JA_RE = re.compile(r'[぀-ゟ゠-ヿ一-鿿]')

# French diacritics + common French words
FR_INDICATORS = re.compile(r"\b(le|la|les|de|du|des|un|une|pour|avec|dans|sur|est|sont|ce|cette|ces|votre|vous|nous|qui|que|comment|plus|aux?|et|ou|à|été|être|peut|faire|comme|sans|chaque|fonction|reconnaissance|gamme|accord|intervalle|écoute|entraînement|exercice|niveau|méthode|musique|musical|musicien|jouer|écouter|entendre|comprendre|apprendre|développer|améliorer)\b", re.I)
DIACRITICS_FR = re.compile(r"[àâäéèêëîïôöùûüÿç]")

# German typical words
DE_INDICATORS = re.compile(r"\b(der|die|das|den|dem|des|ein|eine|einen|für|mit|von|zu|auf|und|oder|aber|wenn|als|wird|sind|ist|war|wurde|werden|hat|haben|sich|sein|seinem|ihrem|ihren|noch|nicht|kann|können|ohne|über|unter|durch|nach|vor|bei|aus|nur|auch|schon|sehr|so|wie|was|wer|warum|jedoch|jeder|jede|jedes|alle|deine|deinen|du|wir|Sie|Akkord|Intervall|Skala|Übung|Übungen|Klavier|Gitarre|Schlagzeug|Gesang|Erkennung|Hören|Funktion|Tonart|Stufe|Forschung|Methode|Stunde|Minute|Woche|Monat|Jahr)\b", re.I)
UMLAUTS = re.compile(r"[äöüÄÖÜß]")

# Substantial English: looking for stretches of pure ASCII letter content
# that aren't single words / technical terms
EN_RUN_RE = re.compile(r"(?:[A-Za-z]+[ ]){5,}[A-Za-z]+")  # 6+ consecutive English words

# Whitelist patterns — these CAN appear in ja pages legitimately
WHITELIST_INLINE = [
    r"Solfege PRO", r"SolfègePRO",
    r"\b[A-Z]{2,4}\b",  # acronyms (BPM, DTM, DAW, etc.)
    r"\b[IVX]{1,5}\b",  # Roman numerals (I, IV, V, vii, etc.)
    r"\bMajor\b", r"\bMinor\b",
    r"\bT/SD/D\b", r"\bSD\b", r"\bD\b",
    r"\bm\d+\b", r"\bM\d+\b",  # m3, M7 intervals
    r"\b\d+st\b", r"\b\d+nd\b", r"\b\d+rd\b", r"\b\d+th\b",
    r"\b[A-G][#b]?\b",  # chord roots
    r"\bM/Hz\b", r"\bHz\b",
]
WHITELIST_RE = re.compile('|'.join(WHITELIST_INLINE))

# Strip script, style, code, pre, em, cite, i — those can contain other-lang text legitimately
SCRIPT_RE = re.compile(r'<(script|style|code|pre|em|cite|i|noscript)\b[^>]*>.*?</\1>', re.S | re.I)
TAG_RE = re.compile(r'<[^>]+>')
# Strip mermaid containers — they contain multi-lang on purpose, CSS hides non-active
MERMAID_RE = re.compile(r'<div\s+class="mermaid-lang"\s+lang="(?!ja\b)[a-z]+"[^>]*>.*?</div>', re.S | re.I)

def visible_text(html, target_lang):
    """Extract visible body text after stripping known multi-lang containers."""
    # Drop <head>
    body_m = re.search(r'<body[^>]*>(.*?)</body>', html, re.S | re.I)
    text = body_m.group(1) if body_m else html
    # Drop mermaid-lang blocks for OTHER langs
    text = re.sub(
        r'<div\s+class="mermaid-lang"\s+lang="(?!' + target_lang + r'\b)[a-z]+"[^>]*>.*?</div>',
        '', text, flags=re.S | re.I)
    # Drop script, style, code, pre, em, cite, i, noscript
    text = SCRIPT_RE.sub('', text)
    # Drop all tags
    text = TAG_RE.sub(' ', text)
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def find_outputs():
    """List all output HTML files grouped by target lang."""
    outputs = {'ja': [], 'en': [], 'fr': [], 'de': []}
    SKIP_DIRS = {'src', 'node_modules', '.git', '.claude', '.githooks', '.idea',
                 'data', 'tools', 'tests', 'assets', 'fastlane', 'test-results',
                 'playwright-report', '.tools', '.agents', '.bundle', '.github'}
    for root, dirs, files in os.walk(REPO):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in files:
            if not fn.endswith('.html'):
                continue
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, REPO)
            # Determine lang from path
            parts = rel.split(os.sep)
            if parts[0] in ('en', 'fr', 'de'):
                lang = parts[0]
            elif fn == 'index.html' or fn.endswith('/index.html') or '/' not in rel:
                lang = 'ja'
            else:
                # Top-level .html (404.html, or old-scheme stubs)
                continue
            # Skip redirect stubs (these are short and have "Redirecting" title)
            with open(full) as f:
                first_2k = f.read(2000)
            if 'meta http-equiv="refresh"' in first_2k and 'Redirecting' in first_2k:
                continue
            outputs[lang].append(rel)
    return outputs

def scan_lang_purity(target_lang, files):
    """Scan each file for substantial wrong-lang content."""
    findings = []
    for rel in files:
        with open(os.path.join(REPO, rel)) as f:
            html = f.read()
        text = visible_text(html, target_lang)
        # Apply whitelist (replace whitelisted patterns with placeholders)
        scanned = WHITELIST_RE.sub('', text)

        if target_lang == 'ja':
            # Look for runs of 6+ consecutive ASCII English words
            en_runs = EN_RUN_RE.findall(scanned)
            for run in en_runs:
                # Skip if mostly numbers/symbols
                if len(re.findall(r'[A-Za-z]', run)) < 20:
                    continue
                findings.append((rel, 'EN-in-ja', run[:120]))
            # French diacritics shouldn't appear in JA at all
            fr_hits = DIACRITICS_FR.findall(scanned)
            if len(fr_hits) > 3:
                # Find a sample chunk
                m = re.search(r'.{0,80}[àâäéèêëîïôöùûüÿç].{0,80}', scanned)
                if m:
                    findings.append((rel, 'FR-diacritics-in-ja', m.group(0)[:160]))
            # German umlauts
            de_hits = UMLAUTS.findall(scanned)
            if len(de_hits) > 3:
                m = re.search(r'.{0,80}[äöüÄÖÜß].{0,80}', scanned)
                if m:
                    findings.append((rel, 'DE-umlauts-in-ja', m.group(0)[:160]))

        elif target_lang == 'en':
            # JA chars shouldn't appear in EN body
            ja_hits = JA_RE.findall(scanned)
            if len(ja_hits) > 5:  # threshold for "substantial"
                m = re.search(r'.{0,80}[぀-ゟ゠-ヿ一-鿿].{0,80}', scanned)
                if m:
                    findings.append((rel, 'JA-in-en', m.group(0)[:160]))
            # FR diacritics
            fr_hits = DIACRITICS_FR.findall(scanned)
            if len(fr_hits) > 5:
                m = re.search(r'.{0,80}[àâäéèêëîïôöùûüÿç].{0,80}', scanned)
                if m:
                    findings.append((rel, 'FR-in-en', m.group(0)[:160]))

        elif target_lang == 'fr':
            ja_hits = JA_RE.findall(scanned)
            if len(ja_hits) > 5:
                m = re.search(r'.{0,80}[぀-ゟ゠-ヿ一-鿿].{0,80}', scanned)
                if m:
                    findings.append((rel, 'JA-in-fr', m.group(0)[:160]))
            # English: stretches of pure English (no French)
            # Hard to detect since French uses Latin alphabet. Skip for now.

        elif target_lang == 'de':
            ja_hits = JA_RE.findall(scanned)
            if len(ja_hits) > 5:
                m = re.search(r'.{0,80}[぀-ゟ゠-ヿ一-鿿].{0,80}', scanned)
                if m:
                    findings.append((rel, 'JA-in-de', m.group(0)[:160]))

    return findings

outputs = find_outputs()
print(f"Discovered: ja={len(outputs['ja'])} en={len(outputs['en'])} fr={len(outputs['fr'])} de={len(outputs['de'])}")
print()

all_findings = {}
for lang in ['ja', 'en', 'fr', 'de']:
    findings = scan_lang_purity(lang, outputs[lang])
    all_findings[lang] = findings
    print(f"=== {lang.upper()} outputs: {len(findings)} finding(s) ===")
    # Group by file
    by_file = defaultdict(list)
    for rel, kind, snippet in findings:
        by_file[rel].append((kind, snippet))
    for rel, items in sorted(by_file.items())[:10]:  # show first 10 files
        print(f"\n  {rel}:")
        for kind, snippet in items[:3]:  # first 3 findings per file
            print(f"    [{kind}] {snippet}")
        if len(items) > 3:
            print(f"    ... and {len(items)-3} more in this file")
    if len(by_file) > 10:
        print(f"\n  ... and {len(by_file)-10} more files with findings")
    print()
