#!/usr/bin/env bash
#
# Static responsive-layout linter.
#
# Catches the Hard rules from CLAUDE.md before they reach commit:
#   - Rule 2: min-width > 280px inside .article-body style scope
#   - Rule 3: overflow-x: auto
#   - Rule 7: duplicate @media (max-width: N) rules for the same selector
#            with different N values (the dead-zone trap)
#
# Runs in well under 1s — safe for pre-commit. Failure aborts commit.
#
# Skip with: SKIP_LAYOUT_CHECK=1 git commit ...
# (Only use the skip switch if you've manually verified the change is OK.)

set -euo pipefail

if [ "${SKIP_LAYOUT_CHECK:-0}" = "1" ]; then
    echo "[check-responsive-css] SKIP_LAYOUT_CHECK=1 — skipping (you'd better know what you're doing)"
    exit 0
fi

cd "$(dirname "$0")/.."

EXIT=0

# Files to scan: every .css and every .html with an inline <style>.
# (macOS ships bash 3.2 — no mapfile; use process substitution + IFS.)
CSS_FILES=()
while IFS= read -r f; do
    CSS_FILES+=("$f")
done < <(find . -type f \( -name '*.css' -o -name '*.html' \) \
    -not -path './node_modules/*' \
    -not -path './playwright-report/*' \
    -not -path './test-results/*' \
    -not -path './.git/*')

red()    { printf '\033[31m%s\033[0m\n' "$1"; }
yellow() { printf '\033[33m%s\033[0m\n' "$1"; }
green()  { printf '\033[32m%s\033[0m\n' "$1"; }

# ---------------------------------------------------------------
# Check 1: overflow-x: auto (Rule 3)
# ---------------------------------------------------------------
# Lines tagged with /* lint-skip: <reason> */ are allowed — used for
# data tables, SVG containers, and monospace ASCII bars where horizontal
# overflow is intrinsic and grid-ification doesn't apply.
echo "[1/3] Checking for 'overflow-x: auto' (Hard rule #3)..."
HITS=$(grep -nE 'overflow-x[[:space:]]*:[[:space:]]*auto' "${CSS_FILES[@]}" 2>/dev/null \
    | grep -v 'lint-skip:' || true)
if [ -n "$HITS" ]; then
    red "  FAIL: overflow-x: auto is a symptom workaround, not a fix."
    echo "$HITS" | sed 's/^/    /'
    echo ""
    echo "  → Fix the underlying width problem (use grid-template-columns"
    echo "    with minmax(0, 1fr) and remove fixed-pixel widths)."
    echo "  → See: .claude/rules/responsive-layout-discipline.md"
    EXIT=1
else
    green "  OK"
fi

# ---------------------------------------------------------------
# Check 2: min-width > 280px (Rule 2)
# ---------------------------------------------------------------
echo "[2/3] Checking for 'min-width' > 280px (Hard rule #2)..."
# Portable: pipe each match line through sed to extract the numeric value,
# then python (always present on macOS) for the threshold compare.
# `min-width:` is also valid INSIDE @media queries (different meaning —
# specifies the viewport breakpoint, not an element constraint). Exclude
# those by skipping lines starting with @media.
HITS=$(grep -nEH 'min-width[[:space:]]*:[[:space:]]*[0-9]+px' "${CSS_FILES[@]}" 2>/dev/null \
    | python3 -c '
import sys, re
pat = re.compile(r"min-width\s*:\s*(\d+)px")
for line in sys.stdin:
    # Skip @media queries — min-width there is a viewport breakpoint.
    if re.search(r"@\s*media", line):
        continue
    # Skip lint-skip waivers.
    if "lint-skip:" in line:
        continue
    m = pat.search(line)
    if m and int(m.group(1)) > 280:
        sys.stdout.write(line.rstrip() + f"  [{m.group(1)}px]\n")
' || true)
if [ -n "$HITS" ]; then
    red "  FAIL: min-width > 280px inside an article-body context overflows the column."
    echo "$HITS" | sed 's/^/    /'
    echo ""
    echo "  → The article column is ~720px max. Cells that demand more than"
    echo "    ~40% of that force the whole row to overflow."
    echo "  → Use grid-template-columns with minmax(0, 1fr) and let cells shrink."
    echo "  → See: .claude/rules/responsive-layout-discipline.md"
    EXIT=1
else
    green "  OK"
fi

# ---------------------------------------------------------------
# Check 3: Duplicate @media (max-width: N) breakpoints (Rule 7)
# ---------------------------------------------------------------
# Detect when one file uses ≥ 2 distinct max-width breakpoints in the
# 700-780px range — that's the dead-zone signature. Same breakpoint
# repeated is fine (multiple rule blocks at the same N).
echo "[3/3] Checking for conflicting @media breakpoints in 700-780px range (Hard rule #7)..."
DEAD_ZONE_HITS=""
for f in "${CSS_FILES[@]}"; do
    BPS=$(grep -oE '@media[[:space:]]*\([[:space:]]*max-width[[:space:]]*:[[:space:]]*7[0-8][0-9]px' "$f" 2>/dev/null \
        | grep -oE '7[0-8][0-9]' \
        | sort -u || true)
    COUNT=$(echo "$BPS" | grep -c . || true)
    if [ "$COUNT" -ge 2 ]; then
        DEAD_ZONE_HITS="${DEAD_ZONE_HITS}${f}: breakpoints=$(echo $BPS | tr '\n' ' ')\n"
    fi
done
if [ -n "$DEAD_ZONE_HITS" ]; then
    red "  FAIL: file has multiple max-width breakpoints in the 700-780px window."
    printf "%b" "$DEAD_ZONE_HITS" | sed 's/^/    /'
    echo ""
    echo "  → Distinct breakpoints in this window create dead zones where one"
    echo "    rule applies but the other doesn't (e.g. flex-direction: column"
    echo "    at 768 but arrow ↓ flip at 760 → 761-768px is broken)."
    echo "  → Pick ONE breakpoint and align all related rules to it."
    echo "  → See: .claude/rules/responsive-layout-discipline.md"
    EXIT=1
else
    green "  OK"
fi

echo ""
if [ "$EXIT" -eq 0 ]; then
    green "[check-responsive-css] All checks passed."
else
    red "[check-responsive-css] FAILED — fix the issues above before committing."
    echo "(Emergency override: SKIP_LAYOUT_CHECK=1 git commit ...)"
fi

exit "$EXIT"
