// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {EnumerableSet} from "./EnumerableSet.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {Context} from "@openzeppelin/contracts/GSN/Context.sol";
import {IKODAV3} from "../IKODAV3.sol";

interface ERC998ERC20TopDown {
    event ReceivedERC20(address indexed _from, uint256 indexed _tokenId, address indexed _erc20Contract, uint256 _value);
    event ReceivedERC20ForEdition(address indexed _from, uint256 indexed _editionId, address indexed _erc20Contract, uint256 _value);
    event TransferERC20(uint256 indexed _tokenId, address indexed _to, address indexed _erc20Contract, uint256 _value);

    function balanceOfERC20(uint256 _tokenId, address _erc20Contract) external view returns (uint256);
    function transferERC20(uint256 _tokenId, address _to, address _erc20Contract, uint256 _value) external;
    function getERC20(address _from, uint256 _tokenId, address _erc20Contract, uint256 _value) external;
}

interface ERC998ERC20TopDownEnumerable {
    function totalERC20Contracts(uint256 _tokenId) external view returns (uint256);
    function erc20ContractByIndex(uint256 _tokenId, uint256 _index) external view returns (address);
}

abstract contract TopDownERC20Composable is ERC998ERC20TopDown, ERC998ERC20TopDownEnumerable, ReentrancyGuard, Context {
    using SafeMath for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    event ContractWhitelisted(address indexed contractAddress);
    event WhitelistRemoved(address indexed contractAddress);
    event MaxERC20sPerNFTUpdated(uint256 old, uint256 newValue);

    uint256 public maxERC20sPerNFT = 3;

    // Edition ID -> ERC20 contract -> Balance of ERC20 for every token in Edition
    mapping(uint256 => mapping(address => uint256)) public editionTokenERC20Balances;

    // Edition ID -> ERC20 contract -> Token ID -> Balance Transferred out of token
    mapping(uint256 => mapping(address => mapping(uint256 => uint256))) public editionTokenERC20TransferAmounts;

    // Edition ID -> Linked ERC20 contract addresses
    mapping(uint256 => EnumerableSet.AddressSet) ERC20sEmbeddedInEdition;

    // Token ID -> Linked ERC20 contract addresses
    mapping(uint256 => EnumerableSet.AddressSet) ERC20sEmbeddedInNft;

    // Token ID -> ERC20 contract -> balance of ERC20 owned by token
    mapping(uint256 => mapping(address => uint256)) public ERC20Balances;

    // ERC20 contract -> whether it is allowed to be wrapped within any token
    mapping(address => bool) public whitelistedContracts;

    function balanceOfERC20(uint256 _tokenId, address _erc20Contract) public override view returns (uint256) {
        IKODAV3 koda = IKODAV3(address(this));
        uint256 editionId = koda.getEditionIdOfToken(_tokenId);

        uint256 editionBalance = editionTokenERC20Balances[editionId][_erc20Contract];
        uint256 tokenBalance = editionBalance.div(koda.getSizeOfEdition(editionId)); // todo I assume single mints will return a size of 1
        uint256 spentTokens = editionTokenERC20TransferAmounts[editionId][_erc20Contract][_tokenId];
        editionBalance = tokenBalance.sub(spentTokens);

        return editionBalance.add(ERC20Balances[_tokenId][_erc20Contract]);
    }

    function transferERC20(uint256 _tokenId, address _to, address _erc20Contract, uint256 _value) external override nonReentrant {
        _prepareERC20LikeTransfer(_tokenId, _to, _erc20Contract, _value);

        IERC20(_erc20Contract).transfer(_to, _value);

        emit TransferERC20(_tokenId, _to, _erc20Contract, _value);
    }

    function getERC20(address _from, uint256 _tokenId, address _erc20Contract, uint256 _value) external override nonReentrant {
        require(_value > 0, "getERC20: Value cannot be zero");

        address spender = _msgSender();
        IERC721 self = IERC721(address(this));

        address owner = self.ownerOf(_tokenId);
        require(
            owner == spender
            || self.isApprovedForAll(owner, spender)
            || self.getApproved(_tokenId) == spender,
            "getERC20: Only token owner"
        );
        require(_from == _msgSender(), "getERC20: ERC20 owner must be the token owner");
        require(whitelistedContracts[_erc20Contract], "getERC20: Specified contract not whitelisted");

        IKODAV3 koda = IKODAV3(address(this));
        uint256 editionId = koda.getEditionIdOfToken(_tokenId);
        bool editionAlreadyContainsERC20 = ERC20sEmbeddedInEdition[editionId].contains(_erc20Contract);
        bool nftAlreadyContainsERC20 = ERC20sEmbeddedInNft[_tokenId].contains(_erc20Contract);
        require(
            nftAlreadyContainsERC20 || editionAlreadyContainsERC20 || totalERC20Contracts(_tokenId) < maxERC20sPerNFT,
            "getERC20: Token limit for number of unique ERC20s reached"
        );

        if (!editionAlreadyContainsERC20 && !nftAlreadyContainsERC20) {
            ERC20sEmbeddedInNft[_tokenId].add(_erc20Contract);
        }

        ERC20Balances[_tokenId][_erc20Contract] = ERC20Balances[_tokenId][_erc20Contract].add(_value);

        IERC20 token = IERC20(_erc20Contract);
        require(token.allowance(_from, address(this)) >= _value, "getERC20: Amount exceeds allowance");

        token.transferFrom(_from, address(this), _value);

        emit ReceivedERC20(_from, _tokenId, _erc20Contract, _value);
    }

    function _addERC20ToEdition(address _from, uint256 _editionId, address _erc20Contract, uint256 _value) internal nonReentrant {
        require(_value > 0, "addERC20ToEdition: Value cannot be zero");

        IKODAV3 koda = IKODAV3(address(this));
        require(koda.getCreatorOfEdition(_editionId) == _msgSender(), "addERC20ToEdition: Only creator of edition");
        require(_from == _msgSender(), "addERC20ToEdition: _from must be creator of edition");
        require(whitelistedContracts[_erc20Contract], "addERC20ToEdition: Specified contract not whitelisted");

        bool editionAlreadyContainsERC20 = ERC20sEmbeddedInEdition[_editionId].contains(_erc20Contract);
        require(!editionAlreadyContainsERC20, "addERC20ToEdition: Edition already contains ERC20");
        require(ERC20sEmbeddedInEdition[_editionId].length() < maxERC20sPerNFT, "addERC20ToEdition: ERC20 limit exceeded");

        ERC20sEmbeddedInEdition[_editionId].add(_erc20Contract);
        editionTokenERC20Balances[_editionId][_erc20Contract] = editionTokenERC20Balances[_editionId][_erc20Contract].add(_value);

        IERC20 token = IERC20(_erc20Contract);
        require(token.allowance(_from, address(this)) >= _value, "addERC20ToEdition: Amount exceeds allowance");

        token.transferFrom(_from, address(this), _value);

        emit ReceivedERC20ForEdition(_from, _editionId, _erc20Contract, _value);
    }

    function totalERC20Contracts(uint256 _tokenId) override public view returns (uint256) {
        IKODAV3 koda = IKODAV3(address(this));
        uint256 editionId = koda.getEditionIdOfToken(_tokenId);
        return ERC20sEmbeddedInNft[_tokenId].length().add(ERC20sEmbeddedInEdition[editionId].length());
    }

    function erc20ContractByIndex(uint256 _tokenId, uint256 _index) override external view returns (address) {
        if (_index >= ERC20sEmbeddedInNft[_tokenId].length()) {
            IKODAV3 koda = IKODAV3(address(this));
            uint256 editionId = koda.getEditionIdOfToken(_tokenId);
            return ERC20sEmbeddedInEdition[editionId].at(_index);
        }

        return ERC20sEmbeddedInNft[_tokenId].at(_index);
    }

    /// --- Admin ----
    // To be overriden by implementing class

    function whitelistERC20(address _address) virtual public;

    function removeWhitelistForERC20(address _address) virtual public;

    function updateMaxERC20sPerNFT(uint256 _max) virtual public;

    /// --- Internal ----

    function _prepareERC20LikeTransfer(uint256 _tokenId, address _to, address _erc20Contract, uint256 _value) private {
        {
            require(_value > 0, "_prepareERC20LikeTransfer: Value cannot be zero");
            require(_to != address(0), "_prepareERC20LikeTransfer: To cannot be zero address");

            IERC721 self = IERC721(address(this));

            address owner = self.ownerOf(_tokenId);
            require(
                owner == _msgSender()
                || self.isApprovedForAll(owner, _msgSender())
                || self.getApproved(_tokenId) == _msgSender(),
                "_prepareERC20LikeTransfer: Not owner"
            );
        }

        bool nftContainsERC20 = ERC20sEmbeddedInNft[_tokenId].contains(_erc20Contract);

        IKODAV3 koda = IKODAV3(address(this));
        uint256 editionId = koda.getEditionIdOfToken(_tokenId);
        bool editionContainsERC20 = ERC20sEmbeddedInEdition[editionId].contains(_erc20Contract);
        require(nftContainsERC20 || editionContainsERC20, "_prepareERC20LikeTransfer: No such ERC20 wrapped in token");

        require(balanceOfERC20(_tokenId, _erc20Contract) >= _value, "_prepareERC20LikeTransfer: Transfer amount exceeds balance");

        uint256 editionBalance = editionTokenERC20Balances[editionId][_erc20Contract].div(koda.getSizeOfEdition(editionId));
        uint256 spentTokens = editionTokenERC20TransferAmounts[editionId][_erc20Contract][_tokenId];
        editionBalance = editionBalance.sub(spentTokens);

        if (editionBalance >= _value) {
            editionTokenERC20TransferAmounts[editionId][_erc20Contract][_tokenId] = spentTokens.add(_value);
        } else if (ERC20Balances[_tokenId][_erc20Contract] >= _value) {
            ERC20Balances[_tokenId][_erc20Contract] = ERC20Balances[_tokenId][_erc20Contract].sub(_value);
        } else {
            // take from both balances
            if (editionBalance > 0) {
                editionTokenERC20TransferAmounts[editionId][_erc20Contract][_tokenId] = spentTokens.add(editionBalance);
            }

            uint256 amountOfTokensToSpendFromTokenBalance = _value.sub(editionBalance);
            ERC20Balances[_tokenId][_erc20Contract] = ERC20Balances[_tokenId][_erc20Contract].sub(amountOfTokensToSpendFromTokenBalance);
        }

        // todo - is it possible to do something like this for an edition? potentially not as all tokens would have to spend their ERC20
        if (nftContainsERC20 && ERC20Balances[_tokenId][_erc20Contract] == 0) {
            ERC20sEmbeddedInNft[_tokenId].remove(_erc20Contract);
        }
    }

    function _whitelistERC20(address _erc20) internal {
        whitelistedContracts[_erc20] = true;
        emit ContractWhitelisted(_erc20);
    }

    // note: this will not brick NFTs that have this token. Just stops people adding new balances
    function _removeWhitelistERC20(address _erc20) internal {
        whitelistedContracts[_erc20] = false;
        emit WhitelistRemoved(_erc20);
    }

    function _updateMaxERC20sPerNFT(uint256 _max) internal {
        emit MaxERC20sPerNFTUpdated(maxERC20sPerNFT, _max);
        maxERC20sPerNFT = _max;
    }
}
