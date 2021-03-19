// SPDX-License-Identifier: MIT

// FIXME bump to 0.8 and drop safemath?
pragma solidity 0.7.6;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {ERC165} from "@openzeppelin/contracts/introspection/ERC165.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IERC2981} from "./IERC2981.sol";
import {IKODAV3} from "./IKODAV3.sol";
import {IKODAV3Minter} from "./IKODAV3Minter.sol";
import {Konstants} from "./Konstants.sol";
import {ITokenUriResolver} from "../programmable/ITokenUriResolver.sol";
import {TopDownERC20Composable} from "./composable/TopDownERC20Composable.sol";

// FIXME Use safe-math for all calcs?

/*
 * A base 721 compliant contract which has a focus on being light weight
 */
contract KnownOriginDigitalAssetV3 is TopDownERC20Composable, Konstants, ERC165, IKODAV3Minter, IKODAV3 {
    using SafeMath for uint256;

    bytes4 constant internal ERC721_RECEIVED = bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));

    event AdminUpdateSecondaryRoyalty(uint256 _secondarySaleRoyalty);
    event AdminEditionReported(uint256 indexed _editionId, bool indexed _reported);
    event AdminArtistAccountReported(address indexed _account, bool indexed _reported);
    event AdditionalMetaDataSet(uint256 indexed _editionId);
    event AdminRoyaltiesRegistryProxySet(address indexed _royaltiesRegistryProxy);
    event AdminTokenUriResolverSet(address indexed _tokenUriResolver);

    modifier onlyContract(){
        require(accessControls.hasContractRole(_msgSender()), "KODA: Caller must have contract role");
        _;
    }

    modifier onlyAdmin(){
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller must have admin role");
        _;
    }

    // Token name
    string public name = "KnownOriginDigitalAsset";

    // Token symbol
    string public symbol = "KODA";

    // KODA version
    string public version = "3";

    // Royalties registry
    IERC2981 public royaltiesRegistryProxy;

    // Token URI resolver
    ITokenUriResolver public tokenUriResolver;

    // Edition number pointer
    uint256 public editionPointer;

    struct EditionDetails {
        address creator;
        uint96 editionSize;
        string uri; // the referenced metadata
    }

    // tokens are minted in batches - the first token ID used is representative of the edition ID (for now)
    mapping(uint256 => EditionDetails) editionDetails;

    // Mapping of tokenId => owner - only set on first transfer (after mint) such as a primary sale and/or gift
    mapping(uint256 => address) internal owners;

    // Mapping of owner => number of tokens owned
    mapping(address => uint256) internal balances;

    // Mapping of tokenId => approved address
    mapping(uint256 => address) internal approvals;

    // Mapping of owner => operator => approved
    mapping(address => mapping(address => bool)) internal operatorApprovals;

    // Optional one time use storage slot for additional edition metadata
    mapping(uint256 => string) public additionalEditionMetaData;

    // A onchain reference to editions which have been reported for some infringement purposes to KO
    mapping(uint256 => bool) public reportedEditionIds;

    // A onchain reference to accounts which have been lost/hacked etc
    mapping(address => bool) public reportedArtistAccounts;

    // TODO confirm default decimal precision (EIP-2981 compatibility required)
    // Secondary sale commission
    uint256 public secondarySaleRoyalty = 12_50000; // 12.5%

    IKOAccessControlsLookup public accessControls;

    constructor(
        IKOAccessControlsLookup _accessControls,
        IERC2981 _royaltiesRegistryProxy,
        uint256 _editionPointer
    ) {
        accessControls = _accessControls;

        editionPointer = _editionPointer;

        // optional registry address - can be constructed as zero address
        royaltiesRegistryProxy = _royaltiesRegistryProxy;

        // INTERFACE_ID_ERC721
        _registerInterface(0x80ac58cd);

        // INTERFACE_ID_ERC721_METADATA
        _registerInterface(0x5b5e139f);

        // INTERFACE_ID_ERC721ROYALTIES
        _registerInterface(0x4b7f2c2d);
    }

    function mintToken(address _to, string calldata _uri)
    public
    override
    onlyContract
    returns (uint256 _tokenId) {
        return _mintBatchEdition(1, _to, _uri);
    }

    // Mints batches of tokens emitting multiple Transfer events
    function mintBatchEdition(uint96 _editionSize, address _to, string calldata _uri)
    public
    override
    onlyContract
    returns (uint256 _editionId) {
        return _mintBatchEdition(_editionSize, _to, _uri);
    }

    function mintBatchEditionAndComposeERC20s(uint96 _editionSize, address _to, string calldata _uri, address[] calldata _erc20s, uint256[] calldata _amounts)
    external onlyContract override returns (uint256 _editionId) {
        require(_erc20s.length == _amounts.length, "Array length mismatch");
        require(_erc20s.length > 0, "Empty array");
        _editionId = _mintBatchEdition(_editionSize, _to, _uri);

        for(uint i = 0; i < _erc20s.length; i++) {
            address erc20 = _erc20s[i];
            uint256 amount = _amounts[i];
            _composeERC20IntoEdition(_to, _editionId, erc20, amount);
        }
    }

    function _mintBatchEdition(uint96 _editionSize, address _to, string calldata _uri) internal returns (uint256) {
        require(_editionSize > 0 && _editionSize <= MAX_EDITION_SIZE, "KODA: Invalid edition size");

        uint256 start = generateNextEditionNumber();

        // N.B: Dont store owner, see ownerOf method to special case checking to avoid storage costs on creation

        // assign balance
        balances[_to] = balances[_to].add(_editionSize);

        // edition of x
        _defineEditionConfig(start, _editionSize, _to, _uri);

        // Loop emit all transfer events
        uint256 end = start.add(_editionSize);
        for (uint i = start; i < end; i++) {
            emit Transfer(address(0), _to, i);
        }
        return start;
    }

    // Mints batches of tokens but emits a single ConsecutiveTransfer event EIP-2309
    function mintConsecutiveBatchEdition(uint96 _editionSize, address _to, string calldata _uri)
    public
    override
    onlyContract
    returns (uint256 _editionId) {
        require(_editionSize > 0 && _editionSize <= MAX_EDITION_SIZE, "KODA: Invalid edition size");

        uint256 start = generateNextEditionNumber();

        // N.B: Dont store owner, see ownerOf method to special case checking to avoid storage costs on creation

        // assign balance
        balances[_to] = balances[_to].add(_editionSize);

        // Start ID always equals edition ID
        _defineEditionConfig(start, _editionSize, _to, _uri);

        // emit EIP-2309 consecutive transfer event
        emit ConsecutiveTransfer(start, start.add(_editionSize), address(0), _to);

        return start;
    }

    function _defineEditionConfig(uint256 _editionId, uint96 _editionSize, address _to, string calldata _uri) internal {
        require(_editionSize <= MAX_EDITION_ID, "Unable to make any more editions");

        // Store edition blob to be the next token pointer
        editionDetails[_editionId] = EditionDetails(_to, _editionSize, _uri);
    }

    function generateNextEditionNumber() internal returns (uint256) {
        editionPointer = editionPointer + MAX_EDITION_SIZE;
        return editionPointer;
    }

    function editionURI(uint256 _editionId) public view returns (string memory) {
        EditionDetails storage edition = editionDetails[_editionId];
        require(edition.editionSize != 0, "KODA: Edition does not exist");

        if (tokenUriResolverActive() && tokenUriResolver.isDefined(_editionId)) {
            return tokenUriResolver.editionURI(_editionId);
        }
        return edition.uri;
    }

    function tokenURI(uint256 _tokenId) public view returns (string memory) {
        uint256 editionId = _editionFromTokenId(_tokenId);
        EditionDetails storage edition = editionDetails[editionId];
        require(edition.editionSize != 0, "KODA: Token does not exist");

        if (tokenUriResolverActive() && tokenUriResolver.isDefined(editionId)) {
            return tokenUriResolver.editionURI(editionId);
        }
        return edition.uri;
    }

    function tokenUriResolverActive() public view returns (bool) {
        return address(tokenUriResolver) != address(0);
    }

    function editionAdditionalMetaData(uint256 _editionId) public view returns (string memory) {
        return additionalEditionMetaData[_editionId];
    }

    function tokenAdditionalMetaData(uint256 _tokenId) public view returns (string memory) {
        uint256 editionId = _editionFromTokenId(_tokenId);
        return additionalEditionMetaData[editionId];
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
        // drop the other size bits
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
        return editionDetails[_editionId].editionSize > 0;
    }

    function exists(uint256 _tokenId) public override view returns (bool) {
        address owner = _ownerOf(_tokenId, _editionFromTokenId(_tokenId));
        return owner != address(0);
    }

    function maxTokenIdOfEdition(uint256 _editionId) public override view returns (uint256 _tokenId) {
        return editionDetails[_editionId].editionSize + _editionId;
    }

    ////////////////
    // Edition ID //
    ////////////////

    function getEditionIdOfToken(uint256 _tokenId) public override pure returns (uint256 _editionId) {
        return _editionFromTokenId(_tokenId);
    }

    //////////////
    // ERC-2981 //
    //////////////

    // Abstract away token royalty registry, proxy through to the implementation
    function royaltyInfo(uint256 _tokenId)
    external
    override
    returns (address receiver, uint256 amount) {
        uint256 editionId = _editionFromTokenId(_tokenId);

        // If we have a registry and its defined, use it
        if (royaltyRegistryActive() && royaltiesRegistryProxy.hasRoyalties(editionId)) {

            // Note: any registry must be edition aware so to only store one entry for all within the edition
            return royaltiesRegistryProxy.royaltyInfo(editionId);
        }

        return (_getCreatorOfEdition(editionId), secondarySaleRoyalty);
    }

    // Expanded method at edition level and expanding on the funds receiver and the creator
    function royaltyAndCreatorInfo(uint256 _editionId)
    external
    override
    returns (address receiver, address creator, uint256 amount) {
        address originalCreator = _getCreatorOfEdition(_editionId);

        if (royaltyRegistryActive() && royaltiesRegistryProxy.hasRoyalties(_editionId)) {
            // Note: any registry must be edition aware so to only store one entry for all within the edition
            (address _receiver, uint256 _amount) = royaltiesRegistryProxy.royaltyInfo(_editionId);
            return (_receiver, originalCreator, _amount);
        }

        return (originalCreator, originalCreator, secondarySaleRoyalty);
    }

    function hasRoyalties(uint256 _tokenId) external override view returns (bool) {
        require(exists(_tokenId), "KODA: Token does not exist");
        if (royaltyRegistryActive() && royaltiesRegistryProxy.hasRoyalties(_editionFromTokenId(_tokenId))) {
            return true;
        }
        return secondarySaleRoyalty > 0;
    }

    function receivedRoyalties(address _royaltyRecipient, address _buyer, uint256 _tokenId, address _tokenPaid, uint256 _amount)
    external
    override {
        emit ReceivedRoyalties(_royaltyRecipient, _buyer, _tokenId, _tokenPaid, _amount);
    }

    ////////////////////////////////////
    // Primary Sale Utilities methods //
    ////////////////////////////////////

    function facilitateNextPrimarySale(uint256 _editionId)
    public
    override
    returns (address receiver, address creator, uint256 tokenId) {
        uint256 _tokenId = getNextAvailablePrimarySaleToken(_editionId);
        address _creator = _getCreatorOfEdition(_editionId);

        if (royaltyRegistryActive()) {
            (address _receiver,) = royaltiesRegistryProxy.royaltyInfo(_editionId);
            return (_receiver, _creator, _tokenId);
        }

        return (_creator, _creator, _tokenId);
    }

    function getNextAvailablePrimarySaleToken(uint256 _editionId) public override view returns (uint256 _tokenId) {
        uint256 maxTokenId = _editionId + editionDetails[_editionId].editionSize;
        for (uint256 tokenId = _editionId; tokenId < maxTokenId; tokenId++) {
            // if no owner set - assume primary if not moved
            if (owners[tokenId] == address(0)) {
                return tokenId;
            }
        }
        revert("KODA: No tokens left on the primary market");
    }

    function hadPrimarySaleOfToken(uint256 _tokenId) public override view returns (bool) {
        return owners[_tokenId] != address(0);
    }

    function royaltyRegistryActive() public view returns (bool) {
        return address(royaltiesRegistryProxy) != address(0);
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
        balances[_from] = balances[_from].sub(1);
        balances[_to] = balances[_to].add(1);
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

    // magic internal method for working out current owner - this returns
    function _ownerOf(uint256 _tokenId, uint256 _editionId) internal view returns (address) {

        // If an owner assigned
        address owner = owners[_tokenId];
        if (owner != address(0)) {
            return owner;
        }

        // fall back to edition creator
        address possibleCreator = _getCreatorOfEdition(_editionId);
        if (possibleCreator != address(0) && (editionDetails[_editionId].editionSize + _editionId - 1) >= _tokenId) {
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

    // TODO validate approval flow for both sold out and partially available editions and their tokens

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

    function updateSecondaryRoyalty(uint256 _secondarySaleRoyalty) public onlyAdmin {
        secondarySaleRoyalty = _secondarySaleRoyalty;
        emit AdminUpdateSecondaryRoyalty(_secondarySaleRoyalty);
    }

    function whitelistERC20(address _address) override onlyAdmin public {
        _whitelistERC20(_address);
    }

    function removeWhitelistForERC20(address _address) override onlyAdmin public {
        _removeWhitelistERC20(_address);
    }

    function updateMaxERC20sPerNFT(uint256 _max) override onlyAdmin public {
        _updateMaxERC20sPerNFT(_max);
    }

    function reportEditionId(uint256 _editionId, bool _reported) onlyAdmin public {
        reportedEditionIds[_editionId] = _reported;
        emit AdminEditionReported(_editionId, _reported);
    }

    function reportArtistAccount(address _account, bool _reported) onlyAdmin public {
        reportedArtistAccounts[_account] = _reported;
        emit AdminArtistAccountReported(_account, _reported);
    }

    function setRoyaltiesRegistryProxy(IERC2981 _royaltiesRegistryProxy) onlyAdmin public {
        royaltiesRegistryProxy = _royaltiesRegistryProxy;
        emit AdminRoyaltiesRegistryProxySet(address(_royaltiesRegistryProxy));
    }

    function setTokenUriResolver(ITokenUriResolver _tokenUriResolver) onlyAdmin public {
        tokenUriResolver = _tokenUriResolver;
        emit AdminTokenUriResolverSet(address(_tokenUriResolver));
    }

    /// @dev Allows for the ability to extract stuck ERC20 tokens
    /// @dev Only callable from admin
    function withdrawStuckTokens(address _tokenAddress, uint256 _amount, address _withdrawalAccount) public {
        require(accessControls.hasContractOrAdminRole(_msgSender()), "KODA: Caller must have contract or admin role");
        IERC20(_tokenAddress).approve(address(this), _amount);
        IERC20(_tokenAddress).transferFrom(address(this), _withdrawalAccount, _amount);
    }

    // TODO add method stuck ERC721 retrieval ... ? I vote no as we can then use this address as the burn address?

    ///////////////////////
    // Creator functions //
    ///////////////////////

    // Optional metadata storage slot which allows the creator to set an additional metadata blob on the token
    function lockInAdditionalMetaData(uint256 _editionId, string calldata metadata) external {
        require(_msgSender() == getCreatorOfEdition(_editionId), "KODA: unable to set when not creator");

        // TODO enforce only once? ... check/confirm thoughts on this

        require(bytes(additionalEditionMetaData[_editionId]).length == 0, "KODA: can only be set once");
        additionalEditionMetaData[_editionId] = metadata;
        emit AdditionalMetaDataSet(_editionId);
    }

}
