// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {safeconsole} from "forge-std/safeconsole.sol";
import {GovernanceToken} from "../src/blocknumber/GTK.sol";
import {DGovernor} from "../src/DGovernor.sol";
import {Timelock} from "../src/Timelock.sol";

contract BlocknumberCase {
    address deployer = 0x0f14341A7f464320319025540E8Fe48Ad0fe5aec;
    address GTK = 0xB81A00CAa77CD98C3c6a7dc6E1e5393656650773;
    address TL = 0x4891332494a67AB7C446dBfb1C08b8125cDA4229;
    address DGVN = 0x398d514611291aB0C1c7c8447589A15b4bD08E3D;

    address bear = 0x3E8436e87Abb49efe1A958EE73fbB7A12B419aAB;
    address yalin = 0x9e0DE805Efd55178B5469c119d5DE75C89582AEe;

    function _run() public {
        GovernanceToken gtk = new GovernanceToken(deployer);
        safeconsole.log("gtk: ", address(gtk));
        address[] memory roles = new address[](1);
        roles[0] = DGVN;
        Timelock tl = new Timelock(3 minutes, roles, roles, DGVN);
        safeconsole.log("tl: ", address(tl));
        DGovernor dgov = new DGovernor(gtk, tl);
        safeconsole.log("dgov: ", address(dgov));

        bytes32 minterRole = gtk.MINTER_ROLE();
        gtk.grantRole(minterRole, deployer);
        gtk.grantRole(minterRole, bear);
        gtk.grantRole(minterRole, yalin);

        require(GTK == address(gtk));
        require(TL == address(tl));
        require(DGVN == address(dgov));
    }
}
