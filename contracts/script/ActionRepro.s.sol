// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {safeconsole} from "forge-std/safeconsole.sol";
import {ActionReproTarget} from "../src/mocks/ActionReproTarget.sol";

contract DeployActionReproTarget is Script {
    uint256 internal constant DARWINIA_CHAIN_ID = 46;

    function run() public returns (ActionReproTarget target) {
        require(block.chainid == DARWINIA_CHAIN_ID, "action repro deploy must run on Darwinia");

        vm.startBroadcast();
        target = new ActionReproTarget();
        vm.stopBroadcast();

        safeconsole.log("ActionReproTarget: ", address(target));
    }
}
