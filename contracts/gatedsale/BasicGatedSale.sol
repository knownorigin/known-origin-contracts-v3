// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import {BaseMarketplace} from "../marketplace/BaseMarketplace.sol";
import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../core/IKODAV3.sol";

import "hardhat/console.sol";

contract BasicGatedSale is BaseMarketplace {

    event SaleWithPhaseCreated(uint256 indexed saleID, uint256 indexed editionID, uint256 startTime, uint256 endTime, uint256 mintLimit, bytes32 merkleRoot, string merkleIPFSHash, uint256 priceInWei);
    event MintFromSale(uint256 indexed saleID, uint256 indexed editionID, address account, uint256 mintCount);

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

    // TODO start and end 128
    //    mint limit 16
    //    price 128
    //    move price up to next to mint, ordered in 32 size slots

    /// @notice Sale represents a gated sale, with mapping links to different sale phases
    struct Sale {
        uint256 id; // The ID of the sale
        uint256 editionId; // The ID of the edition the sale will mint
        uint256 platformPrimarySaleCommission;  // percentage to platform
    }

    /// @notice KO commission on every sale
    uint256 constant internal defaultPlatformPrimarySaleCommission = 15_00000;  // 15.00000%, KO standard

    /// @dev sales is a mapping of sale id => Sale
    mapping(uint256 => Sale) public sales;
    /// @dev phases is a mapping of sale id => array of associated phases
    mapping(uint256 => Phase[]) public phases;
    /// @dev totalMints is a mapping of sale id => phase id => address => total minted by that address
    mapping(uint256 => mapping(uint256 => mapping(address => uint))) private totalMints;
    /// @dev editionToSale is a mapping of edition id => sale id
    mapping(uint256 => uint256) public editionToSale;

    constructor(IKOAccessControlsLookup _accessControls, IKODAV3 _koda, address _platformAccount)
    BaseMarketplace(_accessControls, _koda, _platformAccount) {}

    function createSaleWithPhase(uint256 _editionId, uint256 _startTime, uint256 _endTime, uint256 _mintLimit, bytes32 _merkleRoot, string memory _merkleIPFSHash, uint256 _priceInWei) public onlyAdmin {
        require(koda.editionExists(_editionId), 'edition does not exist');
        require(_startTime > block.timestamp, 'phase start time must be in the future');
        require(_endTime > _startTime, 'phase end time must be after start time');
        require(_mintLimit > 0, 'phase mint limit must be greater than 0');

        // Get the latest sale ID
        saleIdCounter += 1;
        uint256 saleId = saleIdCounter;

        // Assign the sale to the sales and editionToSale mappings
        sales[saleId] = Sale({id : saleId, editionId : _editionId, platformPrimarySaleCommission: defaultPlatformPrimarySaleCommission});
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

        emit SaleWithPhaseCreated(saleId, _editionId, _startTime, _endTime, _mintLimit, _merkleRoot, _merkleIPFSHash, _priceInWei);
    }

    function mint(uint256 _saleId, uint256 _salePhaseId, uint256 _mintCount, uint256 _index, bytes32[] calldata _merkleProof) payable public nonReentrant whenNotPaused {
        require(_salePhaseId <= phases[_saleId].length - 1, 'phase id does not exist');

        Phase memory phase = phases[_saleId][_salePhaseId];

        require(block.timestamp >= phase.startTime && block.timestamp < phase.endTime, 'sale phase not in progress');
        require(msg.value >= phase.priceInWei * _mintCount, 'not enough wei sent to complete mint');
        require(canMint(_saleId, _salePhaseId, _index, msg.sender, _merkleProof), 'address not able to mint from sale');         // Check the msg sender is on the pre list
        require(totalMints[_saleId][_salePhaseId][msg.sender] + _mintCount <= phase.mintLimit, 'cannot exceed total mints for sale phase');

        totalMints[_saleId][_salePhaseId][msg.sender] += _mintCount;

        // sort payments
        Sale memory sale = sales[_saleId];
        (address receiver, address creator, uint256 tokenId) = koda.facilitateNextPrimarySale(sale.editionId);

        // split money // FIXME do we just send all the money?
        _handleEditionSaleFunds(sale.editionId, creator, receiver, msg.value, sale.platformPrimarySaleCommission);

        // send token to buyer (assumes approval has been made, if not then this will fail)
        koda.safeTransferFrom(creator, msg.sender, tokenId);

        // FIXME this is a bit pointless - maybe move back...
//        _processSale(sale.editionId, msg.value, msg.sender, creator); // FIXME do we just send all the money?

        emit MintFromSale(_saleId, sale.editionId, msg.sender, _mintCount);
    }

    // FIXME need internal and public?
    function canMint(uint256 _saleId, uint _salePhaseId, uint256 _index, address _account, bytes32[] calldata _merkleProof) public view returns (bool) {
        Phase memory phase = phases[_saleId][_salePhaseId];

        // assume balance of 1 for enabled artists
        bytes32 node = keccak256(abi.encodePacked(_index, _account, uint256(1)));
        return MerkleProof.verify(_merkleProof, phase.merkleRoot, node);
    }

    // TODO speak to James about the whole point of this...
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
        return false;
    }

    function _handleEditionSaleFunds(uint256 _editionId, address _creator, address _receiver, uint256 _paymentAmount, uint256 _platformPrimarySaleCommission) internal {
        uint256 koCommission = (_paymentAmount / modulo) * _platformPrimarySaleCommission;
        if (koCommission > 0) {
            (bool koCommissionSuccess,) = platformAccount.call{value : koCommission}("");
            require(koCommissionSuccess, "commission payment failed");
        }

        (bool success,) = _receiver.call{value : _paymentAmount - koCommission}("");
        require(success, "payment failed");
    }

    function updatePlatformPrimarySaleCommission(uint256 _saleId, uint256 _platformPrimarySaleCommission) public onlyAdmin {
        Sale storage sale = sales[_saleId];
        sale.platformPrimarySaleCommission = _platformPrimarySaleCommission;
        emit AdminUpdatePlatformPrimarySaleCommission(_platformPrimarySaleCommission); // FIXME needs new event with both params
    }
}
