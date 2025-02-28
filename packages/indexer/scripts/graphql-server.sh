#!/bin/sh
#

set -ex

BIN_PATH=$(cd "$(dirname "$0")"; pwd -P)
WORK_PATH=${BIN_PATH}/../

cd ${WORK_PATH}

npx squid-graphql-server


