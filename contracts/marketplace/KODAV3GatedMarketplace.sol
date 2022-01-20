// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import {BaseMarketplace} from "../marketplace/BaseMarketplace.sol";
import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../core/IKODAV3.sol";

import "hardhat/console.sol";

contract KODAV3GatedMarketplace is BaseMarketplace {
    /// @notice emitted when a sale, with a single phase, is created
    event SaleWithPhaseCreated(uint256 indexed saleId, uint256 indexed editionId);
    /// @notice emitted when a new phase is added to a sale
    event PhaseCreated(uint256 indexed saleId, uint256 indexed editionId);
    /// @notice emitted when someone mints from a sale
    event MintFromSale(uint256 indexed saleId, uint256 indexed editionId, address account, uint256 mintCount);
    /// @notice emitted when primary sales commission is updated for a sale
    event AdminUpdatePlatformPrimarySaleCommissionGatedSale(uint256 indexed saleId, uint256 platformPrimarySaleCommission);

    /// @dev incremental counter for the ID of a sale
    uint256 private saleIdCounter;

    /// @notice Phase represents a time structured part of a sale, i.e. VIP, pre sale or open sale
    struct Phase {
        uint128 startTime; // The start time of the sale as a whole
        uint128 endTime; // The end time of the sale phase, also the beginning of the next phase if applicable
        uint16 mintLimit; // The mint limit per wallet for the phase
        uint128 priceInWei; // Price in wei for one mint
        bytes32 merkleRoot; // The merkle tree root for the phase
        string merkleIPFSHash; // The IPFS hash referencing the merkle tree
    }

    /// @notice Sale represents a gated sale, with mapping links to different sale phases
    struct Sale {
        uint256 id; // The ID of the sale
        uint256 editionId; // The ID of the edition the sale will mint
    }

    // TODO can these mapping ids be smaller uints?
    /// @dev sales is a mapping of sale id => Sale
    mapping(uint256 => Sale) public sales;
    /// @dev phases is a mapping of sale id => array of associated phases
    mapping(uint256 => Phase[]) public phases;
    /// @dev totalMints is a mapping of sale id => phase id => address => total minted by that address
    mapping(uint256 => mapping(uint256 => mapping(address => uint))) private totalMints;
    /// @dev editionToSale is a mapping of edition id => sale id
    mapping(uint256 => uint256) public editionToSale;
    /// @dev saleCommission is a mapping of sale id => commission %, if 0 its default 15_00000 (15%)
    mapping(uint256 => uint256) private saleCommission;

    modifier onlyCreatorOrAdmin(uint256 _editionId) {
        require(
            accessControls.hasAdminRole(_msgSender()) || koda.getCreatorOfEdition(_editionId) == _msgSender(),
            "Caller not creator or admin"
        );
        _;
    }

    constructor(IKOAccessControlsLookup _accessControls, IKODAV3 _koda, address _platformAccount)
    BaseMarketplace(_accessControls, _koda, _platformAccount) {}

    function createSaleWithPhase(uint256 _editionId, uint128 _startTime, uint128 _endTime, uint16 _mintLimit, bytes32 _merkleRoot, string memory _merkleIPFSHash, uint128 _priceInWei)
    public
    whenNotPaused
    onlyCreatorOrAdmin(_editionId) {
        require(koda.editionExists(_editionId), 'edition does not exist');
        require(_endTime > _startTime, 'phase end time must be after start time');
        require(_mintLimit > 0 && _mintLimit < koda.getSizeOfEdition(_editionId), 'phase mint limit must be greater than 0');
        // TODO should this be per phase or overall sale?

        uint256 saleId = saleIdCounter += 1;

        // Assign the sale to the sales and editionToSale mappings
        sales[saleId] = Sale({id : saleId, editionId : _editionId});
        editionToSale[_editionId] = saleId;

        // Add the phase to the phases mapping
        phases[saleId].push(Phase({
        startTime : _startTime,
        endTime : _endTime,
        mintLimit : _mintLimit,
        merkleRoot : _merkleRoot,
        merkleIPFSHash : _merkleIPFSHash,
        priceInWei : _priceInWei
        }));

        emit SaleWithPhaseCreated(saleId, _editionId);
    }

    // TODO can the merkle tree element be smaller uints?
    function mint(uint256 _saleId, uint256 _salePhaseId, uint16 _mintCount, uint256 _index, bytes32[] calldata _merkleProof) payable public nonReentrant whenNotPaused {
        require(_salePhaseId <= phases[_saleId].length - 1, 'phase id does not exist');

        Phase memory phase = phases[_saleId][_salePhaseId];

        require(totalMints[_saleId][_salePhaseId][_msgSender()] + _mintCount <= phase.mintLimit, 'cannot exceed total mints for sale phase');
        require(block.timestamp >= phase.startTime && block.timestamp < phase.endTime, 'sale phase not in progress');
        require(msg.value >= phase.priceInWei * _mintCount, 'not enough wei sent to complete mint');
        require(canMint(_saleId, _salePhaseId, _index, _msgSender(), _merkleProof), 'address not able to mint from sale');
        // Check the msg sender is on the pre list

        // Up the mint count for the user
        totalMints[_saleId][_salePhaseId][_msgSender()] += _mintCount;

        // sort payments
        Sale memory sale = sales[_saleId];
        (address receiver, address creator, uint256 tokenId) = koda.facilitateNextPrimarySale(sale.editionId);

        // split money
        _handleEditionSaleFunds(_saleId, sale.editionId, creator, receiver, msg.value);

        // send token to buyer (assumes approval has been made, if not then this will fail)
        koda.safeTransferFrom(creator, _msgSender(), tokenId);
        // TODO need to handle multiple mints

        emit MintFromSale(_saleId, sale.editionId, _msgSender(), _mintCount);
    }

    function createPhase(uint256 _editionId, uint128 _startTime, uint128 _endTime, uint16 _mintLimit, bytes32 _merkleRoot, string memory _merkleIPFSHash, uint128 _priceInWei)
    public
    whenNotPaused
    onlyCreatorOrAdmin(_editionId) {
        require(koda.editionExists(_editionId), 'edition does not exist');
        require(_endTime > _startTime, 'phase end time must be after start time');
        require(_mintLimit > 0 && _mintLimit < koda.getSizeOfEdition(_editionId), 'phase mint limit must be greater than 0');
        // TODO do we need to tot up all mint limits for this check?

        uint256 saleId = editionToSale[_editionId];
        require(saleId > 0, 'no sale associated with edition id');

        Sale memory sale = sales[saleId];

        // Add the phase to the phases mapping
        phases[sale.id].push(Phase({
        startTime : _startTime,
        endTime : _endTime,
        mintLimit : _mintLimit,
        merkleRoot : _merkleRoot,
        merkleIPFSHash : _merkleIPFSHash,
        priceInWei : _priceInWei
        }));

        emit PhaseCreated(sale.id, _editionId);
    }

    //  TODO functions: addPhase, removePhase, pauseSale, endPhase?

    // FIXME need internal and public, profile first and make decision?
    function canMint(uint256 _saleId, uint _salePhaseId, uint256 _index, address _account, bytes32[] calldata _merkleProof) public view returns (bool) {
        Phase memory phase = phases[_saleId][_salePhaseId];

        // assume balance of 1 for enabled artists
        bytes32 node = keccak256(abi.encodePacked(_index, _account, uint256(1)));
        return MerkleProof.verify(_merkleProof, phase.merkleRoot, node);
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
