// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import {IKODAV3SecondarySaleMarketplace} from "./IKODAV3Marketplace.sol";
import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../core/IKODAV3.sol";
import {BuyNowMarketplace} from "./BuyNowMarketplace.sol";
import {ReserveAuctionMarketplace} from "./ReserveAuctionMarketplace.sol";
import {BaseMarketplace} from "./BaseMarketplace.sol";

contract KODAV3SecondaryMarketplace is
    IKODAV3SecondarySaleMarketplace,
    BaseMarketplace,
    BuyNowMarketplace,
    ReserveAuctionMarketplace {
    event AdminUpdateSecondaryRoyalty(uint256 _secondarySaleRoyalty);
    event AdminUpdateSecondarySaleCommission(uint256 _platformSecondarySaleCommission);

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
    BaseMarketplace(_accessControls, _koda, _platformAccount) {}

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
        require(!isTokenListed(_tokenId), "Token is listed");

        // Check for highest offer
        Offer storage offer = tokenOffers[_tokenId];
        require(msg.value >= offer.offer + minBidAmount, "Bid not high enough");

        // send money back to top bidder if existing offer found
        if (offer.offer > 0) {
            _refundBidder(offer.bidder, offer.offer);
        }

        // setup offer
        tokenOffers[_tokenId] = Offer(msg.value, _msgSender(), getLockupTime());

        emit TokenBidPlaced(_tokenId, koda.ownerOf(_tokenId), _msgSender(), msg.value);
    }

    function withdrawTokenBid(uint256 _tokenId)
    public
    override
    whenNotPaused
    nonReentrant {
        Offer storage offer = tokenOffers[_tokenId];
        require(offer.bidder != address(0), "No open bid");

        // caller must be bidder
        require(offer.bidder == _msgSender(), "Not bidder");

        // cannot withdraw before lockup period elapses
        require(block.timestamp >= (offer.lockupUntil), "Bid lockup not elapsed");

        // send money back to top bidder
        _refundBidder(offer.bidder, offer.offer);

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
        _refundBidder(offer.bidder, offer.offer);

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
        require(offer.offer == _offerPrice, "Offer price has changed");

        address currentOwner = koda.ownerOf(_tokenId);
        require(currentOwner == _msgSender(), "Not current owner");

        _facilitateSecondarySale(_tokenId, offer.offer, currentOwner, offer.bidder);

        // clear open offer
        delete tokenOffers[_tokenId];

        emit TokenBidAccepted(_tokenId, currentOwner, offer.bidder, offer.offer);
    }

    // emergency admin "reject" button for stuck bids
    function adminRejectTokenBid(uint256 _tokenId) public onlyAdmin {
        Offer memory offer = tokenOffers[_tokenId];
        require(offer.bidder != address(0), "No open bid");

        // send money back to top bidder
        _refundBidder(offer.bidder, offer.offer);

        // delete offer
        delete tokenOffers[_tokenId];

        emit TokenBidRejected(_tokenId, koda.ownerOf(_tokenId), offer.bidder, offer.offer);
    }

    //////////////////////////////
    // Secondary sale "helpers" //
    //////////////////////////////

    function _processSale(uint256 _id, uint256 _paymentAmount, address _buyer, address _seller, bool) internal override returns (uint256) {
        _facilitateSecondarySale(_id, _paymentAmount, _seller, _buyer);
        return _id;
    }

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
    returns (uint256 creatorRoyalties){
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

    function convertReserveAuctionToBuyItNow(uint256 _editionId, uint128 _listingPrice, uint128 _startDate)
    public
    //override
    whenNotPaused
    nonReentrant {
        ReserveAuction storage tokenWithReserveAuction = editionOrTokenWithReserveAuctions[_editionId];

        require(tokenWithReserveAuction.reservePrice > 0, "No active auction");
        require(tokenWithReserveAuction.bid < tokenWithReserveAuction.reservePrice, "Can only convert before reserve met");
        require(tokenWithReserveAuction.seller == _msgSender(), "Not the seller");

        // refund any bids
        if (tokenWithReserveAuction.bid > 0) {
            _refundBidder(tokenWithReserveAuction.bidder, tokenWithReserveAuction.bid);
        }

        delete editionOrTokenWithReserveAuctions[_editionId];

        // Check price over min bid
        require(_listingPrice >= minBidAmount, "Listing price not enough");

        editionOrTokenListings[_editionId] = Listing(_listingPrice, _startDate, _msgSender());

        emit ReserveAuctionConvertedToBuyItNow(_editionId, _listingPrice, _startDate);
    }

    function emergencyExitBidFromReserveAuction(uint256 _editionId)
    public
    override
    whenNotPaused
    nonReentrant {
        bool isApprovalActiveForMarketplace = koda.isApprovedForAll(
            editionOrTokenWithReserveAuctions[_editionId].seller,
            address(this)
        );

        require(
            !isApprovalActiveForMarketplace,
            "Bid cannot be withdrawn as reserve auction listing is valid"
        );

        _emergencyExitBidFromReserveAuction(_editionId);
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

    // as offers are always possible, we wont count it as a listing
    function isTokenListed(uint256 _tokenId) internal view returns (bool) {
        if (editionOrTokenListings[_tokenId].seller != address(0)) {
            return true;
        }

        if (editionOrTokenWithReserveAuctions[_tokenId].seller != address(0)) {
            return true;
        }

        return false;
    }

    function getLockupTime() internal view returns (uint256 lockupUntil) {
        lockupUntil = block.timestamp + bidLockupPeriod;
    }
}
