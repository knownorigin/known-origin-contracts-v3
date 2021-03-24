// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Context} from "@openzeppelin/contracts/GSN/Context.sol";

import {IKODAV3PrimarySaleMarketplace, IKODAV3SecondarySaleMarketplace} from "./IKODAV3Marketplace.sol";
import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../core/IKODAV3.sol";

contract KODAV3Marketplace is IKODAV3PrimarySaleMarketplace, IKODAV3SecondarySaleMarketplace, ReentrancyGuard, Context {
    using SafeMath for uint256;

    event AdminUpdateSecondaryRoyalty(uint256 _secondarySaleRoyalty);
    event AdminUpdatePlatformPrimarySaleCommission(uint256 _platformPrimarySaleCommission);
    event AdminUpdateSecondarySaleCommission(uint256 _platformSecondarySaleCommission);
    event AdminUpdateModulo(uint256 _modulo);
    event AdminUpdateMinBidAmount(uint256 _minBidAmount);

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

    // Reserve price off-chain
    struct Offer {
        uint256 offer;
        address bidder;
        uint256 lockupUntil;
    }

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

    // Edition ID to Offer mapping
    mapping(uint256 => Offer) public editionOffers;

    // Edition ID to StartDate
    mapping(uint256 => uint256) public editionOffersStartDate;

    // Edition ID to Listing
    mapping(uint256 => Listing) public editionListings;

    // Edition ID to stepped auction
    mapping(uint256 => Stepped) public editionStep;

    // Token ID to Offer mapping
    mapping(uint256 => Offer) public tokenOffers;

    // Token ID to Listing
    mapping(uint256 => Listing) public tokenListings;

    // KODA token
    IKODAV3 public koda;

    // platform funds collector
    address public platformAccount;

    // TODO confirm default decimal precision (EIP-2981 compatibility required)
    // Secondary sale commission
    uint256 public secondarySaleRoyalty = 12_50000; // 12.5%

    // KO commission
    uint256 public platformPrimarySaleCommission = 15_00000;  // 15.00000%
    uint256 public platformSecondarySaleCommission = 2_50000;  // 2.50000%

    // precision 100.00000%
    uint256 public modulo = 100_00000;

    // Minimum bid/list amount
    uint256 public minBidAmount = 0.01 ether;

    // Bid lockup period
    uint256 public bidLockupPeriod = 6 hours;

    IKOAccessControlsLookup public accessControls;

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

    // FIXME do we need a global emergency stop "pause"

    // FIXME admin functions for fixing issues/draining tokens & ETH

    // Primary "buy now" sale flow

    // list edition with "buy now" price and start date
    function listEdition(address _creator, uint256 _editionId, uint128 _listingPrice, uint128 _startDate)
    public
    onlyContract
    override {
        require(_listingPrice >= minBidAmount, "Listing price not enough");

        // Store listing data
        editionListings[_editionId] = Listing(_listingPrice, _startDate, _creator);

        emit EditionListed(_editionId, _listingPrice, _startDate);
    }

    // delist the "buy now" price - putting the edition in an "accepting offers" state
    function delistEdition(uint256 _editionId)
    public
    onlyContractOrCreator(_editionId)
    override {
        // Clear listing
        delete editionListings[_editionId];

        // Emit event
        emit EditionDeListed(_editionId);
    }

    // update the "buy now" price
    function setEditionPriceListing(uint256 _editionId, uint128 _listingPrice)
    onlyContractOrCreator(_editionId)
    public {
        // Set price
        editionListings[_editionId].price = _listingPrice;

        // Emit event
        emit EditionPriceChanged(_editionId, _listingPrice);
    }

    // Buy an token from the edition on the primary market
    function buyEditionToken(uint256 _editionId)
    nonReentrant
    public
    override payable {
        Listing storage listing = editionListings[_editionId];
        require(address(0) != listing.seller, "No listing found");
        require(msg.value >= listing.price, "List price not satisfied");
        require(block.timestamp >= listing.startDate, "List not available yet");

        uint256 tokenId = facilitateNextPrimarySale(_editionId, msg.value, _msgSender());

        emit EditionPurchased(_editionId, tokenId, _msgSender(), msg.value);
    }

    // convert from a "buy now" listing and converting to "accepting offers" with an optional start date
    function convertFromBuyNowToOffers(uint256 _editionId, uint128 _startDate)
    onlyContractOrCreator(_editionId)
    public {
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
    onlyContractOrCreator(_editionId)
    override
    external {

        // clear any buy now price which could be set
        delete editionListings[_editionId];

        // setup offers only
        editionOffersStartDate[_editionId] = _startDate;

        // Emit event
        emit EditionAcceptingOffer(_editionId, _startDate);
    }

    function placeEditionBid(uint256 _editionId) nonReentrant public override payable {
        Offer storage offer = editionOffers[_editionId];
        require(msg.value >= offer.offer.add(minBidAmount), "Bid not high enough");

        // No contracts can bid to prevent money lockups on reverts
        require(!Address.isContract(_msgSender()), "Cannot offer as a contract");

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

    function withdrawEditionBid(uint256 _editionId) public override nonReentrant {
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

    function rejectEditionBid(uint256 _editionId) public override nonReentrant {
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

    function acceptEditionBid(uint256 _editionId, uint256 _offerPrice) public override nonReentrant {
        Offer storage offer = editionOffers[_editionId];
        require(offer.bidder != address(0), "No open bid");
        require(offer.offer == _offerPrice, "Offer price has changed");
        require(koda.getCreatorOfEdition(_editionId) == _msgSender(), "Not creator");

        // get a new token from the edition to transfer ownership
        uint256 tokenId = facilitateNextPrimarySale(_editionId, offer.offer, offer.bidder);

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

    function buyNextStep(uint256 _editionId) public override nonReentrant payable {
        Stepped storage steppedAuction = editionStep[_editionId];
        require(steppedAuction.seller != address(0), "Edition not listed for stepped auction");
        require(steppedAuction.startDate <= block.timestamp, "Not started yet");

        uint256 expectedPrice = _getNextEditionSteppedPrice(_editionId);
        require(msg.value >= expectedPrice, "Expected price not met");

        uint256 tokenId = facilitateNextPrimarySale(_editionId, expectedPrice, _msgSender());

        // Bump the current step
        uint16 step = steppedAuction.currentStep;

        // no safemath for uint16
        steppedAuction.currentStep = step + 1;

        // send back excess if supplied - will allow UX flow of setting max price to pay
        if (msg.value > expectedPrice) {
            (bool success,) = _msgSender().call{value : msg.value.sub(expectedPrice)}("");
            require(success, "failed to send overspend back");
        }

        emit EditionSteppedSaleBuy(_editionId, tokenId, _msgSender(), expectedPrice, step);
    }

    // creates an exit from a step if required but forces a buy now price
    function convertSteppedAuctionToListing(uint256 _editionId, uint128 _listingPrice) public override nonReentrant {
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
        uint256 stepAmount = uint256(steppedAuction.stepPrice).mul(uint256(steppedAuction.currentStep));
        price = uint256(steppedAuction.basePrice).add(stepAmount);
    }

    // primary sale helpers

    function facilitateNextPrimarySale(uint256 _editionId, uint256 _paymentAmount, address _buyer) internal returns (uint256) {
        // get next token to sell along with the royalties recipient and the original creator
        (address receiver, address creator, uint256 tokenId) = koda.facilitateNextPrimarySale(_editionId);

        // split money
        handleEditionSaleFunds(receiver, _paymentAmount);

        // send token to buyer (assumes approval has been made, if not then this will fail)
        koda.safeTransferFrom(creator, _buyer, tokenId);

        // FIXME we could in theory remove this - write a test to prove its not needed and we can do withdrawals
        //      - and use the current approach of KO where a bidder must pull back any funds once its sold out on primary
        //      - would probs shave a good bit of GAS (profile the options)
        //      - could be replaced with a open method when in that state, monies are returned to bidder (future proof building tools to cover this)

        // if we are about to sellout - send any open offers back to the bidder
        if (tokenId == koda.maxTokenIdOfEdition(_editionId)) {

            // send money back to top bidder if existing offer found
            Offer storage offer = editionOffers[_editionId];
            if (offer.offer > 0) {
                _refundBidder(offer.bidder, offer.offer);
            }
        }

        return tokenId;
    }

    function handleEditionSaleFunds(address _receiver, uint256 _paymentAmount) internal {
        uint256 koCommission = _paymentAmount.div(modulo).mul(platformPrimarySaleCommission);
        (bool koCommissionSuccess,) = platformAccount.call{value : koCommission}("");
        require(koCommissionSuccess, "Edition commission payment failed");

        (bool success,) = _receiver.call{value : _paymentAmount.sub(koCommission)}("");
        require(success, "Edition payment failed");
    }

    function _refundBidder(address _receiver, uint256 _paymentAmount) internal {
        (bool success,) = _receiver.call{value : _paymentAmount}("");
        require(success, "Edition offer refund failed");
    }

    function getLockupTime() internal view returns (uint256 lockupUntil) {
        lockupUntil = block.timestamp + bidLockupPeriod;
    }

    ///////////////////////////////////
    // Secondary sale "buy now" flow //
    ///////////////////////////////////

    function listToken(uint256 _tokenId, uint128 _listingPrice, uint128 _startDate) public override {
        // Check ownership before listing
        require(koda.ownerOf(_tokenId) == _msgSender(), "Not token owner");

        // No contracts can list to prevent money lockups on transfer
        require(!Address.isContract(_msgSender()), "Cannot list as a contract");

        // Check price over min bid
        require(_listingPrice >= minBidAmount, "Listing price not enough");

        // List the token
        tokenListings[_tokenId] = Listing(_listingPrice, _startDate, _msgSender());

        emit TokenListed(_tokenId, _msgSender(), _listingPrice);
    }

    function delistToken(uint256 _tokenId) public override {
        // check listing found
        require(tokenListings[_tokenId].seller != address(0), "No listing found");

        // check owner is caller
        require(koda.ownerOf(_tokenId) == _msgSender(), "Not token owner");

        // remove the listing
        delete tokenListings[_tokenId];

        emit TokenDeListed(_tokenId);
    }

    function buyToken(uint256 _tokenId) public payable override nonReentrant {
        Listing storage listing = tokenListings[_tokenId];

        require(address(0) != listing.seller, "No listing found");
        require(msg.value >= listing.price, "List price not satisfied");
        require(block.timestamp >= listing.startDate, "List not available yet");

        // check current owner is the lister as it may have changed hands
        address currentOwner = koda.ownerOf(_tokenId);
        require(listing.seller == currentOwner, "Listing not valid, token owner has changed");

        // trade the token
        facilitateSecondarySale(_tokenId, msg.value, currentOwner, _msgSender());

        // remove the listing
        delete tokenListings[_tokenId];

        emit TokenPurchased(_tokenId, _msgSender(), currentOwner, msg.value);
    }

    // Secondary sale "offer" flow

    function placeTokenBid(uint256 _tokenId) public payable override nonReentrant {
        // Check for highest offer
        Offer storage offer = tokenOffers[_tokenId];
        require(msg.value >= offer.offer.add(minBidAmount), "Bid not high enough");

        // TODO create testing contract for this
        // No contracts can place a bid to prevent money lockups on refunds
        require(!Address.isContract(_msgSender()), "Cannot make an offer as a contract");

        // send money back to top bidder if existing offer found
        if (offer.offer > 0) {
            _refundSecondaryBidder(offer.bidder, offer.offer);
        }

        // setup offer
        tokenOffers[_tokenId] = Offer(msg.value, _msgSender(), getLockupTime());

        emit TokenBidPlaced(_tokenId, koda.ownerOf(_tokenId), _msgSender(), msg.value);
    }

    function withdrawTokenBid(uint256 _tokenId) public override nonReentrant {
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

    function rejectTokenBid(uint256 _tokenId) public override nonReentrant {
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

    function acceptTokenBid(uint256 _tokenId, uint256 _offerPrice) public override nonReentrant {
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
        address originalCreator = koda.getCreatorOfToken(_tokenId);

        // split money
        handleSecondarySaleFunds(_seller, originalCreator, _paymentAmount);

        // N:B. open offers are left for the bidder to withdraw or the new token owner to reject/accept

        // send token to buyer
        koda.safeTransferFrom(_seller, _buyer, _tokenId);
    }

    function handleSecondarySaleFunds(address _receiver, address _originalCreator, uint256 _paymentAmount) internal {
        // pay royalties
        uint256 creatorRoyalties = _paymentAmount.div(modulo).mul(secondarySaleRoyalty);
        (bool creatorSuccess,) = _originalCreator.call{value : creatorRoyalties}("");
        require(creatorSuccess, "Token payment failed");

        // pay platform fee
        uint256 koCommission = _paymentAmount.div(modulo).mul(platformSecondarySaleCommission);
        (bool koCommissionSuccess,) = platformAccount.call{value : koCommission}("");
        require(koCommissionSuccess, "Token commission payment failed");

        // pay seller
        (bool success,) = _receiver.call{value : _paymentAmount.sub(creatorRoyalties).sub(koCommission)}("");
        require(success, "Token payment failed");
    }

    function _refundSecondaryBidder(address _receiver, uint256 _paymentAmount) internal {
        (bool success,) = _receiver.call{value : _paymentAmount}("");
        require(success, "Token offer refund failed");
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

    // Admin Methods

    function updateSecondaryRoyalty(uint256 _secondarySaleRoyalty) public onlyAdmin {
        secondarySaleRoyalty = _secondarySaleRoyalty;
        emit AdminUpdateSecondaryRoyalty(_secondarySaleRoyalty);
    }

    function updatePlatformPrimarySaleCommission(uint256 _platformPrimarySaleCommission) public onlyAdmin {
        platformPrimarySaleCommission = _platformPrimarySaleCommission;
        emit AdminUpdatePlatformPrimarySaleCommission(_platformPrimarySaleCommission);
    }

    function updatePlatformSecondarySaleCommission(uint256 _platformSecondarySaleCommission) public onlyAdmin {
        platformSecondarySaleCommission = _platformSecondarySaleCommission;
        emit AdminUpdateSecondarySaleCommission(_platformSecondarySaleCommission);
    }

    function updateModulo(uint256 _modulo) public onlyAdmin {
        modulo = _modulo;
        emit AdminUpdateModulo(_modulo);
    }

    function updateMinBidAmount(uint256 _minBidAmount) public onlyAdmin {
        minBidAmount = _minBidAmount;
        emit AdminUpdateMinBidAmount(_minBidAmount);
    }
}
