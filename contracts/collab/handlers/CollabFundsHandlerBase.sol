// SPDX-License-Identifier: MIT

pragma solidity 0.8.5;

import "./ICollabFundsHandler.sol";

abstract contract CollabFundsHandlerBase is ICollabFundsHandler {

    // Constants
    uint256 internal constant SCALE_FACTOR = 100000;

    // State
    bool internal locked = false;
    address[] public recipients;
    uint256[] public splits;

    /**
     * @notice Using a minimal proxy contract pattern initialises the contract and sets delegation
     * @dev initialises the FundsReceiver (see https://eips.ethereum.org/EIPS/eip-1167)
     */
    function init(address[] calldata _recipients, uint256[] calldata _splits) override virtual external {
        require(!locked, "contract locked sorry");
        locked = true;
        recipients = _recipients;
        splits = _splits;
    }

    // accept all funds
    receive() external payable {}

    // get the number of recipients this funds handler is configured for
    function totalRecipients() public override virtual view returns (uint256) {
        return recipients.length;
    }

    // get the recipient and split at the given index of the recipients list
    function royaltyAtIndex(uint256 _index) public override view returns (address recipient, uint256 split) {
        recipient = recipients[_index];
        split = splits[_index];
    }
}
