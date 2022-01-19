// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {BaseMarketplace} from "../marketplace/BaseMarketplace.sol";

import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../core/IKODAV3.sol";

contract BasicGatedSale is BaseMarketplace {

    event SaleCreated(uint256 indexed id);
    event MintFromSale(uint256 saleID, address account, uint256 mintCount);

    uint256 private saleIdCounter;

    struct SalePhase {
        uint256 startTime; // The start time of the sale as a whole
        uint256 endTime; // The end time of the sale phase, also the beginning of the next phase if applicable
        uint256 mintLimit; // The mint limit per wallet for the phase
        bytes32 merkleRoot; // The merkle tree root for the phase
        uint256 priceInWei; // Price in wei for one mint
    }

    struct Sale {
        uint256 id; // The ID of the sale
        uint256 editionId;
    }

    // Sale id return Sale
    mapping(uint256 => Sale) public sales;
    // Sale id => Phases
    mapping(uint256 => SalePhase[]) public phases; // TODO had to make this public for testing?
    // Sale id => Phase id => address returns a total mints
    mapping(uint256 => mapping(uint256 => mapping(address => uint))) private totalMints;

    constructor(IKOAccessControlsLookup _accessControls, IKODAV3 _koda, address _platformAccount)
        BaseMarketplace(_accessControls, _koda, _platformAccount) {
    }

    // _nextSaleID generates the next available SaleID
    function _nextSaleId() private returns (uint256) {
        saleIdCounter = saleIdCounter + 1;
        return saleIdCounter;
    }

    function createSale(uint256 _editionId) public onlyAdmin {

        // Get the latest sale ID
        uint256 saleId = _nextSaleId();

        // Assign the sale to the sales mapping
        sales[saleId] = Sale({id : saleId, editionId : _editionId});

        emit SaleCreated(saleId);
    }

    function addPhase(uint256 _saleId, uint256 _startTime, uint256 _endTime, uint256 _mintLimit, bytes32 _merkleRoot, uint256 _priceInWei) public onlyAdmin {
        require(_startTime > block.timestamp, 'phase start time must be in the future');
        require(_endTime > _startTime, 'phase end time must be after start time');
        require(_mintLimit > 0, 'phase mint limit must be greater than 0');
        require(_merkleRoot != 0, 'phase must have a valid merkle root');
        require(_priceInWei > 0, 'phase price must be greater than 0');

        phases[_saleId].push(
            SalePhase({
            startTime : _startTime,
            endTime : _endTime,
            mintLimit : _mintLimit,
            merkleRoot : _merkleRoot,
            priceInWei : _priceInWei
            }));
    }

    function mintFromSale(uint256 _saleId, uint _salePhaseId, uint256 _mintCount, uint256 _index, bytes32[] calldata _merkleProof) payable public nonReentrant {
        // Get the sale object
        SalePhase memory phase = phases[_saleId][_salePhaseId];

        // Check the phase exists and it is in progress
        require(block.timestamp >= phase.startTime && block.timestamp < phase.endTime, 'sale phase not in progress');

        // Check enough wei was sent
        require(msg.value >= phase.priceInWei * _mintCount, 'not enough wei sent to complete mint');

        // Check the msg sender is on the pre list
        require(onPreList(_saleId, _salePhaseId, _index, msg.sender, _merkleProof), 'address not able to mint from sale');

        require(totalMints[_saleId][_salePhaseId][msg.sender] + _mintCount <= phase.mintLimit, 'cannot exceed total mints for sale phase');

        totalMints[_saleId][_salePhaseId][msg.sender] += _mintCount;

        emit MintFromSale(_saleId, msg.sender, _mintCount);
    }

    function onPreList(uint256 _saleId, uint _salePhaseId, uint256 _index, address _account, bytes32[] calldata _merkleProof) public view returns (bool) {
        SalePhase memory phase = phases[_saleId][_salePhaseId];

        // assume balance of 1 for enabled artists
        bytes32 node = keccak256(abi.encodePacked(_index, _account, uint256(1)));
        return MerkleProof.verify(_merkleProof, phase.merkleRoot, node);
    }

    // shall we use?
    function _processSale(
        uint256 _tokenId,
        uint256 _paymentAmount,
        address _buyer,
        address _seller
    ) internal override returns (uint256) {
//        _facilitateSecondarySale(_tokenId, _paymentAmount, _seller, _buyer);
        return _tokenId;
    }

    // not used
    function _isListingPermitted(uint256 _editionId) internal view override returns (bool) {
        return false;
    }
}
