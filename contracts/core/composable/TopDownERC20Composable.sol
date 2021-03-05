// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC721 } from "../IERC721Lean.sol";

// todo: this does not include the ERC223
interface ERC998ERC20TopDown {
    event ReceivedERC20(address indexed _from, uint256 indexed _tokenId, address indexed _erc20Contract, uint256 _value);
    event TransferERC20(uint256 indexed _tokenId, address indexed _to, address indexed _erc20Contract, uint256 _value);

    function balanceOfERC20(uint256 _tokenId, address _erc20Contract) external view returns (uint256);
    function transferERC20(uint256 _tokenId, address _to, address _erc20Contract, uint256 _value) external;
    function getERC20(address _from, uint256 _tokenId, address _erc20Contract, uint256 _value) external;
}

interface ERC998ERC20TopDownEnumerable {
    function totalERC20Contracts(uint256 _tokenId) external view returns (uint256);
    function erc20ContractByIndex(uint256 _tokenId, uint256 _index) external view returns (address);
}

abstract contract TopDownERC20Composable is ERC998ERC20TopDown, ERC998ERC20TopDownEnumerable, ReentrancyGuard {
    using SafeMath for uint256;
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;

    event ContractWhitelisted(address indexed contractAddress);
    event WhitelistRemoved(address indexed contractAddress);
    event MaxERC20sPerNFTUpdated(uint256 old, uint256 newValue);

    uint256 public maxERC20sPerNFT = 3;

    // Token ID -> Linked ERC20 contract addresses
    mapping(uint256 => EnumerableSet.AddressSet) ERC20sEmbeddedInNft;

    // Token ID -> ERC20 contract -> balance of ERC20 owned by token
    mapping(uint256 => mapping(address => uint256)) public ERC20Balances;

    // ERC20 contract -> whether it is allowed to be wrapped within any token
    mapping(address => bool) public whitelistedContracts;

    function balanceOfERC20(uint256 _tokenId, address _erc20Contract) external override view returns (uint256) {
        return ERC20Balances[_tokenId][_erc20Contract];
    }

    function transferERC20(uint256 _tokenId, address _to, address _erc20Contract, uint256 _value) external override nonReentrant {
        _prepareERC20LikeTransfer(_tokenId, _to, _erc20Contract, _value);

        IERC20(_erc20Contract).transfer(_to, _value);

        emit TransferERC20(_tokenId, _to, _erc20Contract, _value);
    }

    // todo; do we need reentrancy guard?
    function getERC20(address _from, uint256 _tokenId, address _erc20Contract, uint256 _value) external override nonReentrant {
        require(_value > 0, "getERC20: Value cannot be zero");

        // todo should support approve or approved for all as those people could transfer the token and do this operation
        require(IERC721(address(this)).ownerOf(_tokenId) == msg.sender, "getERC20: Only token owner");
        require(_from == msg.sender, "getERC20: ERC20 owner must be the token owner");
        require(whitelistedContracts[_erc20Contract], "getERC20: Specified contract not whitelisted");

        bool nftAlreadyContainsERC20 = ERC20sEmbeddedInNft[_tokenId].contains(_erc20Contract);
        require(
            nftAlreadyContainsERC20 || totalERC20Contracts(_tokenId) < maxERC20sPerNFT,
            "getERC20: Token limit for number of unique ERC20s reached"
        );

        if (!nftAlreadyContainsERC20) {
            ERC20sEmbeddedInNft[_tokenId].add(_erc20Contract);
        }

        ERC20Balances[_tokenId][_erc20Contract] = ERC20Balances[_tokenId][_erc20Contract].add(_value);

        IERC20 token = IERC20(_erc20Contract);
        address self = address(this);
        require(token.allowance(_from, self) >= _value, "getERC20: Amount exceeds allowance");

        token.transferFrom(_from, self, _value);

        emit ReceivedERC20(_from, _tokenId, _erc20Contract, _value);
    }

    function totalERC20Contracts(uint256 _tokenId) override public view returns (uint256) {
        return ERC20sEmbeddedInNft[_tokenId].length();
    }

    function erc20ContractByIndex(uint256 _tokenId, uint256 _index) override external view returns (address) {
        return ERC20sEmbeddedInNft[_tokenId].at(_index);
    }

    /// --- Admin ----
    // To be overriden by implementing class

    function whitelistERC20(address _address) virtual public;

    function removeWhitelistForERC20(address _address) virtual public;

    function updateMaxERC20sPerNFT(uint256 _max) virtual public;

    /// --- Internal ----

    function _prepareERC20LikeTransfer(uint256 _tokenId, address _to, address _erc20Contract, uint256 _value) private {
        require(_value > 0, "_prepareERC20LikeTransfer: Value cannot be zero");

        // todo should support approve or approved for all as those people could transfer the token and do this operation
        require(IERC721(address(this)).ownerOf(_tokenId) == msg.sender, "_prepareERC20LikeTransfer: Not owner");
        require(ERC20sEmbeddedInNft[_tokenId].contains(_erc20Contract), "_prepareERC20LikeTransfer: No such ERC20/ERC223 wrapped in token");

        ERC20Balances[_tokenId][_erc20Contract] = ERC20Balances[_tokenId][_erc20Contract].sub(
            _value,
            "_prepareERC20LikeTransfer: Transfer amount exceeds NFT balance"
        );

        if (ERC20Balances[_tokenId][_erc20Contract] == 0) {
            ERC20sEmbeddedInNft[_tokenId].remove(_erc20Contract);
        }
    }

    function _whitelistERC20ERC223(address _erc20ERC223) internal {
        whitelistedContracts[_erc20ERC223] = true;
        emit ContractWhitelisted(_erc20ERC223);
    }

    // note: this will not brick NFTs that have this token. Just stops people adding new balances
    function _removeWhitelistERC20ERC223(address _erc20ERC223) internal {
        whitelistedContracts[_erc20ERC223] = false;
        emit WhitelistRemoved(_erc20ERC223);
    }

    function _updateMaxERC20sPerNFT(uint256 _max) internal {
        emit MaxERC20sPerNFTUpdated(maxERC20sPerNFT, _max);
        maxERC20sPerNFT = _max;
    }
}
