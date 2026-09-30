#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.."

WEB_GA_ID='G-R009HVF9CD'
APP_GA_ID='G-0364FGYZ1J'
ANALYTICS_ASSET_VERSION='4'
BOOTSTRAP_ASSET_VERSION='14'

if ! grep -Fq "var GA_ID = '${WEB_GA_ID}';" analytics.js; then
    echo "analytics.js must use the dedicated Web GA4 property: ${WEB_GA_ID}" >&2
    exit 1
fi

if grep -Fq "${APP_GA_ID}" analytics.js; then
    echo "analytics.js must never send website traffic to the iOS app property: ${APP_GA_ID}" >&2
    exit 1
fi

if ! grep -Fq "'analytics.js?v=${ANALYTICS_ASSET_VERSION}'" bootstrap.js; then
    echo "bootstrap.js must load analytics.js?v=${ANALYTICS_ASSET_VERSION}" >&2
    exit 1
fi

STALE_BOOTSTRAP_REFS=$(git grep -n 'bootstrap\.js?v=' -- '*.html' \
    | grep -v "bootstrap\.js?v=${BOOTSTRAP_ASSET_VERSION}" || true)
if [ -n "$STALE_BOOTSTRAP_REFS" ]; then
    echo "HTML files must load bootstrap.js?v=${BOOTSTRAP_ASSET_VERSION}:" >&2
    echo "$STALE_BOOTSTRAP_REFS" >&2
    exit 1
fi

echo "Web GA4 property isolation is valid."
