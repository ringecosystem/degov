import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  stringToHex,
} from "viem";
import { DegovIndexerHelpers } from "./helpers";

export const TIMELOCK_TYPE_CONTROL = "GovernorTimelockControl";
export const TIMELOCK_TYPE_COMPOUND = "GovernorTimelockCompound";

export const TIMELOCK_STATE_WAITING = "Waiting";
export const TIMELOCK_STATE_READY = "Ready";
export const TIMELOCK_STATE_DONE = "Done";
export const TIMELOCK_STATE_CANCELED = "Canceled";

export const ZERO_BYTES32 = `0x${"0".repeat(64)}`;

const DEFAULT_ADMIN_ROLE = ZERO_BYTES32;
const PROPOSER_ROLE = keccak256(stringToHex("PROPOSER_ROLE"));
const EXECUTOR_ROLE = keccak256(stringToHex("EXECUTOR_ROLE"));
const CANCELLER_ROLE = keccak256(stringToHex("CANCELLER_ROLE"));

function normalizeHex(value: string): string {
  return value.toLowerCase();
}

export function timelockOperationEntityId(options: {
  chainId: number;
  timelockAddress: string;
  operationId: string;
}): string {
  return [
    "timelock",
    options.chainId,
    DegovIndexerHelpers.normalizeAddress(options.timelockAddress),
    normalizeHex(options.operationId),
  ].join(":");
}

export function timelockCallEntityId(
  operationEntityId: string,
  actionIndex: number
): string {
  return `${operationEntityId}:call:${actionIndex}`;
}

export function timelockRoleLabel(role?: string | null): string | undefined {
  const normalizedRole = role ? normalizeHex(role) : undefined;
  switch (normalizedRole) {
    case DEFAULT_ADMIN_ROLE:
      return "DEFAULT_ADMIN_ROLE";
    case PROPOSER_ROLE:
      return "PROPOSER_ROLE";
    case EXECUTOR_ROLE:
      return "EXECUTOR_ROLE";
    case CANCELLER_ROLE:
      return "CANCELLER_ROLE";
    default:
      return undefined;
  }
}

export function governorTimelockSalt(options: {
  governorAddress: string;
  descriptionHash: string;
}): string {
  const normalizedGovernorAddress = (
    DegovIndexerHelpers.normalizeAddress(options.governorAddress) ?? ""
  ).replace(/^0x/, "");
  const governorBytes32 = `0x${normalizedGovernorAddress}${"0".repeat(24)}`;
  const saltBigInt =
    BigInt(governorBytes32) ^ BigInt(normalizeHex(options.descriptionHash));
  return `0x${saltBigInt.toString(16).padStart(64, "0")}`;
}

export function timelockOperationIdForBatch(options: {
  targets: string[];
  values: string[];
  calldatas: string[];
  predecessor?: string;
  salt: string;
}): string {
  const payload = encodeAbiParameters(
    parseAbiParameters(
      "address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt"
    ),
    [
      options.targets.map(
        (target) =>
          (DegovIndexerHelpers.normalizeAddress(target) ?? target) as `0x${string}`
      ),
      options.values.map((value) => BigInt(value)),
      options.calldatas.map((data) => normalizeHex(data) as `0x${string}`),
      normalizeHex(options.predecessor ?? ZERO_BYTES32) as `0x${string}`,
      normalizeHex(options.salt) as `0x${string}`,
    ]
  );

  return keccak256(payload);
}
