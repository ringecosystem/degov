#!/bin/sh

set -eu

if [ "${1:-}" = "" ] || [ "${2:-}" = "" ] || [ "${3:-}" = "" ]; then
  echo "usage: $0 <degov-config-path> <start-block> <end-block> [force]" >&2
  exit 1
fi

CONFIG_PATH="$1"
START_BLOCK="$2"
END_BLOCK="$3"
RESET_MODE="${4:-}"

case "$START_BLOCK" in
  ''|*[!0-9]*)
    echo "start-block must be a non-negative integer" >&2
    exit 1
    ;;
esac

case "$END_BLOCK" in
  ''|*[!0-9]*)
    echo "end-block must be a non-negative integer" >&2
    exit 1
    ;;
esac

BIN_PATH=$(cd "$(dirname "$0")"; pwd -P)
WORK_PATH="${BIN_PATH}/.."

export DEGOV_CONFIG_PATH="$CONFIG_PATH"
export DEGOV_INDEXER_START_BLOCK="$START_BLOCK"
export DEGOV_INDEXER_END_BLOCK="$END_BLOCK"
export DEGOV_INDEXER_VERBOSE_LOGS="${DEGOV_INDEXER_VERBOSE_LOGS:-true}"

echo "Local verify range"
echo "  config: ${DEGOV_CONFIG_PATH}"
echo "  start:  ${DEGOV_INDEXER_START_BLOCK}"
echo "  end:    ${DEGOV_INDEXER_END_BLOCK}"
echo "  verbose:${DEGOV_INDEXER_VERBOSE_LOGS}"

cd "${WORK_PATH}"

if [ "$RESET_MODE" = "force" ]; then
  sh ./scripts/smart-start.sh force
else
  sh ./scripts/smart-start.sh
fi

echo
echo "Range replay finished."
echo "To inspect local GraphQL data, run:"
echo "  just graphql-server"
echo
echo "Then query samples with:"
echo "  node scripts/local-verify-query.mjs --delegator <address> [--delegate <address>]"
echo "  node scripts/local-verify-query.mjs --negative-current --limit 20"
