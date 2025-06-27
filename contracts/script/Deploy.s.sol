// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Script} from "forge-std/Script.sol";
import {safeconsole} from "forge-std/safeconsole.sol";
import {FungibleToken} from "../src/FT.sol";
import {GovernanceFungibleToken} from "../src/GFT.sol";
import {DGovernor} from "../src/DGovernor.sol";
import {Timelock} from "../src/Timelock.sol";

contract DeployScript is Script {
    address deployer = 0x0f14341A7f464320319025540E8Fe48Ad0fe5aec;
    address FT = 0x0f14341A7f464320319025540E8Fe48Ad0fe5aec;
    address GFT = 0x0f14341A7f464320319025540E8Fe48Ad0fe5aec;
    address DGVN = 0x0f14341A7f464320319025540E8Fe48Ad0fe5aec;
    address TL = 0x0f14341A7f464320319025540E8Fe48Ad0fe5aec;

    function run() public {
        safeconsole.log("Chain Id: ", block.chainid);
        vm.startBroadcast();

        FungibleToken ft = new FungibleToken(deployer);
        safeconsole.log("ft: ", address(ft));
        // require(FT == address(ft));
        GovernanceFungibleToken gft = new GovernanceFungibleToken(ft);
        safeconsole.log("gft: ", address(gft));
        // require(GFT == address(gft))
        address[] memory roles = new address[](1);
        roles[0] = DGVN;
        Timelock tl = new Timelock(3 minutes, roles, roles, DGVN);
        // require(TL == address(tl));
        safeconsole.log("tl: ", address(tl));
        DGovernor dgov = new DGovernor(gft, tl);
        // require(DGVN == address(dgov));
        safeconsole.log("dgov: ", address(dgov));

        vm.stopBroadcast();
    }
}
