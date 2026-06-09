#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

: "${DEGOV_DB_HOST:=localhost}"
: "${DEGOV_DB_PORT:=7432}"
: "${DEGOV_DB_NAME:=degov_datalens_main_latest}"
: "${DEGOV_DB_USER:=postgres}"
if [[ -z "${DEGOV_INDEXER_DATABASE_URL:-}" ]]; then
  if [[ -n "${DEGOV_DB_PASSWORD:-}" ]]; then
    export DEGOV_INDEXER_DATABASE_URL="postgresql://${DEGOV_DB_USER}:${DEGOV_DB_PASSWORD}@${DEGOV_DB_HOST}:${DEGOV_DB_PORT}/${DEGOV_DB_NAME}"
  else
    export DEGOV_INDEXER_DATABASE_URL="postgresql://${DEGOV_DB_USER}@${DEGOV_DB_HOST}:${DEGOV_DB_PORT}/${DEGOV_DB_NAME}"
  fi
fi

: "${DEGOV_INDEXER_GRAPHQL_BIND_ADDRESS:=0.0.0.0:8005}"
: "${DEGOV_INDEXER_GRAPHQL_PATH:=/graphql}"
: "${DEGOV_INDEXER_GRAPHQL_ENDPOINT:=http://127.0.0.1:8005${DEGOV_INDEXER_GRAPHQL_PATH}}"
: "${DEGOV_INDEXER_CONFIG_FILE:=apps/indexer/indexer.yml}"
: "${DEGOV_INDEXER_CONTRACT_SET_MODE:=all}"
: "${DEGOV_INDEXER_CONTRACT_SET_MAX_CONCURRENCY:=unlimited}"
: "${DEGOV_INDEXER_TARGET_HEIGHT:=latest}"
: "${DEGOV_INDEXER_RUN_ONCE:=false}"
: "${DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED:=true}"
: "${DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_ENABLED:=true}"
: "${RUST_LOG:=info}"
export DEGOV_INDEXER_GRAPHQL_BIND_ADDRESS
export DEGOV_INDEXER_GRAPHQL_ENDPOINT
export DEGOV_INDEXER_GRAPHQL_PATH
export DEGOV_INDEXER_CONFIG_FILE
export DEGOV_INDEXER_CONTRACT_SET_MODE
export DEGOV_INDEXER_CONTRACT_SET_MAX_CONCURRENCY
export DEGOV_INDEXER_TARGET_HEIGHT
export DEGOV_INDEXER_RUN_ONCE
export DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED
export DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_ENABLED
export RUST_LOG
LOG_DIR="$REPO_ROOT/.local/logs"
mkdir -p "$LOG_DIR"
DB_LOG_URL="$DEGOV_INDEXER_DATABASE_URL"
if [[ "$DB_LOG_URL" =~ ^([^:]+://[^:/@]+):[^@]+@(.*)$ ]]; then
  DB_LOG_URL="${BASH_REMATCH[1]}:****@${BASH_REMATCH[2]}"
fi
echo "combined runner starting at $(date -u +%Y-%m-%dT%H:%M:%SZ) commit=$(git rev-parse --short HEAD) db=${DB_LOG_URL} bind=${DEGOV_INDEXER_GRAPHQL_BIND_ADDRESS}" >> "$LOG_DIR/indexer-combined-main.log"
cleanup() {
  set +e
  echo "combined runner stopping at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG_DIR/indexer-combined-main.log"
  [[ -n "${GRAPHQL_PID:-}" ]] && kill "$GRAPHQL_PID" 2>/dev/null || true
  [[ -n "${INDEXER_PID:-}" ]] && kill "$INDEXER_PID" 2>/dev/null || true
  wait "$GRAPHQL_PID" 2>/dev/null || true
  wait "$INDEXER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
cargo run -p degov-datalens-indexer --locked -- graphql >> "$LOG_DIR/indexer-graphql-main.log" 2>&1 &
GRAPHQL_PID=$!
echo "graphql pid=$GRAPHQL_PID" >> "$LOG_DIR/indexer-combined-main.log"
sleep 3
cargo run -p degov-datalens-indexer --locked -- run >> "$LOG_DIR/indexer-sync-main.log" 2>&1 &
INDEXER_PID=$!
echo "indexer pid=$INDEXER_PID" >> "$LOG_DIR/indexer-combined-main.log"
wait -n "$GRAPHQL_PID" "$INDEXER_PID"
status=$?
echo "combined runner child exited at $(date -u +%Y-%m-%dT%H:%M:%SZ) status=$status graphql_pid=$GRAPHQL_PID indexer_pid=$INDEXER_PID" >> "$LOG_DIR/indexer-combined-main.log"
exit "$status"
