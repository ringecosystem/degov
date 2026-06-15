// SPDX-License-Identifier: MIT
// File overview: Deploy the playground Timelock and DGovernor around the existing Darwinia governance token.
pragma solidity ^0.8.0;

import {Script} from "forge-std/Script.sol";
import {safeconsole} from "forge-std/safeconsole.sol";
import {IERC6372} from "@openzeppelin/contracts/interfaces/IERC6372.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {DGovernor} from "../src/DGovernor.sol";
import {Timelock} from "../src/Timelock.sol";

contract DeployPlayground is Script {
    uint256 internal constant DARWINIA_CHAIN_ID = 46;
    address internal constant DEFAULT_DEPLOYER = 0x0f14341A7f464320319025540E8Fe48Ad0fe5aec;
    address internal constant GTP = 0xbC9f58566810F7e853e1eef1b9957ac82F9971df;
    uint256 internal constant MIN_DELAY = 3 minutes;

    function run() public {
        require(block.chainid == DARWINIA_CHAIN_ID, "playground deploy must run on Darwinia");
        require(GTP.code.length > 0, "playground GTP has no code");
        IERC6372(GTP).clock();

        address deployer = vm.envOr("PLAYGROUND_DEPLOYER", DEFAULT_DEPLOYER);

        safeconsole.log("Chain Id: ", block.chainid);
        safeconsole.log("deployer: ", deployer);
        safeconsole.log("gtp: ", GTP);

        vm.startBroadcast(deployer);

        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](0);
        Timelock timelock = new Timelock(MIN_DELAY, proposers, executors, deployer);
        safeconsole.log("timelock: ", address(timelock));

        DGovernor governor = new DGovernor(IVotes(GTP), timelock);
        safeconsole.log("dgov: ", address(governor));

        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));
        timelock.grantRole(timelock.EXECUTOR_ROLE(), address(governor));
        timelock.grantRole(timelock.DEFAULT_ADMIN_ROLE(), address(governor));
        timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), deployer);

        require(timelock.hasRole(timelock.PROPOSER_ROLE(), address(governor)), "governor missing proposer role");
        require(timelock.hasRole(timelock.CANCELLER_ROLE(), address(governor)), "governor missing canceller role");
        require(timelock.hasRole(timelock.EXECUTOR_ROLE(), address(governor)), "governor missing executor role");
        require(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), address(governor)), "governor missing admin role");
        require(!timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), deployer), "deployer still has admin role");

        vm.stopBroadcast();
    }
}
