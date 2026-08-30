// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Test} from "forge-std/Test.sol";
import {GTK} from "../src/GTK.sol";
import {PlaygroundFaucet} from "../src/PlaygroundFaucet.sol";

contract PlaygroundFaucetTest is Test {
    GTK private token;
    PlaygroundFaucet private faucet;
    address private owner = makeAddr("owner");
    address private alice = makeAddr("alice");

    function setUp() public {
        token = new GTK(owner);
        faucet = new PlaygroundFaucet(token, owner);
        vm.prank(owner);
        token.mint(address(faucet), faucet.DAILY_LIMIT());
    }

    function testClaimTransfersFixedAmount() public {
        vm.prank(alice);
        faucet.claim();

        assertEq(token.balanceOf(alice), 100e18);
        assertEq(faucet.lastClaimAt(alice), block.timestamp);
    }

    function testClaimRequiresCooldown() public {
        vm.startPrank(alice);
        faucet.claim();
        vm.expectRevert("claim cooldown active");
        faucet.claim();
        vm.stopPrank();

        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        faucet.claim();
        assertEq(token.balanceOf(alice), 200e18);
    }

    function testOwnerCanPauseClaims() public {
        vm.prank(owner);
        faucet.pause();

        vm.prank(alice);
        vm.expectRevert();
        faucet.claim();
    }

    function testOnlyOwnerCanWithdraw() public {
        vm.prank(alice);
        vm.expectRevert();
        faucet.withdraw(alice, 1e18);
    }

    function testDailyLimitIsEnforced() public {
        for (uint256 i = 0; i < 1_000; i++) {
            vm.prank(vm.addr(i + 1));
            faucet.claim();
        }

        vm.prank(makeAddr("last-user"));
        vm.expectRevert("daily faucet limit reached");
        faucet.claim();
    }
}
