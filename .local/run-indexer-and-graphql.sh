#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
set -a
source .env
set +a
export DEGOV_INDEXER_DATABASE_URL="postgresql://postgres:password@localhost:7432/degov_datalens_main_latest"
export DEGOV_INDEXER_GRAPHQL_BIND_ADDRESS="0.0.0.0:8005"
export DEGOV_INDEXER_GRAPHQL_ENDPOINT="http://eu2.ncp.kahub.in:8005/graphql"
export DEGOV_INDEXER_GRAPHQL_PATH="/graphql"
export DEGOV_INDEXER_CONFIG_FILE="apps/indexer/indexer.yml"
export DEGOV_INDEXER_CONTRACT_SET_MODE="all"
export DEGOV_INDEXER_CONTRACT_SET_MAX_CONCURRENCY="unlimited"
export DEGOV_INDEXER_TARGET_HEIGHT="latest"
export DEGOV_INDEXER_RUN_ONCE="false"
export DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED="true"
export DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_ENABLED="true"
export RUST_LOG="info"
LOG_DIR="$REPO_ROOT/.local/logs"
mkdir -p "$LOG_DIR"
echo "combined runner starting at $(date -u +%Y-%m-%dT%H:%M:%SZ) commit=$(git rev-parse --short HEAD) db=${DEGOV_INDEXER_DATABASE_URL} bind=${DEGOV_INDEXER_GRAPHQL_BIND_ADDRESS}" >> "$LOG_DIR/indexer-combined-main.log"
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
