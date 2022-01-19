// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {BaseMarketplace} from "../marketplace/BaseMarketplace.sol";

import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../core/IKODAV3.sol";

import "hardhat/console.sol";
import "../spikes/core/mixins/NFTPermit.sol";
import "../marketplace/IKODAV3Marketplace.sol";

contract BasicGatedSale is BaseMarketplace {

    event SaleWithPhaseCreated(uint256 indexed saleID, uint256 editionID, uint256 startTime, uint256 endTime, uint256 mintLimit, bytes32 merkleRoot, string merkleIPFSHash, uint256 priceInWei);
    event MintFromSale(uint256 saleID, uint256 editionID, address account, uint256 mintCount);

    uint256 private saleIdCounter;

    /// @notice Phase represents a time structured part of a sale, i.e. VIP, pre sale or open sale
    struct Phase {
        uint256 startTime; // The start time of the sale as a whole
        uint256 endTime; // The end time of the sale phase, also the beginning of the next phase if applicable
        uint256 mintLimit; // The mint limit per wallet for the phase
        bytes32 merkleRoot; // The merkle tree root for the phase
        string merkleIPFSHash; // The IPFS hash referencing the merkle tree
        uint256 priceInWei; // Price in wei for one mint
    }

    /// @notice Sale represents a gated sale, with mapping links to different sale phases
    struct Sale {
        uint256 id; // The ID of the sale
        uint256 editionId; // The ID of the edition the sale will mint
    }

    /// @notice KO commission on every sale
    uint256 public platformPrimarySaleCommission = 15_00000;  // 15.00000%

    mapping(uint256 => Sale) public sales;
    mapping(uint256 => Phase[]) public phases;
    mapping(uint256 => mapping(uint256 => mapping(address => uint))) private totalMints;

    constructor(IKOAccessControlsLookup _accessControls, IKODAV3 _koda, address _platformAccount)
    BaseMarketplace(_accessControls, _koda, _platformAccount) {
    }

    function createSaleWithPhase(uint256 _editionId, uint256 _startTime, uint256 _endTime, uint256 _mintLimit, bytes32 _merkleRoot, string memory _merkleIPFSHash, uint256 _priceInWei) public onlyAdmin {
        require(koda.editionExists(_editionId), 'edition does not exist');
        require(_startTime > block.timestamp, 'phase start time must be in the future');
        require(_endTime > _startTime, 'phase end time must be after start time');
        require(_mintLimit > 0, 'phase mint limit must be greater than 0');

        // Get the latest sale ID
        saleIdCounter += 1;
        uint256 saleId = saleIdCounter;

        // Assign the sale to the sales mapping
        sales[saleId] = Sale({id : saleId, editionId : _editionId});

        phases[saleId].push(Phase({
        startTime : _startTime,
        endTime : _endTime,
        mintLimit : _mintLimit,
        merkleRoot : _merkleRoot,
        merkleIPFSHash : _merkleIPFSHash,
        priceInWei : _priceInWei
        }));

        emit SaleWithPhaseCreated(saleId, _editionId, _startTime, _endTime, _mintLimit, _merkleRoot, _merkleIPFSHash, _priceInWei);
    }

    function mint(uint256 _saleId, uint256 _salePhaseId, uint256 _mintCount, uint256 _index, bytes32[] calldata _merkleProof) payable public nonReentrant {
        Phase memory phase = phases[_saleId][_salePhaseId];

        // Check the phase exists and it is in progress
        require(block.timestamp >= phase.startTime && block.timestamp < phase.endTime, 'sale phase not in progress');
        require(msg.value >= phase.priceInWei * _mintCount, 'not enough wei sent to complete mint');

        // Check the msg sender is on the pre list
        require(canMint(_saleId, _salePhaseId, _index, msg.sender, _merkleProof), 'address not able to mint from sale');

        require(totalMints[_saleId][_salePhaseId][msg.sender] + _mintCount <= phase.mintLimit, 'cannot exceed total mints for sale phase');

        totalMints[_saleId][_salePhaseId][msg.sender] += _mintCount;

        // sort payments
        Sale memory sale = sales[_saleId];
        (address receiver, address creator, uint256 tokenId) = koda.facilitateNextPrimarySale(sale.editionId);

        // split money
        _handleEditionSaleFunds(sale.editionId, creator, receiver, msg.value);

        // send token to buyer (assumes approval has been made, if not then this will fail)
        koda.safeTransferFrom(creator, msg.sender, tokenId);

        emit MintFromSale(_saleId, sale.editionId, msg.sender, _mintCount);
    }

    function canMint(uint256 _saleId, uint _salePhaseId, uint256 _index, address _account, bytes32[] calldata _merkleProof) public view returns (bool) {
        Phase memory phase = phases[_saleId][_salePhaseId];

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

    function _handleEditionSaleFunds(uint256 _editionId, address _creator, address _receiver, uint256 _paymentAmount) internal {
        uint256 koCommission = (_paymentAmount / modulo) * platformPrimarySaleCommission;
        if (koCommission > 0) {
            (bool koCommissionSuccess,) = platformAccount.call{value : koCommission}("");
            require(koCommissionSuccess, "Edition commission payment failed");
        }

        (bool success,) = _receiver.call{value : _paymentAmount - koCommission}("");
        require(success, "Edition payment failed");
    }

    function updatePlatformPrimarySaleCommission(uint256 _platformPrimarySaleCommission) public onlyAdmin {
        platformPrimarySaleCommission = _platformPrimarySaleCommission;
        emit AdminUpdatePlatformPrimarySaleCommission(_platformPrimarySaleCommission);
    }
}
