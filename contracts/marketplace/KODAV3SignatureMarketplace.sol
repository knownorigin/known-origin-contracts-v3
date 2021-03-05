// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/GSN/Context.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IKODAV3Marketplace } from "./IKODAV3Marketplace.sol";
import { IKOAccessControlsLookup } from "../access/IKOAccessControlsLookup.sol";
import { IKODAV3 } from "../core/IKODAV3.sol";

contract KODAV3SignatureMarketplace is ReentrancyGuard, Context {
    using SafeMath for uint256;

    // edition buy now
    event EditionPurchased(uint256 indexed _editionId, uint256 indexed _tokenId, address indexed _buyer, uint256 _price);

    mapping(address => uint256) public listingNonces;

    // Permit domain
    bytes32 public DOMAIN_SEPARATOR; // todo construct this in constructor

    // keccak256("Permit(address _creator,address _editionId,uint256 _price,address _paymentToken,uint256 _startDate,uint256 nonce,uint256 deadline)");
    bytes32 public constant PERMIT_TYPEHASH = 0xf3382276f6888783a091a3aaa8e9e7f25b042fdb1cf10e366884472180bbdcf6;

    function isListingValid(
        address _creator,
        uint256 _editionId,
        uint256 _price,
        address _paymentToken,
        uint256 _startDate,
        uint256 _deadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) public view returns (bool) {
        if (_deadline < block.timestamp) {
            return false;
        }

        // todo check if real artist?

        // Create digest to check signatures
        bytes32 digest = getListingDigest(
            _creator,
            _editionId,
            _price,
            _paymentToken,
            _startDate,
            _deadline
        );

        return ecrecover(digest, _v, _r, _s) == _creator;
    }

    function buyEditionToken(
        address _creator,
        uint256 _editionId,
        uint256 _price,
        address _paymentToken,
        uint256 _startDate,
        uint256 _deadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) public payable nonReentrant {
        require(
            isListingValid(
                _creator,
                _editionId,
                _price,
                _paymentToken,
                _startDate,
                _deadline,
                _v,
                _r,
                _s
            ),
            "Invalid listing"
        );

        require(block.timestamp >= _startDate, "List not available yet");

        if (_paymentToken == address(0)) {
            require(msg.value >= _price, "List price in ETH not satisfied");
        } else {
            IERC20(_paymentToken).transferFrom(_msgSender(), address(this), _price);
        }

        listingNonces[_creator] = listingNonces[_creator].add(1);

        uint256 tokenId = facilitateNextPrimarySale(_editionId, msg.value, _msgSender());

        emit EditionPurchased(_editionId, tokenId, _msgSender(), msg.value);
    }

    function invalidateListingNonce() public {
        listingNonces[_msgSender()] = listingNonces[_msgSender()].add(1);
    }

    function getListingDigest(
        address _creator,
        uint256 _editionId,
        uint256 _price,
        address _paymentToken,
        uint256 _startDate,
        uint256 _deadline
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(PERMIT_TYPEHASH, _creator, _editionId, _price, _paymentToken, _startDate, listingNonces[_msgSender()] + 1, _deadline))
            )
        );
    }

    function facilitateNextPrimarySale(
        uint256 _editionId,
        uint256 _paymentAmount,
        address _buyer
    ) internal returns (uint256) {
        // todo copy pasta back code from original marketplace
        return 0;
    }
}
