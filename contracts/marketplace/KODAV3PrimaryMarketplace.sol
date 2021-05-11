// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../core/IKODAV3.sol";
import {IKODAV3PrimarySaleMarketplace} from "./IKODAV3Marketplace.sol";
import {ReserveAuctionMarketplace} from "./ReserveAuctionMarketplace.sol";

/// @title KnownOrigin Primary Marketplace for all V3 tokens
/// @notice The following listing types are supported: Buy now, Stepped, Reserve and Offers
/// @dev The contract is pausable and has reentrancy guards
/// @author KnownOrigin Labs
contract KODAV3PrimaryMarketplace is IKODAV3PrimarySaleMarketplace, ReserveAuctionMarketplace {

    event AdminSetKoCommissionOverride(address indexed _receiver, uint256 _koCommission);

    // KO Commission override definition for a given creator
    struct KOCommissionOverride {
        bool active;
        uint256 koCommission;
    }

    // Offer / Bid definition placed on an edition
    struct Offer {
        uint256 offer;
        address bidder;
        uint256 lockupUntil;
    }

    // Buy now listing definition
    struct Listing {
        uint128 price;
        uint128 startDate;
        address seller;
    }

    // Stepped auction definition
    struct Stepped {
        uint128 basePrice;
        uint128 stepPrice;
        uint128 startDate;
        address seller;
        uint16 currentStep;
    }

    /// @notice primary sale proceed address
    mapping(address => KOCommissionOverride) public koCommissionOverrides;

    /// @notice Edition ID to Offer mapping
    mapping(uint256 => Offer) public editionOffers;

    /// @notice Edition ID to StartDate
    mapping(uint256 => uint256) public editionOffersStartDate;

    /// @notice Edition ID to Listing
    mapping(uint256 => Listing) public editionListings;

    /// @notice Edition ID to stepped auction
    mapping(uint256 => Stepped) public editionStep;

    /// @notice 1 of 1 edition ID to reserve auction definition
    mapping(uint256 => ReserveAuction) public editionWithReserveAuctions;

    /// @notice KO commission on every sale
    uint256 public platformPrimarySaleCommission = 15_00000;  // 15.00000%

    constructor(IKOAccessControlsLookup _accessControls, IKODAV3 _koda, address _platformAccount)
    ReserveAuctionMarketplace(_accessControls, _koda, _platformAccount) {}

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

        uint256 tokenId = _facilitateNextPrimarySale(_editionId, msg.value, _recipient, false);

        delete editionListings[_editionId];

        emit EditionPurchased(_editionId, tokenId, _recipient, msg.value);
    }

    // convert from a "buy now" listing and converting to "accepting offers" with an optional start date
    function convertFromBuyNowToOffers(uint256 _editionId, uint128 _startDate)
    public
    whenNotPaused
    onlyContractOrCreator(_editionId) {
        require(editionListings[_editionId].seller != address(0), "No listing found");

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
    onlyContract {
        // Set the start date if one supplied
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
        require(!isEditionListed(_editionId), "Edition is listed");

        Offer storage offer = editionOffers[_editionId];
        require(msg.value >= offer.offer + minBidAmount, "Bid not high enough");

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
        uint256 tokenId = _facilitateNextPrimarySale(_editionId, offer.offer, offer.bidder, false);

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

    function convertOffersToBuyItNow(uint256 _editionId, uint128 _listingPrice, uint128 _startDate)
    public
    override
    whenNotPaused
    nonReentrant
    onlyContractOrCreator(_editionId) {
        require(!isEditionListed(_editionId), "Edition is listed");
        require(_listingPrice >= minBidAmount, "Listing price not enough");

        // send money back to top bidder if existing offer found
        Offer storage offer = editionOffers[_editionId];
        if (offer.offer > 0) {
            _refundBidder(offer.bidder, offer.offer);
        }

        emit EditionBidRejected(_editionId, offer.bidder, offer.offer);

        // delete offer
        delete editionOffers[_editionId];

        // delete rest of offer information
        delete editionOffersStartDate[_editionId];

        // Store listing data
        editionListings[_editionId] = Listing(_listingPrice, _startDate, _msgSender());

        emit EditionConvertedFromOffersToBuyItNow(_editionId, _listingPrice, _startDate);
    }

    // Primary sale "stepped pricing" flow
    function listSteppedEditionAuction(address _creator, uint256 _editionId, uint128 _basePrice, uint128 _stepPrice, uint128 _startDate)
    public
    override
    whenNotPaused
    onlyContract {
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

    function updateSteppedAuction(uint256 _editionId, uint128 _basePrice, uint128 _stepPrice)
    public
    override
    whenNotPaused {
        Stepped storage steppedAuction = editionStep[_editionId];
        require(steppedAuction.seller == _msgSender(), "Only seller");
        require(steppedAuction.currentStep == 0, "Only when no sales");

        steppedAuction.basePrice = _basePrice;
        steppedAuction.stepPrice = _stepPrice;

        emit EditionSteppedAuctionUpdated(_editionId, _basePrice, _stepPrice);
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

        uint256 tokenId = _facilitateNextPrimarySale(_editionId, expectedPrice, _msgSender(), true);

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
        require(steppedAuction.currentStep == 0, "Sale has been made");

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
            !isApprovalActiveForMarketplace || koda.getEditionSalesDisabled(_editionId),
            "Bid cannot be withdrawn as reserve auction listing is valid"
        );

        _emergencyExitBidFromReserveAuction(_editionId);
    }

    function convertReserveAuctionToBuyItNow(uint256 _editionId, uint128 _listingPrice, uint128 _startDate)
    public
    //override
    whenNotPaused
    nonReentrant {
        ReserveAuction storage reserveAuction = editionOrTokenWithReserveAuctions[_editionId];

        require(reserveAuction.reservePrice > 0, "No active auction");
        require(reserveAuction.bid < reserveAuction.reservePrice, "Can only convert before reserve met");
        require(reserveAuction.seller == _msgSender(), "Not the seller");
        require(_listingPrice >= minBidAmount, "Listing price not enough");

        // refund any bids
        if (reserveAuction.bid > 0) {
            _refundBidder(reserveAuction.bidder, reserveAuction.bid);
        }

        delete editionOrTokenWithReserveAuctions[_editionId];

        editionListings[_editionId] = Listing(_listingPrice, _startDate, _msgSender());

        emit ReserveAuctionConvertedToBuyItNow(_editionId, _listingPrice, _startDate);
    }

    // primary sale helpers

    function _processSale(uint256 _id, uint256 _paymentAmount, address _buyer, address _seller, bool _reverse) internal override returns (uint256) {
        return _facilitateNextPrimarySale(_id, _paymentAmount, _buyer, _reverse);
    }

    function _facilitateNextPrimarySale(uint256 _editionId, uint256 _paymentAmount, address _buyer, bool _reverse) internal returns (uint256) {
        // for stepped sales, should they be sold in reverse order ie. 10...1 and not 1...10?
        // get next token to sell along with the royalties recipient and the original creator
        (address receiver, address creator, uint256 tokenId) = _reverse
            ? koda.facilitateReversePrimarySale(_editionId)
            : koda.facilitateNextPrimarySale(_editionId);

        // split money
        handleEditionSaleFunds(receiver, _paymentAmount);

        // send token to buyer (assumes approval has been made, if not then this will fail)
        koda.safeTransferFrom(creator, _buyer, tokenId);

        // N:B. open offers are left once sold out for the bidder to withdraw or the artist to reject

        return tokenId;
    }

    function handleEditionSaleFunds(address _receiver, uint256 _paymentAmount) internal {
        uint256 primarySaleCommission;

        if (koCommissionOverrides[_receiver].active) {
            primarySaleCommission = koCommissionOverrides[_receiver].koCommission;
        } else {
            primarySaleCommission = platformPrimarySaleCommission;
        }

        uint256 koCommission = (_paymentAmount / modulo) * primarySaleCommission;
        if (koCommission > 0) {
            (bool koCommissionSuccess,) = platformAccount.call{value : koCommission}("");
            require(koCommissionSuccess, "Edition commission payment failed");
        }

        (bool success,) = _receiver.call{value : _paymentAmount - koCommission}("");
        require(success, "Edition payment failed");
    }

    function getLockupTime() internal view returns (uint256 lockupUntil) {
        lockupUntil = block.timestamp + bidLockupPeriod;
    }

    // as offers are always possible, we wont count it as a listing
    function isEditionListed(uint256 _editionId) internal view returns (bool) {
        if (editionListings[_editionId].seller != address(0)) {
            return true;
        }

        if (editionStep[_editionId].seller != address(0)) {
            return true;
        }

        if (editionWithReserveAuctions[_editionId].seller != address(0)) {
            return true;
        }

        return false;
    }

    function updatePlatformPrimarySaleCommission(uint256 _platformPrimarySaleCommission) public onlyAdmin {
        platformPrimarySaleCommission = _platformPrimarySaleCommission;
        emit AdminUpdatePlatformPrimarySaleCommission(_platformPrimarySaleCommission);
    }

    function setKoCommissionOverrideForReceiver(address _receiver, uint256 _koCommission) public onlyAdmin {
        KOCommissionOverride storage koCommissionOverride = koCommissionOverrides[_receiver];
        koCommissionOverride.active = true;
        koCommissionOverride.koCommission = _koCommission;

        emit AdminSetKoCommissionOverride(_receiver, _koCommission);
    }

    function pause() public onlyAdmin {
        super._pause();
    }

    function unpause() public onlyAdmin {
        super._unpause();
    }
}

