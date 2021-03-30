// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "@openzeppelin/contracts/proxy/UpgradeableBeacon.sol";
import "../collaborators/simple/FundsReceiver.sol";


contract RoyaltyImplV1R2 is FundsReceiver {

    function getCriticalInfo() public view returns (string response) {
        response = "Yay, the bug has been fixeed!";
    }

}
