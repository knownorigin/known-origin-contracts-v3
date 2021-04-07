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

        // Determine share for each recipient
        uint256 balance = address(this).balance;
        uint256 singleUnitOfValue = balance / FIXED_PCT;
        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 share = singleUnitOfValue * splits[i];
            payable(recipients[i]).transfer(share);
        }
    }

}