// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;

import "../IFundsHandler.sol";
import "../IFundsDrainable.sol";

contract FundsReceiver is IFundsHandler, IFundsDrainable {

    bool private _notEntered = true;

    /** @dev Prevents a contract from calling itself, directly or indirectly. */
    modifier nonReentrant() {
        require(_notEntered, "ReentrancyGuard: reentrant call");
        _notEntered = false;
        _;
        _notEntered = true;
    }

    bool private locked;
    address[] public recipients;
    uint256[] public splits;

    /**
     * @notice Using a minimal proxy contract pattern initialises the contract and sets delegation
     * @dev initialises the FundsReceiver (see https://eips.ethereum.org/EIPS/eip-1167)
     */
    function init(address[] calldata _recipients, uint256[] calldata _splits) override external {
        require(!locked, "contract locked sorry");
        locked = true;
        recipients = _recipients;
        splits = _splits;
    }

    // accept all funds
    receive() external payable {}

    function drain() nonReentrant public override {

        // accept funds
        uint256 balance = address(this).balance;
        uint256 singleUnitOfValue = balance / 100000;

        // split according to total
        for (uint256 i = 0; i < recipients.length; i++) {

            // Work out split
            uint256 share = singleUnitOfValue * splits[i];

            // Assumed all recipients are EOA and not contracts atm
            // Fire split to recipient
            payable(recipients[i]).transfer(share);
        }
    }

    function totalRecipients() public override view returns (uint256) {
        return recipients.length;
    }

    function royaltyAtIndex(uint256 index) public override view returns (address, uint256) {
        return (recipients[index], splits[index]);
    }
}
