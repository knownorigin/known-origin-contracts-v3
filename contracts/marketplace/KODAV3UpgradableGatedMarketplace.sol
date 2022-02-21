// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import {BaseUpgradableMarketplace} from "./BaseUpgradableMarketplace.sol";
import {KODAV3GatedMerkleMarketplace} from "./KODAV3GatedMerkleMarketplace.sol";
import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../core/IKODAV3.sol";

// TODO (test) ensure only admin can upgrade e.g. https://docs.openzeppelin.com/contracts/4.x/api/proxy#UUPSUpgradeable-_authorizeUpgrade-address-
// TODO (test) Confirm we can convert from a gated sale to a buy now flow?
// TODO (test) Impact of starting in a reserve auction, setting up a gated sale and selling it during the final auction close?

contract KODAV3UpgradableGatedMarketplace is BaseUpgradableMarketplace, KODAV3GatedMerkleMarketplace {

    /// @notice emitted when a sale, with a single phase, is created
    event SaleWithPhaseCreated(uint256 indexed saleId, uint256 indexed editionId);

    /// @notice emitted when a new phase is added to a sale
    event PhaseCreated(uint256 indexed saleId, uint256 indexed editionId, uint256 indexed phaseId);

    /// @notice emitted when a phase is removed from a sale
    event PhaseRemoved(uint256 indexed saleId, uint256 indexed editionId, uint256 indexed phaseId);

    /// @notice emitted when someone mints from a sale
    event MintFromSale(uint256 saleId, uint256 tokenId, uint256 phaseId, address account);

    /// @notice emitted when someone mints from a sale
    //    event MintFromSale(uint256 saleId, uint256 phaseId, address account, uint256[] tokenIds);

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
        uint128 mintCap; // The maximum amount of mints for the phase
        uint128 mintCounter; // The current amount of items minted
        bytes32 merkleRoot; // The merkle tree root for the phase
        string merkleIPFSHash; // The IPFS hash referencing the merkle tree
    }

    /// @notice Sale represents a gated sale, with mapping links to different sale phases
    struct Sale {
        uint256 id; // The ID of the sale
        uint256 editionId; // The ID of the edition the sale will mint
        address creator;
        address fundsReceiver;
        bool paused; // Whether the sale is currently paused
    }

    /// @dev sales is a mapping of sale id => Sale
    mapping(uint256 => Sale) public sales;

    /// @dev phases is a mapping of sale id => array of associated phases
    mapping(uint256 => Phase[]) public phases;

    // TODO create composite key to save the mappings e.g. encode(saleId, phaseId, address) = mapping key - would this be cheaper?
    /// @dev totalMints is a mapping of sale id => phase id => address => total minted by that address
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public totalMints;

    /// @dev editionToSale is a mapping of edition id => sale id
    mapping(uint256 => uint256) public editionToSale;

    /// @dev saleCommission is a mapping of sale id => commission %, if 0 its default 15_00000 (15%) unless commission for platform disabled
    mapping(uint256 => uint256) public saleCommission;

    modifier onlyCreatorOrAdmin(uint256 _editionId) {
        require(
        // TODO quick exit to save GAS
            koda.getCreatorOfEdition(_editionId) == _msgSender() || accessControls.hasAdminRole(_msgSender()),
            "Caller not creator or admin"
        );
        _;
    }

    /// @notice Allow an artist or admin to create a sale with 1 or more phases
    function createSaleWithPhases(
        uint256 _editionId,
        address _creator,
        address _fundsReceiver,
        uint128[] memory _startTimes,
        uint128[] memory _endTimes,
        uint16[] memory _walletMintLimits,
        bytes32[] memory _merkleRoots,
        string[] memory _merkleIPFSHashes,
        uint128[] memory _pricesInWei,
        uint128[] memory _mintCaps
    ) external whenNotPaused onlyCreatorOrAdmin(_editionId) {
        uint256 saleId = ++saleIdCounter;

        // Assign the sale to the sales and editionToSale mappings
        sales[saleId] = Sale({
            id : saleId,
            editionId : _editionId,
            creator : _creator,
            fundsReceiver : _fundsReceiver,
            paused : false
        });
        editionToSale[_editionId] = saleId;

        _addPhasesToSale(
            _startTimes,
            _endTimes,
            _walletMintLimits,
            _merkleRoots,
            _merkleIPFSHashes,
            _pricesInWei,
            _mintCaps
        );

        emit SaleWithPhaseCreated(saleId, _editionId);
    }

    /// @notice Mint an NFT from the gated list
    function mint(
        uint256 _saleId,
        uint256 _phaseId,
        uint16 _mintCount,
        address _recipient,
        uint256 _index,
        bytes32[] calldata _merkleProof
    ) payable external nonReentrant whenNotPaused {
        require(_recipient != address(0), "Zero recipient");

        Sale storage sale = sales[_saleId];
        require(!sale.paused, 'sale is paused');

        //        require(!koda.isEditionSoldOut(sale.editionId), 'the sale is sold out');
        //        require(_phaseId <= phases[_saleId].length - 1, 'phase id does not exist');
        // FIXME DROP THIS POINTLESS I THINK

        Phase storage phase = phases[_saleId][_phaseId];

        require(block.timestamp >= phase.startTime && block.timestamp < phase.endTime, 'sale phase not in progress');
        require(phase.mintCounter + _mintCount <= phase.mintCap, 'phase mint cap reached');
        require(totalMints[_saleId][_phaseId][_msgSender()] + _mintCount <= phase.walletMintLimit, 'cannot exceed total mints for sale phase');
        require(msg.value >= phase.priceInWei * _mintCount, 'not enough wei sent to complete mint');
        require(onPhaseMintList(_saleId, _phaseId, _index, _msgSender(), _merkleProof), 'address not able to mint from sale');

        _handleMint(_saleId, _phaseId, sale.editionId, _mintCount, _recipient);

        // Up the mint count for the user and the phase mint counter
        totalMints[_saleId][_phaseId][_msgSender()] += _mintCount;
        phase.mintCounter += _mintCount;
    }

    function createPhase(uint256 _editionId, uint128 _startTime, uint128 _endTime, uint16 _walletMintLimit, bytes32 _merkleRoot, string calldata _merkleIPFSHash, uint128 _priceInWei, uint128 _mintCap)
    external
    whenNotPaused
    onlyCreatorOrAdmin(_editionId) {
        uint256 editionSize = koda.getSizeOfEdition(_editionId);
        require(editionSize > 0, 'edition does not exist');
        require(_endTime > _startTime, 'phase end time must be after start time');
        require(_walletMintLimit > 0 && _walletMintLimit <= editionSize, 'phase mint limit must be greater than 0');
        require(_mintCap > 0, "Zero mint cap");
        require(_merkleRoot != bytes32(0), "Zero merkle root");
        require(bytes(_merkleIPFSHash).length == 46, "Invalid IPFS hash");

        uint256 saleId = editionToSale[_editionId];
        require(saleId > 0, 'no sale associated with edition id');

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

        emit PhaseCreated(saleId, _editionId, phases[saleId].length - 1);
    }

    function removePhase(uint256 _editionId, uint256 _phaseId)
    external
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
    function onPhaseMintList(uint256 _saleId, uint256 _phaseId, uint256 _index, address _account, bytes32[] calldata _merkleProof)
    public
    view
    returns (bool) {
        Phase storage phase = phases[_saleId][_phaseId];

        // TODO pass in mint limit and replace the hard coded 1 as part of the tree lookup, does not need to be stored on chain then
        // assume balance of 1 for enabled minting access
        bytes32 node = keccak256(abi.encodePacked(_index, _account, uint256(1)));
        return MerkleProof.verify(_merkleProof, phase.merkleRoot, node);
    }

    function remainingPhaseMintAllowance(uint256 _saleId, uint _phaseId, uint256 _index, address _account, bytes32[] calldata _merkleProof)
    external
    view
    returns (uint256) {
        require(onPhaseMintList(_saleId, _phaseId, _index, _account, _merkleProof), 'address not able to mint from sale');

        return phases[_saleId][_phaseId].walletMintLimit - totalMints[_saleId][_phaseId][_account];
    }

    function toggleSalePause(uint256 _saleId, uint256 _editionId) external onlyCreatorOrAdmin(_editionId) {
        if (sales[_saleId].paused) {
            sales[_saleId].paused = false;
            emit SaleResumed(_saleId, _editionId);
        } else {
            sales[_saleId].paused = true;
            emit SalePaused(_saleId, _editionId);
        }
    }

    function updatePlatformPrimarySaleCommission(uint256 _saleId, uint256 _platformPrimarySaleCommission) external onlyAdmin {
        require(_platformPrimarySaleCommission > 0, "Zero commission must use other admin method");
        require(!isSaleCommissionForPlatformDisabled[_saleId], "Sale commission for platform disabled");
        saleCommission[_saleId] = _platformPrimarySaleCommission;

        emit AdminUpdatePlatformPrimarySaleCommissionGatedSale(
            _saleId,
            _getPlatformSaleCommissionForSale(_saleId)
        );
    }

    function togglePlatformCommissionDisabledForSale(uint256 _saleId) external onlyAdmin {
        isSaleCommissionForPlatformDisabled[_saleId] = !isSaleCommissionForPlatformDisabled[_saleId];

        emit AdminUpdatePlatformPrimarySaleCommissionGatedSale(
            _saleId,
            _getPlatformSaleCommissionForSale(_saleId)
        );
    }

    function _handleMint(uint256 _saleId, uint256 _phaseId, uint256 _editionId, uint16 _mintCount, address _recipient) internal override {
        require(_mintCount > 0, "Nothing being minted");

        //        address creator = koda.getCreatorOfEdition(_editionId);
        address creator = sales[_saleId].creator;

        //        address _receiver;
        //                uint256 _size = koda.getSizeOfEdition(_editionId);
        //                bool normal = false;
        //        uint256[] memory tokenIds = new uint256[](_mintCount);

        uint256 tokenId = _editionId + phases[_saleId][_phaseId].mintCounter;

        for (uint i = 0; i < _mintCount; i++) {

            //            (address receiver, address creator, uint256 tokenId) = normal
            //            ? koda.facilitateNextPrimarySale(_editionId)
            //            : koda.facilitateReversePrimarySale(_editionId);

            //            (address receiver, address creator, uint256 tokenId) = koda.facilitateNextPrimarySale(_editionId);
            //            tokenIds[i] = tokenId;
            //            _receiver = receiver;

            emit MintFromSale(_saleId, tokenId, _phaseId, _recipient);

            // send token to buyer (assumes approval has been made, if not then this will fail)
            koda.safeTransferFrom(creator, _recipient, tokenId);

            tokenId++;
        }

        //        emit MintFromSale(_saleId, tokenId, _phaseId, _recipient);
        //        emit MintFromSale(_saleId, _phaseId, _recipient, tokenIds);

        _handleEditionSaleFunds(_saleId, _editionId);
    }


    function _handleEditionSaleFunds(uint256 _saleId, uint256 _editionId) internal override {
        uint256 platformPrimarySaleCommission = _getPlatformSaleCommissionForSale(_saleId);
        uint256 koCommission = (msg.value / modulo) * platformPrimarySaleCommission;
        if (koCommission > 0) {
            (bool koCommissionSuccess,) = platformAccount.call{value : koCommission}("");
            require(koCommissionSuccess, "commission payment failed");
        }

        (bool success,) = sales[_saleId].fundsReceiver.call{value : msg.value - koCommission}("");
        require(success, "payment failed");
    }

    function _getPlatformSaleCommissionForSale(uint256 _saleId) internal returns (uint256) {
        uint256 commission;

        if (!isSaleCommissionForPlatformDisabled[_saleId]) {
            commission = saleCommission[_saleId] > 0 ? saleCommission[_saleId] : platformPrimaryCommission;
        }

        return commission;
    }

    function _addPhasesToSale(
        uint128[] memory _startTimes,
        uint128[] memory _endTimes,
        uint16[] memory _walletMintLimits,
        bytes32[] memory _merkleRoots,
        string[] memory _merkleIPFSHashes,
        uint128[] memory _pricesInWei,
        uint128[] memory _mintCaps
    ) internal {
        uint256 editionSize = koda.getSizeOfEdition(sales[saleIdCounter].editionId);
        require(editionSize > 0, 'edition does not exist');

        uint256 numOfPhases = _startTimes.length;
        for (uint256 i; i < numOfPhases; ++i) {
            require(_endTimes[i] > _startTimes[i], 'phase end time must be after start time');
            require(_walletMintLimits[i] > 0 && _walletMintLimits[i] <= editionSize, 'phase mint limit must be greater than 0');
            require(_mintCaps[i] > 0, "Zero mint cap");
            require(_merkleRoots[i] != bytes32(0), "Zero merkle root");
            require(bytes(_merkleIPFSHashes[i]).length == 46, "Invalid IPFS hash");

            phases[saleIdCounter].push(Phase({
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
    }
}
