// SPDX-License-Identifier: MIT

pragma solidity 0.8.0;

import {Context} from "@openzeppelin/contracts/utils/Context.sol";

import {IKODAV3Minter} from "../core/IKODAV3Minter.sol";
import {IKODAV3PrimarySaleMarketplace} from "../marketplace/IKODAV3Marketplace.sol";
import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";

contract MintingFactory is Context {

    event AdminFreezeWindowChanged(uint256 _account);
    event AdminFrequencyOverrideChanged(address _account, bool _override);

    IKOAccessControlsLookup public accessControls;

    IKODAV3Minter public koda;

    IKODAV3PrimarySaleMarketplace public marketplace;

    // TODO decide on freeze period concept
    // TODO decide on merkle tree vs whitelist

    modifier canMintAgain(){
        require(_canCreateNewEdition(_msgSender()), "Caller unable to create yet");
        _;
    }

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

    function mintToken(SaleType _saleType, uint128 _startDate, uint128 _basePrice, uint128 _stepPrice, string calldata _uri)
    canMintAgain
    external {
        require(accessControls.hasMinterRole(_msgSender()), "Caller must have minter role");

        // Make tokens & edition
        uint256 editionId = koda.mintBatchEdition(1, _msgSender(), _uri);

        setupSalesMechanic(editionId, _saleType, _startDate, _basePrice, _stepPrice);
    }

    function mintBatchEdition(SaleType _saleType, uint96 _editionSize, uint128 _startDate, uint128 _basePrice, uint128 _stepPrice, string calldata _uri)
    canMintAgain
    external {
        require(accessControls.hasMinterRole(_msgSender()), "Caller must have minter role");

        // Make tokens & edition
        uint256 editionId = koda.mintBatchEdition(_editionSize, _msgSender(), _uri);

        setupSalesMechanic(editionId, _saleType, _startDate, _basePrice, _stepPrice);
    }

    function mintBatchEditionAndComposeERC20s(SaleType _saleType, uint96 _editionSize, uint128 _startDate, uint128 _basePrice, uint128 _stepPrice, string calldata _uri, address[] calldata _erc20s, uint256[] calldata _amounts)
    canMintAgain
    external {
        require(accessControls.hasMinterRole(_msgSender()), "Caller must have minter role");

        uint256 editionId = koda.mintBatchEditionAndComposeERC20s(_editionSize, _msgSender(), _uri, _erc20s, _amounts);

        setupSalesMechanic(editionId, _saleType, _startDate, _basePrice, _stepPrice);
    }

    function mintConsecutiveBatchEdition(SaleType _saleType, uint96 _editionSize, uint128 _startDate, uint128 _basePrice, uint128 _stepPrice, string calldata _uri)
    canMintAgain
    external {
        require(accessControls.hasMinterRole(_msgSender()), "Caller must have minter role");

        // Make tokens & edition
        uint256 editionId = koda.mintConsecutiveBatchEdition(_editionSize, _msgSender(), _uri);

        setupSalesMechanic(editionId, _saleType, _startDate, _basePrice, _stepPrice);
    }

    function setupSalesMechanic(uint256 _editionId, SaleType _saleType, uint128 _startDate, uint128 _basePrice, uint128 _stepPrice) internal {
        if (SaleType.BUY_NOW == _saleType) {
            marketplace.listEdition(_msgSender(), _editionId, _basePrice, _startDate);
        }
        else if (SaleType.STEPPED == _saleType) {
            marketplace.listSteppedEditionAuction(_msgSender(), _editionId, _basePrice, _stepPrice, _startDate);
        }
        else if (SaleType.OFFERS == _saleType) {
            marketplace.enableEditionOffers(_editionId, _startDate);
        }

        _recordSuccessfulMint(_msgSender());
    }

    /// Internal helpers

    function _canCreateNewEdition(address _account) internal view returns (bool) {
        return frequencyOverride[_account] ? true : _getNow() >= frozenTil[_account];
    }

    function _recordSuccessfulMint(address _account) internal {
        frozenTil[_account] = _getNow() + freezeWindow;
    }

    function _getNow() internal virtual view returns (uint256) {
        return block.timestamp;
    }

    /// Public helpers

    function canCreateNewEdition(address _account) public view returns (bool) {
        return _canCreateNewEdition(_account);
    }

    function setFrequencyOverride(address _account, bool _override) external {
        require(accessControls.hasAdminRole(_msgSender()), "Caller must have admin role");
        frequencyOverride[_account] = _override;
        emit AdminFrequencyOverrideChanged(_account, _override);
    }

    function setFreezeWindow(uint256 _freezeWindow) public {
        require(accessControls.hasAdminRole(_msgSender()), "Caller must have admin role");
        freezeWindow = _freezeWindow;
        emit AdminFreezeWindowChanged(_freezeWindow);
    }
}
