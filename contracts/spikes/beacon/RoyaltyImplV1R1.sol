// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "@openzeppelin/contracts/proxy/UpgradeableBeacon.sol";
import "../collaborators/simple/FundsReceiver.sol";


contract RoyaltyImplV1R1 is FundsReceiver {

    function totalRecipients() external override view returns (uint256) {
        require( false, "Woops, there's a bug!");
        return 0;
    }

}
