// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IMintableToken {
    function mint(address to, uint256 amount) external;
}

contract PlaygroundFaucet {
    uint256 public constant CLAIM_AMOUNT = 10 ether;

    IMintableToken public immutable token;
    mapping(address account => bool) public claimed;

    error AlreadyClaimed();
    error InvalidToken();

    event Claimed(address indexed account, uint256 amount);

    constructor(IMintableToken token_) {
        if (address(token_) == address(0)) revert InvalidToken();
        token = token_;
    }

    function claim() external {
        if (claimed[msg.sender]) revert AlreadyClaimed();

        claimed[msg.sender] = true;
        token.mint(msg.sender, CLAIM_AMOUNT);

        emit Claimed(msg.sender, CLAIM_AMOUNT);
    }
}
