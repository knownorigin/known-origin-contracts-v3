// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import "../collaborators/IFundsHandler.sol";

contract RoyaltyProxy is BeaconProxy, IFundsHandler {

    constructor(address _beacon, bytes memory _data) BeaconProxy(_beacon, _data) {}

    // TODO - move init to a different interface or drop if we deploy implementations by script and not contract
    function init(address[] calldata _recipients, uint256[] calldata _splits) override external {}

    function totalRecipients() public override view returns (uint256) {
        return IFundsHandler(_implementation()).totalRecipients();
    }

    function royaltyAtIndex(uint256 _index) public override view returns (address recipient, uint256 split) {
        return IFundsHandler(_implementation()).royaltyAtIndex(_index);
    }

}