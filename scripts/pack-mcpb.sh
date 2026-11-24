#!/usr/bin/env bash
# Arma la extensión de Claude Desktop (sii-boletas.mcpb) con solo lo necesario.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
rm -rf .mcpb-build && mkdir .mcpb-build
cp -r dist manifest.json package.json package-lock.json README.md LICENSE icon.png .mcpb-build/ 2>/dev/null || true
(cd .mcpb-build && npm ci --omit=dev --ignore-scripts --silent)
./node_modules/.bin/mcpb pack .mcpb-build sii-boletas.mcpb
rm -rf .mcpb-build
