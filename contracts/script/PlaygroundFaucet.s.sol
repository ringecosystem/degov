// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PlaygroundFaucet} from "../src/PlaygroundFaucet.sol";

contract DeployPlaygroundFaucet is Script {
    uint256 internal constant BASE_CHAIN_ID = 8453;
    address internal constant PLAYGROUND_GTK = 0xef8ef3A1705f42e7FC1e06809940ec5942F5bB98;

    function run() external returns (PlaygroundFaucet faucet) {
        require(block.chainid == BASE_CHAIN_ID, "faucet deploy must run on Base");
        require(PLAYGROUND_GTK.code.length > 0, "playground GTK has no code");
        address owner = vm.envAddress("PLAYGROUND_FAUCET_OWNER");

        vm.startBroadcast();
        faucet = new PlaygroundFaucet(IERC20(PLAYGROUND_GTK), owner);
        vm.stopBroadcast();
    }
}
