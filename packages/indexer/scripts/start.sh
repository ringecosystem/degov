#!/bin/sh
#

set -ex

BIN_PATH=$(cd "$(dirname "$0")"; pwd -P)
WORK_PATH=${BIN_PATH}/../

cd ${WORK_PATH}

pnpm exec sqd migration:apply

restart_delay_seconds="${DEGOV_INDEXER_PROCESSOR_RESTART_DELAY_SECONDS:-30}"

while true; do
  set +e
  node -r dotenv/config lib/main.js
  exit_code=$?
  set -e

  if [ "$exit_code" -eq 0 ]; then
    exit 0
  fi

  echo "processor exited with code ${exit_code}; restarting in ${restart_delay_seconds}s"
  sleep "${restart_delay_seconds}"
done
