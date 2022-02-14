// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import {BaseUpgradableMarketplace} from "../../../marketplace/BaseUpgradableMarketplace.sol";
import {IKOAccessControlsLookup} from "../../../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../../../core/IKODAV3.sol";

contract MockKODAV3UpgradableGatedMarketplace is BaseUpgradableMarketplace {

    /// @notice emitted when a sale, with a single phase, is created
    event SaleWithPhaseCreated(uint256 indexed saleId, uint256 indexed editionId);
    /// @notice emitted when a new phase is added to a sale
    event PhaseCreated(uint256 indexed saleId, uint256 indexed editionId, uint256 indexed phaseId);
    /// @notice emitted when a phase is removed from a sale
    event PhaseRemoved(uint256 indexed saleId, uint256 indexed editionId, uint256 indexed phaseId);
    /// @notice emitted when someone mints from a sale
    event MintFromSale(uint256 indexed saleId, uint256 indexed editionId, uint256 indexed phaseId, address account, uint256 mintCount);
    /// @notice emitted when primary sales commission is updated for a sale
    event AdminUpdatePlatformPrimarySaleCommissionGatedSale(uint256 indexed saleId, uint256 platformPrimarySaleCommission);
    /// @notice emitted when a sale is paused
    event SalePaused(uint256 indexed saleId, uint256 indexed editionId);
    /// @notice emitted when a sale is resumed
    event SaleResumed(uint256 indexed saleId, uint256 indexed editionId);

    /// @dev incremental counter for the ID of a sale
    uint256 private saleIdCounter;

    /// @notice Phase represents a time structured part of a sale, i.e. VIP, pre sale or open sale
    struct Phase {
        uint128 startTime; // The start time of the sale as a whole
        uint128 endTime; // The end time of the sale phase, also the beginning of the next phase if applicable
        uint16 walletMintLimit; // The mint limit per wallet for the phase
        uint128 priceInWei; // Price in wei for one mint
        bytes32 merkleRoot; // The merkle tree root for the phase
        string merkleIPFSHash; // The IPFS hash referencing the merkle tree
        uint128 mintCap; // The maximum amount of mints for the phase
        uint128 mintCounter; // The current amount of items minted
    }

    /// @notice Sale represents a gated sale, with mapping links to different sale phases
    struct Sale {
        uint256 id; // The ID of the sale
        uint256 editionId; // The ID of the edition the sale will mint
        bool paused; // Whether the sale is currently paused
    }

    /// @dev sales is a mapping of sale id => Sale
    mapping(uint256 => Sale) public sales;
    /// @dev phases is a mapping of sale id => array of associated phases
    mapping(uint256 => Phase[]) public phases;
    /// @dev totalMints is a mapping of sale id => phase id => address => total minted by that address
    mapping(uint256 => mapping(uint256 => mapping(address => uint))) public totalMints;
    /// @dev editionToSale is a mapping of edition id => sale id
    mapping(uint256 => uint256) public editionToSale;
    /// @dev saleCommission is a mapping of sale id => commission %, if 0 its default 15_00000 (15%)
    mapping(uint256 => uint256) public saleCommission;

    modifier onlyCreatorOrAdmin(uint256 _editionId) {
        require(
            accessControls.hasAdminRole(_msgSender()) || koda.getCreatorOfEdition(_editionId) == _msgSender(),
            "Caller not creator or admin"
        );
        _;
    }

    function createSaleWithPhase(uint256 _editionId, uint128 _startTime, uint128 _endTime, uint16 _walletMintLimit, bytes32 _merkleRoot, string memory _merkleIPFSHash, uint128 _priceInWei, uint128 _mintCap)
    public
    whenNotPaused
    onlyCreatorOrAdmin(_editionId) {
        uint256 editionSize = koda.getSizeOfEdition(_editionId);
        require(editionSize > 0, 'edition does not exist');
        require(_endTime > _startTime, 'phase end time must be after start time');
        require(_walletMintLimit > 0 && _walletMintLimit < editionSize, 'phase mint limit must be greater than 0');

        uint256 saleId = saleIdCounter += 1;

        // Assign the sale to the sales and editionToSale mappings
        sales[saleId] = Sale({id : saleId, editionId : _editionId, paused : false});
        editionToSale[_editionId] = saleId;

        // Add the phase to the phases mapping
        phases[saleId].push(Phase({
        startTime : _startTime,
        endTime : _endTime,
        walletMintLimit : _walletMintLimit,
        merkleRoot : _merkleRoot,
        merkleIPFSHash : _merkleIPFSHash,
        priceInWei : _priceInWei,
        mintCap : _mintCap,
        mintCounter : 0
        }));

        emit SaleWithPhaseCreated(saleId, _editionId);
    }

    function createSaleWithPhases(uint256 _editionId, uint128[] memory _startTimes, uint128[] memory _endTimes, uint16[] memory _walletMintLimits, bytes32[] memory _merkleRoots, string[] memory _merkleIPFSHashes, uint128[] memory _pricesInWei, uint128[] memory _mintCaps)
    public
    whenNotPaused
    onlyCreatorOrAdmin(_editionId) {
        uint256 editionSize = koda.getSizeOfEdition(_editionId);
        require(editionSize > 0, 'edition does not exist');

        uint256 saleId = saleIdCounter += 1;

        // Assign the sale to the sales and editionToSale mappings
        sales[saleId] = Sale({id : saleId, editionId : _editionId, paused : false});
        editionToSale[_editionId] = saleId;

        for (uint i = 0; i < _startTimes.length; i++) {
            require(_endTimes[i] > _startTimes[i], 'phase end time must be after start time');
            require(_walletMintLimits[i] > 0 && _walletMintLimits[i] < editionSize, 'phase mint limit must be greater than 0');

            phases[saleId].push(Phase({
            startTime : _startTimes[i],
            endTime : _endTimes[i],
            walletMintLimit : _walletMintLimits[i],
            merkleRoot : _merkleRoots[i],
            merkleIPFSHash : _merkleIPFSHashes[i],
            priceInWei : _pricesInWei[i],
            mintCap : _mintCaps[i],
            mintCounter : 0
            }));
        }

        emit SaleWithPhaseCreated(saleId, _editionId);
    }

    function mint(uint256 _saleId, uint256 _phaseId, uint16 _mintCount, uint256 _index, bytes32[] calldata _merkleProof) payable public nonReentrant whenNotPaused {
        Sale memory sale = sales[_saleId];

        require(!sale.paused, 'sale is paused');
        require(!koda.isEditionSoldOut(sale.editionId), 'the sale is sold out');
        require(_phaseId <= phases[_saleId].length - 1, 'phase id does not exist');

        Phase storage phase = phases[_saleId][_phaseId];

        require(block.timestamp >= phase.startTime && block.timestamp < phase.endTime, 'sale phase not in progress');
        require(phase.mintCounter + _mintCount <= phase.mintCap, 'phase mint cap reached');
        require(totalMints[_saleId][_phaseId][_msgSender()] + _mintCount <= phase.walletMintLimit, 'cannot exceed total mints for sale phase');
        require(msg.value >= phase.priceInWei * _mintCount, 'not enough wei sent to complete mint');
        require(onPhaseMintList(_saleId, _phaseId, _index, _msgSender(), _merkleProof), 'address not able to mint from sale');

        _handleMint(_saleId, sale.editionId, _mintCount);

        // Up the mint count for the user and the phase mint counter
        totalMints[_saleId][_phaseId][_msgSender()] += _mintCount;
        phase.mintCounter += _mintCount;

        emit MintFromSale(_saleId, sale.editionId, _phaseId, _msgSender(), _mintCount);
    }

    function _handleMint(uint256 _saleId, uint256 _editionId, uint16 _mintCount) internal {
        address _receiver;

        for (uint i = 0; i < _mintCount; i++) {
            (address receiver, address creator, uint256 tokenId) = koda.facilitateNextPrimarySale(_editionId);
            _receiver = receiver;

            // send token to buyer (assumes approval has been made, if not then this will fail)
            koda.safeTransferFrom(creator, _msgSender(), tokenId);
        }

        _handleEditionSaleFunds(_saleId, _editionId, _receiver);
    }

    function createPhase(uint256 _editionId, uint128 _startTime, uint128 _endTime, uint16 _walletMintLimit, bytes32 _merkleRoot, string memory _merkleIPFSHash, uint128 _priceInWei, uint128 _mintCap)
    public
    whenNotPaused
    onlyCreatorOrAdmin(_editionId) {
        uint256 editionSize = koda.getSizeOfEdition(_editionId);
        require(editionSize > 0, 'edition does not exist');
        require(_endTime > _startTime, 'phase end time must be after start time');
        require(_walletMintLimit > 0 && _walletMintLimit <= editionSize, 'phase mint limit must be greater than 0');

        uint256 saleId = editionToSale[_editionId];
        require(saleId > 0, 'no sale associated with edition id');

        Sale memory sale = sales[saleId];

        // Add the phase to the phases mapping
        phases[sale.id].push(Phase({
        startTime : _startTime,
        endTime : _endTime,
        walletMintLimit : _walletMintLimit,
        merkleRoot : _merkleRoot,
        merkleIPFSHash : _merkleIPFSHash,
        priceInWei : _priceInWei,
        mintCap : _mintCap,
        mintCounter : 0
        }));

        emit PhaseCreated(sale.id, _editionId, phases[saleId].length - 1);
    }

    function removePhase(uint256 _editionId, uint256 _phaseId)
    public
    whenNotPaused
    onlyCreatorOrAdmin(_editionId)
    {
        require(koda.editionExists(_editionId), 'edition does not exist');

        uint256 saleId = editionToSale[_editionId];
        require(saleId > 0, 'no sale associated with edition id');

        delete phases[saleId][_phaseId];

        emit PhaseRemoved(saleId, _editionId, _phaseId);
    }

    /// @dev checks whether a given user is on the list to mint from a phase
    function onPhaseMintList(uint256 _saleId, uint _phaseId, uint256 _index, address _account, bytes32[] calldata _merkleProof) public view returns (bool) {
        Phase memory phase = phases[_saleId][_phaseId];

        // assume balance of 1 for enabled artists
        bytes32 node = keccak256(abi.encodePacked(_index, _account, uint256(1)));
        return MerkleProof.verify(_merkleProof, phase.merkleRoot, node);
    }

    function remainingPhaseMintAllowance(uint256 _saleId, uint _phaseId, uint256 _index, address _account, bytes32[] calldata _merkleProof) public view returns (uint256) {
        require(onPhaseMintList(_saleId, _phaseId, _index, _account, _merkleProof), 'address not able to mint from sale');

        return phases[_saleId][_phaseId].walletMintLimit - totalMints[_saleId][_phaseId][_account];
    }

    function toggleSalePause(uint256 _saleId, uint256 _editionId) public onlyCreatorOrAdmin(_editionId) {
        if (sales[_saleId].paused) {
            sales[_saleId].paused = false;
            emit SaleResumed(_saleId, _editionId);
        } else {
            sales[_saleId].paused = true;
            emit SalePaused(_saleId, _editionId);
        }
    }

    function _handleEditionSaleFunds(uint256 _saleId, uint256 _editionId, address _receiver) internal {
        uint256 platformPrimarySaleCommission = saleCommission[_saleId] > 0 ? saleCommission[_saleId] : 15_00000;
        uint256 koCommission = (msg.value / modulo) * platformPrimarySaleCommission;
        if (koCommission > 0) {
            (bool koCommissionSuccess,) = platformAccount.call{value : koCommission}("");
            require(koCommissionSuccess, "commission payment failed");
        }

        (bool success,) = _receiver.call{value : msg.value - koCommission}("");
        require(success, "payment failed");
    }

    function updatePlatformPrimarySaleCommission(uint256 _saleId, uint256 _platformPrimarySaleCommission) public onlyAdmin {
        saleCommission[_saleId] = _platformPrimarySaleCommission;

        emit AdminUpdatePlatformPrimarySaleCommissionGatedSale(_saleId, _platformPrimarySaleCommission);
    }

    function getGreatestFootballTeam() external pure returns (string memory) {
        return "Hull City";
    }
}
