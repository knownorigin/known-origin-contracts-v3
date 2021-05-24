// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import {IKODAV3SecondarySaleMarketplace} from "./IKODAV3Marketplace.sol";
import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../core/IKODAV3.sol";
import {BuyNowMarketplace} from "./BuyNowMarketplace.sol";
import {ReserveAuctionMarketplace} from "./ReserveAuctionMarketplace.sol";
import {BaseMarketplace} from "./BaseMarketplace.sol";

/// @title KnownOrigin Secondary Marketplace for all V3 tokens
/// @notice The following listing types are supported: Buy now, Reserve and Offers
/// @dev The contract is pausable and has reentrancy guards
/// @author KnownOrigin Labs
contract KODAV3SecondaryMarketplace is
    IKODAV3SecondarySaleMarketplace,
    BaseMarketplace,
    BuyNowMarketplace,
    ReserveAuctionMarketplace {

    event SecondaryMarketplaceDeployed();
    event AdminUpdateSecondaryRoyalty(uint256 _secondarySaleRoyalty);
    event AdminUpdateSecondarySaleCommission(uint256 _platformSecondarySaleCommission);
    event ConvertFromBuyNowToOffers(uint256 indexed _tokenId, uint128 _startDate);
    event ReserveAuctionConvertedToOffers(uint256 indexed _tokenId);

    // FIXME use bid terminology
    struct Offer {
        uint256 offer;
        address bidder;
        uint256 lockupUntil;
    }

    // Token ID to Offer mapping
    mapping(uint256 => Offer) public tokenOffers;

    // Secondary sale commission
    uint256 public secondarySaleRoyalty = 12_50000; // 12.5%

    uint256 public platformSecondarySaleCommission = 2_50000;  // 2.50000%

    constructor(IKOAccessControlsLookup _accessControls, IKODAV3 _koda, address _platformAccount)
    BaseMarketplace(_accessControls, _koda, _platformAccount) {
        emit SecondaryMarketplaceDeployed();
    }

    function listTokenForBuyNow(uint256 _tokenId, uint128 _listingPrice, uint128 _startDate)
    public
    override
    whenNotPaused {
        listForBuyNow(_msgSender(), _tokenId, _listingPrice, _startDate);
    }

    function delistToken(uint256 _tokenId)
    public
    override
    whenNotPaused {
        // check listing found
        require(editionOrTokenListings[_tokenId].seller != address(0), "No listing found");

        // check owner is caller
        require(koda.ownerOf(_tokenId) == _msgSender(), "Not token owner");

        // remove the listing
        delete editionOrTokenListings[_tokenId];

        emit TokenDeListed(_tokenId);
    }

    // Secondary sale "offer" flow

    function placeTokenBid(uint256 _tokenId)
    public
    payable
    override
    whenNotPaused
    nonReentrant {
        require(!_isTokenListed(_tokenId), "Token is listed"); // FIXME should be be Token is not listed?

        // Check for highest offer
        Offer storage offer = tokenOffers[_tokenId];
        require(msg.value >= offer.offer + minBidAmount, "Bid not high enough");

        // send money back to top bidder if existing offer found
        if (offer.offer > 0) {
            _refundBidder(_tokenId, offer.bidder, offer.offer);
        }

        // setup offer
        tokenOffers[_tokenId] = Offer(msg.value, _msgSender(), _getLockupTime());

        emit TokenBidPlaced(_tokenId, koda.ownerOf(_tokenId), _msgSender(), msg.value);
    }

    function withdrawTokenBid(uint256 _tokenId)
    public
    override
    whenNotPaused
    nonReentrant {
        Offer storage offer = tokenOffers[_tokenId];

        // caller must be bidder
        require(offer.bidder == _msgSender(), "Not bidder");

        // cannot withdraw before lockup period elapses
        require(block.timestamp >= offer.lockupUntil, "Bid lockup not elapsed");

        // send money back to top bidder
        _refundBidder(_tokenId, offer.bidder, offer.offer);

        // delete offer
        delete tokenOffers[_tokenId];

        emit TokenBidWithdrawn(_tokenId, _msgSender());
    }

    function rejectTokenBid(uint256 _tokenId)
    public
    override
    whenNotPaused
    nonReentrant {
        Offer memory offer = tokenOffers[_tokenId];
        require(offer.bidder != address(0), "No open bid");

        address currentOwner = koda.ownerOf(_tokenId);
        require(currentOwner == _msgSender(), "Not current owner");

        // send money back to top bidder
        _refundBidder(_tokenId, offer.bidder, offer.offer);

        // delete offer
        delete tokenOffers[_tokenId];

        emit TokenBidRejected(_tokenId, currentOwner, offer.bidder, offer.offer);
    }

    function acceptTokenBid(uint256 _tokenId, uint256 _offerPrice)
    public
    override
    whenNotPaused
    nonReentrant {
        Offer memory offer = tokenOffers[_tokenId];
        require(offer.bidder != address(0), "No open bid");
        require(offer.offer >= _offerPrice, "Offer price has changed");

        address currentOwner = koda.ownerOf(_tokenId);
        require(currentOwner == _msgSender(), "Not current owner");

        _facilitateSecondarySale(_tokenId, offer.offer, currentOwner, offer.bidder);

        // clear open offer
        delete tokenOffers[_tokenId];

        emit TokenBidAccepted(_tokenId, currentOwner, offer.bidder, offer.offer);
    }

    // emergency admin "reject" button for stuck bids
    function adminRejectTokenBid(uint256 _tokenId)
    public
    nonReentrant
    onlyAdmin {
        Offer memory offer = tokenOffers[_tokenId];
        require(offer.bidder != address(0), "No open bid");

        // send money back to top bidder
        _refundBidderIgnoreError(_tokenId, offer.bidder, offer.offer);

        // delete offer
        delete tokenOffers[_tokenId];

        emit TokenBidRejected(_tokenId, koda.ownerOf(_tokenId), offer.bidder, offer.offer);
    }

    // FIXME should these be in ReserveAuctionMarketplace?
    function convertReserveAuctionToBuyItNow(uint256 _tokenId, uint128 _listingPrice, uint128 _startDate)
    public
    override
    whenNotPaused
    nonReentrant {
        require(_listingPrice >= minBidAmount, "Listing price not enough");
        _removeReserveAuctionListing(_tokenId);

        editionOrTokenListings[_tokenId] = Listing(_listingPrice, _startDate, _msgSender());

        emit ReserveAuctionConvertedToBuyItNow(_tokenId, _listingPrice, _startDate);
    }

    // FIXME should these be in ReserveAuctionMarketplace?
    function convertReserveAuctionToOffers(uint256 _tokenId)
    public
    override
    whenNotPaused
    nonReentrant {
        _removeReserveAuctionListing(_tokenId);
        emit ReserveAuctionConvertedToOffers(_tokenId);
    }

    //////////////////////////////
    // Secondary sale "helpers" //
    //////////////////////////////

    function _facilitateSecondarySale(uint256 _tokenId, uint256 _paymentAmount, address _seller, address _buyer) internal {
        (address royaltyRecipient,) = koda.royaltyInfo(_tokenId);

        // split money
        uint256 creatorRoyalties = handleSecondarySaleFunds(_seller, royaltyRecipient, _paymentAmount);

        // N:B. open offers are left for the bidder to withdraw or the new token owner to reject/accept

        // send token to buyer
        koda.safeTransferFrom(_seller, _buyer, _tokenId);

        // fire royalties callback event
        koda.receivedRoyalties(royaltyRecipient, _buyer, _tokenId, address(0), creatorRoyalties);
    }

    function handleSecondarySaleFunds(address _seller, address _royaltyRecipient, uint256 _paymentAmount)
    internal
    returns (uint256 creatorRoyalties) {
        // pay royalties
        creatorRoyalties = (_paymentAmount / modulo) * secondarySaleRoyalty;
        (bool creatorSuccess,) = _royaltyRecipient.call{value : creatorRoyalties}("");
        require(creatorSuccess, "Token payment failed");

        // pay platform fee
        uint256 koCommission = (_paymentAmount / modulo) * platformSecondarySaleCommission;
        (bool koCommissionSuccess,) = platformAccount.call{value : koCommission}("");
        require(koCommissionSuccess, "Token commission payment failed");

        // pay seller
        (bool success,) = _seller.call{value : _paymentAmount - creatorRoyalties - koCommission}("");
        require(success, "Token payment failed");
    }

    // Admin Methods

    function updatePlatformSecondarySaleCommission(uint256 _platformSecondarySaleCommission) public onlyAdmin {
        platformSecondarySaleCommission = _platformSecondarySaleCommission;
        emit AdminUpdateSecondarySaleCommission(_platformSecondarySaleCommission);
    }

    function updateSecondaryRoyalty(uint256 _secondarySaleRoyalty) public onlyAdmin {
        secondarySaleRoyalty = _secondarySaleRoyalty;
        emit AdminUpdateSecondaryRoyalty(_secondarySaleRoyalty);
    }

    // internal

    function _isListingPermitted(uint256 _tokenId) internal override returns (bool) {
        return !_isTokenListed(_tokenId);
    }

    function _isReserveListingPermitted(uint256 _tokenId) internal override returns (bool) {
        return koda.ownerOf(_tokenId) == _msgSender();
    }

    function _hasReserveListingBeenInvalidated(uint256 _id) internal override returns (bool) {
        bool isApprovalActiveForMarketplace = koda.isApprovedForAll(
            editionOrTokenWithReserveAuctions[_id].seller,
            address(this)
        );

        return !isApprovalActiveForMarketplace || koda.ownerOf(_id) != editionOrTokenWithReserveAuctions[_id].seller;
    }

    function _isBuyNowListingPermitted(uint256 _tokenId) internal override returns (bool) {
        return koda.ownerOf(_tokenId) == _msgSender();
    }

    function _processSale(
        uint256 _tokenId,
        uint256 _paymentAmount,
        address _buyer,
        address _seller
    ) internal override returns (uint256) {
        _facilitateSecondarySale(_tokenId, _paymentAmount, _seller, _buyer);
        return _tokenId;
    }

    // as offers are always possible, we will not count it as a listing
    function _isTokenListed(uint256 _tokenId) internal view returns (bool) {
        if (editionOrTokenListings[_tokenId].seller != address(0)) {
            return true;
        }

        if (editionOrTokenWithReserveAuctions[_tokenId].seller != address(0)) {
            return true;
        }

        return false;
    }
}
