// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/UpgradeableBeacon.sol";

contract CollaborativeUpgradableBeacon is UpgradeableBeacon {

    /**
     * @dev Sets the address of the initial implementation, and the deployer account as the owner who can upgrade the
     * beacon.
     */
    constructor(address implementation_)
    UpgradeableBeacon(implementation_)
    public {
    }
}
