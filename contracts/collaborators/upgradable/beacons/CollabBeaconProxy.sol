// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import {BeaconProxy} from "@openzeppelin/contracts/proxy/BeaconProxy.sol";

contract CollabBeaconProxy is BeaconProxy {

    constructor(address beacon, bytes memory data)
    BeaconProxy(beacon, data)
    public
    payable {
    }
}
