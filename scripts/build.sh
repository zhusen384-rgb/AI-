#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

echo "========================================"
echo "Starting build process..."
echo "Time: $(date)"
echo "========================================"

echo "Step 1: Installing dependencies..."
corepack pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel=warn

echo "Step 2: Cleaning previous build..."
rm -rf .next/standalone 2>/dev/null || true

echo "Step 3: Building the project..."
corepack pnpm exec next build

echo "========================================"
echo "Build completed successfully!"
echo "Time: $(date)"
echo "========================================"
