// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "./CollabFundsHandlerBase.sol";
import "./ICollabFundsDrainable.sol";

/**
 * Allows funds to be split using a pull pattern, holding a balance until drained
 */
contract CollabFundsReceiver is CollabFundsHandlerBase, ICollabFundsDrainable {

    // split current contract balance among recipients
    function drain() nonReentrant public override {

        uint256[] memory amounts;

        // Calculate and send share for each recipient
        uint256 total = address(this).balance;
        uint256 singleUnitOfValue = total / FIXED_PCT;
        for (uint256 i = 0; i < recipients.length; i++) {
            amounts[i] = singleUnitOfValue * splits[i];
            payable(recipients[i]).transfer(amounts[i]);
        }

        emit FundsDrained(total, recipients, amounts);
    }

}