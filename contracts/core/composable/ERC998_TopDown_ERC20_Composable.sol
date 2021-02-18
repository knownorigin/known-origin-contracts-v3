// SPDX-License-Identifier: MIT

pragma solidity 0.7.4;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

interface ERC998ERC20TopDown {
    event ReceivedERC20(address indexed _from, uint256 indexed _tokenId, address indexed _erc20Contract, uint256 _value);
    event TransferERC20(uint256 indexed _tokenId, address indexed _to, address indexed _erc20Contract, uint256 _value);

    function tokenFallback(address _from, uint256 _value, bytes calldata _data) external;
    function balanceOfERC20(uint256 _tokenId, address _erc20Contract) external view returns (uint256);
    function transferERC20(uint256 _tokenId, address _to, address _erc20Contract, uint256 _value) external;
    function transferERC223(uint256 _tokenId, address _to, address _erc223Contract, uint256 _value, bytes calldata _data) external;
    function getERC20(address _from, uint256 _tokenId, address _erc20Contract, uint256 _value) external;
}

interface ERC998ERC20TopDownEnumerable {
    function totalERC20Contracts(uint256 _tokenId) external view returns (uint256);
    function erc20ContractByIndex(uint256 _tokenId, uint256 _index) external view returns (address);
}

abstract contract TopDownERC20Composable is ERC998ERC20TopDown, ERC998ERC20TopDownEnumerable {
    using SafeMath for uint256;
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;

    event ChildContractWhitelisted(address indexed contractAddress);

    // todo admin update method
    uint256 public maxERC20sPerNFT = 3;

    // token ID -> set of erc20
    mapping(uint256 => EnumerableSet.AddressSet) ERC20sEmbeddedInNft;
    mapping(uint256 => mapping(address => uint256)) public ERC20Balances;

    mapping(address => bool) public whitelistedContracts;

    function tokenFallback(address _from, uint256 _value, bytes calldata _data) external override {

    }

    function balanceOfERC20(uint256 _tokenId, address _erc20Contract) external override view returns (uint256) {
        return ERC20Balances[_tokenId][_erc20Contract];
    }

    function transferERC20(uint256 _tokenId, address _to, address _erc20Contract, uint256 _value) external override {

    }

    function transferERC223(uint256 _tokenId, address _to, address _erc223Contract, uint256 _value, bytes calldata _data) external override {

    }

    function getERC20(address _from, uint256 _tokenId, address _erc20Contract, uint256 _value) external override {
        require(_value > 0, "");

        // todo should support approve or approved for all as those people could transfer the token and do this operation
        require(IERC721(address(this)).ownerOf(_tokenId) == msg.sender, "");
        require(_from == msg.sender, "");
        require(whitelistedContracts[_erc20Contract], "");

        bool nftAlreadyContainsERC20 = ERC20sEmbeddedInNft[_tokenId].contains(_erc20Contract);
        require(
            nftAlreadyContainsERC20 || totalERC20Contracts(_tokenId) < maxERC20sPerNFT,
            ""
        );

        require(IERC20(_erc20Contract).allowance(_from, address(this)) >= _value, "");

        if (!nftAlreadyContainsERC20) {
            ERC20sEmbeddedInNft[_tokenId].add(_erc20Contract);
        }

        ERC20Balances[_tokenId][_erc20Contract] = ERC20Balances[_tokenId][_erc20Contract].add(_value);

        emit ReceivedERC20(_from, _tokenId, _erc20Contract, _value);
    }

    function totalERC20Contracts(uint256 _tokenId) override public view returns (uint256) {
        return ERC20sEmbeddedInNft[_tokenId].length();
    }

    function erc20ContractByIndex(uint256 _tokenId, uint256 _index) override external view returns (address) {
        return ERC20sEmbeddedInNft[_tokenId].at(_index);
    }

    /// --- Internal ----

    function _whitelistChildContract(address _newChildContractAddress) internal {
        whitelistedContracts[_newChildContractAddress] = true;
        emit ChildContractWhitelisted(_newChildContractAddress);
    }
}
