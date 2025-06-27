// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Script} from "forge-std/Script.sol";
import {safeconsole} from "forge-std/safeconsole.sol";
import {FungibleToken} from "../src/FT.sol";
import {GovernanceFungibleToken} from "../src/GFT.sol";
import {DGovernor} from "../src/DGovernor.sol";
import {Timelock} from "../src/Timelock.sol";

contract Deploy is Script {
    address deployer = 0x0f14341A7f464320319025540E8Fe48Ad0fe5aec;
    address FT = 0xcbd1931E971c2Cc1eD11cF44Cdfd4dA732B7fFB4;
    address GFT = 0x7946A3EA97EEb82acC915952C5De4383313AF24b;
    address TL = 0xA8F392949A79Faf397CA1997387d8A0BaA1F6bd5;
    address DGVN = 0x4484123c31BBB9cb6497B3676aC6F4771a2257d7;

    function run() public {
        safeconsole.log("Chain Id: ", block.chainid);
        vm.startBroadcast();

        FungibleToken ft = new FungibleToken(deployer);
        safeconsole.log("ft: ", address(ft));
        require(FT == address(ft));
        GovernanceFungibleToken gft = new GovernanceFungibleToken(ft);
        safeconsole.log("gft: ", address(gft));
        require(GFT == address(gft));
        address[] memory roles = new address[](1);
        roles[0] = DGVN;
        Timelock tl = new Timelock(3 minutes, roles, roles, DGVN);
        require(TL == address(tl));
        safeconsole.log("tl: ", address(tl));
        DGovernor dgov = new DGovernor(gft, tl);
        require(DGVN == address(dgov));
        safeconsole.log("dgov: ", address(dgov));

        vm.stopBroadcast();
    }
}
