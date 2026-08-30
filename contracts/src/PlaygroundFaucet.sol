// SPDX-License-Identifier: MIT
// File overview: Fixed-amount GTK faucet for the Base Playground DAO.
pragma solidity ^0.8.22;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract PlaygroundFaucet is Ownable, Pausable {
    using SafeERC20 for IERC20;

    uint256 public constant CLAIM_AMOUNT = 100e18;
    uint256 public constant COOLDOWN = 1 days;
    uint256 public constant DAILY_LIMIT = 100_000e18;

    IERC20 public immutable token;
    mapping(address account => uint256 claimedAt) public lastClaimAt;
    uint256 public dailyClaimed;
    uint256 public dailyClaimDay;

    event Claimed(address indexed account, uint256 amount);

    constructor(IERC20 token_, address owner_) Ownable(owner_) {
        require(address(token_) != address(0), "faucet token is zero");
        token = token_;
    }

    function claim() external whenNotPaused {
        require(
            lastClaimAt[msg.sender] == 0 || lastClaimAt[msg.sender] + COOLDOWN <= block.timestamp,
            "claim cooldown active"
        );
        require(token.balanceOf(address(this)) >= CLAIM_AMOUNT, "faucet balance too low");
        _rollDailyBudget();
        require(dailyClaimed + CLAIM_AMOUNT <= DAILY_LIMIT, "daily faucet limit reached");

        lastClaimAt[msg.sender] = block.timestamp;
        dailyClaimed += CLAIM_AMOUNT;
        token.safeTransfer(msg.sender, CLAIM_AMOUNT);
        emit Claimed(msg.sender, CLAIM_AMOUNT);
    }

    function _rollDailyBudget() internal {
        uint256 day = block.timestamp / 1 days;
        if (dailyClaimDay == day) return;
        dailyClaimDay = day;
        dailyClaimed = 0;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "withdraw recipient is zero");
        token.safeTransfer(to, amount);
    }
}
