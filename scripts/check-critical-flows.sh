#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/4] TypeScript type check"
corepack pnpm exec tsc -p tsconfig.json --noEmit

echo "[2/4] Verifying unified resume parsing chain"
rg -q "extractContactInfoFromText" src/app/api/resume/extract/route.ts
rg -q "extractContactInfoFromText" src/app/api/resume-parse-tasks/route.ts
rg -q "storeResumeFile" src/app/api/candidates/reparse-resume/route.ts
rg -q "extractResumeFromBuffer" src/app/api/candidates/reparse-resume/route.ts
rg -q "parseResumeContent" src/app/api/candidates/reparse-resume/route.ts
rg -q "name: contactInfo.name || prev.name" src/app/candidates/page.tsx
rg -q "phone: contactInfo.phone || prev.phone" src/app/candidates/page.tsx
rg -q "email: contactInfo.email || prev.email" src/app/candidates/page.tsx
rg -q "const patchNewCandidate" src/app/candidates/page.tsx

echo "[3/4] Linting critical files"
corepack pnpm exec eslint \
  src/lib/server-base-url.ts \
  src/lib/resume-contact-info.ts \
  src/app/api/resume/extract/route.ts \
  src/app/api/resume/parse/route.ts \
  src/app/api/resume-parse-tasks/route.ts \
  src/app/api/candidates/reparse-resume/route.ts \
  src/app/candidates/page.tsx \
  src/app/api/full-ai-interview/background-process/route.ts

echo "[4/4] Verifying server-side internal request base URL helper"
rg -q "getServerBaseUrl" src/app/api/full-ai-interview/background-process/route.ts
rg -q "getServerBaseUrl" src/app/api/candidates/reparse-resume/route.ts

echo "Critical flow checks passed."
