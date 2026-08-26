// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ActionReproTarget} from "../src/mocks/ActionReproTarget.sol";

contract ActionReproTargetTest is Test {
    address internal constant DEMO_FT = 0x3ff4F23F328664FfD046eb4ca62be3d8aF3e452f;
    address internal constant RECIPIENT = 0xA44270cDA1B4835340c156a28f4a8717b2586255;

    ActionReproTarget internal target;

    function setUp() public {
        target = new ActionReproTarget();
    }

    function testReleaseRecordsTheTokenAndCallCount() public {
        vm.expectEmit(true, true, false, true);
        emit ActionReproTarget.Released(address(this), DEMO_FT, 1);

        target.release(DEMO_FT);

        assertEq(target.lastToken(), DEMO_FT);
        assertEq(target.releaseCount(), 1);
    }

    function testReleaseRejectsZeroAddress() public {
        vm.expectRevert("token is zero address");
        target.release(address(0));
    }

    function testTwoActionFixtureKeepsTargetsAndCalldataDistinct() public view {
        address[] memory targets = new address[](2);
        targets[0] = address(target);
        targets[1] = DEMO_FT;

        bytes[] memory calldatas = new bytes[](2);
        calldatas[0] = abi.encodeCall(ActionReproTarget.release, (DEMO_FT));
        calldatas[1] = abi.encodeWithSignature("transfer(address,uint256)", RECIPIENT, 1 ether);

        assertNotEq(targets[0], targets[1]);
        assertEq(bytes4(calldatas[0]), ActionReproTarget.release.selector);
        assertEq(bytes4(calldatas[1]), bytes4(keccak256("transfer(address,uint256)")));
        assertNotEq(keccak256(calldatas[0]), keccak256(calldatas[1]));
    }
}
