// SPDX-License-Identifier: MIT

pragma solidity 0.7.4; // FIXME bump to 0.8 and drop safemath?

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/introspection/ERC165.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./chi/ChiGasSaver.sol";

import "../access/KOAccessControls.sol";

import "./IKODAV3.sol";
import "./KODAV3Core.sol";
import "./ERC2612_NFTPermit.sol";

// TODO remove me
import "hardhat/console.sol";

/*
 * A base 721 compliant contract which has a focus on being light weight
 */
contract KnownOriginDigitalAssetV3 is NFTPermit, KODAV3Core, ChiGasSaver, IKODAV3, ERC165 {
    using SafeMath for uint256;

    bytes4 constant internal ERC721_RECEIVED = bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
    bytes4 private constant _INTERFACE_ID_ERC721 = 0x80ac58cd;
    bytes4 private constant _INTERFACE_ID_ERC721_METADATA = 0x5b5e139f;

    event AdminEditionReported(uint256 _editionId, bool _reported);

    // Edition number pointer
    uint256 public editionPointer;

    // Royalties registry
    IERC2981 public royaltiesRegistryProxy;

    // bool flag to setting proxy or not
    bool public royaltyRegistryActive;

    // Token name
    string public name;

    // Token symbol
    string public symbol;

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

    // A onchain reference to editions which have been reported for some infringement purposes to KO
    mapping(uint256 => bool) public reportedEditionIds;

    struct EditionDetails {
        uint256 editionConfig; // combined creator and size
        string uri; // the referenced metadata
    }

    constructor(
        KOAccessControls _accessControls,
        IERC2981 _royaltiesRegistryProxy,
        address _chiToken,
        uint256 _editionPointer
    )
    KODAV3Core(_accessControls)
    ChiGasSaver(_chiToken) {
        editionPointer = _editionPointer;

        // TODO setter
        // optional
        if (address(royaltiesRegistryProxy) != address(0)) {
            royaltiesRegistryProxy = _royaltiesRegistryProxy;
            royaltyRegistryActive = true;
        }

        name = "KnownOriginDigitalAsset";
        symbol = "KODA";

        _registerInterface(_INTERFACE_ID_ERC721);
        _registerInterface(_INTERFACE_ID_ERC721_METADATA);
    }

    function mintToken(address _to, string calldata _uri)
    public
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

    // GAS Saver version - TODO needs more testing and general understanding
    function mintTokenWithGasSaver(address _to, string calldata _uri)
    public
    saveGas(_to)
    returns (uint256 _tokenId) {
        return mintToken(_to, _uri);
    }

    // Mints batches of tokens emitting multiple Transfer events
    function mintBatchEdition(uint256 _editionSize, address _to, string calldata _uri)
    public
    returns (uint256 _editionId) {
        require(accessControls.hasContractRole(_msgSender()), "KODA: Caller must have minter role");
        require(_editionSize > 0 && _editionSize <= MAX_EDITION_SIZE, "KODA: Invalid edition size");

        uint256 start = generateNextEditionNumber();

        // N.B: Dont store owner, see ownerOf method to special case checking to avoid storage costs on creation

        // assign balance
        balances[_to] = balances[_to].add(_editionSize);

        // edition of x
        _defineEditionConfig(start, _editionSize, _to, _uri);

        // Emit a single event for the first token only
        emit Transfer(address(0), _to, start);

        return start;
    }

    // Mints batches of tokens but emits a single ConsecutiveTransfer event EIP-2309
    function mintConsecutiveBatchEdition(uint256 _editionSize, address _to, string calldata _uri)
    public
    returns (uint256 _editionId) {
        require(_editionSize > 0 && _editionSize <= MAX_EDITION_SIZE, "KODA: Invalid edition size");
        require(accessControls.hasContractRole(_msgSender()), "KODA: Caller must have minter role");

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
        // store address and size in config | address = holds a 20 byte value
        uint256 editionConfig = uint256(_to);

        // TODO calculate and document the max edition ID we can fit in these bits
        // 256 bits can be stored in a uint256
        // 20 byte address takes up 160 bytes
        // shift and store edition size in the unused bytes
        // edition size can occupy a max of 12 bytes, or 96 bits (I think)
        editionConfig |= _editionSize << 160;

        // Store edition blob to be the next token pointer
        editionDetails[_editionId] = EditionDetails(editionConfig, _uri);
    }

    function generateNextEditionNumber() internal returns (uint256) {
        editionPointer = editionPointer += MAX_EDITION_SIZE;
        return editionPointer;
    }

    // FIXME use resolver for dynamic token URIs ... ?
    function editionURI(uint256 _editionId) public view returns (string memory) {
        EditionDetails storage edition = editionDetails[_editionId];
        require(edition.editionConfig != 0, "Token does not exist");
        return edition.uri;
    }

    // FIXME use resolver for dynamic token URIs ... ?
    function tokenURI(uint256 _tokenId) public view returns (string memory) {
        uint256 editionId = _editionFromTokenId(_tokenId);
        EditionDetails storage edition = editionDetails[editionId];
        require(edition.editionConfig != 0, "Token does not exist");
        return edition.uri;
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

    function getCreatorOfEdition(uint256 _editionId)
    public
    override
    view
    returns (address _originalCreator) {
        return _getCreatorOfEdition(_editionId);
    }

    function getCreatorOfToken(uint256 _tokenId)
    public
    override
    view
    returns (address _originalCreator) {
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

    // TODO there must be a better way of doing this?
    function exists(uint256 _tokenId) public override view returns (bool) {
        ownerOf(_tokenId);
        return true;
    }

    // FIXME Use safe-math?
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

    // Abstract away token royalty registry, proxy through to the implementation
    function royaltyInfo(uint256 _tokenId)
    external
    override
    returns (address receiver, uint256 amount) {
        address creator = _getCreatorOfEdition(_editionFromTokenId(_tokenId));

        // If we have a registry - use it
        if (royaltyRegistryActive) {
            // any registry must be edition aware so to only store one entry for all within the edition
            return royaltiesRegistryProxy.royaltyInfo(_editionFromTokenId(_tokenId));
        }
        return (creator, secondarySaleRoyalty);
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
    returns (address _royaltyReceiver, address _creator, uint256 _tokenId) {
        uint256 tokenId = getNextAvailablePrimarySaleToken(_editionId);
        address originalCreator = _getCreatorOfEdition(_editionId);

        if (royaltyRegistryActive) {
            (address _receiver,) = royaltiesRegistryProxy.royaltyInfo(_editionId);
            return (_receiver, originalCreator, tokenId);
        }

        return (originalCreator, originalCreator, tokenId);
    }

    // FIXME means we need to sell in order?
    function getNextAvailablePrimarySaleToken(uint256 _editionId)
    public
    override
    view
    returns (uint256 _tokenId) {

        // TODO is there a optimisation where we record the last token sold on primary and then we start from this point ... ?
        uint256 maxTokenId = _editionId + _getSizeOfEdition(_editionId);

        for (uint256 tokenId = _editionId; tokenId < maxTokenId; tokenId++) {

            // TODO add a test to make sure this work after being minted, transferred and then transferred back to the original creator

            // if no owner set - assume primary if not moved
            if (owners[tokenId] == address(0)) {
                return tokenId;
            }
        }
        revert("No tokens left on the primary market");

        // TODO GAS costs increase per loop - gifting should reverse this list to make it smaller
        // TODO replace with inline assembly to optimise looping costs (https://medium.com/@jeancvllr/solidity-tutorial-all-about-assembly-5acdfefde05c)
    }

    function hasPrimarySaleOfToken(uint256 _tokenId) public override view returns (bool) {
        require(exists(_tokenId), "Token does not exist");
        return owners[_tokenId] != address(0);
    }

    // TODO add method stuck ETH retrieval
    // TODO add method stuck ERC20 retrieval
    // TODO add method stuck ERC721 retrieval

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
    function safeTransferFrom(
        address _from,
        address _to,
        uint256 _tokenId,
        bytes calldata _data
    )
    override
    external
    {
        transferFrom(
            _from,
            _to,
            _tokenId
        );

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

    /// @notice Transfers the ownership of an NFT from one address to another address
    /// @dev This works identically to the other function with an extra data parameter,
    ///      except this function just sets data to "".
    /// @param _from The current owner of the NFT
    /// @param _to The new owner
    /// @param _tokenId The NFT to transfer
    function safeTransferFrom(
        address _from,
        address _to,
        uint256 _tokenId
    )
    override
    external
    {
        transferFrom(
            _from,
            _to,
            _tokenId
        );

        uint256 receiverCodeSize;
        assembly {
            receiverCodeSize := extcodesize(_to)
        }
        if (receiverCodeSize > 0) {
            bytes4 selector = IERC721Receiver(_to).onERC721Received(
                _msgSender(),
                _from,
                _tokenId,
                ""
            );
            require(
                selector == ERC721_RECEIVED,
                "ERC721_INVALID_SELECTOR"
            );
        }
    }

    /// @notice Change or reaffirm the approved address for an NFT
    /// @dev The zero address indicates there is no approved address.
    ///      Throws unless `msg.sender` is the current NFT owner, or an authorized
    ///      operator of the current owner.
    /// @param _approved The new approved NFT controller
    /// @param _tokenId The NFT to approve
    function approve(address _approved, uint256 _tokenId)
    override
    external
    {
        address owner = ownerOf(_tokenId);
        require(
            _msgSender() == owner || isApprovedForAll(owner, _msgSender()),
            "ERC721_INVALID_SENDER"
        );

        approvals[_tokenId] = _approved;
        emit Approval(
            owner,
            _approved,
            _tokenId
        );
    }

    // TODO add method e.g. creatorTransfer()
    //      - this can be lighter weight then transfer as we can confirm the creator and pre-state of the edition
    //      - can be used by other contracts only
    //      - approval flow needs thought?

    // TODO validate approval flow for both sold out and partially available editions and their tokens

    /// @notice Enable or disable approval for a third party ("operator") to manage
    ///         all of `msg.sender`'s assets
    /// @dev Emits the ApprovalForAll event. The contract MUST allow
    ///      multiple operators per owner.
    /// @param _operator Address to add to the set of authorized operators
    /// @param _approved True if the operator is approved, false to revoke approval
    function setApprovalForAll(address _operator, bool _approved)
    override
    external
    {
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
    function balanceOf(address _owner)
    override
    external
    view
    returns (uint256)
    {
        require(
            _owner != address(0),
            "ERC721_ZERO_OWNER"
        );
        return balances[_owner];
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
    function transferFrom(
        address _from,
        address _to,
        uint256 _tokenId
    )
    override
    public {
        // enforce not being able to send to zero as we have explicit rules what a minted but unbound owner is
        require(_to != address(0), "ERC721_ZERO_TO_ADDRESS");

        address owner = ownerOf(_tokenId);
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

        // move the token
        emit Transfer(_from, _to, _tokenId);

        // after transfer - check to see if any more tokens are assigning to the creator and trigger transfer event
        uint256 nextTokenId = _tokenId + 1;
        if (
            (nextTokenId < maxTokenIdOfEdition(_editionFromTokenId(_tokenId))) // does not exceed max token ID for edition
            && (owners[nextTokenId] == address(0)) // not already assigned an new owner
        ) {
            // TODO _from in this scenario should always be the creator ... test this assumption ... ?
            // issue the transfer event for the next token
            emit Transfer(address(0), _from, nextTokenId);
        }
    }

    /// @notice Find the owner of an NFT
    /// @dev NFTs assigned to zero address are considered invalid, and queries about them do throw.
    /// @param _tokenId The identifier for an NFT
    /// @return The address of the owner of the NFT
    function ownerOf(uint256 _tokenId)
    override
    public
    view
    returns (address) {
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

        // Get the edition size and work out the max token ID, if it does not fall within this range then fail
        if ((_getSizeOfEdition(_editionId) + _editionId) <= _tokenId) {
            revert("ERC721_ZERO_OWNER");
            // TODO validate this is needed
            //      - I am pretty sure it is, when requesting a token from outside of the edition size but within the edition range
        }

        // fall back to edition creator
        address possibleCreator = _getCreatorOfEdition(_editionId);
        if (possibleCreator != address(0)) {
            return possibleCreator;
        }

        return address(0);
    }

    /// @notice Get the approved address for a single NFT
    /// @dev Throws if `_tokenId` is not a valid NFT.
    /// @param _tokenId The NFT to find the approved address for
    /// @return The approved address for this NFT, or the zero address if there is none
    function getApproved(uint256 _tokenId)
    override
    public
    view
    returns (address)
    {
        return approvals[_tokenId];
    }

    /// @notice Query if an address is an authorized operator for another address
    /// @param _owner The address that owns the NFTs
    /// @param _operator The address that acts on behalf of the owner
    /// @return True if `_operator` is an approved operator for `_owner`, false otherwise
    function isApprovedForAll(address _owner, address _operator)
    override
    public
    view
    returns (bool)
    {
        return operatorApprovals[_owner][_operator];
    }

    // TODO confirm coverage for callback and magic receiver

    function _checkOnERC721Received(address from, address to, uint256 tokenId, bytes memory _data)
    private returns (bool)
    {
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
        } else {
            bytes4 retval = abi.decode(returndata, (bytes4));
            return (retval == ERC721_RECEIVED);
        }
    }

    ///////////////////
    // Admin setters //
    ///////////////////

    function reportEditionId(uint256 _editionId, bool _reported) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller must have admin role");
        reportedEditionIds[_editionId] = _reported;
        emit AdminEditionReported(_editionId, _reported);
    }

}
