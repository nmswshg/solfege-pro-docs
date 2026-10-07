#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.."

WEB_GA_ID='G-R009HVF9CD'
APP_GA_ID='G-0364FGYZ1J'
ANALYTICS_ASSET_VERSION='5'
BOOTSTRAP_ASSET_VERSION='15'

if ! grep -Fq "var GA_ID = '${WEB_GA_ID}';" analytics.js; then
    echo "analytics.js must use the dedicated Web GA4 property: ${WEB_GA_ID}" >&2
    exit 1
fi

# Check every tracked HTML/JavaScript file that can introduce another tag,
# including source templates. Tests and build tools may name the forbidden
# ID to verify this guard, but must not count as website instrumentation.
APP_PROPERTY_REFS=$(git grep -n -F "${APP_GA_ID}" -- '*.html' '*.js' \
    ':!tests/**' ':!tools/**' || true)
if [ -n "$APP_PROPERTY_REFS" ]; then
    echo "Website HTML/JavaScript must never reference the iOS app property: ${APP_GA_ID}" >&2
    echo "$APP_PROPERTY_REFS" >&2
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
