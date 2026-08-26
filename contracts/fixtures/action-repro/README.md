# Darwinia custom ABI and ERC-20 action reproduction

This fixture reproduces a proposal containing two custom actions built from different ABI sources:

1. An uploaded ABI calls `release(address token)` on a dedicated test contract.
2. DeGov's built-in ERC-20 ABI calls `transfer(address to, uint256 value)` on the existing demo FT contract.

The proposal is only for checking action construction. Do not vote, queue, or execute it unless that is separately intended.

## Live demo constants

- Chain: Darwinia Network (`46`)
- RPC: `https://rpc.darwinia.network`
- Governor: `0xC9EA55E644F496D6CaAEDcBAD91dE7481Dcd7517`
- Timelock: `0x6AB15C6ada9515A8E21321e241013dB457C8576c`
- Existing FT: `0x3ff4F23F328664FfD046eb4ca62be3d8aF3e452f`
- FT decimals: `18`

The FT is reused so the reproduction needs only one deployment.

## Build and deploy the target

Use a Foundry account that can sign on Darwinia. Keep the key in Foundry's encrypted keystore; do not put it in this repository or pass it on the command line.

```sh
cd contracts
forge build
forge script script/ActionRepro.s.sol:DeployActionReproTarget \
  --rpc-url darwinia \
  --chain 46 \
  --account <foundry-account-name> \
  --broadcast \
  --legacy
```

Record the `ActionReproTarget` address printed by the script.

## Build the proposal on demo.degov.ai

Use a proposal title that clearly marks the proposal as a non-execution reproduction.

### Action 1: uploaded ABI

- Type: `Custom`
- Target: deployed `ActionReproTarget` address
- ABI source: upload `ActionReproTarget.abi.json` from this directory
- Method: `release(address token)`
- `token`: `0x3ff4F23F328664FfD046eb4ca62be3d8aF3e452f`
- Native value: `0`

Expected calldata:

```text
0x191655870000000000000000000000003ff4f23f328664ffd046eb4ca62be3d8af3e452f
```

### Action 2: built-in ERC-20 ABI

- Type: `Custom`
- Target: `0x3ff4F23F328664FfD046eb4ca62be3d8aF3e452f`
- ABI source: built-in `ERC20`
- Method: `transfer(address to, uint256 value)`
- `to`: `0xa44270cda1b4835340c156a28f4a8717b2586255`
- `value`: `1000000000000000000` (1 FT in atomic units)
- Native value: `0`

Expected calldata:

```text
0xa9059cbb000000000000000000000000a44270cda1b4835340c156a28f4a8717b25862550000000000000000000000000000000000000000000000000de0b6b3a7640000
```

## Acceptance check before signing

The wallet's final `propose` request must contain these arrays in the same order:

```text
targets[0] = <deployed ActionReproTarget>
targets[1] = 0x3ff4F23F328664FfD046eb4ca62be3d8aF3e452f

values[0] = 0
values[1] = 0

calldatas[0] starts with 0x19165587
calldatas[1] starts with 0xa9059cbb
```

Cancel the wallet request and capture the preview plus final request data if either target or calldata is duplicated.
