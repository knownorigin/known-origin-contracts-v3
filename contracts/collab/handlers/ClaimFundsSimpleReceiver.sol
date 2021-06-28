// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./CollabFundsHandlerBase.sol";
import {ICollabFundsDrainable} from "./ICollabFundsDrainable.sol";

/**
 * Allows funds to be split using a pull pattern, holding a balance until drained.
 *
 * Supports claiming/draining all balances at one - not an individual shares
 */
contract CollabFundsSimpleReceiver is ReentrancyGuard, CollabFundsHandlerBase, ICollabFundsDrainable {

    // split current contract balance among recipients
    function drain() public nonReentrant override {

        // Check that there are funds to drain
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to drain");

        uint256[] memory shares = new uint256[](recipients.length);

        // Calculate and send share for each recipient
        uint256 singleUnitOfValue = balance / SCALE_FACTOR;
        uint256 sumPaidOut;
        for (uint256 i = 0; i < recipients.length; i++) {
            shares[i] = singleUnitOfValue * splits[i];

            // Deal with the first recipient later (see comment below)
            if (i != 0) {
                payable(recipients[i]).call{value : shares[i]}("");
            }

            sumPaidOut += shares[i];
        }

        // The first recipient is a special address as it receives any dust left over from splitting up the funds
        uint256 remainingBalance = balance - sumPaidOut;
        // Either going to be a zero or non-zero value
        payable(recipients[0]).call{value : remainingBalance + shares[0]}("");

        emit FundsDrained(balance, recipients, shares, address(0));
    }

    function drainERC20(IERC20 token) public nonReentrant override {

        // Check that there are funds to drain
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "No funds to drain");

        uint256[] memory shares = new uint256[](recipients.length);

        // Calculate and send share for each recipient
        uint256 singleUnitOfValue = balance / SCALE_FACTOR;
        uint256 sumPaidOut;
        for (uint256 i = 0; i < recipients.length; i++) {
            shares[i] = singleUnitOfValue * splits[i];

            // Deal with the first recipient later (see comment below)
            if (i != 0) {
                token.transfer(recipients[i], shares[i]);
            }

            sumPaidOut += shares[i];
        }

        // The first recipient is a special address as it receives any dust left over from splitting up the funds
        uint256 remainingBalance = balance - sumPaidOut;
        // Either going to be a zero or non-zero value
        token.transfer(recipients[0], remainingBalance + shares[0]);

        emit FundsDrained(balance, recipients, shares, address(token));
    }

}
