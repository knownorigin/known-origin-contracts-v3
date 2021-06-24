// SPDX-License-Identifier: MIT

pragma solidity 0.8.5;

import {ERC165Storage} from "@openzeppelin/contracts/utils/introspection/ERC165Storage.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IERC2981} from "./IERC2981.sol";
import {IKODAV3Minter} from "./IKODAV3Minter.sol";
import {ITokenUriResolver} from "../programmable/ITokenUriResolver.sol";
import {TopDownERC20Composable} from "./composable/TopDownERC20Composable.sol";
import {BaseKoda} from "./BaseKoda.sol";

/// @title A ERC-721 compliant contract which has a focus on being GAS efficient along with being able to support
//// both unique tokens and multi-editions sharing common traits but of limited supply
///
/// @author KnownOrigin Labs - https://knownorigin.io/
///
/// @notice The NFT supports a range of standards such as:
/// @notice EIP-2981 Royalties Standard
/// @notice EIP-2309 Consecutive batch mint
/// @notice ERC-998 Top-down ERC-20 composable
contract KnownOriginDigitalAssetV3 is TopDownERC20Composable, BaseKoda, ERC165Storage, IKODAV3Minter {

    event EditionURIUpdated(uint256 indexed _editionId);
    event EditionSalesDisabledToggled(uint256 indexed _editionId, bool _oldValue, bool _newValue);
    event SealedEditionMetaDataSet(uint256 indexed _editionId);
    event SealedTokenMetaDataSet(uint256 indexed _tokenId);
    event AdditionalEditionUnlockableSet(uint256 indexed _editionId);
    event AdminRoyaltiesRegistryProxySet(address indexed _royaltiesRegistryProxy);
    event AdminTokenUriResolverSet(address indexed _tokenUriResolver);

    /// @notice Token name
    string public constant name = "KnownOriginDigitalAsset";

    /// @notice Token symbol
    string public constant symbol = "KODA";

    /// @notice KODA version
    string public constant version = "3";

    /// @notice Royalties registry
    IERC2981 public royaltiesRegistryProxy;

    /// @notice Token URI resolver
    ITokenUriResolver public tokenUriResolver;

    /// @notice Edition number pointer
    uint256 public editionPointer;

    struct EditionDetails {
        address creator; // primary edition/token creator
        uint96 editionSize; // onchain edition size
        string uri; // the referenced metadata
    }

    /// @dev tokens are minted in batches - the first token ID used is representative of the edition ID
    mapping(uint256 => EditionDetails) internal editionDetails;

    /// @dev Mapping of tokenId => owner - only set on first transfer (after mint) such as a primary sale and/or gift
    mapping(uint256 => address) internal owners;

    /// @dev Mapping of owner => number of tokens owned
    mapping(address => uint256) internal balances;

    /// @dev Mapping of tokenId => approved address
    mapping(uint256 => address) internal approvals;

    /// @dev Mapping of owner => operator => approved
    mapping(address => mapping(address => bool)) internal operatorApprovals;

    /// @notice Optional one time use storage slot for additional edition metadata
    mapping(uint256 => string) public sealedEditionMetaData;

    /// @notice Optional one time use storage slot for additional token metadata such ass peramweb metadata
    mapping(uint256 => string) public sealedTokenMetaData;

    /// @notice Optional storage slot for additional unlockable content
    mapping(uint256 => string) public additionalEditionUnlockableSlot;

    /// @notice Allows a creator to disable sales of their edition
    mapping(uint256 => bool) public editionSalesDisabled;

    // TODO check this as it is out of sync with KO basis points modulo - if so rename
    /// @notice Basis points conversion modulo
    uint256 public basisPointsModulo = 1000;

    /// @notice precision 100.00000%
    uint256 public modulo = 100_00000;

    constructor(
        IKOAccessControlsLookup _accessControls,
        IERC2981 _royaltiesRegistryProxy,
        uint256 _editionPointer
    ) BaseKoda(_accessControls) {

        editionPointer = _editionPointer;

        // optional registry address - can be constructed as zero address
        royaltiesRegistryProxy = _royaltiesRegistryProxy;

        // INTERFACE_ID_ERC721
        _registerInterface(0x80ac58cd);

        // INTERFACE_ID_ERC721_METADATA
        _registerInterface(0x5b5e139f);

        // _INTERFACE_ID_ERC2981
        _registerInterface(0x2a55205a);

        // _INTERFACE_ID_FEES
        _registerInterface(0xb7799584);
    }

    /// @notice Mints batches of tokens emitting multiple Transfer events
    function mintBatchEdition(uint96 _editionSize, address _to, string calldata _uri)
    public
    override
    onlyContract
    returns (uint256 _editionId) {
        return _mintBatchEdition(_editionSize, _to, _uri);
    }

    /// @notice Mints an edition token batch and composes ERC20s for every token in the edition
    /// @dev there is a limit on the number of ERC20s that can be embedded in an edition
    function mintBatchEditionAndComposeERC20s(
        uint96 _editionSize,
        address _to,
        string calldata _uri,
        address[] calldata _erc20s,
        uint256[] calldata _amounts
    ) external
    override
    onlyContract
    returns (uint256 _editionId) {
        uint256 totalErc20s = _erc20s.length;
        require(totalErc20s > 0 && totalErc20s == _amounts.length, "Tokens invalid");

        _editionId = _mintBatchEdition(_editionSize, _to, _uri);

        for (uint i = 0; i < totalErc20s; i++) {
            _composeERC20IntoEdition(_to, _editionId, _erc20s[i], _amounts[i]);
        }
    }

    function _mintBatchEdition(uint96 _editionSize, address _to, string calldata _uri) internal returns (uint256) {
        require(_editionSize > 0 && _editionSize <= MAX_EDITION_SIZE, "Invalid edition size");

        uint256 start = generateNextEditionNumber();

        // N.B: Dont store owner, see ownerOf method to special case checking to avoid storage costs on creation

        // assign balance
        balances[_to] = balances[_to] + _editionSize;

        // edition of x
        editionDetails[start] = EditionDetails(_to, _editionSize, _uri);

        // Loop emit all transfer events
        uint256 end = start + _editionSize;
        for (uint i = start; i < end; i++) {
            emit Transfer(address(0), _to, i);
        }
        return start;
    }

    /// @notice Mints batches of tokens but emits a single ConsecutiveTransfer event EIP-2309
    function mintConsecutiveBatchEdition(uint96 _editionSize, address _to, string calldata _uri)
    public
    override
    onlyContract
    returns (uint256 _editionId) {
        require(_editionSize > 0 && _editionSize <= MAX_EDITION_SIZE, "Invalid edition size");

        uint256 start = generateNextEditionNumber();

        // N.B: Dont store owner, see ownerOf method to special case checking to avoid storage costs on creation

        // assign balance
        balances[_to] = balances[_to] + _editionSize;

        // Start ID always equals edition ID
        editionDetails[start] = EditionDetails(_to, _editionSize, _uri);

        // emit EIP-2309 consecutive transfer event
        emit ConsecutiveTransfer(start, start + _editionSize, address(0), _to);

        return start;
    }

    /// @notice Allows the creator of an edition to update the token URI provided that no primary sales have been made
    function updateURIIfNoSaleMade(uint256 _editionId, string calldata _newURI) external override {
        require(_msgSender() == editionDetails[_editionId].creator, "Not creator");
        require(!hasMadePrimarySale(_editionId), "Edition has had primary sale");

        editionDetails[_editionId].uri = _newURI;

        emit EditionURIUpdated(_editionId);
    }

    /// @notice Increases the edition pointer and then returns this pointer for minting methods
    function generateNextEditionNumber() internal returns (uint256) {
        editionPointer = editionPointer + MAX_EDITION_SIZE;
        return editionPointer;
    }

    /// @notice URI for an edition. Individual tokens in an edition will have this URI when tokenURI() is called
    function editionURI(uint256 _editionId) public view returns (string memory) {
        require(_editionExists(_editionId), "Edition does not exist");

        if (tokenUriResolverActive() && tokenUriResolver.isDefined(_editionId)) {
            return tokenUriResolver.editionURI(_editionId);
        }

        return editionDetails[_editionId].uri;
    }

    /// @notice Returns the URI based on the edition associated with a token
    function tokenURI(uint256 _tokenId) public view returns (string memory) {
        require(_exists(_tokenId), "Token does not exist");
        uint256 editionId = _editionFromTokenId(_tokenId);

        if (tokenUriResolverActive() && tokenUriResolver.isDefined(editionId)) {
            return tokenUriResolver.editionURI(editionId);
        }

        return editionDetails[editionId].uri;
    }

    /// @notice Allows the caller to check if external URI resolver is active
    function tokenUriResolverActive() public view returns (bool) {
        return address(tokenUriResolver) != address(0);
    }

    /// @notice Additional metadata string for an edition
    function editionAdditionalMetaData(uint256 _editionId) public view returns (string memory) {
        return sealedEditionMetaData[_editionId];
    }

    /// @notice Additional metadata string for a token
    function tokenAdditionalMetaData(uint256 _tokenId) public view returns (string memory) {
        return sealedTokenMetaData[_tokenId];
    }

    /// @notice Additional metadata string for an edition given a token ID
    function editionAdditionalMetaDataForToken(uint256 _tokenId) public view returns (string memory) {
        uint256 editionId = _editionFromTokenId(_tokenId);
        return sealedEditionMetaData[editionId];
    }

    function getEditionDetails(uint256 _tokenId)
    public
    override
    view
    returns (address _originalCreator, address _owner, uint256 _editionId, uint256 _size, string memory _uri) {
        uint256 editionId = _editionFromTokenId(_tokenId);
        EditionDetails storage edition = editionDetails[editionId];
        return (
        edition.creator, // originCreator
        _ownerOf(_tokenId, editionId), // owner
        editionId,
        edition.editionSize, // size
        edition.uri
        );
    }

    /// @notice If primary sales for an edition are disabled
    function isEditionSalesDisabled(uint256 _editionId) external view override returns (bool) {
        return editionSalesDisabled[_editionId];
    }

    /// @notice If primary sales for an edition are disabled or if the edition is sold out
    function isSalesDisabledOrSoldOut(uint256 _editionId) external view override returns (bool) {
        return editionSalesDisabled[_editionId] || isEditionSoldOut(_editionId);
    }

    /// @notice Toggle for disabling primary sales for an edition
    function toggleEditionSalesDisabled(uint256 _editionId) external override {
        address creator = editionDetails[_editionId].creator;
        require(_editionExists(_editionId), "Edition does not exist");

        require(
            creator == _msgSender() || accessControls.hasAdminRole(_msgSender()),
            "Only creator or platform admin"
        );

        emit EditionSalesDisabledToggled(_editionId, editionSalesDisabled[_editionId], !editionSalesDisabled[_editionId]);

        editionSalesDisabled[_editionId] = !editionSalesDisabled[_editionId];
    }

    ///////////////////
    // Creator query //
    ///////////////////

    function getCreatorOfEdition(uint256 _editionId) public override view returns (address _originalCreator) {
        return _getCreatorOfEdition(_editionId);
    }

    function getCreatorOfToken(uint256 _tokenId) public override view returns (address _originalCreator) {
        return _getCreatorOfEdition(_editionFromTokenId(_tokenId));
    }

    function _getCreatorOfEdition(uint256 _editionId) internal view returns (address _originalCreator) {
        return editionDetails[_editionId].creator;
    }

    ////////////////
    // Size query //
    ////////////////

    function getSizeOfEdition(uint256 _editionId) public override view returns (uint256 _size) {
        return editionDetails[_editionId].editionSize;
    }

    function getEditionSizeOfToken(uint256 _tokenId) public override view returns (uint256 _size) {
        return editionDetails[_editionFromTokenId(_tokenId)].editionSize;
    }

    /////////////////////
    // Existence query //
    /////////////////////

    function editionExists(uint256 _editionId) public override view returns (bool) {
        return _editionExists(_editionId);
    }

    function _editionExists(uint256 _editionId) internal view returns (bool) {
        return editionDetails[_editionId].editionSize > 0;
    }

    function exists(uint256 _tokenId) public override view returns (bool) {
        return _exists(_tokenId);
    }

    function _exists(uint256 _tokenId) internal view returns (bool) {
        return _ownerOf(_tokenId, _editionFromTokenId(_tokenId)) != address(0);
    }

    /// @notice Returns the last token ID of an edition based on the edition's size
    function maxTokenIdOfEdition(uint256 _editionId) public override view returns (uint256 _tokenId) {
        return _maxTokenIdOfEdition(_editionId);
    }

    function _maxTokenIdOfEdition(uint256 _editionId) internal view returns (uint256 _tokenId) {
        return editionDetails[_editionId].editionSize + _editionId;
    }

    ////////////////
    // Edition ID //
    ////////////////

    function getEditionIdOfToken(uint256 _tokenId) public override pure returns (uint256 _editionId) {
        return _editionFromTokenId(_tokenId);
    }

    function _royaltyInfo(uint256 _tokenId, uint256 _value) internal view returns (address _receiver, uint256 _royaltyAmount) {
        uint256 editionId = _editionFromTokenId(_tokenId);

        // If we have a registry and its defined, use it
        if (royaltyRegistryActive() && royaltiesRegistryProxy.hasRoyalties(editionId)) {
            (_receiver, _royaltyAmount) = royaltiesRegistryProxy.royaltyInfo(editionId, _value);
        } else {
            // Fall back to KO defaults
            _receiver = _getCreatorOfEdition(editionId);
            _royaltyAmount = (_value / modulo) * secondarySaleRoyalty;
        }
    }

    //////////////
    // ERC-2981 //
    //////////////

    // Abstract away token royalty registry, proxy through to the implementation
    function royaltyInfo(uint256 _tokenId, uint256 _value)
    external
    override
    view
    returns (address _receiver, uint256 _royaltyAmount) {
        return _royaltyInfo(_tokenId, _value);
    }

    // Expanded method at edition level and expanding on the funds receiver and the creator
    function royaltyAndCreatorInfo(uint256 _editionId, uint256 _value)
    external
    override
    returns (address receiver, address creator, uint256 royaltyAmount) {
        address originalCreator = _getCreatorOfEdition(_editionId);

        if (royaltyRegistryActive() && royaltiesRegistryProxy.hasRoyalties(_editionId)) {
            // Note: any registry must be edition aware so to only store one entry for all within the edition
            (address _receiver, uint256 _royaltyAmount) = royaltiesRegistryProxy.royaltyInfo(_editionId, _value);
            return (_receiver, originalCreator, _royaltyAmount);
        }

        return (originalCreator, originalCreator, (_value / modulo) * secondarySaleRoyalty);
    }

    function hasRoyalties(uint256 _tokenId) external override view returns (bool) {
        require(exists(_tokenId), "Token does not exist");
        return royaltyRegistryActive() && royaltiesRegistryProxy.hasRoyalties(_editionFromTokenId(_tokenId))
                || secondarySaleRoyalty > 0;
    }

    function royaltyRegistryActive() public view returns (bool) {
        return address(royaltiesRegistryProxy) != address(0);
    }

    //////////////////////////////
    // Has Secondary Sale Fees //
    ////////////////////////////

    function getFeeRecipients(uint256 _tokenId) external override returns (address payable[] memory) {
        address payable[] memory feeRecipients = new address payable[](1);
        (address _receiver, ) = _royaltyInfo(_tokenId, 0);
        feeRecipients[0] = payable(_receiver);
        return feeRecipients;
    }

    function getFeeBps(uint256 _tokenId) external override returns (uint[] memory) {
        uint[] memory feeBps = new uint[](1);
        feeBps[0] = uint(secondarySaleRoyalty) / basisPointsModulo;
        // convert to basis points
        return feeBps;
    }

    ////////////////////////////////////
    // Primary Sale Utilities methods //
    ////////////////////////////////////

    /// @notice List of token IDs that are still with the original creator
    function getAllUnsoldTokenIdsForEdition(uint256 _editionId) public view returns (uint256[] memory) {
        require(_editionExists(_editionId), "Edition does not exist");
        uint256 maxTokenId = _maxTokenIdOfEdition(_editionId);

        // work out number of unsold tokens in order to allocate memory to an array later
        uint256 numOfUnsoldTokens;
        for (uint256 i = _editionId; i < maxTokenId; i++) {
            // if no owner set - assume primary if not moved
            if (owners[i] == address(0)) {
                numOfUnsoldTokens += 1;
            }
        }

        uint256[] memory unsoldTokens = new uint256[](numOfUnsoldTokens);

        // record token IDs of unsold tokens
        uint256 nextIndex;
        for (uint256 tokenId = _editionId; tokenId < maxTokenId; tokenId++) {
            // if no owner set - assume primary if not moved
            if (owners[tokenId] == address(0)) {
                unsoldTokens[nextIndex] = tokenId;
                nextIndex += 1;
            }
        }

        return unsoldTokens;
    }

    /// @notice For a given edition, returns the next token and associated royalty information
    function facilitateNextPrimarySale(uint256 _editionId)
    public
    override
    returns (address receiver, address creator, uint256 tokenId) {
        require(!editionSalesDisabled[_editionId], "Edition sales disabled");

        uint256 _tokenId = getNextAvailablePrimarySaleToken(_editionId);
        address _creator = _getCreatorOfEdition(_editionId);

        if (royaltyRegistryActive() && royaltiesRegistryProxy.hasRoyalties(_editionId)) {
            // Note: we do not need the second value in tuple `_royaltyAmount` which is derived from the second arg to `royaltyInfo` and hence we pass 0
            (address _receiver,) = royaltiesRegistryProxy.royaltyInfo(_editionId, 0);
            return (_receiver, _creator, _tokenId);
        }

        return (_creator, _creator, _tokenId);
    }

    /// @notice Return the next unsold token ID for a given edition unless all tokens have been sold
    function getNextAvailablePrimarySaleToken(uint256 _editionId) public override view returns (uint256 _tokenId) {
        uint256 maxTokenId = _maxTokenIdOfEdition(_editionId);

        // low to high
        for (uint256 tokenId = _editionId; tokenId < maxTokenId; tokenId++) {
            // if no owner set - assume primary if not moved
            if (owners[tokenId] == address(0)) {
                return tokenId;
            }
        }
        revert("No tokens left on the primary market");
    }

    /// @notice Starting from the last token in an edition and going down the first, returns the next unsold token (if any)
    function getReverseAvailablePrimarySaleToken(uint256 _editionId) public override view returns (uint256 _tokenId) {
        uint256 highestTokenId = _maxTokenIdOfEdition(_editionId) - 1;

        // high to low
        while (highestTokenId >= _editionId) {
            // if no owner set - assume primary if not moved
            if (owners[highestTokenId] == address(0)) {
                return highestTokenId;
            }
            highestTokenId--;
        }
        revert("No tokens left on the primary market");
    }

    /// @notice Using the reverse token ID logic of an edition, returns next token ID and associated royalty information
    function facilitateReversePrimarySale(uint256 _editionId)
    public
    override
    returns (address receiver, address creator, uint256 tokenId) {
        require(!editionSalesDisabled[_editionId], "Edition sales disabled");

        uint256 _tokenId = getReverseAvailablePrimarySaleToken(_editionId);
        address _creator = _getCreatorOfEdition(_editionId);

        if (royaltyRegistryActive() && royaltiesRegistryProxy.hasRoyalties(_editionId)) {
            // Note: we do not need the second value in tuple `_royaltyAmount` which is derived from the second arg to `royaltyInfo` and hence we pass 0
            (address _receiver,) = royaltiesRegistryProxy.royaltyInfo(_editionId, 0);
            return (_receiver, _creator, _tokenId);
        }

        return (_creator, _creator, _tokenId);
    }

    /// @notice If the token specified by token ID has been sold on the primary market
    function hadPrimarySaleOfToken(uint256 _tokenId) public override view returns (bool) {
        return owners[_tokenId] != address(0);
    }

    /// @notice If any token in the edition has been sold
    function hasMadePrimarySale(uint256 _editionId) public override view returns (bool) {
        require(_editionExists(_editionId), "Edition does not exist");
        uint256 maxTokenId = _maxTokenIdOfEdition(_editionId);

        // low to high
        for (uint256 tokenId = _editionId; tokenId < maxTokenId; tokenId++) {
            // if no owner set - assume primary if not moved
            if (owners[tokenId] != address(0)) {
                return true;
            }
        }

        return false;
    }

    /// @notice If all tokens in the edition have been sold
    function isEditionSoldOut(uint256 _editionId) public override view returns (bool) {
        uint256 maxTokenId = _maxTokenIdOfEdition(_editionId);

        // low to high
        for (uint256 tokenId = _editionId; tokenId < maxTokenId; tokenId++) {
            // if no owner set - assume primary if not moved
            if (owners[tokenId] == address(0)) {
                return false;
            }
        }

        return true;
    }

    //////////////
    // Defaults //
    //////////////

    /// @notice Transfers the ownership of an NFT from one address to another address
    /// @dev Throws unless `msg.sender` is the current owner, an authorized
    ///      operator, or the approved address for this NFT. Throws if `_from` is
    ///      not the current owner. Throws if `_to` is the zero address. Throws if
    ///      `_tokenId` is not a valid NFT. When transfer is complete, this function
    ///      checks if `_to` is a smart contract (code size > 0). If so, it calls
    ///      `onERC721Received` on `_to` and throws if the return value is not
    ///      `bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"))`.
    /// @param _from The current owner of the NFT
    /// @param _to The new owner
    /// @param _tokenId The NFT to transfer
    /// @param _data Additional data with no specified format, sent in call to `_to`
    function safeTransferFrom(address _from, address _to, uint256 _tokenId, bytes calldata _data) override external {
        _safeTransferFrom(_from, _to, _tokenId, _data);

        // move the token
        emit Transfer(_from, _to, _tokenId);
    }

    /// @notice Transfers the ownership of an NFT from one address to another address
    /// @dev This works identically to the other function with an extra data parameter,
    ///      except this function just sets data to "".
    /// @param _from The current owner of the NFT
    /// @param _to The new owner
    /// @param _tokenId The NFT to transfer
    function safeTransferFrom(address _from, address _to, uint256 _tokenId) override external {
        _safeTransferFrom(_from, _to, _tokenId, bytes(""));

        // move the token
        emit Transfer(_from, _to, _tokenId);
    }

    function _safeTransferFrom(address _from, address _to, uint256 _tokenId, bytes memory _data) private {
        _transferFrom(_from, _to, _tokenId);

        uint256 receiverCodeSize;
        assembly {
            receiverCodeSize := extcodesize(_to)
        }
        if (receiverCodeSize > 0) {
            bytes4 selector = IERC721Receiver(_to).onERC721Received(
                _msgSender(),
                _from,
                _tokenId,
                _data
            );
            require(
                selector == ERC721_RECEIVED,
                "ERC721_INVALID_SELECTOR"
            );
        }
    }

    /// @notice Transfer ownership of an NFT -- THE CALLER IS RESPONSIBLE
    ///         TO CONFIRM THAT `_to` IS CAPABLE OF RECEIVING NFTS OR ELSE
    ///         THEY MAY BE PERMANENTLY LOST
    /// @dev Throws unless `_msgSender()` is the current owner, an authorized
    ///      operator, or the approved address for this NFT. Throws if `_from` is
    ///      not the current owner. Throws if `_to` is the zero address. Throws if
    ///      `_tokenId` is not a valid NFT.
    /// @param _from The current owner of the NFT
    /// @param _to The new owner
    /// @param _tokenId The NFT to transfer
    function transferFrom(address _from, address _to, uint256 _tokenId) override external {
        _transferFrom(_from, _to, _tokenId);

        // move the token
        emit Transfer(_from, _to, _tokenId);
    }

    function _transferFrom(address _from, address _to, uint256 _tokenId) private {
        // enforce not being able to send to zero as we have explicit rules what a minted but unbound owner is
        require(_to != address(0), "ERC721_ZERO_TO_ADDRESS");

        // Ensure the owner is the sender
        address owner = _ownerOf(_tokenId, _editionFromTokenId(_tokenId));
        require(owner != address(0), "ERC721_ZERO_OWNER");
        require(_from == owner, "ERC721_OWNER_MISMATCH");

        address spender = _msgSender();
        address approvedAddress = getApproved(_tokenId);
        require(
            spender == owner // sending to myself
            || isApprovedForAll(owner, spender)  // is approved to send any behalf of owner
            || approvedAddress == spender, // is approved to move this token ID
            "ERC721_INVALID_SPENDER"
        );

        // Ensure approval for token ID is cleared
        if (approvedAddress != address(0)) {
            approvals[_tokenId] = address(0);
        }

        // set new owner - this will now override any specific other mappings for the base edition config
        owners[_tokenId] = _to;

        // Modify balances
        balances[_from] = balances[_from] - 1;
        balances[_to] = balances[_to] + 1;
    }

    /// @notice Find the owner of an NFT
    /// @dev NFTs assigned to zero address are considered invalid, and queries about them do throw.
    /// @param _tokenId The identifier for an NFT
    /// @return The address of the owner of the NFT
    function ownerOf(uint256 _tokenId) override public view returns (address) {
        uint256 editionId = _editionFromTokenId(_tokenId);
        address owner = _ownerOf(_tokenId, editionId);
        require(owner != address(0), "ERC721_ZERO_OWNER");
        return owner;
    }

    /// @dev Newly created editions and its tokens minted to a creator don't have the owner set until the token is sold on the primary market
    /// @dev Therefore, if internally an edition exists and owner of token is zero address, then creator still owns the token
    /// @dev Otherwise, the token owner is returned or the zero address if the token does not exist
    function _ownerOf(uint256 _tokenId, uint256 _editionId) internal view returns (address) {

        // If an owner assigned
        address owner = owners[_tokenId];
        if (owner != address(0)) {
            return owner;
        }

        // fall back to edition creator
        address possibleCreator = _getCreatorOfEdition(_editionId);
        if (possibleCreator != address(0) && (_maxTokenIdOfEdition(_editionId) - 1) >= _tokenId) {
            return possibleCreator;
        }

        return address(0);
    }

    /// @notice Change or reaffirm the approved address for an NFT
    /// @dev The zero address indicates there is no approved address.
    ///      Throws unless `msg.sender` is the current NFT owner, or an authorized
    ///      operator of the current owner.
    /// @param _approved The new approved NFT controller
    /// @param _tokenId The NFT to approve
    function approve(address _approved, uint256 _tokenId) override external {
        address owner = ownerOf(_tokenId);
        require(_approved != owner, "ERC721_APPROVED_IS_OWNER");
        require(_msgSender() == owner || isApprovedForAll(owner, _msgSender()), "ERC721_INVALID_SENDER");
        approvals[_tokenId] = _approved;
        emit Approval(owner, _approved, _tokenId);
    }

    /// @notice Enable or disable approval for a third party ("operator") to manage
    ///         all of `msg.sender`"s assets
    /// @dev Emits the ApprovalForAll event. The contract MUST allow
    ///      multiple operators per owner.
    /// @param _operator Address to add to the set of authorized operators
    /// @param _approved True if the operator is approved, false to revoke approval
    function setApprovalForAll(address _operator, bool _approved) override external {
        operatorApprovals[_msgSender()][_operator] = _approved;
        emit ApprovalForAll(
            _msgSender(),
            _operator,
            _approved
        );
    }

    /// @notice Count all NFTs assigned to an owner
    /// @dev NFTs assigned to the zero address are considered invalid, and this
    ///      function throws for queries about the zero address.
    /// @param _owner An address for whom to query the balance
    /// @return The number of NFTs owned by `_owner`, possibly zero
    function balanceOf(address _owner) override external view returns (uint256) {
        require(_owner != address(0), "ERC721_ZERO_OWNER");
        return balances[_owner];
    }

    /// @notice Get the approved address for a single NFT
    /// @dev Throws if `_tokenId` is not a valid NFT.
    /// @param _tokenId The NFT to find the approved address for
    /// @return The approved address for this NFT, or the zero address if there is none
    function getApproved(uint256 _tokenId) override public view returns (address){
        return approvals[_tokenId];
    }

    /// @notice Query if an address is an authorized operator for another address
    /// @param _owner The address that owns the NFTs
    /// @param _operator The address that acts on behalf of the owner
    /// @return True if `_operator` is an approved operator for `_owner`, false otherwise
    function isApprovedForAll(address _owner, address _operator) override public view returns (bool){
        return operatorApprovals[_owner][_operator];
    }

    /// @notice An extension to the default ERC721 behaviour, derived from ERC-875.
    /// @dev Allowing for batch transfers from the provided address, will fail if from does not own all the tokens
    function batchTransferFrom(address _from, address _to, uint256[] calldata _tokenIds) public {
        for (uint256 i = 0; i < _tokenIds.length; i++) {
            _safeTransferFrom(_from, _to, _tokenIds[i], bytes(""));
            emit Transfer(_from, _to, _tokenIds[i]);
        }
    }

    /// @notice An extension to the default ERC721 behaviour, derived from ERC-875 but using the ConsecutiveTransfer event
    /// @dev Allowing for batch transfers from the provided address, will fail if from does not own all the tokens
    function consecutiveBatchTransferFrom(address _from, address _to, uint256 _fromTokenId, uint256 _toTokenId) public {
        for (uint256 i = _fromTokenId; i <= _toTokenId; i++) {
            _safeTransferFrom(_from, _to, i, bytes(""));
        }
        emit ConsecutiveTransfer(_fromTokenId, _toTokenId, _from, _to);
    }

    /////////////////////
    // Admin functions //
    /////////////////////

    function setRoyaltiesRegistryProxy(IERC2981 _royaltiesRegistryProxy) onlyAdmin public {
        royaltiesRegistryProxy = _royaltiesRegistryProxy;
        emit AdminRoyaltiesRegistryProxySet(address(_royaltiesRegistryProxy));
    }

    function setTokenUriResolver(ITokenUriResolver _tokenUriResolver) onlyAdmin public {
        tokenUriResolver = _tokenUriResolver;
        emit AdminTokenUriResolverSet(address(_tokenUriResolver));
    }

    function updateBasisPointsModulo(uint256 _newModulo) onlyAdmin public {
        basisPointsModulo = _newModulo;
    }

    ///////////////////////
    // Creator functions //
    ///////////////////////

    /// @notice Optional metadata storage slot which allows the creator to set an additional metadata blob on the edition
    function lockInAdditionalMetaData(uint256 _editionId, string calldata _metadata) external {
        address creator = getCreatorOfEdition(_editionId);
        require(
            _msgSender() == creator || accessControls.isVerifiedArtistProxy(creator, _msgSender()),
            "Unable to set when not creator"
        );

        require(bytes(sealedEditionMetaData[_editionId]).length == 0, "can only be set once");
        sealedEditionMetaData[_editionId] = _metadata;
        emit SealedEditionMetaDataSet(_editionId);
    }

    /// @notice Optional storage slot which allows the creator to set an additional unlockable blob on the edition
    function lockInUnlockableContent(uint256 _editionId, string calldata _content) external {
        address creator = getCreatorOfEdition(_editionId);
        require(
            _msgSender() == creator || accessControls.isVerifiedArtistProxy(creator, _msgSender()),
            "Unable to set when not creator"
        );

        additionalEditionUnlockableSlot[_editionId] = _content;
        emit AdditionalEditionUnlockableSet(_editionId);
    }

    /// @notice Optional metadata storage slot which allows a token owner to set an additional metadata blob on the token
    function lockInAdditionalTokenMetaData(uint256 _tokenId, string calldata _metadata) external {
        require(_msgSender() == ownerOf(_tokenId), "Unable to set when not owner");
        require(bytes(sealedTokenMetaData[_tokenId]).length == 0, "can only be set once");
        sealedTokenMetaData[_tokenId] = _metadata;
        emit SealedTokenMetaDataSet(_tokenId);
    }
}
