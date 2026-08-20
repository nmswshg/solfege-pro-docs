#!/usr/bin/env python3

import json
import os
import re
import sys
from pathlib import Path

from argostranslate import translate


if len(sys.argv) != 4:
    raise SystemExit("Usage: translate-pages-argos.py <source lang key> <Argos target code> <output path>")

LANG_KEY, TARGET_CODE, OUTPUT_PATH = sys.argv[1:]
SOURCE_PATH = Path("data/translation-source.json")
LEGAL_PATH = Path("data/legal-page-translations.json")
CACHE_PATH = Path(f"/private/tmp/solfege-argos-cache-{LANG_KEY}.json")

IMMUTABLE_RE = re.compile(
    r"(<[^>]+>|https?://[^\s<\"]+|"
    r"Solfege PRO|App Store|Google Play|Firebase Analytics|Firebase Crashlytics|"
    r"Google Forms|Apple Account|Google Account|Restore Purchases|"
    r"`[^`]+`|\{\{[^}]+\}\}|\{[^}\n]+\}|"
    r"\b(?:BPM|DTM|MIDI|OS|iOS|Android|FAQ|PRO)\b)"
)


def load_json(path):
    with path.open(encoding="utf-8") as file:
        return json.load(file)


source = load_json(SOURCE_PATH)
legal = load_json(LEGAL_PATH)
cache = load_json(CACHE_PATH) if CACHE_PATH.exists() else {"strings": {}, "segments": {}}
string_cache = cache.setdefault("strings", {})
segment_cache = cache.setdefault("segments", {})
translator = translate.get_translation_from_codes("en", TARGET_CODE)
if translator is None:
    raise RuntimeError(f"Argos model en->{TARGET_CODE} is not installed")


def translate_segment(segment):
    if segment in segment_cache:
        return segment_cache[segment]
    if not re.search(r"[A-Za-z]", segment):
        return segment
    leading = segment[: len(segment) - len(segment.lstrip())]
    trailing = segment[len(segment.rstrip()) :]
    core_end = len(segment) - len(trailing) if trailing else len(segment)
    core = segment[len(leading) : core_end]
    if not core:
        return segment
    translated = segment_cache.get(core)
    if translated is None:
        translated = translator.translate(core)
        segment_cache[core] = translated
    result = f"{leading}{translated}{trailing}"
    segment_cache[segment] = result
    return result


def translate_value(value):
    if not value or value in string_cache:
        return string_cache.get(value, value)
    parts = IMMUTABLE_RE.split(value)
    translated = "".join(
        part if index % 2 else translate_segment(part)
        for index, part in enumerate(parts)
    )
    string_cache[value] = translated
    return translated


def seed_legal():
    for source_path in ("terms.html", "privacy.html"):
        source_page = source["pages"].get(source_path)
        translated_page = legal.get(LANG_KEY, {}).get(source_path)
        if not source_page or not translated_page:
            continue
        for original, localized in zip(source_page["spans"], translated_page["spans"]):
            string_cache[original] = localized
        if source_page.get("title") and translated_page.get("title"):
            string_cache[source_page["title"]] = translated_page["title"]
        if source_page.get("description") and translated_page.get("description"):
            string_cache[source_page["description"]] = translated_page["description"]


def write_cache():
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


seed_legal()
all_values = []
for page in source["pages"].values():
    all_values.extend(page["spans"])
    all_values.extend(page.get("mermaid", []))
    all_values.extend(page.get("script", []))
    all_values.extend((page.get("title", ""), page.get("description", "")))
pending = list(dict.fromkeys(value for value in all_values if value and value not in string_cache))
print(f"[{LANG_KEY}] {len(pending)} unique strings pending with Argos en->{TARGET_CODE}.", flush=True)

segment_cores = []
for value in pending:
    for index, segment in enumerate(IMMUTABLE_RE.split(value)):
        if index % 2 or not re.search(r"[A-Za-z]", segment):
            continue
        leading = segment[: len(segment) - len(segment.lstrip())]
        trailing = segment[len(segment.rstrip()) :]
        core_end = len(segment) - len(trailing) if trailing else len(segment)
        core = segment[len(leading) : core_end]
        if core and core not in segment_cache:
            segment_cores.append(core)
segment_cores = list(dict.fromkeys(segment_cores))

BATCH_SIZE = 32
batches = [segment_cores[index : index + BATCH_SIZE] for index in range(0, len(segment_cores), BATCH_SIZE)]
print(f"[{LANG_KEY}] {len(segment_cores)} text segments in {len(batches)} batches.", flush=True)
for batch_index, batch in enumerate(batches, start=1):
    joined = "\n\n".join(batch)
    translated_parts = translator.translate(joined).split("\n\n")
    if len(translated_parts) != len(batch):
        translated_parts = [translator.translate(core) for core in batch]
    for core, translated in zip(batch, translated_parts):
        segment_cache[core] = translated
    if batch_index % 5 == 0 or batch_index == len(batches):
        write_cache()
        print(f"[{LANG_KEY}] batch {batch_index}/{len(batches)}", flush=True)

for value in pending:
    translate_value(value)
write_cache()

pages = {}
for source_path, page in source["pages"].items():
    pages[source_path] = {
        "spans": [string_cache[value] for value in page["spans"]],
        "mermaid": [string_cache[value] for value in page.get("mermaid", [])],
        "script": [string_cache[value] for value in page.get("script", [])],
        "title": string_cache.get(page.get("title", ""), ""),
        "description": string_cache.get(page.get("description", ""), ""),
    }

Path(OUTPUT_PATH).write_text(
    json.dumps({"pages": pages}, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print(f"Wrote {OUTPUT_PATH}", flush=True)
