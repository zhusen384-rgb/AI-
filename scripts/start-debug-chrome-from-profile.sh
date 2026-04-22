#!/usr/bin/env bash
set -euo pipefail

CHROME_APP="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SOURCE_ROOT="${HOME}/Library/Application Support/Google/Chrome"
PROFILE_NAME="${1:-Default}"
DEBUG_PORT="${AUTO_GREETING_DEBUG_PORT:-9222}"
TMP_DIR="$(mktemp -d /tmp/auto-greeting-chrome.XXXXXX)"
LOG_PATH="/tmp/auto-greeting-chrome-debug.log"

if [[ ! -x "${CHROME_APP}" ]]; then
  echo "Chrome binary not found: ${CHROME_APP}" >&2
  exit 1
fi

if [[ ! -d "${SOURCE_ROOT}/${PROFILE_NAME}" ]]; then
  echo "Chrome profile not found: ${SOURCE_ROOT}/${PROFILE_NAME}" >&2
  exit 1
fi

cp -R "${SOURCE_ROOT}/${PROFILE_NAME}" "${TMP_DIR}/${PROFILE_NAME}"
cp "${SOURCE_ROOT}/Local State" "${TMP_DIR}/Local State"

if [[ "$(uname -s)" == "Darwin" ]]; then
  open -na "Google Chrome" --args \
    --remote-debugging-port="${DEBUG_PORT}" \
    --user-data-dir="${TMP_DIR}" \
    --profile-directory="${PROFILE_NAME}"
else
  nohup "${CHROME_APP}" \
    --remote-debugging-port="${DEBUG_PORT}" \
    --user-data-dir="${TMP_DIR}" \
    --profile-directory="${PROFILE_NAME}" \
    >"${LOG_PATH}" 2>&1 &
fi

echo "PROFILE_COPY_DIR=${TMP_DIR}"
echo "DEBUG_PORT=${DEBUG_PORT}"
echo "LOG_PATH=${LOG_PATH}"
