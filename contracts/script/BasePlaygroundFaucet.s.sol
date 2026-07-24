// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {safeconsole} from "forge-std/safeconsole.sol";
import {GovernanceToken} from "../src/blocknumber/GTK.sol";
import {IMintableToken, PlaygroundFaucet} from "../src/PlaygroundFaucet.sol";

contract DeployBasePlaygroundFaucet is Script {
    uint256 internal constant BASE_CHAIN_ID = 8453;
    address internal constant DEFAULT_DEPLOYER = 0x0f14341A7f464320319025540E8Fe48Ad0fe5aec;
    address internal constant GTK = 0xef8ef3A1705f42e7FC1e06809940ec5942F5bB98;

    function run() public returns (PlaygroundFaucet faucet) {
        require(block.chainid == BASE_CHAIN_ID, "faucet deploy must run on Base");
        require(GTK.code.length > 0, "Base Playground GTK has no code");

        address deployer = vm.envOr("PLAYGROUND_DEPLOYER", DEFAULT_DEPLOYER);

        safeconsole.log("Chain Id: ", block.chainid);
        safeconsole.log("deployer: ", deployer);
        safeconsole.log("gtk: ", GTK);

        vm.startBroadcast(deployer);
        faucet = new PlaygroundFaucet(IMintableToken(GTK));
        vm.stopBroadcast();

        require(address(faucet.token()) == GTK, "faucet token mismatch");
        safeconsole.log("faucet: ", address(faucet));
        safeconsole.log("Next: grant faucet minter role");
    }
}

contract GrantBasePlaygroundFaucetRole is Script {
    uint256 internal constant BASE_CHAIN_ID = 8453;
    address internal constant DEFAULT_DEPLOYER = 0x0f14341A7f464320319025540E8Fe48Ad0fe5aec;
    address internal constant GTK = 0xef8ef3A1705f42e7FC1e06809940ec5942F5bB98;

    function run() public {
        require(block.chainid == BASE_CHAIN_ID, "role grant must run on Base");
        require(GTK.code.length > 0, "Base Playground GTK has no code");

        address faucet = vm.envAddress("PLAYGROUND_FAUCET");
        require(faucet.code.length > 0, "Playground faucet has no code");
        require(address(PlaygroundFaucet(faucet).token()) == GTK, "faucet token mismatch");

        address deployer = vm.envOr("PLAYGROUND_DEPLOYER", DEFAULT_DEPLOYER);
        GovernanceToken gtk = GovernanceToken(GTK);
        bytes32 minterRole = gtk.MINTER_ROLE();

        vm.startBroadcast(deployer);
        gtk.grantRole(minterRole, faucet);
        vm.stopBroadcast();

        require(gtk.hasRole(minterRole, faucet), "faucet missing MINTER_ROLE");
        safeconsole.log("faucet minter role granted: ", faucet);
    }
}
