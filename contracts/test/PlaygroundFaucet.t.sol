// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IMintableToken, PlaygroundFaucet} from "../src/PlaygroundFaucet.sol";

contract MintableTokenMock is IMintableToken {
    mapping(address account => uint256) public balanceOf;
    bool public shouldRevert;

    function setShouldRevert(bool value) external {
        shouldRevert = value;
    }

    function mint(address to, uint256 amount) external {
        require(!shouldRevert, "mint failed");
        balanceOf[to] += amount;
    }
}

contract PlaygroundFaucetTest is Test {
    address internal constant USER = address(0xBEEF);

    MintableTokenMock internal token;
    PlaygroundFaucet internal faucet;

    function setUp() public {
        token = new MintableTokenMock();
        faucet = new PlaygroundFaucet(token);
    }

    function test_Claim_FirstClaimMintsTenTokens() public {
        vm.expectEmit(true, false, false, true);
        emit PlaygroundFaucet.Claimed(USER, 10 ether);

        vm.prank(USER);
        faucet.claim();

        assertTrue(faucet.claimed(USER));
        assertEq(token.balanceOf(USER), 10 ether);
    }

    function test_Claim_SecondClaimReverts() public {
        vm.startPrank(USER);
        faucet.claim();

        vm.expectRevert(PlaygroundFaucet.AlreadyClaimed.selector);
        faucet.claim();
        vm.stopPrank();

        assertEq(token.balanceOf(USER), 10 ether);
    }

    function test_Claim_MintFailureDoesNotConsumeClaim() public {
        token.setShouldRevert(true);

        vm.prank(USER);
        vm.expectRevert("mint failed");
        faucet.claim();

        assertFalse(faucet.claimed(USER));
        assertEq(token.balanceOf(USER), 0);
    }

    function test_Constructor_ZeroTokenReverts() public {
        vm.expectRevert(PlaygroundFaucet.InvalidToken.selector);
        new PlaygroundFaucet(IMintableToken(address(0)));
    }
}
