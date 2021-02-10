// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./libs/Whitelist.sol";
import "./ISelfServiceFrequencyControls.sol";

contract SelfServiceFrequencyControls is ISelfServiceFrequencyControls, Whitelist {
    using SafeMath for uint256;

    // frozen out for..
    uint256 public freezeWindow = 1 days;

    // When the current time period started
    mapping(address => uint256) public frozenTil;

    // Frequency override list for users - you can temporaily add in address which disables the 24hr check
    mapping(address => bool) public frequencyOverride;

    constructor() {
        super.addAddressToWhitelist(msg.sender);
    }

    function canCreateNewEdition(address artist) external override view returns (bool) {
        if (frequencyOverride[artist]) {
            return true;
        }
        return (block.timestamp >= frozenTil[artist]);
    }

    function recordSuccessfulMint(address artist, uint256 /*totalAvailable*/, uint256 /*priceInWei*/) external onlyIfWhitelisted(msg.sender) override returns (bool) {
        frozenTil[artist] = block.timestamp.add(freezeWindow);
        return true;
    }

    function setFrequencyOverride(address artist, bool value) external onlyIfWhitelisted(msg.sender) {
        frequencyOverride[artist] = value;
    }

    /**
     * @dev Sets freeze window
     * @dev Only callable from owner
     */
    function setFreezeWindow(uint256 _freezeWindow) onlyIfWhitelisted(msg.sender) public {
        freezeWindow = _freezeWindow;
    }

}
