#!/bin/sh

set -eu

BIN_PATH=$(cd "$(dirname "$0")"; pwd -P)
WORK_PATH="${BIN_PATH}/../"

cd "${WORK_PATH}"

CONFIG_PATH="${DEGOV_CONFIG_PATH:-../../degov.yml}"
PROPOSAL_LIMIT="${DEGOV_RECONCILE_PROPOSAL_LIMIT:-25}"
VOTE_SAMPLES="${DEGOV_RECONCILE_VOTE_SAMPLES:-5}"
STAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
OUTPUT_DIR="${DEGOV_RECONCILIATION_DIR:-${WORK_PATH}/artifacts/reconciliation}"
OUTPUT_PATH="${DEGOV_RECONCILIATION_OUTPUT:-${OUTPUT_DIR}/reconciliation-${STAMP}.json}"

mkdir -p "${OUTPUT_DIR}"

if [ -z "${DEGOV_INDEXER_END_BLOCK:-}" ]; then
  export DEGOV_INDEXER_END_BLOCK="$(
    DEGOV_CONFIG_PATH="${CONFIG_PATH}" node --input-type=module <<'EOF'
import fs from "fs";
import path from "path";
import yaml from "yaml";
import { createPublicClient, http } from "viem";

const configPath = process.env.DEGOV_CONFIG_PATH;
const absoluteConfigPath = path.isAbsolute(configPath)
  ? configPath
  : path.resolve(process.cwd(), configPath);
const config = yaml.parse(fs.readFileSync(absoluteConfigPath, "utf8"));
const envVarName = `CHAIN_RPC_${config.chain.id}`;
const envRpcs = `${process.env[envVarName] ?? ""}`
  .replace(/\r\n|\n/g, ",")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const configRpcs = [
  ...(config.indexer?.rpc ? [config.indexer.rpc] : []),
  ...(config.chain?.rpcs ?? []),
];
const [rpc] = [...new Set([...envRpcs, ...configRpcs])];

if (!rpc) {
  throw new Error(`No RPC endpoint found for ${configPath}`);
}

const client = createPublicClient({
  transport: http(rpc.replace(/^ws:\/\//, "http://").replace(/^wss:\/\//, "https://")),
});
const latestBlock = await client.getBlock();
process.stdout.write((latestBlock.number ?? 0n).toString());
EOF
  )"
fi

echo "Replay/backfill config: ${CONFIG_PATH}"
echo "Replay/backfill end block: ${DEGOV_INDEXER_END_BLOCK}"
echo "Reconciliation output: ${OUTPUT_PATH}"

npx sqd build
npx sqd migration:apply
node -r dotenv/config lib/main.js
node lib/reconcile.js \
  --config "${CONFIG_PATH}" \
  --output "${OUTPUT_PATH}" \
  --proposal-sample-limit "${PROPOSAL_LIMIT}" \
  --vote-samples "${VOTE_SAMPLES}"
