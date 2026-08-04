// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {safeconsole} from "forge-std/safeconsole.sol";
import {GovernanceToken} from "../src/blocknumber/GTK.sol";
import {DGovernor} from "../src/DGovernor.sol";
import {Timelock} from "../src/Timelock.sol";

contract BlocknumberCase {
    address deployer = 0x0f14341A7f464320319025540E8Fe48Ad0fe5aec;
    address GTK = 0xef8ef3A1705f42e7FC1e06809940ec5942F5bB98;
    address TL = 0xa7E9dC6aBe0EfcdaBB8ED0471De0c56013066c20;
    address DGVN = 0x449337BBe404CaE0bA82f3451661AF7481f37aaC;

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
