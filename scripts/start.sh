#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
PORT=3000
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-$PORT}"
HOST="${HOST:-0.0.0.0}"

start_service() {
    cd "${COZE_WORKSPACE_PATH}"
    echo "Starting HTTP service on ${HOST}:${DEPLOY_RUN_PORT} for deploy..."
    npx next start --hostname "${HOST}" --port "${DEPLOY_RUN_PORT}"
}

echo "Starting HTTP service on ${HOST}:${DEPLOY_RUN_PORT} for deploy..."
start_service
