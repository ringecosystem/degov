import * as p from '@subsquid/evm-codec'
import { event, fun, viewFun, indexed, ContractBase } from '@subsquid/evm-abi'
import type { EventParams as EParams, FunctionArguments, FunctionReturn } from '@subsquid/evm-abi'

export const events = {
    CallScheduled: event("0x4cf4410cc57040e44862ef0f45f3dd5a5e02db8eb8add648d4b0e236f1d07dca", "CallScheduled(bytes32,uint256,address,uint256,bytes,bytes32,uint256)", {"id": indexed(p.bytes32), "index": indexed(p.uint256), "target": p.address, "value": p.uint256, "data": p.bytes, "predecessor": p.bytes32, "delay": p.uint256}),
    CallExecuted: event("0xc2617efa69bab66782fa219543714338489c4e9e178271560a91b82c3f612b58", "CallExecuted(bytes32,uint256,address,uint256,bytes)", {"id": indexed(p.bytes32), "index": indexed(p.uint256), "target": p.address, "value": p.uint256, "data": p.bytes}),
    CallSalt: event("0x20fda5fd27a1ea7bf5b9567f143ac5470bb059374a27e8f67cb44f946f6d0387", "CallSalt(bytes32,bytes32)", {"id": indexed(p.bytes32), "salt": p.bytes32}),
    Cancelled: event("0xbaa1eb22f2a492ba1a5fea61b8df4d27c6c8b5f3971e63bb58fa14ff72eedb70", "Cancelled(bytes32)", {"id": indexed(p.bytes32)}),
    MinDelayChange: event("0x11c24f4ead16507c69ac467fbd5e4eed5fb5c699626d2cc6d66421df253886d5", "MinDelayChange(uint256,uint256)", {"oldDuration": p.uint256, "newDuration": p.uint256}),
    RoleAdminChanged: event("0xbd79b86ffe0ab8e8776151514217cd7cacd52c909f66475c3af44e129f0b00ff", "RoleAdminChanged(bytes32,bytes32,bytes32)", {"role": indexed(p.bytes32), "previousAdminRole": indexed(p.bytes32), "newAdminRole": indexed(p.bytes32)}),
    RoleGranted: event("0x2f8788117e7eff1d82e926ec794901d17c78024a50270940304540a733656f0d", "RoleGranted(bytes32,address,address)", {"role": indexed(p.bytes32), "account": indexed(p.address), "sender": indexed(p.address)}),
    RoleRevoked: event("0xf6391f5c32d9c69d2a47ea670b442974b53935d1edc7fd64eb21e047a839171b", "RoleRevoked(bytes32,address,address)", {"role": indexed(p.bytes32), "account": indexed(p.address), "sender": indexed(p.address)}),
}

export const functions = {
    getMinDelay: viewFun("0xf27a0c92", "getMinDelay()", {}, p.uint256),
    GRACE_PERIOD: viewFun("0xc1a287e2", "GRACE_PERIOD()", {}, p.uint256),
}

export class Contract extends ContractBase {

    getMinDelay() {
        return this.eth_call(functions.getMinDelay, {})
    }

    GRACE_PERIOD() {
        return this.eth_call(functions.GRACE_PERIOD, {})
    }
}

/// Event types
export type CallScheduledEventArgs = EParams<typeof events.CallScheduled>
export type CallExecutedEventArgs = EParams<typeof events.CallExecuted>
export type CallSaltEventArgs = EParams<typeof events.CallSalt>
export type CancelledEventArgs = EParams<typeof events.Cancelled>
export type MinDelayChangeEventArgs = EParams<typeof events.MinDelayChange>
export type RoleAdminChangedEventArgs = EParams<typeof events.RoleAdminChanged>
export type RoleGrantedEventArgs = EParams<typeof events.RoleGranted>
export type RoleRevokedEventArgs = EParams<typeof events.RoleRevoked>

/// Function types
export type GetMinDelayParams = FunctionArguments<typeof functions.getMinDelay>
export type GetMinDelayReturn = FunctionReturn<typeof functions.getMinDelay>

export type GRACE_PERIODParams = FunctionArguments<typeof functions.GRACE_PERIOD>
export type GRACE_PERIODReturn = FunctionReturn<typeof functions.GRACE_PERIOD>

