// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface Token {
    function transfer(address to, uint256 amount) external returns (bool);
}

// Test-only dispenser, funded with a fixed supply of Test KTON.
contract TestKTONFaucet {
    Token public immutable token;
    mapping(address => bool) public claimed;

    constructor(address asset) {
        token = Token(asset);
    }

    function claim() external {
        require(!claimed[msg.sender], "Already claimed");
        claimed[msg.sender] = true;
        require(token.transfer(msg.sender, 100 ether), "Transfer failed");
    }
}
