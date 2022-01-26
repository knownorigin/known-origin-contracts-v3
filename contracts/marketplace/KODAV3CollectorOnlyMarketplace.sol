// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import {BaseMarketplace} from "../marketplace/BaseMarketplace.sol";
import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../core/IKODAV3.sol";

import "hardhat/console.sol";


contract KODAV3CollectorOnlyMarketplace is BaseMarketplace {
    /// @notice emitted when a sale is created
    event SaleCreated(uint256 indexed saleId, uint256 indexed editionId);
    /// @notice emitted when someone mints from a sale
    event MintFromSale(uint256 indexed saleId, uint256 indexed editionId, address account, uint256 mintCount);
    /// @notice emitted when primary sales commission is updated for a sale
    event AdminUpdatePlatformPrimarySaleCommissionGatedSale(uint256 indexed saleId, uint256 platformPrimarySaleCommission);

    /// @dev incremental counter for the ID of a sale
    uint256 private saleIdCounter;

    struct Sale {
        uint256 id; // The ID of the sale
        address owner; // The creator of the sale
        uint256 editionId; // The ID of the edition the sale will mint
        uint128 startTime; // The start time of the sale
        uint128 endTime; // The end time of the sale
        uint16 mintLimit; // The mint limit per wallet for the sale
        uint128 priceInWei; // Price in wei for one mint
    }

    modifier onlyCreatorOrAdmin(uint256 _editionId) {
        require(
            accessControls.hasAdminRole(_msgSender()) || koda.getCreatorOfEdition(_editionId) == _msgSender(),
            "Caller not creator or admin"
        );
        _;
    }

    /// @dev sales is a mapping of sale id => Sale
    mapping(uint256 => Sale) public sales;
    /// @dev editionToSale is a mapping of edition id => sale id
    mapping(uint256 => uint256) public editionToSale;
    /// @dev totalMints is a mapping of sale id => address => total minted by that address
    mapping(uint256 => mapping(address => uint)) private totalMints;
    /// @dev saleCommission is a mapping of sale id => commission %, if 0 its default 15_00000 (15%)
    mapping(uint256 => uint256) private saleCommission;

    constructor(IKOAccessControlsLookup _accessControls, IKODAV3 _koda, address _platformAccount)
    BaseMarketplace(_accessControls, _koda, _platformAccount) {}

    function createSale(uint256 _editionId, uint128 _startTime, uint128 _endTime, uint16 _mintLimit, uint128 _priceInWei)
    public
    whenNotPaused
    onlyCreatorOrAdmin(_editionId)
    {
        uint256 editionSize = koda.getSizeOfEdition(_editionId);
        require(editionSize > 0, 'edition does not exist');
        require(_endTime > _startTime, 'sale end time must be after start time');
        require(_mintLimit > 0 && _mintLimit < editionSize, 'mint limit must be greater than 0 and smaller than edition size');

        uint256 saleId = saleIdCounter += 1;

        // Assign the sale to the sales and editionToSale mappings
        sales[saleId] = Sale({
        id : saleId,
        owner : _msgSender(),
        editionId : _editionId,
        startTime : _startTime,
        endTime : _endTime,
        mintLimit : _mintLimit,
        priceInWei : _priceInWei
        });
        editionToSale[_editionId] = saleId;

        emit SaleCreated(saleId, _editionId);
    }

    function mint(uint256 _saleId, uint256 _tokenId, uint16 _mintCount)
    payable
    public
    nonReentrant
    whenNotPaused
    {
        require(koda.ownerOf(_tokenId) == _msgSender(), 'caller does not own token');

        Sale memory sale = sales[_saleId];

        require(koda.getCreatorOfToken(_tokenId) == sale.owner, 'token creator does not match sale creator');

        // TODO do we need both checks, will the sold out check save gas of fetching token ids?
        require(!koda.isEditionSoldOut(sale.editionId), 'the sale is sold out');

        uint256 nextAvailableToken = koda.getNextAvailablePrimarySaleToken(sale.editionId);
        uint256 maxTokenAvailable = koda.maxTokenIdOfEdition(sale.editionId);
        require((maxTokenAvailable - nextAvailableToken) >= _mintCount, 'not enough supply remaining to fulfil mint');

        require(block.timestamp >= sale.startTime && block.timestamp < sale.endTime, 'sale not in progress');
        require(totalMints[_saleId][_msgSender()] + _mintCount <= sale.mintLimit, 'cannot exceed total mints for sale');
        require(msg.value >= sale.priceInWei * _mintCount, 'not enough wei sent to complete mint');

        // Up the mint count for the user
        totalMints[_saleId][_msgSender()] += _mintCount;

        _handleMint(_saleId, sale.editionId, _mintCount, msg.value);

        emit MintFromSale(_saleId, sale.editionId, _msgSender(), _mintCount);
    }

    function _handleMint(uint256 _saleId, uint256 _editionId, uint16 _mintCount, uint value) internal {
        address receiver;
        address creator;

        for (uint i = 0; i < _mintCount; i++) {
            (address receiver, address creator, uint256 tokenId) = koda.facilitateNextPrimarySale(_editionId);

            // send token to buyer (assumes approval has been made, if not then this will fail)
            koda.safeTransferFrom(creator, _msgSender(), tokenId);
        }

        _handleEditionSaleFunds(_saleId, _editionId, creator, receiver, value);
    }

    function _processSale(
        uint256 _editionId,
        uint256 _paymentAmount,
        address _buyer,
        address _seller
    ) internal override returns (uint256) {
        return 0;
    }

    // not used
    function _isListingPermitted(uint256 _editionId) internal view override returns (bool) {
        // TODO use this to check sales type etc, guard before create
        return false;
    }

    function _handleEditionSaleFunds(uint256 _saleId, uint256 _editionId, address _creator, address _receiver, uint256 _paymentAmount) internal {
        uint256 platformPrimarySaleCommission = saleCommission[_saleId] > 0 ? saleCommission[_saleId] : 15_00000;
        uint256 koCommission = (_paymentAmount / modulo) * platformPrimarySaleCommission;
        if (koCommission > 0) {
            (bool koCommissionSuccess,) = platformAccount.call{value : koCommission}("");
            require(koCommissionSuccess, "commission payment failed");
        }

        (bool success,) = _receiver.call{value : _paymentAmount - koCommission}("");
        require(success, "payment failed");
    }

    function updatePlatformPrimarySaleCommission(uint256 _saleId, uint256 _platformPrimarySaleCommission) public onlyAdmin {
        saleCommission[_saleId] = _platformPrimarySaleCommission;

        emit AdminUpdatePlatformPrimarySaleCommissionGatedSale(_saleId, _platformPrimarySaleCommission);
    }
}
