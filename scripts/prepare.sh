#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

# 安装系统依赖（poppler-utils 用于 PDF 解析）
echo "Checking system dependencies..."
if ! command -v pdftotext &> /dev/null; then
  echo "Installing poppler-utils for PDF parsing..."
  apt-get update -qq && apt-get install -y -qq poppler-utils 2>/dev/null || echo "Warning: Could not install poppler-utils"
fi

echo "Installing dependencies..."
# 跳过 puppeteer Chromium 下载（约 130MB），避免阻塞启动
# 如需使用 puppeteer，可手动安装 Chromium 或设置 PUPPETEER_EXECUTABLE_PATH
export PUPPETEER_SKIP_DOWNLOAD=true
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
pnpm install --prefer-frozen-lockfile --prefer-offline
