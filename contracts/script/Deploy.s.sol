// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Script} from "forge-std/Script.sol";
import {safeconsole} from "forge-std/safeconsole.sol";
import {BlocknumberCase} from "./BN.s.sol";

contract Deploy is Script, BlocknumberCase {
    function run() public {
        safeconsole.log("Chain Id: ", block.chainid);
        vm.startBroadcast();
        _run();
        vm.stopBroadcast();
    }
}
