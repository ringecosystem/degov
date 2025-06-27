// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Script} from "forge-std/Script.sol";
import {safeconsole} from "forge-std/safeconsole.sol";
import {Token} from "../src/TK.sol";
import {GovernanceToken} from "../src/GTK.sol";
import {DGovernor} from "../src/DGovernor.sol";
import {Timelock} from "../src/Timelock.sol";

contract Deploy is Script {
    address deployer = 0x0f14341A7f464320319025540E8Fe48Ad0fe5aec;
    address TK = 0x337a2E57930577A4C39f5F176D974F5E8C2A2f90;
    address GTK = 0xA8Fd3E32e7E6eEa26a29Cb428c580CeAF8652eFc;
    address TL = 0x423d1A3b3a3cCFb812F2c8Ac81962bDa5d642944;
    address DGVN = 0x1e4122BdB410475561C27A6D3D8Bd7f69D9da60e;

    function run() public {
        safeconsole.log("Chain Id: ", block.chainid);
        vm.startBroadcast();

        Token tk = new Token(deployer);
        safeconsole.log("tk: ", address(tk));
        require(TK == address(tk));
        GovernanceToken gtk = new GovernanceToken(tk);
        safeconsole.log("gtk: ", address(gtk));
        require(GTK == address(gtk));
        address[] memory roles = new address[](1);
        roles[0] = DGVN;
        Timelock tl = new Timelock(3 minutes, roles, roles, DGVN);
        require(TL == address(tl));
        safeconsole.log("tl: ", address(tl));
        DGovernor dgov = new DGovernor(gtk, tl);
        require(DGVN == address(dgov));
        safeconsole.log("dgov: ", address(dgov));

        vm.stopBroadcast();
    }
}
