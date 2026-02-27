import * as p from '@subsquid/evm-codec'
import { event, indexed } from '@subsquid/evm-abi'
import type { EventParams as EParams } from '@subsquid/evm-abi'

export const events = {
    // IStaking: AttesterRegistered(address indexed attester, uint256 stakeAmount, uint256 activationBlock)
    AttesterRegistered: event("0x0a008fb73c935968ae4e2703c94045967e14171afc089f50423272b0a555770e", "AttesterRegistered(address,uint256,uint256)", {"attester": indexed(p.address), "stakeAmount": p.uint256, "activationBlock": p.uint256}),
    // IStaking: AttesterUnregistered(address indexed attester, address indexed receiver, uint256 effectiveStakeAmount)
    AttesterUnregistered: event("0xd093900c69857626c80fe61edc537170a356647e411f3909e83955ebfff79d94", "AttesterUnregistered(address,address,uint256)", {"attester": indexed(p.address), "receiver": indexed(p.address), "effectiveStakeAmount": p.uint256}),
    // StakeIncreased(address indexed attester, uint256 additionalStakeAmount)
    StakeIncreased: event("0x8b0ed825817a2e696c9a931715af4609fc60e1701f09c89ee7645130e937eb2d", "StakeIncreased(address,uint256)", {"attester": indexed(p.address), "additionalStakeAmount": p.uint256}),
    // StakeDecreased(address indexed attester, uint256 decreasedStakeAmount)
    StakeDecreased: event("0x700865370ffb2a65a2b0242e6a64b21ac907ed5ecd46c9cffc729c177b2b1c69", "StakeDecreased(address,uint256)", {"attester": indexed(p.address), "decreasedStakeAmount": p.uint256}),
    // Penalized(address indexed attester, address indexed challenger, uint256 penaltyAmount, uint256 challengerReward, uint8 reason)
    Penalized: event("0x335eecf7606f75ae04e20d2277b4007e4a4393c127c80f970965779d626bbac7", "Penalized(address,address,uint256,uint256,uint8)", {"attester": indexed(p.address), "challenger": indexed(p.address), "penaltyAmount": p.uint256, "challengerReward": p.uint256, "reason": p.uint8}),
    // Slashed(address indexed attester, address indexed challenger, uint256 slashAmount, uint256 challengerReward, uint8 reason)
    Slashed: event("0x3b3b44f22c4864fdbce5e9f6c68b37f3b3c13bd42410faaa15bd6ad265425202", "Slashed(address,address,uint256,uint256,uint8)", {"attester": indexed(p.address), "challenger": indexed(p.address), "slashAmount": p.uint256, "challengerReward": p.uint256, "reason": p.uint8}),
    // ForceExitInitiated(address indexed attester, uint256 effectiveBalance, uint256 exitBlock)
    ForceExitInitiated: event("0x352db1e50d2d8e121c548139a0d03ba175ff9b693ebc1abd952157bb176ca1f0", "ForceExitInitiated(address,uint256,uint256)", {"attester": indexed(p.address), "effectiveBalance": p.uint256, "exitBlock": p.uint256}),
}

/// Event types
export type AttesterRegisteredEventArgs = EParams<typeof events.AttesterRegistered>
export type AttesterUnregisteredEventArgs = EParams<typeof events.AttesterUnregistered>
export type StakeIncreasedEventArgs = EParams<typeof events.StakeIncreased>
export type StakeDecreasedEventArgs = EParams<typeof events.StakeDecreased>
export type PenalizedEventArgs = EParams<typeof events.Penalized>
export type SlashedEventArgs = EParams<typeof events.Slashed>
export type ForceExitInitiatedEventArgs = EParams<typeof events.ForceExitInitiated>
