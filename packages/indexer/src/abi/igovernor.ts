import * as p from '@subsquid/evm-codec'
import { event, fun, viewFun, indexed, ContractBase } from '@subsquid/evm-abi'
import type { EventParams as EParams, FunctionArguments, FunctionReturn } from '@subsquid/evm-abi'

export const events = {
    ProposalCanceled: event("0x789cf55be980739dad1d0699b93b58e806b51c9d96619bfa8fe0a28abaa7b30c", "ProposalCanceled(uint256)", {"proposalId": p.uint256}),
    ProposalCreated: event("0x7d84a6263ae0d98d3329bd7b46bb4e8d6f98cd35a7adb45c274c8b7fd5ebd5e0", "ProposalCreated(uint256,address,address[],uint256[],string[],bytes[],uint256,uint256,string)", {"proposalId": p.uint256, "proposer": p.address, "targets": p.array(p.address), "values": p.array(p.uint256), "signatures": p.array(p.string), "calldatas": p.array(p.bytes), "voteStart": p.uint256, "voteEnd": p.uint256, "description": p.string}),
    ProposalExecuted: event("0x712ae1383f79ac853f8d882153778e0260ef8f03b504e2866e0593e04d2b291f", "ProposalExecuted(uint256)", {"proposalId": p.uint256}),
    ProposalQueued: event("0x9a2e42fd6722813d69113e7d0079d3d940171428df7373df9c7f7617cfda2892", "ProposalQueued(uint256,uint256)", {"proposalId": p.uint256, "etaSeconds": p.uint256}),
    VoteCast: event("0xb8e138887d0aa13bab447e82de9d5c1777041ecd21ca36ba824ff1e6c07ddda4", "VoteCast(address,uint256,uint8,uint256,string)", {"voter": indexed(p.address), "proposalId": p.uint256, "support": p.uint8, "weight": p.uint256, "reason": p.string}),
    VoteCastWithParams: event("0xe2babfbac5889a709b63bb7f598b324e08bc5a4fb9ec647fb3cbc9ec07eb8712", "VoteCastWithParams(address,uint256,uint8,uint256,string,bytes)", {"voter": indexed(p.address), "proposalId": p.uint256, "support": p.uint8, "weight": p.uint256, "reason": p.string, "params": p.bytes}),
}

export const functions = {
    CLOCK_MODE: viewFun("0x4bf5d7e9", "CLOCK_MODE()", {}, p.string),
    COUNTING_MODE: viewFun("0xdd4e2ba5", "COUNTING_MODE()", {}, p.string),
    cancel: fun("0x452115d6", "cancel(address[],uint256[],bytes[],bytes32)", {"targets": p.array(p.address), "values": p.array(p.uint256), "calldatas": p.array(p.bytes), "descriptionHash": p.bytes32}, p.uint256),
    castVote: fun("0x56781388", "castVote(uint256,uint8)", {"proposalId": p.uint256, "support": p.uint8}, p.uint256),
    castVoteBySig: fun("0x8ff262e3", "castVoteBySig(uint256,uint8,address,bytes)", {"proposalId": p.uint256, "support": p.uint8, "voter": p.address, "signature": p.bytes}, p.uint256),
    castVoteWithReason: fun("0x7b3c71d3", "castVoteWithReason(uint256,uint8,string)", {"proposalId": p.uint256, "support": p.uint8, "reason": p.string}, p.uint256),
    castVoteWithReasonAndParams: fun("0x5f398a14", "castVoteWithReasonAndParams(uint256,uint8,string,bytes)", {"proposalId": p.uint256, "support": p.uint8, "reason": p.string, "params": p.bytes}, p.uint256),
    castVoteWithReasonAndParamsBySig: fun("0x5b8d0e0d", "castVoteWithReasonAndParamsBySig(uint256,uint8,address,string,bytes,bytes)", {"proposalId": p.uint256, "support": p.uint8, "voter": p.address, "reason": p.string, "params": p.bytes, "signature": p.bytes}, p.uint256),
    clock: viewFun("0x91ddadf4", "clock()", {}, p.uint48),
    execute: fun("0x2656227d", "execute(address[],uint256[],bytes[],bytes32)", {"targets": p.array(p.address), "values": p.array(p.uint256), "calldatas": p.array(p.bytes), "descriptionHash": p.bytes32}, p.uint256),
    getProposalId: viewFun("0xa8f8a668", "getProposalId(address[],uint256[],bytes[],bytes32)", {"targets": p.array(p.address), "values": p.array(p.uint256), "calldatas": p.array(p.bytes), "descriptionHash": p.bytes32}, p.uint256),
    getVotes: viewFun("0xeb9019d4", "getVotes(address,uint256)", {"account": p.address, "timepoint": p.uint256}, p.uint256),
    getVotesWithParams: viewFun("0x9a802a6d", "getVotesWithParams(address,uint256,bytes)", {"account": p.address, "timepoint": p.uint256, "params": p.bytes}, p.uint256),
    hasVoted: viewFun("0x43859632", "hasVoted(uint256,address)", {"proposalId": p.uint256, "account": p.address}, p.bool),
    hashProposal: viewFun("0xc59057e4", "hashProposal(address[],uint256[],bytes[],bytes32)", {"targets": p.array(p.address), "values": p.array(p.uint256), "calldatas": p.array(p.bytes), "descriptionHash": p.bytes32}, p.uint256),
    name: viewFun("0x06fdde03", "name()", {}, p.string),
    proposalDeadline: viewFun("0xc01f9e37", "proposalDeadline(uint256)", {"proposalId": p.uint256}, p.uint256),
    proposalEta: viewFun("0xab58fb8e", "proposalEta(uint256)", {"proposalId": p.uint256}, p.uint256),
    proposalNeedsQueuing: viewFun("0xa9a95294", "proposalNeedsQueuing(uint256)", {"proposalId": p.uint256}, p.bool),
    proposalProposer: viewFun("0x143489d0", "proposalProposer(uint256)", {"proposalId": p.uint256}, p.address),
    proposalSnapshot: viewFun("0x2d63f693", "proposalSnapshot(uint256)", {"proposalId": p.uint256}, p.uint256),
    proposalThreshold: viewFun("0xb58131b0", "proposalThreshold()", {}, p.uint256),
    propose: fun("0x7d5e81e2", "propose(address[],uint256[],bytes[],string)", {"targets": p.array(p.address), "values": p.array(p.uint256), "calldatas": p.array(p.bytes), "description": p.string}, p.uint256),
    queue: fun("0x160cbed7", "queue(address[],uint256[],bytes[],bytes32)", {"targets": p.array(p.address), "values": p.array(p.uint256), "calldatas": p.array(p.bytes), "descriptionHash": p.bytes32}, p.uint256),
    quorum: viewFun("0xf8ce560a", "quorum(uint256)", {"timepoint": p.uint256}, p.uint256),
    state: viewFun("0x3e4f49e6", "state(uint256)", {"proposalId": p.uint256}, p.uint8),
    supportsInterface: viewFun("0x01ffc9a7", "supportsInterface(bytes4)", {"interfaceId": p.bytes4}, p.bool),
    version: viewFun("0x54fd4d50", "version()", {}, p.string),
    votingDelay: viewFun("0x3932abb1", "votingDelay()", {}, p.uint256),
    votingPeriod: viewFun("0x02a251a3", "votingPeriod()", {}, p.uint256),
}

export class Contract extends ContractBase {

    CLOCK_MODE() {
        return this.eth_call(functions.CLOCK_MODE, {})
    }

    COUNTING_MODE() {
        return this.eth_call(functions.COUNTING_MODE, {})
    }

    clock() {
        return this.eth_call(functions.clock, {})
    }

    getProposalId(targets: GetProposalIdParams["targets"], values: GetProposalIdParams["values"], calldatas: GetProposalIdParams["calldatas"], descriptionHash: GetProposalIdParams["descriptionHash"]) {
        return this.eth_call(functions.getProposalId, {targets, values, calldatas, descriptionHash})
    }

    getVotes(account: GetVotesParams["account"], timepoint: GetVotesParams["timepoint"]) {
        return this.eth_call(functions.getVotes, {account, timepoint})
    }

    getVotesWithParams(account: GetVotesWithParamsParams["account"], timepoint: GetVotesWithParamsParams["timepoint"], params: GetVotesWithParamsParams["params"]) {
        return this.eth_call(functions.getVotesWithParams, {account, timepoint, params})
    }

    hasVoted(proposalId: HasVotedParams["proposalId"], account: HasVotedParams["account"]) {
        return this.eth_call(functions.hasVoted, {proposalId, account})
    }

    hashProposal(targets: HashProposalParams["targets"], values: HashProposalParams["values"], calldatas: HashProposalParams["calldatas"], descriptionHash: HashProposalParams["descriptionHash"]) {
        return this.eth_call(functions.hashProposal, {targets, values, calldatas, descriptionHash})
    }

    name() {
        return this.eth_call(functions.name, {})
    }

    proposalDeadline(proposalId: ProposalDeadlineParams["proposalId"]) {
        return this.eth_call(functions.proposalDeadline, {proposalId})
    }

    proposalEta(proposalId: ProposalEtaParams["proposalId"]) {
        return this.eth_call(functions.proposalEta, {proposalId})
    }

    proposalNeedsQueuing(proposalId: ProposalNeedsQueuingParams["proposalId"]) {
        return this.eth_call(functions.proposalNeedsQueuing, {proposalId})
    }

    proposalProposer(proposalId: ProposalProposerParams["proposalId"]) {
        return this.eth_call(functions.proposalProposer, {proposalId})
    }

    proposalSnapshot(proposalId: ProposalSnapshotParams["proposalId"]) {
        return this.eth_call(functions.proposalSnapshot, {proposalId})
    }

    proposalThreshold() {
        return this.eth_call(functions.proposalThreshold, {})
    }

    quorum(timepoint: QuorumParams["timepoint"]) {
        return this.eth_call(functions.quorum, {timepoint})
    }

    state(proposalId: StateParams["proposalId"]) {
        return this.eth_call(functions.state, {proposalId})
    }

    supportsInterface(interfaceId: SupportsInterfaceParams["interfaceId"]) {
        return this.eth_call(functions.supportsInterface, {interfaceId})
    }

    version() {
        return this.eth_call(functions.version, {})
    }

    votingDelay() {
        return this.eth_call(functions.votingDelay, {})
    }

    votingPeriod() {
        return this.eth_call(functions.votingPeriod, {})
    }
}

/// Event types
export type ProposalCanceledEventArgs = EParams<typeof events.ProposalCanceled>
export type ProposalCreatedEventArgs = EParams<typeof events.ProposalCreated>
export type ProposalExecutedEventArgs = EParams<typeof events.ProposalExecuted>
export type ProposalQueuedEventArgs = EParams<typeof events.ProposalQueued>
export type VoteCastEventArgs = EParams<typeof events.VoteCast>
export type VoteCastWithParamsEventArgs = EParams<typeof events.VoteCastWithParams>

/// Function types
export type CLOCK_MODEParams = FunctionArguments<typeof functions.CLOCK_MODE>
export type CLOCK_MODEReturn = FunctionReturn<typeof functions.CLOCK_MODE>

export type COUNTING_MODEParams = FunctionArguments<typeof functions.COUNTING_MODE>
export type COUNTING_MODEReturn = FunctionReturn<typeof functions.COUNTING_MODE>

export type CancelParams = FunctionArguments<typeof functions.cancel>
export type CancelReturn = FunctionReturn<typeof functions.cancel>

export type CastVoteParams = FunctionArguments<typeof functions.castVote>
export type CastVoteReturn = FunctionReturn<typeof functions.castVote>

export type CastVoteBySigParams = FunctionArguments<typeof functions.castVoteBySig>
export type CastVoteBySigReturn = FunctionReturn<typeof functions.castVoteBySig>

export type CastVoteWithReasonParams = FunctionArguments<typeof functions.castVoteWithReason>
export type CastVoteWithReasonReturn = FunctionReturn<typeof functions.castVoteWithReason>

export type CastVoteWithReasonAndParamsParams = FunctionArguments<typeof functions.castVoteWithReasonAndParams>
export type CastVoteWithReasonAndParamsReturn = FunctionReturn<typeof functions.castVoteWithReasonAndParams>

export type CastVoteWithReasonAndParamsBySigParams = FunctionArguments<typeof functions.castVoteWithReasonAndParamsBySig>
export type CastVoteWithReasonAndParamsBySigReturn = FunctionReturn<typeof functions.castVoteWithReasonAndParamsBySig>

export type ClockParams = FunctionArguments<typeof functions.clock>
export type ClockReturn = FunctionReturn<typeof functions.clock>

export type ExecuteParams = FunctionArguments<typeof functions.execute>
export type ExecuteReturn = FunctionReturn<typeof functions.execute>

export type GetProposalIdParams = FunctionArguments<typeof functions.getProposalId>
export type GetProposalIdReturn = FunctionReturn<typeof functions.getProposalId>

export type GetVotesParams = FunctionArguments<typeof functions.getVotes>
export type GetVotesReturn = FunctionReturn<typeof functions.getVotes>

export type GetVotesWithParamsParams = FunctionArguments<typeof functions.getVotesWithParams>
export type GetVotesWithParamsReturn = FunctionReturn<typeof functions.getVotesWithParams>

export type HasVotedParams = FunctionArguments<typeof functions.hasVoted>
export type HasVotedReturn = FunctionReturn<typeof functions.hasVoted>

export type HashProposalParams = FunctionArguments<typeof functions.hashProposal>
export type HashProposalReturn = FunctionReturn<typeof functions.hashProposal>

export type NameParams = FunctionArguments<typeof functions.name>
export type NameReturn = FunctionReturn<typeof functions.name>

export type ProposalDeadlineParams = FunctionArguments<typeof functions.proposalDeadline>
export type ProposalDeadlineReturn = FunctionReturn<typeof functions.proposalDeadline>

export type ProposalEtaParams = FunctionArguments<typeof functions.proposalEta>
export type ProposalEtaReturn = FunctionReturn<typeof functions.proposalEta>

export type ProposalNeedsQueuingParams = FunctionArguments<typeof functions.proposalNeedsQueuing>
export type ProposalNeedsQueuingReturn = FunctionReturn<typeof functions.proposalNeedsQueuing>

export type ProposalProposerParams = FunctionArguments<typeof functions.proposalProposer>
export type ProposalProposerReturn = FunctionReturn<typeof functions.proposalProposer>

export type ProposalSnapshotParams = FunctionArguments<typeof functions.proposalSnapshot>
export type ProposalSnapshotReturn = FunctionReturn<typeof functions.proposalSnapshot>

export type ProposalThresholdParams = FunctionArguments<typeof functions.proposalThreshold>
export type ProposalThresholdReturn = FunctionReturn<typeof functions.proposalThreshold>

export type ProposeParams = FunctionArguments<typeof functions.propose>
export type ProposeReturn = FunctionReturn<typeof functions.propose>

export type QueueParams = FunctionArguments<typeof functions.queue>
export type QueueReturn = FunctionReturn<typeof functions.queue>

export type QuorumParams = FunctionArguments<typeof functions.quorum>
export type QuorumReturn = FunctionReturn<typeof functions.quorum>

export type StateParams = FunctionArguments<typeof functions.state>
export type StateReturn = FunctionReturn<typeof functions.state>

export type SupportsInterfaceParams = FunctionArguments<typeof functions.supportsInterface>
export type SupportsInterfaceReturn = FunctionReturn<typeof functions.supportsInterface>

export type VersionParams = FunctionArguments<typeof functions.version>
export type VersionReturn = FunctionReturn<typeof functions.version>

export type VotingDelayParams = FunctionArguments<typeof functions.votingDelay>
export type VotingDelayReturn = FunctionReturn<typeof functions.votingDelay>

export type VotingPeriodParams = FunctionArguments<typeof functions.votingPeriod>
export type VotingPeriodReturn = FunctionReturn<typeof functions.votingPeriod>

