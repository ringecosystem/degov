// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Minimal target for reproducing custom-ABI proposal actions.
contract ActionReproTarget {
    address public lastToken;
    uint256 public releaseCount;

    event Released(address indexed caller, address indexed token, uint256 releaseCount);

    function release(address token) external {
        require(token != address(0), "token is zero address");

        lastToken = token;
        releaseCount += 1;

        emit Released(msg.sender, token, releaseCount);
    }
}
