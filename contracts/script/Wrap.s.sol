// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {safeconsole} from "forge-std/safeconsole.sol";
import {Token} from "../src/TK.sol";
import {GovernanceToken} from "../src/wrap/GTK.sol";
import {DGovernor} from "../src/DGovernor.sol";
import {Timelock} from "../src/Timelock.sol";

contract WrapCase {
    address deployer = 0x0f14341A7f464320319025540E8Fe48Ad0fe5aec;
    address TK = 0x48C817eebE1fD79F946bd6b976EF579540517121;
    address GTK = 0x0ef0827A9d5D329DFbaA14c7d5Aae364453A4D32;
    address TL = 0xd1E2Cc9c1e9D7ccDEBB948382A917b4FFfCE7Ae1;
    address DGVN = 0x892eaD4A183067fD30aAB74947Eb57ddd17BfE53;

    address bear = 0x3E8436e87Abb49efe1A958EE73fbB7A12B419aAB;
    address yalin = 0x9e0DE805Efd55178B5469c119d5DE75C89582AEe;

    function _run() public {
        Token tk = new Token(deployer);
        safeconsole.log("tk: ", address(tk));
        GovernanceToken gtk = new GovernanceToken(tk);
        safeconsole.log("gtk: ", address(gtk));
        address[] memory roles = new address[](1);
        roles[0] = DGVN;
        Timelock tl = new Timelock(3 minutes, roles, roles, DGVN);
        safeconsole.log("tl: ", address(tl));
        DGovernor dgov = new DGovernor(gtk, tl);
        safeconsole.log("dgov: ", address(dgov));

        bytes32 minterRole = tk.MINTER_ROLE();
        tk.grantRole(minterRole, deployer);
        tk.grantRole(minterRole, bear);
        tk.grantRole(minterRole, yalin);

        require(TK == address(tk));
        require(GTK == address(gtk));
        require(TL == address(tl));
        require(DGVN == address(dgov));
    }
}
