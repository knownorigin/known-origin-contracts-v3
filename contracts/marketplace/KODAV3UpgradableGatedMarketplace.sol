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

    /// @notice emitted when primary sales commission is updated for a sale
    event AdminUpdatePlatformPrimarySaleCommissionGatedSale(uint256 indexed saleId, uint256 platformPrimarySaleCommission);

    /// @notice emitted when a sale is paused
    event SalePaused(uint256 indexed saleId, uint256 indexed editionId);

    /// @notice emitted when a sale is resumed
    event SaleResumed(uint256 indexed saleId, uint256 indexed editionId);

    modifier onlyCreatorOrAdmin(uint256 _editionId) {
        require(
            accessControls.hasAdminRole(_msgSender()) || koda.getCreatorOfEdition(_editionId) == _msgSender(),
            "Caller not creator or admin"
        );
        _;
    }

    /// @dev incremental counter for the ID of a sale
    uint256 private saleIdCounter;

    /// @notice Phase represents a time structured part of a sale, i.e. VIP, pre sale or open sale
    struct Phase {
        uint128 startTime;      // The start time of the sale as a whole
        uint128 endTime;        // The end time of the sale phase, also the beginning of the next phase if applicable
        uint128 priceInWei;     // Price in wei for one mint
        uint128 mintCounter;    // The current amount of items minted
        uint16 walletMintLimit; // The mint limit per wallet for the phase
        uint16 mintCap;        // The maximum amount of mints for the phase
        bytes32 merkleRoot;     // The merkle tree root for the phase
        string merkleIPFSHash;  // The IPFS hash referencing the merkle tree
    }

    // TODO add admin methods to modify creator and funds receiver, maxEditionId - admin only

    /// @notice Sale represents a gated sale, with mapping links to different sale phases
    struct Sale {
        uint256 id;             // The ID of the sale
        uint256 editionId;      // The ID of the edition the sale will mint
        address creator;        // Set on creation to save gas - the original edition creator
        address fundsReceiver;  // Where are the funds set
        uint256 maxEditionId;   // Stores the max edition ID for the edition - used when assigning tokens
        uint16 mintCounter;     // Keeps a pointer to the overall mint count for the full sale
        uint8 paused;           // Whether the sale is currently paused > 0 is paused
    }

    /// @dev sales is a mapping of sale id => Sale
    mapping(uint256 => Sale) public sales;

    /// @dev phases is a mapping of sale id => array of associated phases
    mapping(uint256 => Phase[]) public phases;

    /// @dev totalMints is a mapping of hash(sale id, phase id, address) => total minted by that address
    mapping(bytes32 => uint256) public totalMints;

    /// @dev editionToSale is a mapping of edition id => sale id
    mapping(uint256 => uint256) public editionToSale;

    /// @dev saleCommission is a mapping of sale id => commission %, if 0 its default 15_00000 (15%) unless commission for platform disabled
    mapping(uint256 => uint256) public saleCommission;

    /// @notice Allow an artist or admin to create a sale with 1 or more phases
    function createSaleWithPhases(
        uint256 _editionId,
        uint128[] memory _startTimes,
        uint128[] memory _endTimes,
        uint128[] memory _pricesInWei,
        uint16[] memory _mintCaps,
        uint16[] memory _walletMintLimits,
        bytes32[] memory _merkleRoots,
        string[] memory _merkleIPFSHashes
    ) external whenNotPaused {
        // Confirm access
        address creator = koda.getCreatorOfEdition(_editionId);
        require(creator == _msgSender() || accessControls.hasAdminRole(_msgSender()), "Caller not creator or admin");

        // Check no existing sale in place
        require(editionToSale[_editionId] == 0, "Sale exists for this edition"); // FIXME discuss with team - added by AMG

        uint256 saleId = ++saleIdCounter;

        // Assign the sale to the sales and editionToSale mappings
        sales[saleId] = Sale({
            id : saleId,
            creator : creator,
            fundsReceiver : koda.getRoyaltiesReceiver(_editionId),
            editionId : _editionId,
            maxEditionId : koda.maxTokenIdOfEdition(_editionId),
            paused : 0,
            mintCounter : 0
        });
        editionToSale[_editionId] = saleId;

        _addMultiplePhasesToSale(
            _editionId,
            saleId,
            _startTimes,
            _endTimes,
            _pricesInWei,
            _mintCaps,
            _walletMintLimits,
            _merkleRoots,
            _merkleIPFSHashes
        );

        emit SaleWithPhaseCreated(saleId, _editionId);
    }

    /// @notice Mint an NFT from the gated list
    function mint(
        uint256 _saleId,
        uint256 _phaseId,
        uint16 _mintCount,
        uint256 _index,
        bytes32[] calldata _merkleProof
    ) payable external nonReentrant whenNotPaused {
        Sale storage sale = sales[_saleId];
        require(sale.paused == 0, 'sale is paused');

        Phase storage phase = phases[_saleId][_phaseId];

        require(block.timestamp >= phase.startTime && block.timestamp < phase.endTime, 'sale phase not in progress');
        require(phase.mintCounter + _mintCount <= phase.mintCap, 'phase mint cap reached');

        // TODO check if we need to encode?
        bytes32 totalMintsKey = keccak256(abi.encode(_saleId, _phaseId, _msgSender()));

        require(totalMints[totalMintsKey] + _mintCount <= phase.walletMintLimit, 'cannot exceed total mints for sale phase');
        require(msg.value >= phase.priceInWei * _mintCount, 'not enough wei sent to complete mint');
        require(onPhaseMintList(_saleId, _phaseId, _index, _msgSender(), _merkleProof), 'address not able to mint from sale');

        _handleMint(_saleId, _phaseId, sale.editionId, _mintCount, _msgSender());

        // Up the mint count for the user and the phase mint counter
        totalMints[totalMintsKey] += _mintCount;
        phase.mintCounter += _mintCount;
        sale.mintCounter += _mintCount;
    }

    function createPhase(
        uint256 _editionId,
        uint128 _startTime,
        uint128 _endTime,
        uint128 _priceInWei,
        uint16 _walletMintLimit,
        uint16 _mintCap,
        bytes32 _merkleRoot,
        string calldata _merkleIPFSHash
    )
    external
    whenNotPaused
    onlyCreatorOrAdmin(_editionId) {
        uint256 saleId = editionToSale[_editionId];
        require(saleId > 0, 'no sale associated with edition id');

        _addPhaseToSale(
            _editionId,
            saleId,
            _startTime,
            _endTime,
            _priceInWei,
            _walletMintLimit,
            _mintCap,
            _merkleRoot,
            _merkleIPFSHash
        );
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
    function onPhaseMintList(uint256 _saleId, uint _phaseId, uint256 _index, address _account, bytes32[] calldata _merkleProof)
    public
    view
    returns (bool) {
        Phase storage phase = phases[_saleId][_phaseId];

        // TODO can we push wallet mint caps put in the tree ... ?

        // assume balance of 1 for enabled minting access
        bytes32 node = keccak256(abi.encodePacked(_index, _account, uint256(1)));
        return MerkleProof.verify(_merkleProof, phase.merkleRoot, node);
    }

    function remainingPhaseMintAllowance(uint256 _saleId, uint _phaseId, uint256 _index, address _account, bytes32[] calldata _merkleProof)
    external
    view
    returns (uint256) {
        require(onPhaseMintList(_saleId, _phaseId, _index, _account, _merkleProof), 'address not able to mint from sale');

        return phases[_saleId][_phaseId].walletMintLimit - totalMints[keccak256(abi.encode(_saleId, _phaseId, _account))];
    }

    function toggleSalePause(uint256 _saleId, uint256 _editionId) external onlyCreatorOrAdmin(_editionId) {
        if (sales[_saleId].paused != 0) {
            sales[_saleId].paused = 0;
            emit SaleResumed(_saleId, _editionId);
        } else {
            sales[_saleId].paused = 1;
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

        uint256 startId = _editionId + sales[_saleId].mintCounter;

        for (uint i = 0; i < _mintCount; i++) {

            uint256 tokenId = getNextAvailablePrimarySaleToken(startId, sales[_saleId].maxEditionId, sales[_saleId].creator);

            // send token to buyer (assumes approval has been made, if not then this will fail)
            koda.safeTransferFrom(sales[_saleId].creator, _recipient, tokenId);

            emit MintFromSale(_saleId, tokenId, _phaseId, _recipient);

            startId = tokenId++;
        }

        _handleEditionSaleFunds(_saleId, _editionId);
    }

    function getNextAvailablePrimarySaleToken(uint256 _startId, uint256 _maxEditionId, address creator) internal view returns (uint256 _tokenId) {
        for (uint256 tokenId = _startId; tokenId < _maxEditionId; tokenId++) {
            if (koda.ownerOf(tokenId) == creator) {
                return tokenId;
            }
        }
        revert("Primary market exhausted");
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

    function _addMultiplePhasesToSale(
        uint256 _editionId,
        uint256 _saleId,
        uint128[] memory _startTimes,
        uint128[] memory _endTimes,
        uint128[] memory _pricesInWei,
        uint16[] memory _walletMintLimits,
        uint16[] memory _mintCaps,
        bytes32[] memory _merkleRoots,
        string[] memory _merkleIPFSHashes
    ) internal {
        uint256 numOfPhases = _startTimes.length;
        for (uint256 i; i < numOfPhases; ++i) {
            _addPhaseToSale(
                _editionId,
                _saleId,
                _startTimes[i],
                _endTimes[i],
                _pricesInWei[i],
                _mintCaps[i],
                _walletMintLimits[i],
                _merkleRoots[i],
                _merkleIPFSHashes[i]
            );
        }
    }

    function _addPhaseToSale(
        uint256 _editionId,
        uint256 _saleId,
        uint128 _startTime,
        uint128 _endTime,
        uint128 _priceInWei,
        uint16  _walletMintLimit,
        uint16 _mintCap,
        bytes32 _merkleRoot,
        string memory _merkleIPFSHash
    ) internal {
        require(_endTime > _startTime, 'Phase end time must be after start time');
        require(_walletMintLimit > 0, 'Zero mint limit');
        require(_mintCap > 0, "Zero mint cap");
        require(_merkleRoot != bytes32(0), "Zero merkle root");
        require(bytes(_merkleIPFSHash).length == 46, "Invalid IPFS hash");

        // Add the phase to the phases mapping
        phases[_saleId].push(Phase({
            startTime : _startTime,
            endTime : _endTime,
            walletMintLimit : _walletMintLimit,
            merkleRoot : _merkleRoot,
            merkleIPFSHash : _merkleIPFSHash,
            priceInWei : _priceInWei,
            mintCap : _mintCap,
            mintCounter : 0
        }));

        emit PhaseCreated(_saleId, _editionId, phases[_saleId].length - 1);
    }
}
