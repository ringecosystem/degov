#!/bin/sh
#

set -ex

BIN_PATH=$(cd "$(dirname "$0")"; pwd -P)
WORK_PATH=${BIN_PATH}/../

cd ${WORK_PATH}

docker compose down || true

docker compose up -d || true

if [ "$1" = "force" ]; then
  npx sqd codegen
  npm run migrate:db -- --force
fi

npm run build

${BIN_PATH}/start.sh
