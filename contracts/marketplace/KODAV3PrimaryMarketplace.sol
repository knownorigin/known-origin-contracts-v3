// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";

import {IKODAV3PrimarySaleMarketplace} from "./IKODAV3Marketplace.sol";
import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../core/IKODAV3.sol";

contract KODAV3PrimaryMarketplace is IKODAV3PrimarySaleMarketplace, Pausable, ReentrancyGuard {
    using Address for address;

    event AdminUpdatePlatformPrimarySaleCommission(uint256 _platformPrimarySaleCommission);
    event AdminUpdateModulo(uint256 _modulo);
    event AdminUpdateMinBidAmount(uint256 _minBidAmount);
    event AdminUpdateReserveAuctionBidExtensionWindow(uint128 _reserveAuctionBidExtensionWindow);
    event AdminUpdateReserveAuctionLengthOnceReserveMet(uint128 _reserveAuctionLengthOnceReserveMet);

    modifier onlyContract(){
        require(accessControls.hasContractRole(_msgSender()), "Caller not contract");
        _;
    }

    modifier onlyContractOrCreator(uint256 _editionId){
        require(
            accessControls.hasContractRole(_msgSender()) || koda.getCreatorOfEdition(_editionId) == _msgSender(),
            "Caller not creator or contract"
        );
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

    struct Stepped {
        uint128 basePrice;
        uint128 stepPrice;
        uint128 startDate;
        address seller;
        uint16 currentStep;
    }

    struct ReserveAuction {
        address seller;
        address bidder;
        uint128 reservePrice;
        uint128 bid;
        uint128 startDate;
        uint128 biddingEnd;
    }

    // Edition ID to Offer mapping
    mapping(uint256 => Offer) public editionOffers;

    // Edition ID to StartDate
    mapping(uint256 => uint256) public editionOffersStartDate;

    // Edition ID to Listing
    mapping(uint256 => Listing) public editionListings;

    // Edition ID to stepped auction
    mapping(uint256 => Stepped) public editionStep;

    // 1 of 1 editions with reserve auctions
    mapping(uint256 => ReserveAuction) public editionWithReserveAuctions;

    // KODA token
    IKODAV3 public koda;

    // TODO add admin setter (with event)
    // platform funds collector
    address public platformAccount;

    // KO commission
    uint256 public platformPrimarySaleCommission = 15_00000;  // 15.00000%

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

    // TODO artist commission override feature (speak to andy)

    constructor(IKOAccessControlsLookup _accessControls, IKODAV3 _koda, address _platformAccount) {
        koda = _koda;
        accessControls = _accessControls;
        platformAccount = _platformAccount;
    }

    // assumes frontend protects against from these things from being called when:
    //  - they dont need to be e.g. listing an edition when its sold out
    //  - they cannot be done e.g. accepting an offer when the edition is sold out
    //  - approvals go astray/removed - approvals may need to be mapped in subgraph
    //  - when an edition sells out - implicit failure due to creator not owning anymore - we dont explicitly check remaining due to GAS

    // FIXME admin functions for fixing issues/draining tokens & ETH

    // Primary "buy now" sale flow

    // list edition with "buy now" price and start date
    function listEdition(address _creator, uint256 _editionId, uint128 _listingPrice, uint128 _startDate)
    public
    override
    whenNotPaused
    onlyContract {
        require(_listingPrice >= minBidAmount, "Listing price not enough");

        // Store listing data
        editionListings[_editionId] = Listing(_listingPrice, _startDate, _creator);

        emit EditionListed(_editionId, _listingPrice, _startDate);
    }

    // delist the "buy now" price - putting the edition in an "accepting offers" state
    function delistEdition(uint256 _editionId)
    public
    override
    whenNotPaused
    onlyContractOrCreator(_editionId) {
        // Clear listing
        delete editionListings[_editionId];

        // Emit event
        emit EditionDeListed(_editionId);
    }

    // update the "buy now" price
    function setEditionPriceListing(uint256 _editionId, uint128 _listingPrice)
    public
    override
    whenNotPaused
    onlyContractOrCreator(_editionId) {
        // Set price
        editionListings[_editionId].price = _listingPrice;

        // Emit event
        emit EditionPriceChanged(_editionId, _listingPrice);
    }

    // Buy an token from the edition on the primary market
    function buyEditionToken(uint256 _editionId)
    public
    override
    payable
    whenNotPaused
    nonReentrant {
        _purchaseEdition(_editionId, _msgSender());
    }

    // Buy an token from the edition on the primary market, ability to define the recipient
    function buyEditionTokenFor(uint256 _editionId, address _recipient)
    public
    override
    payable
    whenNotPaused
    nonReentrant {
        _purchaseEdition(_editionId, _recipient);
    }

    function _purchaseEdition(uint256 _editionId, address _recipient) internal {
        Listing storage listing = editionListings[_editionId];
        require(address(0) != listing.seller, "No listing found");
        require(msg.value >= listing.price, "List price not satisfied");
        require(block.timestamp >= listing.startDate, "List not available yet");

        uint256 tokenId = facilitateNextPrimarySale(_editionId, msg.value, _recipient, false);

        emit EditionPurchased(_editionId, tokenId, _recipient, msg.value);
    }

    // convert from a "buy now" listing and converting to "accepting offers" with an optional start date
    function convertFromBuyNowToOffers(uint256 _editionId, uint128 _startDate)
    public
    whenNotPaused
    onlyContractOrCreator(_editionId) {
        require(editionStep[_editionId].basePrice == 0, "Cannot convert from a step");
        require(editionListings[_editionId].seller != address(0), "No listing found");
        require(editionOffers[_editionId].offer == 0, "Already have offers set");

        // clear listing
        delete editionListings[_editionId];

        // set the start date for the offer (optional)
        editionOffersStartDate[_editionId] = _startDate;

        // Emit event
        emit EditionAcceptingOffer(_editionId, _startDate);
    }

    // Edition listing accessors

    function getEditionListing(uint256 _editionId)
    public
    view
    returns (address _seller, uint128 _listingPrice, uint128 _startDate) {
        Listing storage listing = editionListings[_editionId];
        return (
        listing.seller, // original seller
        listing.price,
        listing.startDate
        );
    }

    function getEditionListingSeller(uint256 _editionId) public view returns (address _seller) {
        return editionListings[_editionId].seller;
    }

    function getEditionListingPrice(uint256 _editionId) public view returns (uint128 _listingPrice) {
        return uint128(editionListings[_editionId].price);
    }

    function getEditionListingDate(uint256 _editionId) public view returns (uint128 _startDate) {
        return uint128(editionListings[_editionId].startDate);
    }

    // Primary "offers" sale flow

    function enableEditionOffers(uint256 _editionId, uint128 _startDate)
    external
    override
    whenNotPaused
    onlyContractOrCreator(_editionId) {

        // clear any buy now price which could be set
        delete editionListings[_editionId];

        // setup offers only
        editionOffersStartDate[_editionId] = _startDate;

        // Emit event
        emit EditionAcceptingOffer(_editionId, _startDate);
    }

    function placeEditionBid(uint256 _editionId)
    public
    override
    payable
    whenNotPaused
    nonReentrant {
        Offer storage offer = editionOffers[_editionId];
        require(msg.value >= offer.offer + minBidAmount, "Bid not high enough");

        // No contracts can bid to prevent money lockups on reverts
        require(!_msgSender().isContract(), "Cannot offer as a contract");

        // Honor start date if set
        uint256 startDate = editionOffersStartDate[_editionId];
        if (startDate > 0) {
            require(block.timestamp >= startDate, "Not yet accepting offers");

            // elapsed, so free storage
            delete editionOffersStartDate[_editionId];
        }

        // send money back to top bidder if existing offer found
        if (offer.offer > 0) {
            _refundBidder(offer.bidder, offer.offer);
        }

        // setup offer
        editionOffers[_editionId] = Offer(msg.value, _msgSender(), getLockupTime());

        emit EditionBidPlaced(_editionId, _msgSender(), msg.value);
    }

    function withdrawEditionBid(uint256 _editionId)
    public
    override
    whenNotPaused
    nonReentrant {
        Offer storage offer = editionOffers[_editionId];
        require(offer.offer > 0, "No open bid");
        require(offer.bidder == _msgSender(), "Not the top bidder");
        require(block.timestamp >= offer.lockupUntil, "Bid lockup not elapsed");

        // send money back to top bidder
        _refundBidder(offer.bidder, offer.offer);

        // emit event
        emit EditionBidWithdrawn(_editionId, _msgSender());

        // delete offer
        delete editionOffers[_editionId];
    }

    function rejectEditionBid(uint256 _editionId)
    public
    override
    whenNotPaused
    nonReentrant {
        Offer storage offer = editionOffers[_editionId];
        require(offer.bidder != address(0), "No open bid");
        require(koda.getCreatorOfEdition(_editionId) == _msgSender(), "Caller not the creator");

        // send money back to top bidder
        _refundBidder(offer.bidder, offer.offer);

        // emit event
        emit EditionBidRejected(_editionId, offer.bidder, offer.offer);

        // delete offer
        delete editionOffers[_editionId];
    }

    function acceptEditionBid(uint256 _editionId, uint256 _offerPrice)
    public
    override
    whenNotPaused
    nonReentrant {
        Offer storage offer = editionOffers[_editionId];
        require(offer.bidder != address(0), "No open bid");
        require(offer.offer == _offerPrice, "Offer price has changed");
        require(koda.getCreatorOfEdition(_editionId) == _msgSender(), "Not creator");

        // get a new token from the edition to transfer ownership
        uint256 tokenId = facilitateNextPrimarySale(_editionId, offer.offer, offer.bidder, false);

        // emit event
        emit EditionBidAccepted(_editionId, tokenId, offer.bidder, offer.offer);

        // clear open offer
        delete editionOffers[_editionId];
    }

    // emergency admin "reject" button for stuck bids
    function adminRejectEditionBid(uint256 _editionId) public onlyAdmin {
        Offer storage offer = editionOffers[_editionId];
        require(offer.bidder != address(0), "No open bid");

        // send money back to top bidder
        _refundBidder(offer.bidder, offer.offer);

        emit EditionBidRejected(_editionId, offer.bidder, offer.offer);

        // delete offer
        delete editionOffers[_editionId];
    }

    // Primary sale "stepped pricing" flow
    function listSteppedEditionAuction(address _creator, uint256 _editionId, uint128 _basePrice, uint128 _stepPrice, uint128 _startDate)
    public
    override
    whenNotPaused
    onlyContractOrCreator(_editionId) {
        require(_basePrice >= minBidAmount, "Base price not enough");
        require(editionStep[_editionId].seller == address(0), "Unable to setup listing again");
        require(koda.getCreatorOfToken(_editionId) == _creator, "Only creator can list edition");

        // Store listing data
        editionStep[_editionId] = Stepped(
            _basePrice,
            _stepPrice,
            _startDate,
            _creator,
            uint16(0)
        );

        emit EditionSteppedSaleListed(_editionId, _basePrice, _stepPrice, _startDate);
    }

    function buyNextStep(uint256 _editionId)
    public
    override
    payable
    whenNotPaused
    nonReentrant {
        Stepped storage steppedAuction = editionStep[_editionId];
        require(steppedAuction.seller != address(0), "Edition not listed for stepped auction");
        require(steppedAuction.startDate <= block.timestamp, "Not started yet");

        uint256 expectedPrice = _getNextEditionSteppedPrice(_editionId);
        require(msg.value >= expectedPrice, "Expected price not met");

        uint256 tokenId = facilitateNextPrimarySale(_editionId, expectedPrice, _msgSender(), true);

        // Bump the current step
        uint16 step = steppedAuction.currentStep;

        // no safemath for uint16
        steppedAuction.currentStep = step + 1;

        // send back excess if supplied - will allow UX flow of setting max price to pay
        if (msg.value > expectedPrice) {
            (bool success,) = _msgSender().call{value : msg.value - expectedPrice}("");
            require(success, "failed to send overspend back");
        }

        emit EditionSteppedSaleBuy(_editionId, tokenId, _msgSender(), expectedPrice, step);
    }

    // creates an exit from a step if required but forces a buy now price
    function convertSteppedAuctionToListing(uint256 _editionId, uint128 _listingPrice)
    public
    override
    nonReentrant
    whenNotPaused {
        Stepped storage steppedAuction = editionStep[_editionId];
        require(_listingPrice >= minBidAmount, "List price not enough");
        require(steppedAuction.seller == _msgSender(), "Only seller can convert");

        // Store listing data
        editionListings[_editionId] = Listing(_listingPrice, 0, steppedAuction.seller);

        // emit event
        emit EditionListed(_editionId, _listingPrice, 0);

        // Clear up the step logic
        delete editionStep[_editionId];
    }

    // get the current state of a stepped auction
    function getSteppedAuctionState(uint256 _editionId)
    public
    view
    returns (address creator, uint128 basePrice, uint128 stepPrice, uint128 startDate, uint16 currentStep) {
        Stepped storage steppedAuction = editionStep[_editionId];
        return (
        steppedAuction.seller,
        steppedAuction.basePrice,
        steppedAuction.stepPrice,
        steppedAuction.startDate,
        steppedAuction.currentStep
        );
    }

    // Get the next
    function getNextEditionSteppedPrice(uint256 _editionId) public view returns (uint256 price) {
        price = _getNextEditionSteppedPrice(_editionId);
    }

    function _getNextEditionSteppedPrice(uint256 _editionId) internal view returns (uint256 price) {
        Stepped storage steppedAuction = editionStep[_editionId];
        uint256 stepAmount = uint256(steppedAuction.stepPrice) * uint256(steppedAuction.currentStep);
        price = uint256(steppedAuction.basePrice) + stepAmount;
    }

    function listEditionForReserveAuction(address _creator, uint256 _editionId, uint128 _reservePrice, uint128 _startDate)
    public
    override
    whenNotPaused
    onlyContract {
        require(editionWithReserveAuctions[_editionId].reservePrice == 0, "Auction already in flight");
        require(koda.getSizeOfEdition(_editionId) == 1, "Only 1 of 1 editions are supported");
        require(_reservePrice >= minBidAmount, "Reserve price must be at least min bid");

        editionWithReserveAuctions[_editionId] = ReserveAuction({
            seller: _creator,
            bidder: address(0),
            reservePrice: _reservePrice,
            startDate: _startDate,
            biddingEnd: 0,
            bid: 0
        });

        emit EditionListedForReserveAuction(_editionId, _reservePrice, _startDate);
    }

    function placeBidOnReserveAuction(uint256 _editionId)
    public
    override
    payable
    whenNotPaused
    nonReentrant {
        ReserveAuction storage editionWithReserveAuction = editionWithReserveAuctions[_editionId];
        require(editionWithReserveAuction.reservePrice > 0, "Token not set up for reserve bidding");
        require(block.timestamp >= editionWithReserveAuction.startDate, "Token not accepting bids yet");
        require(!_msgSender().isContract(), "Cannot bid as a contract");
        require(msg.value >= editionWithReserveAuction.bid + minBidAmount, "You have not exceeded previous bid by min bid amount");

        // if a bid has been placed, then we will have a bidding end timestamp and we need to ensure no one
        // can bid beyond this
        if (editionWithReserveAuction.biddingEnd > 0) {
            require(block.timestamp < editionWithReserveAuction.biddingEnd, "Token is no longer accepting bids");
        }

        // If the reserve has been met, then bidding will end in 24 hours
        // if we are near the end, we have bids, then extend the bidding end
        if (editionWithReserveAuction.bid + msg.value >= editionWithReserveAuction.reservePrice && editionWithReserveAuction.biddingEnd == 0) {
            editionWithReserveAuction.biddingEnd = uint128(block.timestamp) + reserveAuctionLengthOnceReserveMet;
        } else if (editionWithReserveAuction.biddingEnd > 0) {
            uint128 secondsUntilBiddingEnd = editionWithReserveAuction.biddingEnd - uint128(block.timestamp);
            if (secondsUntilBiddingEnd <= reserveAuctionBidExtensionWindow) {
                editionWithReserveAuction.biddingEnd = editionWithReserveAuction.biddingEnd + reserveAuctionBidExtensionWindow;
            }
        }

        // if someone else has previously bid, there is a bid we need to refund
        if (editionWithReserveAuction.bid > 0) {
            _refundBidder(editionWithReserveAuction.bidder, editionWithReserveAuction.bid);
        }

        editionWithReserveAuction.bid = uint128(msg.value);
        editionWithReserveAuction.bidder = _msgSender();

        emit BidPlacedOnReserveAuction(_editionId, _msgSender(), msg.value);
    }

    function resultReserveAuction(uint256 _editionId)
    public
    override
    whenNotPaused
    nonReentrant {
        ReserveAuction storage editionWithReserveAuction = editionWithReserveAuctions[_editionId];

        require(editionWithReserveAuction.reservePrice > 0, "No active auction");
        require(editionWithReserveAuction.bid > 0, "No bids received");
        require(editionWithReserveAuction.bid >= editionWithReserveAuction.reservePrice, "Reserve not met");
        require(block.timestamp > editionWithReserveAuction.biddingEnd, "Bidding has not yet ended");
        require(
            editionWithReserveAuction.bidder == _msgSender() || editionWithReserveAuction.seller == _msgSender(),
            "Only winner or seller can result"
        );

        // send token to winner
        // todo - check if edition ID matches token ID and think about what happens when the seller transfers the token before resulting
        // todo we could allow buyer to withdraw if we know seller
        koda.safeTransferFrom(editionWithReserveAuction.seller, editionWithReserveAuction.bidder, _editionId);

        handleEditionSaleFunds(editionWithReserveAuction.seller, editionWithReserveAuction.bid);

        delete editionWithReserveAuctions[_editionId];

        emit ReserveAuctionResulted(_editionId, editionWithReserveAuction.bid, editionWithReserveAuction.bidder);
    }

    // Only permit bid withdrawals if reserve not met
    function withdrawBidFromReserveAuction(uint256 _editionId)
    public
    override
    whenNotPaused
    nonReentrant {
        ReserveAuction storage editionWithReserveAuction = editionWithReserveAuctions[_editionId];

        require(editionWithReserveAuction.reservePrice > 0, "No reserve auction in flight");
        require(editionWithReserveAuction.bid < editionWithReserveAuction.reservePrice, "Bids can only be withdrawn if reserve not met");
        require(editionWithReserveAuction.bidder == _msgSender(), "Only the bidder can withdraw their bid");

        _refundBidder(editionWithReserveAuction.bidder, editionWithReserveAuction.bid);

        editionWithReserveAuction.bidder = address(0);
        editionWithReserveAuction.bid = 0;

        emit BidWithdrawnFromReserveAuction(_editionId, editionWithReserveAuction.bidder, editionWithReserveAuction.bid);
    }

    // can only do this if the reserve has not been met
    function updateReservePriceForReserveAuction(uint256 _editionId, uint128 _reservePrice)
    public
    override
    whenNotPaused
    nonReentrant {
        ReserveAuction storage editionWithReserveAuction = editionWithReserveAuctions[_editionId];

        require(editionWithReserveAuction.reservePrice > 0, "No reserve auction in flight");
        require(editionWithReserveAuction.seller == _msgSender(), "Not the seller");
        require(editionWithReserveAuction.bid < editionWithReserveAuction.reservePrice, "Reserve price reached");
        require(_reservePrice >= minBidAmount, "Reserve must be at least min bid");

        editionWithReserveAuction.reservePrice = _reservePrice;

        emit ReservePriceUpdated(_editionId, _reservePrice);
    }

    function convertReserveAuctionToOffers(uint256 _editionId, uint128 _startDate)
    public
    override
    whenNotPaused
    nonReentrant {
        ReserveAuction storage editionWithReserveAuction = editionWithReserveAuctions[_editionId];

        require(editionWithReserveAuction.reservePrice > 0, "No reserve auction in flight");
        require(editionWithReserveAuction.seller == _msgSender(), "Not the seller");
        require(editionWithReserveAuction.bid < editionWithReserveAuction.reservePrice, "Reserve price reached");

        delete editionWithReserveAuctions[_editionId];

        editionOffersStartDate[_editionId] = _startDate;

        emit ReserveAuctionConvertedToOffers(_editionId, _startDate);
    }

    function convertReserveAuctionToBuyItNow(uint256 _editionId, uint128 _listingPrice, uint128 _startDate)
    public
    override
    whenNotPaused
    nonReentrant {
        ReserveAuction storage editionWithReserveAuction = editionWithReserveAuctions[_editionId];

        require(editionWithReserveAuction.reservePrice > 0, "No active auction");
        require(editionWithReserveAuction.bid < editionWithReserveAuction.reservePrice, "Can only convert before reserve met");
        require(editionWithReserveAuction.seller == _msgSender(), "Not the seller");

        // refund any bids
        if (editionWithReserveAuction.bid > 0) {
            _refundBidder(editionWithReserveAuction.bidder, editionWithReserveAuction.bid);
        }

        delete editionWithReserveAuctions[_editionId];

        // Check price over min bid
        require(_listingPrice >= minBidAmount, "Listing price not enough");

        editionListings[_editionId] = Listing(_listingPrice, _startDate, _msgSender());

        emit ReserveAuctionConvertedToBuyItNow(_editionId, _listingPrice, _startDate);
    }

    function updateReserveAuctionBidExtensionWindow(uint128 _reserveAuctionBidExtensionWindow) onlyAdmin public {
        reserveAuctionBidExtensionWindow = _reserveAuctionBidExtensionWindow;
        emit AdminUpdateReserveAuctionBidExtensionWindow(_reserveAuctionBidExtensionWindow);
    }

    function updateReserveAuctionLengthOnceReserveMet(uint128 _reserveAuctionLengthOnceReserveMet) onlyAdmin public {
        reserveAuctionLengthOnceReserveMet = _reserveAuctionLengthOnceReserveMet;
        emit AdminUpdateReserveAuctionLengthOnceReserveMet(_reserveAuctionLengthOnceReserveMet);
    }

    // primary sale helpers

    function facilitateNextPrimarySale(uint256 _editionId, uint256 _paymentAmount, address _buyer, bool _reverse) internal returns (uint256) {
        // for stepped sales, should they be sold in reverse order ie. 10...1 and not 1...10?
        // get next token to sell along with the royalties recipient and the original creator
        (address receiver, address creator, uint256 tokenId) = _reverse
            ? koda.facilitateReveresPrimarySale(_editionId) // todo - is function name a known typo?
            : koda.facilitateNextPrimarySale(_editionId);

        // split money
        handleEditionSaleFunds(receiver, _paymentAmount);

        // send token to buyer (assumes approval has been made, if not then this will fail)
        koda.safeTransferFrom(creator, _buyer, tokenId);

        // TODO add a test to prove that once an edition sells out, if there are open offers on they cannot be action and only withdrawn/rejected
        // N:B. open offers are left once sold out for the bidder to withdraw or the artist to reject

        return tokenId;
    }

    function handleEditionSaleFunds(address _receiver, uint256 _paymentAmount) internal {
        uint256 koCommission = (_paymentAmount / modulo) * platformPrimarySaleCommission;
        (bool koCommissionSuccess,) = platformAccount.call{value : koCommission}("");
        require(koCommissionSuccess, "Edition commission payment failed");

        (bool success,) = _receiver.call{value : _paymentAmount - koCommission}("");
        require(success, "Edition payment failed");
    }

    function _refundBidder(address _receiver, uint256 _paymentAmount) internal {
        (bool success,) = _receiver.call{value : _paymentAmount}("");
        require(success, "Edition offer refund failed");
    }

    function getLockupTime() internal view returns (uint256 lockupUntil) {
        lockupUntil = block.timestamp + bidLockupPeriod;
    }

    function updatePlatformPrimarySaleCommission(uint256 _platformPrimarySaleCommission) public onlyAdmin {
        platformPrimarySaleCommission = _platformPrimarySaleCommission;
        emit AdminUpdatePlatformPrimarySaleCommission(_platformPrimarySaleCommission);
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
}

