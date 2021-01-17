// SPDX-License-Identifier: MIT

pragma solidity 0.7.3;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/introspection/ERC165.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/EnumerableMap.sol";
import "./IKODAV3.sol";
import "../access/KOAccessControls.sol";

// TODO add GSN support

/*
 * A base 721 compliant contract which has a focus on being light weight
 */
contract KnownOriginDigitalAssetV3 is ERC165, IKODAV3 {
    using SafeMath for uint256;
    using EnumerableMap for EnumerableMap.UintToAddressMap;

    bytes4 constant internal ERC721_RECEIVED = bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
    bytes4 private constant _INTERFACE_ID_ERC721 = 0x80ac58cd;
    bytes4 private constant _INTERFACE_ID_ERC721_METADATA = 0x5b5e139f;

    KOAccessControls public accessControls;

    uint256 public constant MAX_EDITION_SIZE = 1000;

    // Token name
    string public name;

    // Token symbol
    string public symbol;

    uint256 public tokenPointer = 0;
    uint256 public totalSupply;

    struct EditionDetails {
        uint256 editionConfig; // creator and size inside
        string uri; // the referenced data
    }

    // tokens are minted in batches - the first token ID used is representative of the edition ID (for now)
    mapping(uint256 => EditionDetails) editionInfo;

    // Mapping of tokenId => owner - only set after initial creation such as a primary sale and or gift
    mapping(uint256 => address) internal owners;

    // Mapping of owner => number of tokens owned
    mapping(address => uint256) internal balances;

    // Mapping of tokenId => approved address
    mapping(uint256 => address) internal approvals;

    // Mapping of owner => operator => approved
    mapping(address => mapping(address => bool)) internal operatorApprovals;

    constructor(KOAccessControls _accessControls, uint256 _startTokenPointer)
    public {
        accessControls = _accessControls;

        // FIXME define on creation from KO V2 max edition ID ...
        tokenPointer = _startTokenPointer;

        name = "KnownOriginDigitalAsset";
        symbol = "KODA";

        _registerInterface(_INTERFACE_ID_ERC721);
        _registerInterface(_INTERFACE_ID_ERC721_METADATA);
    }

    function mintToken(address _to, string calldata _uri) external returns (uint256 _tokenId) {
        require(accessControls.hasContractRole(msg.sender), "KODA: Caller must have minter role");

        // bump token pointer
        uint256 tokenId = tokenPointer;

        // N.B: Dont store owner, see ownerOf method to special case checking to avoid storage costs on creation
        balances[_to] = balances[_to].add(1);

        // edition of 1
        _defineEditionConfig(1, _to, _uri);

        // FIXME Q: can we remove pointer and or supply?

        // Update token pointer to be move to the next range
        tokenPointer = tokenPointer.add(MAX_EDITION_SIZE);

        // update contract total supply
        totalSupply = totalSupply.add(1);

        // Single Transfer event for a single token
        emit Transfer(address(0), _to, tokenId);

        return tokenId;
    }

    // Mints batches of tokens emitting multiple Transfer events
    function mintTokenEdition(uint256 _editionSize, address _to, string calldata _uri)
    external
    returns (uint256 _firstTokenId, uint256 _lastTokenId) {
        require(_editionSize > 0 && _editionSize <= MAX_EDITION_SIZE, "KODA: Invalid edition size");
        require(accessControls.hasContractRole(msg.sender), "KODA: Caller must have minter role");

        uint256 start = tokenPointer;
        uint256 end = start.add(_editionSize);

        // N.B: Dont store owner, see ownerOf method to special case checking to avoid storage costs on creation

        // assign balance
        balances[_to] = balances[_to].add(_editionSize);

        // edition of x
        _defineEditionConfig(_editionSize, _to, _uri);

        // FIXME Q: can we remove pointer and or supply?

        // Update token pointer to be move to the next range
        tokenPointer = tokenPointer.add(MAX_EDITION_SIZE);

        // update contract total supply
        totalSupply = totalSupply.add(1);

        // Batch event emitting
        for (uint i = start; i < end; i++) {
            emit Transfer(address(0), _to, i);
        }

        return (start, end);
    }

    // Mints batches of tokens but emits a single ConsecutiveTransfer event EIP-2309
    function mintConsecutiveEdition(uint256 _editionSize, address _to, string calldata _uri)
    external
    returns (uint256 _firstTokenId, uint256 _lastTokenId) {
        require(_editionSize > 0 && _editionSize <= MAX_EDITION_SIZE, "KODA: Invalid edition size");
        require(accessControls.hasContractRole(msg.sender), "KODA: Caller must have minter role");

        uint256 start = tokenPointer;
        uint256 end = start.add(_editionSize);

        // assign balance
        balances[_to] = balances[_to].add(_editionSize);

        _defineEditionConfig(_editionSize, _to, _uri);

        // FIXME Q: can we remove pointer and or supply?

        // Update token pointer to be move to the next range
        tokenPointer = tokenPointer.add(MAX_EDITION_SIZE);

        // update contract total supply
        totalSupply = totalSupply.add(1);

        // emit EIP-2309 consecutive transfer event
        emit ConsecutiveTransfer(start, end, address(0), _to);

        return (start, end);
    }

    function _defineEditionConfig(uint256 _editionSize, address _to, string calldata _uri) internal {

        // store address and size in config
        uint256 editionConfig = uint256(_to);
        // shift and store edition size
        editionConfig |= _editionSize << 160;

        // Store edition blob to be the next token pointer
        editionInfo[tokenPointer] = EditionDetails(editionConfig, _uri);
    }

    function tokenURI(uint256 _tokenId) external view returns (string memory) {
        return editionInfo[_editionFromTokenId(_tokenId)].uri;
    }

    function getEditionIdForToken(uint256 _tokenId) public view returns (uint256 _editionId) {
        return _editionFromTokenId(_tokenId);
    }

    function getNextEditionNumber() external view returns (uint256 _editionId) {
        return tokenPointer;
    }

    function getEditionDetails(uint256 _tokenId)
    public
    view
    returns (address _originalCreator, uint256 _editionId, uint256 _size, string memory _uri) {
        uint256 editionId = _editionFromTokenId(_tokenId);
        EditionDetails memory edition = editionInfo[editionId];

        // Extract creator and size of edition
        uint256 editionConfig = edition.editionConfig;
        address originCreator = address(editionConfig);
        uint256 size = uint256(uint40(editionConfig >> 160));

        return (
        originCreator,
        editionId,
        size,
        edition.uri
        );
    }

    function getEditionCreator(uint256 _tokenId)
    public
    view
    returns (address _originalCreator) {
        uint256 editionId = _editionFromTokenId(_tokenId);
        EditionDetails memory edition = editionInfo[editionId];
        // Pop off creator
        uint256 editionConfig = edition.editionConfig;
        address originCreator = address(editionConfig);
        return originCreator;
    }

    function getEditionSize(uint256 _tokenId) public view returns (uint256 _size) {
        uint256 editionId = _editionFromTokenId(_tokenId);
        EditionDetails memory edition = editionInfo[editionId];
        uint256 editionConfig = edition.editionConfig;
        uint256 size = uint256(uint40(editionConfig >> 160));
        return size;
    }

    function editionExists(uint256 _editionId) public view returns (bool) {
        EditionDetails memory edition = editionInfo[_editionId];
        uint256 editionConfig = edition.editionConfig;
        uint256 size = uint256(uint40(editionConfig >> 160));
        return size > 0;
    }

    // magic method that defines the maximum range for an edition
    // this is fix forever
    // tokens are minted in range
    function _editionFromTokenId(uint256 _tokenId) internal view returns (uint256) {
        require(_ownerOf(_tokenId) != address(0), "Token does not exist");
        return (_tokenId / MAX_EDITION_SIZE) * MAX_EDITION_SIZE;
    }

    //////////////
    // ERC-2981 //
    //////////////

    // Abstract away token royalty registry, proxy through to the implementation
    function royaltyInfo(uint256 _tokenId) external override returns (address receiver, uint256 amount) {
        // TODO implement this
        return (address(0), 0);
    }

    //////////////
    // Defaults //
    //////////////

    // TODO Do we need a burn?

    //    function burn(uint256 _tokenId) external {
    //        require(accessControls.hasContractRole(msg.sender) || ownerOf(_tokenId) == msg.sender, "KODA: Caller does not have permission");
    //        _burn(_tokenId);
    //    }

    // Replace a burn with a proxies burn address call ... ?

    //    function _burn(uint256 _tokenId) internal {
    //        address owner = _ownerOf(_tokenId);
    //        require(owner != address(0), "ERC721_ZERO_OWNER_ADDRESS");
    //
    //        owners[_tokenId] = address(0);
    //        balances[owner] = balances[owner].sub(1);
    //        totalSupply = totalSupply.sub(1);
    //
    //        // TODO - reduce supply within editionConfig
    //
    //        emit Transfer(owner, address(0), _tokenId);
    //    }

    /// @notice Transfers the ownership of an NFT from one address to another address
    /// @dev This works identically to the other function with an extra data parameter,
    ///      except this function just sets data to "".
    /// @param _from The current owner of the NFT
    /// @param _to The new owner
    /// @param _tokenId The NFT to transfer
    function safeTransferFrom(address _from, address _to, uint256 _tokenId) override public {
        safeTransferFrom(_from, _to, _tokenId, "");
    }

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
    function safeTransferFrom(address _from, address _to, uint256 _tokenId, bytes memory _data)
    override
    public {
        transferFrom(_from, _to, _tokenId);
        require(_checkOnERC721Received(_from, _to, _tokenId, _data), "ERC721: transfer to non ERC721Receiver implementer");
    }

    /// @notice Change or reaffirm the approved address for an NFT
    /// @dev The zero address indicates there is no approved address.
    ///      Throws unless `msg.sender` is the current NFT owner, or an authorized
    ///      operator of the current owner.
    /// @param _approved The new approved NFT controller
    /// @param _tokenId The NFT to approve
    function approve(address _approved, uint256 _tokenId)
    override
    external {
        address owner = ownerOf(_tokenId);
        require(_approved != owner, "ERC721: approval to current owner");

        require(msg.sender == owner || isApprovedForAll(owner, msg.sender), "ERC721: approve caller is not owner nor approved for all");

        approvals[_tokenId] = _approved;

        emit Approval(owner, _approved, _tokenId);
    }

    /// @notice Enable or disable approval for a third party ("operator") to manage
    ///         all of `msg.sender`'s assets
    /// @dev Emits the ApprovalForAll event. The contract MUST allow
    ///      multiple operators per owner.
    /// @param _operator Address to add to the set of authorized operators
    /// @param _approved True if the operator is approved, false to revoke approval
    function setApprovalForAll(address _operator, bool _approved)
    override
    external {
        require(_operator != msg.sender, "ERC721: approve to caller");

        operatorApprovals[msg.sender][_operator] = _approved;
        emit ApprovalForAll(msg.sender, _operator, _approved);
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
    returns (uint256){
        require(_owner != address(0), "ERC721: owner query for nonexistent token");
        return balances[_owner];
    }

    /// @notice Transfer ownership of an NFT -- THE CALLER IS RESPONSIBLE
    ///         TO CONFIRM THAT `_to` IS CAPABLE OF RECEIVING NFTS OR ELSE
    ///         THEY MAY BE PERMANENTLY LOST
    /// @dev Throws unless `msg.sender` is the current owner, an authorized
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
        require(_to != address(0), "ERC721_ZERO_TO_ADDRESS");

        address owner = ownerOf(_tokenId);
        require(_from == owner, "ERC721_OWNER_MISMATCH");

        address spender = msg.sender;
        address approvedAddress = getApproved(_tokenId);
        require(spender == owner || isApprovedForAll(owner, spender) || approvedAddress == spender, "ERC721_INVALID_SPENDER");

        if (approvedAddress != address(0)) {
            approvals[_tokenId] = address(0);
        }

        // set new owner - this will now override any specific other mappings for the base edition config
        owners[_tokenId] = _to;

        balances[_from] = balances[_from].sub(1);
        balances[_to] = balances[_to].add(1);

        emit Transfer(_from, _to, _tokenId);
    }

    /// @notice Find the owner of an NFT
    /// @dev NFTs assigned to zero address are considered invalid, and queries
    ///      about them do throw.
    /// @param _tokenId The identifier for an NFT
    /// @return The address of the owner of the NFT
    function ownerOf(uint256 _tokenId)
    override
    public
    view
    returns (address) {
        address owner = _ownerOf(_tokenId);
        require(owner != address(0), "ERC721: owner query for nonexistent token");
        return owner;
    }

    // magic internal method for working out current owner
    function _ownerOf(uint256 _tokenId) internal view returns (address) {
        // If an owner assigned
        address owner = owners[_tokenId];
        if (owner != address(0)) {
            return owner;
        }

        // fall back to edition creator
        address possibleCreator = getEditionCreator(getEditionIdForToken(_tokenId));
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
    returns (address) {
        require(_ownerOf(_tokenId) != address(0), "ERC721: approved query for nonexistent token");
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
    returns (bool) {
        return operatorApprovals[_owner][_operator];
    }

    // FIXME does this support create2 ?
    function isContract(address account) internal view returns (bool) {
        // According to EIP-1052, 0x0 is the value returned for not-yet created accounts
        // and 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470 is returned
        // for accounts without code, i.e. `keccak256('')`
        bytes32 codehash;
        bytes32 accountHash = 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470;
        // solhint-disable-next-line no-inline-assembly
        assembly {codehash := extcodehash(account)}
        return (codehash != accountHash && codehash != 0x0);
    }

    function _checkOnERC721Received(address from, address to, uint256 tokenId, bytes memory _data)
    private returns (bool) {
        if (!isContract(to)) {
            return true;
        }
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returndata) = to.call(abi.encodeWithSelector(
                IERC721Receiver(to).onERC721Received.selector,
                msg.sender,
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

}
