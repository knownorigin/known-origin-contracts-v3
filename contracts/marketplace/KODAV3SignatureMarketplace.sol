// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/GSN/Context.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../core/IKODAV3.sol";

import "hardhat/console.sol";

contract KODAV3SignatureMarketplace is ReentrancyGuard, Context {
    using SafeMath for uint256;

    // Contract name
    string public constant name = "KODAV3SignatureMarketplace";

    // marketplace version
    string public constant version = "3";

    // edition buy now
    event EditionPurchased(uint256 indexed _editionId, uint256 indexed _tokenId, address indexed _buyer, uint256 _price);

    // address -> Edition ID -> nonce
    mapping(address => mapping(uint256 => uint256)) public listingNonces;

    // Permit domain
    bytes32 public DOMAIN_SEPARATOR;

    // keccak256("Permit(address _creator,address _editionId,uint256 _price,address _paymentToken,uint256 _startDate,uint256 nonce)");
    bytes32 public constant PERMIT_TYPEHASH = 0xe5ea8149e9b023b903163e5566c4bfbc4b3ca830f7f5f70157b91046afe0bc87;

    // FIXME get GAS costings for using a counter and draw down method for KO funds?
    // platform funds collector
    address public platformAccount;

    IKODAV3 public koda;
    IKOAccessControlsLookup public accessControls;

    constructor(
        IKOAccessControlsLookup _accessControls,
        IKODAV3 _koda,
        address _platformAccount
    ) {
        koda = _koda;
        platformAccount = _platformAccount;
        accessControls = _accessControls;

        // Grab chain ID
        uint256 chainId;
        assembly {chainId := chainid()}

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                address(this)
            ));
    }

    function isListingValid(
        address _creator,
        uint256 _editionId,
        uint256 _price,
        address _paymentToken,
        uint256 _startDate,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) public view returns (bool) {
        // Create digest to check signatures
        bytes32 digest = getListingDigest(
            _creator,
            _editionId,
            _price,
            _paymentToken,
            _startDate
        );

        return ecrecover(digest, _v, _r, _s) == _creator;
    }

    function buyEditionToken(
        address _creator,
        uint256 _editionId,
        uint256 _price,
        address _paymentToken,
        uint256 _startDate,
        uint256 _nonce,
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
                _v,
                _r,
                _s
            ),
            "Invalid listing"
        );

        require(block.timestamp >= _startDate, "Tokens not available for purchase yet");

        if (_paymentToken == address(0)) {
            require(msg.value >= _price, "List price in ETH not satisfied");
        } else {
            IERC20(_paymentToken).transferFrom(_msgSender(), address(this), _price);
        }

        uint256 tokenId = facilitateNextPrimarySale(_creator, _editionId, _price, _msgSender());

        emit EditionPurchased(_editionId, tokenId, _msgSender(), _price);
    }

    function invalidateListingNonce(uint256 _editionId) public {
        listingNonces[_msgSender()][_editionId] = listingNonces[_msgSender()][_editionId].add(1);
    }

    function getListingDigest(
        address _creator,
        uint256 _editionId,
        uint256 _price,
        address _paymentToken,
        uint256 _startDate
    ) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(PERMIT_TYPEHASH, _creator, _editionId, _price, _paymentToken, _startDate, listingNonces[_creator][_editionId] + 1))
            )
        );
    }

    function facilitateNextPrimarySale(address _from, uint256 _editionId, uint256 _paymentAmount, address _buyer) internal returns (uint256) {
        // get next token to sell along with the royalties recipient and the original creator
        (address receiver, address creator, uint256 tokenId) = koda.facilitateNextPrimarySale(_editionId);

        // split money
        // todo
        //handleEditionSaleFunds(receiver, _paymentAmount);

        // send token to buyer (assumes approval has been made, if not then this will fail)
        koda.safeTransferFrom(_from, _buyer, tokenId);

        // FIXME we could in theory remove this
        //      - and use the current approach of KO where a bidder must pull back any funds once its sold out on primary
        //      - would probs shave a good bit of GAS (profile the options)
        //      - could be replaced with a open method when in that state, monies are returned to bidder (future proof building tools to cover this)

        //todo: sell out logic
        // if we are about to sellout - send any open offers back to the bidder
        //        if (tokenId == koda.maxTokenIdOfEdition(_editionId)) {
        //
        //            // send money back to top bidder if existing offer found
        //            Offer storage offer = editionOffers[_editionId];
        //            if (offer.offer > 0) {
        //                _refundBidder(offer.bidder, offer.offer);
        //            }
        //        }

        return tokenId;
    }

    function getChainId() public view returns (uint256) {
        uint256 chainId;
        assembly {chainId := chainid()}
        return chainId;
    }
}
