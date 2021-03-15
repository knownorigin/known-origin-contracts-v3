// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import {Context} from "@openzeppelin/contracts/GSN/Context.sol";

import {IKODAV3Minter} from "../core/IKODAV3Minter.sol";
import {IKODAV3PrimarySaleMarketplace} from "../marketplace/IKODAV3Marketplace.sol";
import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";

contract MinterFactory is Context {

    event AdminFreezeWindowChanged(uint256 _account);
    event AdminFrequencyOverrideChanged(address _account, bool _override);

    IKOAccessControlsLookup public accessControls;

    IKODAV3Minter public koda;

    IKODAV3PrimarySaleMarketplace public marketplace;

    // frozen out for..
    uint256 public freezeWindow = 1 days;

    // When the current time period started
    mapping(address => uint256) public frozenTil;

    // Frequency override list for users - you can temporarily add in address which disables the freeze time check
    mapping(address => bool) public frequencyOverride;

    enum SaleType {
        BUY_NOW, OFFERS, STEPPED
    }

    constructor(
        IKOAccessControlsLookup _accessControls,
        IKODAV3Minter _koda,
        IKODAV3PrimarySaleMarketplace _marketplace
    ) {
        accessControls = _accessControls;
        koda = _koda;
        marketplace = _marketplace;
    }

    ////////
    // V2 //
    ////////

    function mintToken(SaleType saleType, uint128 _startDate, uint128 _basePrice, uint128 _stepPrice, string calldata _uri) public {
        require(accessControls.hasMinterRole(_msgSender()), "KODA: Caller must have minter role");
        require(_canCreateNewEdition(_msgSender()), "KODA: Caller unable to create yet");

        // Make tokens & edition
        uint256 editionId = koda.mintToken(_msgSender(), _uri);

        setupSalesMechanic(editionId, saleType, _startDate, _basePrice, _stepPrice);
    }

    function mintBatchEdition(SaleType saleType, uint96 _editionSize, uint128 _startDate, uint128 _basePrice, uint128 _stepPrice, string calldata _uri) public {
        require(accessControls.hasMinterRole(_msgSender()), "KODA: Caller must have minter role");
        require(_canCreateNewEdition(_msgSender()), "KODA: Caller unable to create yet");

        // Make tokens & edition
        uint256 editionId = koda.mintBatchEdition(_editionSize, _msgSender(), _uri);

        setupSalesMechanic(editionId, saleType, _startDate, _basePrice, _stepPrice);
    }

    function mintConsecutiveBatchEdition(SaleType saleType, uint96 _editionSize, uint128 _startDate, uint128 _basePrice, uint128 _stepPrice, string calldata _uri) public {
        require(accessControls.hasMinterRole(_msgSender()), "KODA: Caller must have minter role");
        require(_canCreateNewEdition(_msgSender()), "KODA: Caller unable to create yet");

        // Make tokens & edition
        uint256 editionId = koda.mintConsecutiveBatchEdition(_editionSize, _msgSender(), _uri);

        setupSalesMechanic(editionId, saleType, _startDate, _basePrice, _stepPrice);
    }

    function setupSalesMechanic(uint256 _editionId, SaleType saleType, uint128 _startDate, uint128 _basePrice, uint128 _stepPrice) internal {
        if (SaleType.BUY_NOW == saleType) {
            marketplace.listEdition(_msgSender(), _editionId, _basePrice, _startDate);
        }
        else if (SaleType.STEPPED == saleType) {
            marketplace.listSteppedEditionAuction(_msgSender(), _editionId, _basePrice, _stepPrice, _startDate);
        }
        else if (SaleType.OFFERS == saleType) {
            marketplace.enableOffers(_msgSender(), _editionId, _startDate);
        }
    }

    //////////////////////
    // Internal helpers //
    //////////////////////

    function _canCreateNewEdition(address _account) internal view returns (bool) {
        if (frequencyOverride[_account]) {
            return true;
        }
        return (block.timestamp >= frozenTil[_account]);
    }

    function _recordSuccessfulMint(address _account) internal {
        frozenTil[_account] = block.timestamp + freezeWindow;
    }

    ////////////////////
    // Public helpers //
    ////////////////////

    function canCreateNewEdition(address _account) public view returns (bool) {
        return _canCreateNewEdition(_account);
    }

    function setFrequencyOverride(address _account, bool _override) external {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller must have admin role");
        frequencyOverride[_account] = _override;
        emit AdminFrequencyOverrideChanged(_account, _override);
    }

    function setFreezeWindow(uint256 _freezeWindow) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller must have admin role");
        freezeWindow = _freezeWindow;
        emit AdminFreezeWindowChanged(_freezeWindow);
    }

}
