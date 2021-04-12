// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./CollabFundsHandlerBase.sol";
import "./ICollabFundsDrainable.sol";

/**
 * Allows funds to be split using a pull pattern, holding a balance until drained
 */
contract CollabFundsReceiver is CollabFundsHandlerBase, ICollabFundsDrainable {

    // split current contract balance among recipients
    function drain() nonReentrant public override {

        // Check that there are funds to drain
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to drain");

        uint256[] memory shares = new uint256[](recipients.length);

        // Calculate and send share for each recipient
        uint256 singleUnitOfValue = balance / SCALE_FACTOR;
        for (uint256 i = 0; i < recipients.length; i++) {
            shares[i] = singleUnitOfValue * splits[i];
            payable(recipients[i]).transfer(shares[i]);
        }

        emit FundsDrained(balance, recipients, shares);
    }

    function drainERC20(IERC20 token) nonReentrant public override {

        // Check that there are funds to drain
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "No funds to drain");

        uint256[] memory shares = new uint256[](recipients.length);

        // Calculate and send share for each recipient
        uint256 singleUnitOfValue = balance / SCALE_FACTOR;
        for (uint256 i = 0; i < recipients.length; i++) {
            shares[i] = singleUnitOfValue * splits[i];
            token.transfer(recipients[i], shares[i]);
        }
    }

}