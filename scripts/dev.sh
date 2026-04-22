#!/bin/bash
set -Eeuo pipefail

PORT=3000
COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
NODE_ENV=development
DEPLOY_RUN_PORT=3000
HOST="${DEV_HOST:-0.0.0.0}"

detect_lan_ip() {
    local candidate

    if command -v ipconfig >/dev/null 2>&1; then
      for interface in en0 en1 en2 en3; do
        candidate=$(ipconfig getifaddr "${interface}" 2>/dev/null || true)
        if [[ -n "${candidate}" ]]; then
          echo "${candidate}"
          return
        fi
      done
    fi

    if command -v ifconfig >/dev/null 2>&1; then
      candidate=$(ifconfig | awk '/inet ([0-9]+\.){3}[0-9]+/ && $2 != "127.0.0.1" { print $2; exit }')
      if [[ -n "${candidate}" ]]; then
        echo "${candidate}"
        return
      fi
    fi
}

LAN_IP="$(detect_lan_ip || true)"
if [[ -n "${LAN_IP}" ]]; then
    export APP_BASE_URL="${APP_BASE_URL:-http://${LAN_IP}:${PORT}}"
    export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-http://${LAN_IP}:${PORT}}"
fi

cd "${COZE_WORKSPACE_PATH}"

kill_port_if_listening() {
    local pids

    if command -v ss >/dev/null 2>&1; then
      pids=$(ss -H -lntp 2>/dev/null | awk -v port="${DEPLOY_RUN_PORT}" '$4 ~ ":"port"$"' | grep -o 'pid=[0-9]*' | cut -d= -f2 | paste -sd' ' - || true)
    elif command -v lsof >/dev/null 2>&1; then
      pids=$(lsof -tiTCP:"${DEPLOY_RUN_PORT}" -sTCP:LISTEN 2>/dev/null | paste -sd' ' - || true)
    else
      pids=""
    fi

    if [[ -z "${pids}" ]]; then
      echo "Port ${DEPLOY_RUN_PORT} is free."
      return
    fi
    echo "Port ${DEPLOY_RUN_PORT} in use by PIDs: ${pids} (SIGKILL)"
    echo "${pids}" | xargs -I {} kill -9 {}
    sleep 1

    if command -v ss >/dev/null 2>&1; then
      pids=$(ss -H -lntp 2>/dev/null | awk -v port="${DEPLOY_RUN_PORT}" '$4 ~ ":"port"$"' | grep -o 'pid=[0-9]*' | cut -d= -f2 | paste -sd' ' - || true)
    elif command -v lsof >/dev/null 2>&1; then
      pids=$(lsof -tiTCP:"${DEPLOY_RUN_PORT}" -sTCP:LISTEN 2>/dev/null | paste -sd' ' - || true)
    else
      pids=""
    fi

    if [[ -n "${pids}" ]]; then
      echo "Warning: port ${DEPLOY_RUN_PORT} still busy after SIGKILL, PIDs: ${pids}"
    else
      echo "Port ${DEPLOY_RUN_PORT} cleared."
    fi
}

cleanup_stale_next_lock() {
    local lock_file
    lock_file="${COZE_WORKSPACE_PATH}/.next/dev/lock"
    if [[ -f "${lock_file}" ]]; then
      echo "Removing stale Next dev lock: ${lock_file}"
      rm -f "${lock_file}"
    fi
}

echo "Clearing port ${PORT} before start."
kill_port_if_listening
cleanup_stale_next_lock
echo "Starting HTTP service on ${HOST}:${PORT} for dev..."
echo "Open http://${HOST}:${PORT} in your browser."

# Next 16 默认 dev 可能走 Turbopack，这个项目当前会触发反复刷新/崩溃；
# 开发模式显式切到 webpack，优先保证本地页面稳定可打开。
node_modules/.bin/next dev --webpack -H "${HOST}" -p "${PORT}"
