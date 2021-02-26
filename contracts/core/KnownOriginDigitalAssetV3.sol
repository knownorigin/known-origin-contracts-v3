// SPDX-License-Identifier: MIT

// FIXME bump to 0.8 and drop safemath?
pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/introspection/ERC165.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "../access/IKOAccessControlsLookup.sol";

import "./IKODAV3.sol";
import "./IKODAV3Minter.sol";
import "./KODAV3Core.sol";
import "../programmable/ITokenUriResolver.sol";
import "./permit/NFTPermit.sol";
import { TopDownERC20Composable } from "./composable/TopDownERC20Composable.sol";

// FIXME Use safe-math for all calcs?

// FIXME bring over OZ 721 test suite for comparison and so I can sleep at night

// FIXME Add composable support - https://github.com/mattlockyer/composables-998/blob/master/contracts/ComposableTopDown.sol

// FIXME add 712 Mint signature variant methods - checks signer has minter role - allows for caller from another contract/service

/*
 * A base 721 compliant contract which has a focus on being light weight
 */
contract KnownOriginDigitalAssetV3 is TopDownERC20Composable, NFTPermit, IKODAV3Minter, KODAV3Core, IKODAV3, ERC165 {
    using SafeMath for uint256;

    bytes4 constant internal ERC721_RECEIVED = bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
    bytes4 private constant _INTERFACE_ID_ERC721 = 0x80ac58cd;
    bytes4 private constant _INTERFACE_ID_ERC721_METADATA = 0x5b5e139f;

    event AdminEditionReported(uint256 indexed _editionId, bool indexed _reported);
    event AdminArtistAccountReported(address indexed _account, bool indexed _reported);
    event AdditionalMetaDataSet(uint256 indexed _editionId);
    event AdminRoyaltiesRegistryProxySet(address indexed _royaltiesRegistryProxy);
    event AdminTokenUriResolverSet(address indexed _tokenUriResolver);

    // Royalties registry
    IERC2981 public royaltiesRegistryProxy;

    // bool flag to setting proxy or not
    bool public royaltyRegistryActive;

    // Token URI resolver
    ITokenUriResolver public tokenUriResolver;

    // bool flag to setting tokenUri resolver
    bool public tokenUriResolverActive;

    // Edition number pointer
    uint256 public editionPointer;

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

    // ERC-2615 permit nonces
    mapping(address => uint256) public nonces;

    // Signature based minting nonces
    mapping(address => uint256) public mintingNonces;

    // TODO generate properly
    // keccak256("MintBatchViaSig(uint256 editionSize, address to, string uri,uint256 nonce,uint256 deadline)");
    bytes32 public constant MINT_BATCH_TYPEHASH = 0x48d39b37a35214940203bbbd4f383519797769b13d936f387d89430afef27688;

    struct EditionDetails {
        uint256 editionConfig; // combined creator and size
        string uri; // the referenced metadata
    }

    constructor(
        IKOAccessControlsLookup _accessControls,
        IERC2981 _royaltiesRegistryProxy,
        uint256 _editionPointer
    )
    KODAV3Core(_accessControls) {
        editionPointer = _editionPointer;

        // optional registry address
        if (address(_royaltiesRegistryProxy) != address(0)) {
            royaltiesRegistryProxy = _royaltiesRegistryProxy;
            royaltyRegistryActive = true;
        }

        _registerInterface(_INTERFACE_ID_ERC721);
        _registerInterface(_INTERFACE_ID_ERC721_METADATA);
    }

    function mintToken(address _to, string calldata _uri)
    public
    override
    returns (uint256 _tokenId) {
        require(accessControls.hasContractRole(_msgSender()), "KODA: Caller must have contract role");

        // Edition number is the first token ID
        uint256 nextEditionNumber = generateNextEditionNumber();

        // N.B: Dont store owner, see ownerOf method to special case checking to avoid storage costs on creation

        // assign balance
        balances[_to] = balances[_to].add(1);

        // edition of 1
        _defineEditionConfig(nextEditionNumber, 1, _to, _uri);

        // Single Transfer event for a single token
        emit Transfer(address(0), _to, nextEditionNumber);

        return nextEditionNumber;
    }

    // Mints batches of tokens emitting multiple Transfer events
    function mintBatchEdition(uint256 _editionSize, address _to, string calldata _uri)
    public
    override
    returns (uint256 _editionId) {
        require(accessControls.hasContractRole(_msgSender()), "KODA: Caller must have contract role");
        require(_editionSize > 0 && _editionSize <= MAX_EDITION_SIZE, "KODA: Invalid edition size");
        return _mintBatchEdition(_editionSize, _to, _uri);
    }

    //    // Mints batches of tokens emitting multiple Transfer events - via signed payloads
    //    function mintBatchEditionViaSig(uint256 _editionSize, address _to, string calldata _uri, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
    //    public returns
    //    (uint256 _editionId) {
    //        require(deadline >= block.timestamp, "KODA: Deadline expired");
    //        require(accessControls.hasMinterRole(_to), "KODA: Minter not approved");
    //        require(_editionSize > 0 && _editionSize <= MAX_EDITION_SIZE, "KODA: Invalid edition size");
    //
    //        {
    //            // Has the original signer signed it
    //            address recoveredAddress = ecrecover(
    //                keccak256(
    //                    abi.encodePacked(
    //                        "\x19\x01",
    //                        DOMAIN_SEPARATOR,
    //                        keccak256(abi.encode(MINT_BATCH_TYPEHASH, _editionSize, _to, _uri, mintingNonces[_to]++, deadline))
    //                    )
    //                ),
    //                v, r, s);
    //            require(recoveredAddress != address(0) && recoveredAddress == _to, "KODA: INVALID_SIGNATURE");
    //        }
    //
    //        return _mintBatchEdition(_editionSize, _to, _uri);
    //    }

    function _mintBatchEdition(uint256 _editionSize, address _to, string calldata _uri) internal returns (uint256) {
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
    function mintConsecutiveBatchEdition(uint256 _editionSize, address _to, string calldata _uri)
    public
    override
    returns (uint256 _editionId) {
        require(accessControls.hasContractRole(_msgSender()), "KODA: Caller must have contract role");
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

    function _defineEditionConfig(uint256 _editionId, uint256 _editionSize, address _to, string calldata _uri) internal {
        // TODO do we need a require for MAX_EDITION_ID ... ? max edition size
        require(_editionSize <= MAX_EDITION_ID, "Unable to make any more editions");

        // store address and size in config | address = holds a 20 byte value
        uint256 editionConfig = uint256(_to);

        // 256 bits can be stored in a single uint256 32 byte slot
        // 20 byte address takes up 160 bits leaving 96 bits left over
        // shift and store edition size in this section
        // edition size can now occupy a max of 12 bytes, or 96 bits
        editionConfig |= _editionSize << 160;

        // Store edition blob to be the next token pointer
        editionDetails[_editionId] = EditionDetails(editionConfig, _uri);
    }

    function generateNextEditionNumber() internal returns (uint256) {
        editionPointer = editionPointer + MAX_EDITION_SIZE;
        return editionPointer;
    }

    // FIXME test
    function editionURI(uint256 _editionId) public view returns (string memory) {
        EditionDetails storage edition = editionDetails[_editionId];
        require(edition.editionConfig != 0, "KODA: Edition does not exist");
        if (tokenUriResolverActive) {
            if (tokenUriResolver.isDefined(_editionId)) {
                return tokenUriResolver.editionURI(_editionId);
            }
        }
        return edition.uri;
    }

    // FIXME test
    function tokenURI(uint256 _tokenId) public view returns (string memory) {
        uint256 editionId = _editionFromTokenId(_tokenId);
        EditionDetails storage edition = editionDetails[editionId];
        require(edition.editionConfig != 0, "KODA: Token does not exist");
        if (tokenUriResolverActive) {
            if (tokenUriResolver.isDefined(editionId)) {
                return tokenUriResolver.editionURI(editionId);
            }
        }
        return edition.uri;
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

        // Extract creator and size of edition
        uint256 editionConfig = edition.editionConfig;

        return (
        address(editionConfig), // originCreator
        _ownerOf(_tokenId, editionId), // owner
        editionId,
        uint256(uint40(editionConfig >> 160)), // size
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
        return address(editionDetails[_editionId].editionConfig);
    }

    ////////////////
    // Size query //
    ////////////////

    function getSizeOfEdition(uint256 _editionId) public override view returns (uint256 _size) {
        return _getSizeOfEdition(_editionId);
    }

    function getEditionSizeOfToken(uint256 _tokenId) public override view returns (uint256 _size) {
        return _getSizeOfEdition(_editionFromTokenId(_tokenId));
    }

    function _getSizeOfEdition(uint256 _editionId) internal view returns (uint256 _size) {
        // gab the size from the end of the slot
        return uint256(uint40(editionDetails[_editionId].editionConfig >> 160));
    }

    /////////////////////
    // Existence query //
    /////////////////////

    function editionExists(uint256 _editionId) public override view returns (bool) {
        return editionDetails[_editionId].editionConfig > 0;
    }

    function exists(uint256 _tokenId) public override view returns (bool) {
        address owner = _ownerOf(_tokenId, _editionFromTokenId(_tokenId));
        return owner != address(0);
    }

    function maxTokenIdOfEdition(uint256 _editionId) public override view returns (uint256 _tokenId) {
        return _getSizeOfEdition(_editionId) + _editionId;
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

    // FIXME Function declared as view, but this expression (potentially) modifies the state and thus requires non-payable (the default) or payable.
    // Abstract away token royalty registry, proxy through to the implementation
    function royaltyInfo(uint256 _tokenId)
    external
    override
    returns (address receiver, uint256 amount) {
        // If we have a registry - use it
        if (royaltyRegistryActive) {
            // any registry must be edition aware so to only store one entry for all within the edition
            return royaltiesRegistryProxy.royaltyInfo(_editionFromTokenId(_tokenId));
        }

        return (_getCreatorOfEdition(_editionFromTokenId(_tokenId)), secondarySaleRoyalty);
    }

    // Expanded method at edition level and expanding on the funds receiver and the creator
    function royaltyAndCreatorInfo(uint256 _editionId)
    external
    override
    returns (address receiver, address creator, uint256 amount) {
        address originalCreator = _getCreatorOfEdition(_editionId);

        if (royaltyRegistryActive) {
            (address _receiver, uint256 _amount) = royaltiesRegistryProxy.royaltyInfo(_editionId);
            return (_receiver, originalCreator, _amount);
        }

        return (originalCreator, originalCreator, secondarySaleRoyalty);
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

        if (royaltyRegistryActive) {
            (address _receiver,) = royaltiesRegistryProxy.royaltyInfo(_editionId);
            return (_receiver, _creator, _tokenId);
        }

        return (_creator, _creator, _tokenId);
    }

    function getNextAvailablePrimarySaleToken(uint256 _editionId) public override view returns (uint256 _tokenId) {
        uint256 maxTokenId = _editionId + _getSizeOfEdition(_editionId);

        // TODO replace with inline assembly to optimise looping costs (https://medium.com/@jeancvllr/solidity-tutorial-all-about-assembly-5acdfefde05c)

        // TODO is a while more efficient ??
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
        if (possibleCreator != address(0) && (_getSizeOfEdition(_editionId) + _editionId - 1) >= _tokenId) {
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
        require(
            _msgSender() == owner || isApprovedForAll(owner, _msgSender()),
            "ERC721_INVALID_SENDER"
        );

        _approval(owner, _approved, _tokenId);
    }

    function _approval(address _owner, address _approved, uint256 _tokenId) internal {
        approvals[_tokenId] = _approved;
        emit Approval(_owner, _approved, _tokenId);
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

    /////////////////////////////
    // ERC-2612 Permit Variant //
    /////////////////////////////

    // FIXME can we move this higher up to the NFTPermit contract with a virtual _approval() method on

    function permit(address owner, address spender, uint256 tokenId, uint deadline, uint8 v, bytes32 r, bytes32 s)
    override
    external {
        require(deadline >= block.timestamp, "KODA: Deadline expired");
        require(ownerOf(tokenId) == owner, "KODA: Invalid owner");

        // Create digest to check signatures
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, tokenId, nonces[owner]++, deadline))
            )
        );

        // Has the original signer signed it
        address recoveredAddress = ecrecover(digest, v, r, s);
        require(recoveredAddress != address(0) && recoveredAddress == owner, "KODA: INVALID_SIGNATURE");

        // set approval for signature if passed
        _approval(owner, spender, tokenId);
    }

    // TODO confirm coverage for callback and magic receiver

    function _checkOnERC721Received(address from, address to, uint256 tokenId, bytes memory _data)
    private returns (bool) {
        if (!Address.isContract(to)) {
            return true;
        }
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returndata) = to.call(abi.encodeWithSelector(
                IERC721Receiver(to).onERC721Received.selector,
                _msgSender(),
                from,
                tokenId,
                _data
            ));
        if (!success) {
            if (returndata.length > 0) {
                // solhint-disable-next-line no-inline-assembly
                assembly {
                    let returndata_size := mload(returndata)
                    revert(add(32, returndata), returndata_size)
                }
            } else {
                revert("ERC721: transfer to non ERC721Receiver implementer");
            }
        }
        bytes4 retval = abi.decode(returndata, (bytes4));
        return (retval == ERC721_RECEIVED);
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

    function whitelistERC20(address _address) override public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller must have admin role");
        _whitelistERC20ERC223(_address);
    }

    function removeWhitelistForERC20ERC223(address _address) override public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller must have admin role");
        _removeWhitelistERC20ERC223(_address);
    }

    function updateMaxERC20sPerNFT(uint256 _max) override public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller must have admin role");
        _updateMaxERC20sPerNFT(_max);
    }

    function reportEditionId(uint256 _editionId, bool _reported) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller must have admin role");
        reportedEditionIds[_editionId] = _reported;
        emit AdminEditionReported(_editionId, _reported);
    }

    function reportEditionId(address _account, bool _reported) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller must have admin role");
        reportedArtistAccounts[_account] = _reported;
        emit AdminArtistAccountReported(_account, _reported);
    }

    // TODO test
    function setRoyaltiesRegistryProxy(IERC2981 _royaltiesRegistryProxy) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller must have admin role");
        royaltiesRegistryProxy = _royaltiesRegistryProxy;
        royaltyRegistryActive = address(_royaltiesRegistryProxy) != address(0);
        emit AdminRoyaltiesRegistryProxySet(address(_royaltiesRegistryProxy));
    }

    // TODO test
    function setTokenUriResolver(ITokenUriResolver _tokenUriResolver) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller must have admin role");
        tokenUriResolver = _tokenUriResolver;
        tokenUriResolverActive = address(_tokenUriResolver) != address(0);
        emit AdminTokenUriResolverSet(address(_tokenUriResolver));
    }

    // TODO add method stuck ERC721 retrieval ... ? I vote no as we can then use this address as the burn address?

    // TODO test
    /// @dev Allows for the ability to extract stuck Ether
    /// @dev Only callable from admin
    function withdrawStuckEther(address payable _withdrawalAccount) public {
        require(accessControls.hasContractRole(_msgSender()), "KODA: Caller must have admin role");
        _withdrawalAccount.transfer(address(this).balance);
    }

    // TODO test
    /// @dev Allows for the ability to extract stuck ERC20 tokens
    /// @dev Only callable from admin
    function withdrawStuckEther(address _tokenAddress, uint256 _amount, address _withdrawalAccount) public {
        require(accessControls.hasContractRole(_msgSender()), "KODA: Caller must have admin role");
        IERC20(_tokenAddress).transferFrom(address(this), _withdrawalAccount, _amount);
    }

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
