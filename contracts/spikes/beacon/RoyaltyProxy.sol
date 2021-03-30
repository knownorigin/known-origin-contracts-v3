// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "@openzeppelin/contracts/proxy/BeaconProxy.sol";
import "../collaborators/simple/IFundsHandler.sol";

contract RoyaltyProxy is BeaconProxy, IFundsHandler {

}