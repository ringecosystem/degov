// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {safeconsole} from "forge-std/safeconsole.sol";
import {DGovernorWithoutTimelock} from "../src/no-timelock/DGovernorWithoutTimelock.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";

contract NoTimelockCase {
    address deployer = 0x0f14341A7f464320319025540E8Fe48Ad0fe5aec;
    IVotes GTK = IVotes(0xbC9f58566810F7e853e1eef1b9957ac82F9971df);
    address DGOV = 0xf81b2a17aFc7f25cB53B0d7d38bE7cEE22B63C33;

    function _run() public {
        DGovernorWithoutTimelock dgov = new DGovernorWithoutTimelock(GTK);
        safeconsole.log("dgov: ", address(dgov));

        require(DGOV == address(dgov));
    }
}
