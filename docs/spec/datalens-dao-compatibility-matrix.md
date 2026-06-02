# Datalens DAO Compatibility Matrix

> Purpose: define which DAO, governor, and governance token shapes the
> Datalens-native DeGov indexer supports, degrades, or rejects.
>
> Read this when: adding a DAO to staging or production, implementing ABI
> decode, ChainTool reads, proposal projection, token projection, or migration
> preflight checks.
>
> This does not define the database schema or revive the removed SQD/Subsquid
> indexer runtime.

## Policy summary

The Datalens-native indexer supports OpenZeppelin Governor-compatible DAOs whose
proposal lifecycle, vote, token, and historical power data can be verified from
chain reads. Tally comparisons are useful diagnostics, but direct chain reads
remain authoritative.

Indexing must fail fast when a registry entry would produce wrong rows. The
indexer may degrade only when the fallback still preserves the DeGov data
contract and the degradation is recorded in preflight output, logs, and
deployment notes.

| Classification | Meaning | Indexer action |
| --- | --- | --- |
| Supported | Required methods and events are present and callable. | Index normally. |
| Degraded | A documented fallback is used without changing business semantics. | Index with an explicit warning and fallback metadata. |
| Unsupported | Required decode, proposal, token, or power semantics are absent or contradictory. | Stop before indexing the DAO or stop the batch with an actionable error. |

## Required governor surface

The governor must expose callable methods needed to project proposal state and
verify proposal-derived rows:

| Surface | Requirement | Failure policy |
| --- | --- | --- |
| `ProposalCreated` | Required event. | Unsupported. |
| `VoteCast` | Required event. | Unsupported. |
| `VoteCastWithParams` | Optional event. | Supported when absent. |
| `ProposalQueued` | Required only when a timelock is configured. | Unsupported if registry declares timelock support but queue events cannot decode. |
| `ProposalExecuted` | Required event. | Unsupported. |
| `ProposalCanceled` | Required for full support; absence is tolerated only if no canceled history exists in the migration range. | Degraded or unsupported by range evidence. |
| `hashProposal` | Required callable method. | Unsupported. |
| `state` | Required callable method. | Unsupported. |
| `proposalSnapshot` | Required callable method. | Unsupported if missing or reverting. |
| `proposalDeadline` | Required callable method. | Unsupported if missing or reverting. |
| `proposalVotes` | Required callable method. | Unsupported if missing or reverting. |
| `quorum` | Required callable method. | Unsupported if missing or reverting. |
| `votingDelay` / `votingPeriod` | Required callable methods. | Unsupported if missing or reverting. |
| `CLOCK_MODE` | Optional method. | Degraded: default to block-number clock and record the fallback. |
| `COUNTING_MODE` | Optional method. | Degraded: use event and proposal-vote semantics, and record the missing mode. |

Governors that revert on required methods, including historical cases where
`proposalSnapshot` reverted, are unsupported even if some events decode.
Continuing would create proposal rows whose snapshot, deadline, state, quorum,
or vote totals cannot be verified.

## Required token surface

The registry token standard must match the observed `Transfer` event shape.
This check prevents ERC20/ERC721 mismatches that otherwise cause topic-count
decode failures.

| Token standard | Required event shape | Required methods | Required events |
| --- | --- | --- | --- |
| `ERC20` | `Transfer(address,address,uint256)` with 2 indexed arguments after the signature topic. | `name`, `symbol`, `totalSupply`, `balanceOf`, `delegates`, plus one current and one historical vote read. | `Transfer`, `DelegateChanged`, `DelegateVotesChanged`. |
| `ERC721` | `Transfer(address,address,uint256)` with 3 indexed arguments after the signature topic. | `name`, `symbol`, `balanceOf`, `ownerOf`, `delegates`, plus one current and one historical vote read. | `Transfer`, `DelegateChanged`, `DelegateVotesChanged`. |

The current vote read must be `getVotes(address)` or the supported fallback
`getCurrentVotes(address)`. The historical vote read must be
`getPastVotes(address,uint256)` or the supported fallback
`getPriorVotes(address,uint256)`.

Plain ERC20 or ERC721 contracts without vote checkpoints are unsupported as
governance tokens. Logs may identify affected accounts, but final current and
historical voting power must come from ChainTool/RPC reads.

## Supported fallbacks

| Missing or variant surface | Fallback | Classification |
| --- | --- | --- |
| Token `getVotes` missing, `getCurrentVotes` present | Use `getCurrentVotes` for current power. | Degraded. |
| Token `getPastVotes` missing, `getPriorVotes` present | Use `getPriorVotes` for historical power. | Degraded. |
| Governor `CLOCK_MODE` missing | Treat proposal timepoints as block numbers. | Degraded. |
| Governor `COUNTING_MODE` missing | Infer supported vote bucket semantics from event/proposal vote data. | Degraded. |
| Governor `timelock` missing and registry does not require a timelock | Skip timelock projection. | Degraded. |
| Timelock `GRACE_PERIOD` missing or reverting | Preserve queue/execute data and omit expiry/grace-period projection. | Degraded. |

Fallbacks must be emitted in preflight output and runtime logs with DAO code,
chain id, governor address, token address, fallback name, and the selected
method. A fallback is not allowed when it changes the public DeGov semantics for
proposal status, vote totals, delegate power, or aggregate metrics.

## Fail-fast cases

The indexer must stop before deployment or during the first affected batch for:

- registry token standard mismatch, such as an `ERC20` registry entry whose
  `Transfer` event has the ERC721 indexed topic shape;
- unsupported `dao.token.standard` values;
- missing or reverting required governor methods, including
  `proposalSnapshot`;
- missing governor events required for the configured migration range;
- missing token `Transfer`, `DelegateChanged`, or `DelegateVotesChanged`;
- token contracts without either `getVotes` or `getCurrentVotes`;
- token contracts without either `getPastVotes` or `getPriorVotes`;
- governors whose proposal id, snapshot, deadline, state, quorum, or vote
  counts cannot be verified from chain reads;
- ABI decode failures for required events where no documented skip policy
  exists;
- DAOs known to require semantics outside this matrix, such as
  `ring-protocol-dao` or public-nouns style cases, until a later issue extends
  this contract.

Fail-fast errors must name the DAO code, chain id, contract address, failed
surface, observed result, expected result, and operator action. The checkpoint
must not advance for a batch that hits a permanent unsupported-DAO error.

## Registry validation

Before a DAO is added to staging or production, preflight must verify:

1. Registry fields are present: DAO code, chain id, governor address, token
   address, token standard, start block, indexer endpoint target, and optional
   timelock address.
2. Contract addresses contain bytecode on the configured chain.
3. The registry token standard matches the observed `Transfer` indexed
   argument count.
4. Required governor methods are callable against at least one known proposal
   id or a deterministic probe where possible.
5. Required token vote-read methods are callable for a sample account and
   historical timepoint where possible.
6. Required event ABIs match Datalens log topic counts before projection code is
   allowed to decode rows.
7. Every degradation has an explicit fallback selection in the preflight
   report.
8. Unsupported DAOs are excluded from active staging and production workloads.

Unsupported DAOs must be documented in the deployment registry metadata or
release note for the run with the reason and a pointer to this matrix. They must
not remain in active staging or production runs as silently skipped workloads.

## Known examples

| DAO | Classification | Reason |
| --- | --- | --- |
| `ens-dao` | Supported | Previous migration comparison matched 69 of 69 Tally proposals after decimal proposal-id normalization, and chain reads remain authoritative. |
| `lisk-dao` | Supported or degraded by observed token/governor surface | Previous staging work used chain reads to investigate Tally-side power mismatches. Treat Tally differences as diagnostics unless chain preflight fails. |
| `legacy-comp-style-dao` | Degraded | Supported only when `getCurrentVotes` and `getPriorVotes` provide the current and historical power reads. |
| `ring-protocol-dao` | Unsupported | Historical migration work found unsupported governor/token semantics that had to be removed from active runs. |
| Public-nouns style DAO entries | Unsupported | Known ERC20/ERC721 registry mismatch and transfer topic-shape risk; reject until registry and token semantics match this matrix. |

## Test coverage

`packages/indexer/scripts/compatibility-preflight.test.mjs` covers:

- rejecting ERC20 registry entries whose observed transfer shape is ERC721;
- rejecting governors whose required `proposalSnapshot` method reverts;
- accepting documented fallbacks as degraded with explicit selected vote-read
  methods.

Future Rust implementation issues must preserve these behaviors in typed Rust
preflight and runtime errors before replacing the placeholder script.
