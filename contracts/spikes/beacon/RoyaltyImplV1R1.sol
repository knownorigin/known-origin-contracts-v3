// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "../collaborators/simple/FundsReceiver.sol";


contract RoyaltyImplV1R1 is FundsReceiver {

    // Faux bug with
    function totalRecipients() public override view returns (uint256) {
        require( false, "Woops, there's a bug!");
        return 0;
    }

}
