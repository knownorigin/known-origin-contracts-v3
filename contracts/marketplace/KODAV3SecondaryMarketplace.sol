// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";

import {IKODAV3SecondarySaleMarketplace} from "./IKODAV3Marketplace.sol";
import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../core/IKODAV3.sol";

contract KODAV3SecondaryMarketplace is IKODAV3SecondarySaleMarketplace, Pausable, ReentrancyGuard {
    using Address for address;

    event AdminUpdateSecondaryRoyalty(uint256 _secondarySaleRoyalty);
    event AdminUpdateSecondarySaleCommission(uint256 _platformSecondarySaleCommission);
    event AdminUpdateModulo(uint256 _modulo);
    event AdminUpdateMinBidAmount(uint256 _minBidAmount);

    modifier onlyContract() {
        require(accessControls.hasContractRole(_msgSender()), "Caller not contract");
        _;
    }

    modifier onlyAdmin(){
        require(accessControls.hasAdminRole(_msgSender()), "Caller not admin");
        _;
    }

    struct Offer {
        uint256 offer;
        address bidder;
        uint256 lockupUntil;
    }

    // buy now
    struct Listing {
        uint128 price;
        uint128 startDate;
        address seller;
    }

    struct ReserveAuction {
        address seller;
        address bidder;
        uint128 reservePrice;
        uint128 bid;
        uint128 startDate;
        uint128 biddingEnd;
    }

    // Token ID to Offer mapping
    mapping(uint256 => Offer) public tokenOffers;

    // Token ID to Listing
    mapping(uint256 => Listing) public tokenListings;

    // 1 of 1 tokens with reserve auctions
    mapping(uint256 => ReserveAuction) public tokenWithReserveAuctions;

    // KODA token
    IKODAV3 public koda;

    // TODO add admin setter (with event)
    // platform funds collector
    address public platformAccount;

    // Secondary sale commission
    uint256 public secondarySaleRoyalty = 12_50000; // 12.5%

    uint256 public platformSecondarySaleCommission = 2_50000;  // 2.50000%

    // precision 100.00000%
    uint256 public modulo = 100_00000;

    // Minimum bid/list amount
    uint256 public minBidAmount = 0.01 ether;

    // TODO add admin setter (with event)
    // Bid lockup period
    uint256 public bidLockupPeriod = 6 hours;

    uint128 reserveAuctionBidExtensionWindow = 15 minutes;

    uint128 reserveAuctionLengthOnceReserveMet = 24 hours;

    // TODO add admin setter (with event)
    IKOAccessControlsLookup public accessControls;

    constructor(IKOAccessControlsLookup _accessControls, IKODAV3 _koda, address _platformAccount) {
        accessControls = _accessControls;
        koda = _koda;
        platformAccount = _platformAccount;
    }

    function listToken(uint256 _tokenId, uint128 _listingPrice, uint128 _startDate)
    public
    override
    whenNotPaused {
        // Check ownership before listing
        require(koda.ownerOf(_tokenId) == _msgSender(), "Not token owner");

        // No contracts can list to prevent money lockups on transfer
        require(!_msgSender().isContract(), "Cannot list as a contract");

        // Check price over min bid
        require(_listingPrice >= minBidAmount, "Listing price not enough");

        // List the token
        tokenListings[_tokenId] = Listing(_listingPrice, _startDate, _msgSender());

        emit TokenListed(_tokenId, _msgSender(), _listingPrice);
    }

    function delistToken(uint256 _tokenId)
    public
    override
    whenNotPaused {
        // check listing found
        require(tokenListings[_tokenId].seller != address(0), "No listing found");

        // check owner is caller
        require(koda.ownerOf(_tokenId) == _msgSender(), "Not token owner");

        // remove the listing
        delete tokenListings[_tokenId];

        emit TokenDeListed(_tokenId);
    }

    function buyToken(uint256 _tokenId)
    public
    payable
    override
    whenNotPaused
    nonReentrant {
        _buyNow(_tokenId, _msgSender());
    }

    function buyTokenFor(uint256 _tokenId, address _recipient)
    public
    payable
    override
    whenNotPaused
    nonReentrant {
        _buyNow(_tokenId, _recipient);
    }

    function _buyNow(uint256 _tokenId, address _recipient) internal {
        Listing storage listing = tokenListings[_tokenId];

        require(address(0) != listing.seller, "No listing found");
        require(msg.value >= listing.price, "List price not satisfied");
        require(block.timestamp >= listing.startDate, "List not available yet");

        // check current owner is the lister as it may have changed hands
        address currentOwner = koda.ownerOf(_tokenId);
        require(listing.seller == currentOwner, "Listing not valid, token owner has changed");

        // trade the token
        facilitateSecondarySale(_tokenId, msg.value, currentOwner, _recipient);

        // remove the listing
        delete tokenListings[_tokenId];

        emit TokenPurchased(_tokenId, _recipient, currentOwner, msg.value);
    }

    // Secondary sale "offer" flow

    function placeTokenBid(uint256 _tokenId)
    public
    payable
    override
    whenNotPaused
    nonReentrant {
        // Check for highest offer
        Offer storage offer = tokenOffers[_tokenId];
        require(msg.value >= offer.offer + minBidAmount, "Bid not high enough");

        // TODO create testing contract for this
        // No contracts can place a bid to prevent money lockups on refunds
        require(!_msgSender().isContract(), "Cannot make an offer as a contract");

        // send money back to top bidder if existing offer found
        if (offer.offer > 0) {
            _refundSecondaryBidder(offer.bidder, offer.offer);
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
        _refundSecondaryBidder(offer.bidder, offer.offer);

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
        _refundSecondaryBidder(offer.bidder, offer.offer);

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

        facilitateSecondarySale(_tokenId, offer.offer, currentOwner, offer.bidder);

        // clear open offer
        delete tokenOffers[_tokenId];

        emit TokenBidAccepted(_tokenId, currentOwner, offer.bidder, offer.offer);
    }

    // emergency admin "reject" button for stuck bids
    function adminRejectTokenBid(uint256 _tokenId) public onlyAdmin {
        Offer memory offer = tokenOffers[_tokenId];
        require(offer.bidder != address(0), "No open bid");

        // send money back to top bidder
        _refundSecondaryBidder(offer.bidder, offer.offer);

        // delete offer
        delete tokenOffers[_tokenId];

        emit TokenBidRejected(_tokenId, koda.ownerOf(_tokenId), offer.bidder, offer.offer);
    }

    //////////////////////////////
    // Secondary sale "helpers" //
    //////////////////////////////

    function facilitateSecondarySale(uint256 _tokenId, uint256 _paymentAmount, address _seller, address _buyer) internal {
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

    // Token accessors

    function getTokenListing(uint256 _tokenId) public view returns (address _seller, uint128 _listingPrice, uint128 _startDate) {
        Listing storage listing = tokenListings[_tokenId];
        return (
        listing.seller, // original seller
        listing.price, // price
        listing.startDate // date
        );
    }

    function getTokenListingSeller(uint256 _tokenId) public view returns (address _seller) {
        return tokenListings[_tokenId].seller;
    }

    function getTokenListingPrice(uint256 _tokenId) public view returns (uint128 _listingPrice) {
        return tokenListings[_tokenId].price;
    }

    function getTokenListingDate(uint256 _tokenId) public view returns (uint128 _startDate) {
        return tokenListings[_tokenId].startDate;
    }

    function listTokenForReserveAuction(address _creator, uint256 _tokenId, uint128 _reservePrice, uint128 _startDate)
    public
    override
    whenNotPaused
    onlyContract {
        require(tokenWithReserveAuctions[_tokenId].reservePrice == 0, "Auction already in flight");
        require(koda.getSizeOfEdition(_tokenId) == 1, "Only 1 of 1 editions are supported");
        require(_reservePrice >= minBidAmount, "Reserve price must be at least min bid");

        tokenWithReserveAuctions[_tokenId] = ReserveAuction({
        seller: _creator,
        bidder: address(0),
        reservePrice: _reservePrice,
        startDate: _startDate,
        biddingEnd: 0,
        bid: 0
        });

        emit TokenListedForReserveAuction(_tokenId, _reservePrice, _startDate);
    }

    function placeBidOnReserveAuction(uint256 _tokenId)
    public
    override
    payable
    whenNotPaused
    nonReentrant {
        ReserveAuction storage tokenWithReserveAuction = tokenWithReserveAuctions[_tokenId];
        require(tokenWithReserveAuction.reservePrice > 0, "Token not set up for reserve bidding");
        require(block.timestamp >= tokenWithReserveAuction.startDate, "Token not accepting bids yet");
        require(!_msgSender().isContract(), "Cannot bid as a contract");
        require(msg.value >= tokenWithReserveAuction.bid + minBidAmount, "You have not exceeded previous bid by min bid amount");

        // if a bid has been placed, then we will have a bidding end timestamp and we need to ensure no one
        // can bid beyond this
        if (tokenWithReserveAuction.biddingEnd > 0) {
            require(block.timestamp < tokenWithReserveAuction.biddingEnd, "Token is no longer accepting bids");
        }

        // If the reserve has been met, then bidding will end in 24 hours
        // if we are near the end, we have bids, then extend the bidding end
        if (tokenWithReserveAuction.bid + msg.value >= tokenWithReserveAuction.reservePrice && tokenWithReserveAuction.biddingEnd == 0) {
            tokenWithReserveAuction.biddingEnd = uint128(block.timestamp) + reserveAuctionLengthOnceReserveMet;
        } else if (tokenWithReserveAuction.biddingEnd > 0) {
            uint128 secondsUntilBiddingEnd = tokenWithReserveAuction.biddingEnd - uint128(block.timestamp);
            if (secondsUntilBiddingEnd <= reserveAuctionBidExtensionWindow) {
                tokenWithReserveAuction.biddingEnd = tokenWithReserveAuction.biddingEnd + reserveAuctionBidExtensionWindow;
            }
        }

        // if someone else has previously bid, there is a bid we need to refund
        if (tokenWithReserveAuction.bid > 0) {
            _refundSecondaryBidder(tokenWithReserveAuction.bidder, tokenWithReserveAuction.bid);
        }

        tokenWithReserveAuction.bid = uint128(msg.value);
        tokenWithReserveAuction.bidder = _msgSender();

        emit BidPlacedOnReserveAuction(_tokenId, _msgSender(), msg.value);
    }

    function resultReserveAuction(uint256 _tokenId)
    public
    override
    whenNotPaused
    nonReentrant {
        ReserveAuction storage tokenWithReserveAuction = tokenWithReserveAuctions[_tokenId];

        require(tokenWithReserveAuction.reservePrice > 0, "No active auction");
        require(tokenWithReserveAuction.bid > 0, "No bids received");
        require(tokenWithReserveAuction.bid >= tokenWithReserveAuction.reservePrice, "Reserve not met");
        require(block.timestamp > tokenWithReserveAuction.biddingEnd, "Bidding has not yet ended");
        require(
            tokenWithReserveAuction.bidder == _msgSender() || tokenWithReserveAuction.seller == _msgSender(),
            "Only winner or seller can result"
        );

        // send token to winner
        // todo - check if edition ID matches token ID and think about what happens when the seller transfers the token before resulting
        // todo we could allow buyer to withdraw if we know seller
        koda.safeTransferFrom(tokenWithReserveAuction.seller, tokenWithReserveAuction.bidder, _tokenId);

        facilitateSecondarySale(_tokenId, tokenWithReserveAuction.bid, tokenWithReserveAuction.seller, tokenWithReserveAuction.bidder);

        address winner = tokenWithReserveAuction.bidder;
        uint256 winningBid = tokenWithReserveAuction.bid;

        delete tokenWithReserveAuctions[_tokenId];

        emit ReserveAuctionResulted(_tokenId, winningBid, winner, _msgSender());
    }

    // Only permit bid withdrawals if reserve not met
    function withdrawBidFromReserveAuction(uint256 _tokenId)
    public
    override
    whenNotPaused
    nonReentrant {
        ReserveAuction storage tokenWithReserveAuction = tokenWithReserveAuctions[_tokenId];

        require(tokenWithReserveAuction.reservePrice > 0, "No reserve auction in flight");
        require(tokenWithReserveAuction.bid < tokenWithReserveAuction.reservePrice, "Bids can only be withdrawn if reserve not met");
        require(tokenWithReserveAuction.bidder == _msgSender(), "Only the bidder can withdraw their bid");

        _refundSecondaryBidder(tokenWithReserveAuction.bidder, tokenWithReserveAuction.bid);

        tokenWithReserveAuction.bidder = address(0);
        tokenWithReserveAuction.bid = 0;

        emit BidWithdrawnFromReserveAuction(_tokenId, tokenWithReserveAuction.bidder, tokenWithReserveAuction.bid);
    }

    function convertReserveAuctionToBuyItNow(uint256 _editionId, uint128 _listingPrice, uint128 _startDate)
    public
    override
    whenNotPaused
    nonReentrant {
        ReserveAuction storage tokenWithReserveAuction = tokenWithReserveAuctions[_editionId];

        require(tokenWithReserveAuction.reservePrice > 0, "No active auction");
        require(tokenWithReserveAuction.bid < tokenWithReserveAuction.reservePrice, "Can only convert before reserve met");
        require(tokenWithReserveAuction.seller == _msgSender(), "Not the seller");

        // refund any bids
        if (tokenWithReserveAuction.bid > 0) {
            _refundSecondaryBidder(tokenWithReserveAuction.bidder, tokenWithReserveAuction.bid);
        }

        delete tokenWithReserveAuctions[_editionId];

        // Check price over min bid
        require(_listingPrice >= minBidAmount, "Listing price not enough");

        tokenListings[_editionId] = Listing(_listingPrice, _startDate, _msgSender());

        emit ReserveAuctionConvertedToBuyItNow(_editionId, _listingPrice, _startDate);
    }

    // can only do this if the reserve has not been met
    function updateReservePriceForReserveAuction(uint256 _tokenId, uint128 _reservePrice)
    public
    override
    whenNotPaused
    nonReentrant {
        ReserveAuction storage tokenWithReserveAuction = tokenWithReserveAuctions[_tokenId];

        require(tokenWithReserveAuction.reservePrice > 0, "No reserve auction in flight");
        require(tokenWithReserveAuction.seller == _msgSender(), "Not the seller");
        require(tokenWithReserveAuction.bid < tokenWithReserveAuction.reservePrice, "Reserve price reached");
        require(_reservePrice >= minBidAmount, "Reserve must be at least min bid");

        tokenWithReserveAuction.reservePrice = _reservePrice;

        emit ReservePriceUpdated(_tokenId, _reservePrice);
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

    function updateModulo(uint256 _modulo) public onlyAdmin {
        modulo = _modulo;
        emit AdminUpdateModulo(_modulo);
    }

    function updateMinBidAmount(uint256 _minBidAmount) public onlyAdmin {
        minBidAmount = _minBidAmount;
        emit AdminUpdateMinBidAmount(_minBidAmount);
    }

    function pause() public onlyAdmin {
        super._pause();
    }

    function unpause() public onlyAdmin {
        super._unpause();
    }

    // internal

    function getLockupTime() internal view returns (uint256 lockupUntil) {
        lockupUntil = block.timestamp + bidLockupPeriod;
    }

    function _refundSecondaryBidder(address _receiver, uint256 _paymentAmount) internal {
        (bool success,) = _receiver.call{value : _paymentAmount}("");
        require(success, "Token offer refund failed");
    }
}
