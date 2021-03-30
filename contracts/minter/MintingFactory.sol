// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import {Context} from "@openzeppelin/contracts/utils/Context.sol";

import {IKODAV3Minter} from "../core/IKODAV3Minter.sol";
import {IKODAV3PrimarySaleMarketplace} from "../marketplace/IKODAV3Marketplace.sol";
import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";

contract MintingFactory is Context {

    event AdminMintingPeriodChanged(uint256 _mintingPeriod);
    event AdminMaxMintsInPeriodChanged(uint256 _maxMintsInPeriod);
    event AdminFrequencyOverrideChanged(address _account, bool _override);

    IKOAccessControlsLookup public accessControls;

    IKODAV3Minter public koda;

    IKODAV3PrimarySaleMarketplace public marketplace;

    // TODO decide on merkle tree vs whitelist

    modifier canMintAgain(){
        require(_canCreateNewEdition(_msgSender()), "Caller unable to create yet");
        _;
    }

    // Minting allowance period
    uint256 public mintingPeriod = 30 days;

    // Limit of mints with in the period
    uint256 public maxMintsInPeriod = 15;

    // Frequency override list for users - you can temporarily add in address which disables the freeze time check
    mapping(address => bool) public frequencyOverride;

    struct MintingPeriod {
        uint128 mints;
        uint128 firstMintInPeriod;
    }

    // How many mints within the current minting period
    mapping(address => MintingPeriod) mintingPeriodConfig;

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
        // if frequency is overridden then assume they can mint
        if (frequencyOverride[_account]) {
            return true;
        }

        // if within the period range, check remaining allowance
        if (_getNow() <= mintingPeriodConfig[_account].firstMintInPeriod + mintingPeriod) {
            return mintingPeriodConfig[_account].mints < maxMintsInPeriod;
        }

        // if period expired - can mint another one
        return true;
    }

    function _recordSuccessfulMint(address _account) internal {
        MintingPeriod storage period = mintingPeriodConfig[_account];

        uint256 endOfCurrentMintingPeriodLimit = period.firstMintInPeriod + mintingPeriod;

        // if first time use, set the first timestamp to be now abd start counting
        if (period.firstMintInPeriod == 0) {
            period.firstMintInPeriod = _getNow();
            period.mints = period.mints + 1;
        }
        // if still within the minting period, record the new mint
        else if (_getNow() <= endOfCurrentMintingPeriodLimit) {
            period.mints = period.mints + 1;
        }
        // if we are outside of the window reset the limit and record a new single mint
        else if (endOfCurrentMintingPeriodLimit < _getNow()) {
            period.mints = 1;
            period.firstMintInPeriod = _getNow();
        }
    }

    function _getNow() internal virtual view returns (uint128) {
        return uint128(block.timestamp);
    }

    /// Public helpers

    function canCreateNewEdition(address _account) public view returns (bool) {
        return _canCreateNewEdition(_account);
    }

    function currentMintConfig(address _account) public view returns (uint128 mints, uint128 firstMintInPeriod) {
        MintingPeriod memory mintingPeriod = mintingPeriodConfig[_account];
        return (
        mintingPeriod.mints,
        mintingPeriod.firstMintInPeriod
        );
    }

    function setFrequencyOverride(address _account, bool _override) external {
        require(accessControls.hasAdminRole(_msgSender()), "Caller must have admin role");
        frequencyOverride[_account] = _override;
        emit AdminFrequencyOverrideChanged(_account, _override);
    }

    function setMintingPeriod(uint256 _mintingPeriod) public {
        require(accessControls.hasAdminRole(_msgSender()), "Caller must have admin role");
        mintingPeriod = _mintingPeriod;
        emit AdminMintingPeriodChanged(_mintingPeriod);
    }

    function setMaxMintsInPeriod(uint256 _maxMintsInPeriod) public {
        require(accessControls.hasAdminRole(_msgSender()), "Caller must have admin role");
        maxMintsInPeriod = _maxMintsInPeriod;
        emit AdminMaxMintsInPeriodChanged(_maxMintsInPeriod);
    }

}
