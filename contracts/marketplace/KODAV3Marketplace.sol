// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Context} from "@openzeppelin/contracts/GSN/Context.sol";
import {
IKODAV3PrimarySaleMarketplace,
IKODAV3SecondarySaleMarketplace
} from "./IKODAV3Marketplace.sol";

import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../core/IKODAV3.sol";

contract KODAV3Marketplace is ReentrancyGuard, IKODAV3PrimarySaleMarketplace, IKODAV3SecondarySaleMarketplace, Context {
    using SafeMath for uint256;

    event AdminUpdateSecondaryRoyalty(uint256 _secondarySaleRoyalty);
    event AdminUpdatePlatformPrimarySaleCommission(uint256 _platformPrimarySaleCommission);
    event AdminUpdateSecondarySaleCommission(uint256 _platformSecondarySaleCommission);
    event AdminUpdateModulo(uint256 _modulo);
    event AdminUpdateMinBidAmount(uint256 _minBidAmount);

    // TODO do we need start date on offers?
    struct Offer {
        uint256 offer;
        address bidder;
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

    // FIXME get GAS costings for using a counter and draw down method for KO funds?
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

    IKOAccessControlsLookup public accessControls;

    constructor(IKOAccessControlsLookup _accessControls, IKODAV3 _koda, address _platformAccount) {
        koda = _koda;
        platformAccount = _platformAccount;
        accessControls = _accessControls;
    }

    // Buy now (basic)
    //  - edition (primary) - DONE
    //  - token (secondary) - DONE

    // Offers (basic)
    // - editions (primary) - DONE
    // - token (secondary) - DONE

    //  Stepped auctions
    // - editions (primary) - IN PROGRESS
    // - token (secondary) - N/A

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////

    // assumes frontend protects against from these things from being called when:
    //  - they dont need to be e.g. listing an edition when its sold out
    //  - they cannot be done e.g. accepting an offer when the edition is sold out
    //  - approvals go astray/removed - approvals may need to be mapped in subgraph
    //  - when an edition sells out - implicit failure due to creator not owning anymore - we dont explicitly check remaining due to GAS

    // FIXME multiple buys at once?

    // TODO expose both contract & minter listing access protected methods
    //      - contract takes in creator, minter assumes creator and needs to check KODA for edition creator

    // TODO create buy now and offers signature model where off-chain signatures can be provider to buy the items

    // TODO enforce rules on sale mechanics i.e. can you have offers and buy now price?
    // TODO only can be on one sales mechanic at a time
    //      - create ability to move between auction modes - clearing down open bids when required

    // TODO Ability to set price/listing in multiple tokens e.g. ETH / DAI / WETH / WBTC
    //      - do we need a list of tokens to allow payments in?
    //      - is this really a different contract?

    // TODO Multi coin payment support
    //      - approved list of tokens?
    //      - reentrancy safe
    //      - requires user approval to buy
    //      - can only be listed in ETH or ERC20/223 ?

    // TODO admin functions for fixing issues/draining tokens & ETH
    // TODO review admin methods
    // TODO review all error messages - short and concise
    // TODO review all solidity docs
    // TODO review all public accessors
    // TODO review all events - ensure present for all actions for indexing

    // TODO CREATE2 to generate vanity deployment address
    //  - https://blog.cotten.io/ethereums-eip-1014-create-2-d17b1a184498
    //  - https://ethgasstation.info/blog/what-is-create2/
    //  - https://medium.com/coinmonks/on-efficient-ethereum-addresses-3fef0596e263

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /////////////////////////////////
    // Primary "buy now" sale flow //
    /////////////////////////////////

    function listEdition(address _creator, uint256 _editionId, uint128 _listingPrice, uint128 _startDate) public override {
        require(accessControls.hasContractRole(_msgSender()), "KODA: Caller must have contract role");
        require(_listingPrice >= minBidAmount, "Listing price not enough");

       // Store listing data
        editionListings[_editionId] = Listing(_listingPrice, _startDate, _creator);

        emit EditionListed(_editionId, _listingPrice, _startDate);
    }

    // FIXME drop?
    function delistEdition(uint256 _editionId) public override {
        require(editionListings[_editionId].seller == _msgSender(), "Caller not the lister");

        delete editionListings[_editionId];

        // TODO - do we send back any open offer?

        emit EditionDeListed(_editionId);
    }

    function buyEditionToken(uint256 _editionId) public override payable nonReentrant {
        Listing storage listing = editionListings[_editionId];
        require(address(0) != listing.seller, "No listing found");
        require(msg.value >= listing.price, "List price not satisfied");
        require(block.timestamp >= listing.startDate, "List not available yet");

        uint256 tokenId = facilitateNextPrimarySale(_editionId, msg.value, _msgSender());

        emit EditionPurchased(_editionId, tokenId, _msgSender(), msg.value);
    }

    ////////////////////////////////
    /// Edition listing accessors //
    ////////////////////////////////

    function getEditionListing(uint256 _editionId)
    public
    view
    returns (
        address _seller,
        uint128 _listingPrice,
        uint128 _startDate
    ) {
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

    ////////////////////////////////
    // Primary "offers" sale flow //
    ////////////////////////////////

    // TODO reserve price?

    function placeEditionBid(uint256 _editionId) public override payable nonReentrant {
        Offer storage offer = editionOffers[_editionId];
        require(offer.offer.add(minBidAmount) >= msg.value, "Bid not high enough");

        // No contracts can bid to prevent money lockups on reverts
        require(!Address.isContract(_msgSender()), "Cannot offer as a contract");

        // send money back to top bidder if existing offer found
        if (offer.offer > 0) {
            _refundBidder(offer.bidder, offer.offer);
        }

        // setup offer
        editionOffers[_editionId] = Offer(msg.value, _msgSender());

        emit EditionBidPlaced(_editionId, _msgSender(), msg.value);
    }

    // TODO lock in period for 24hrs?
    function withdrawEditionBid(uint256 _editionId) public override nonReentrant {
        Offer storage offer = editionOffers[_editionId];
        require(offer.bidder == _msgSender(), "Not bidder");

        // send money back to top bidder
        _refundBidder(offer.bidder, offer.offer);

        // delete offer
        delete editionOffers[_editionId];

        emit EditionBidWithdrawn(_editionId, _msgSender());
    }

    function rejectEditionBid(uint256 _editionId) public override nonReentrant {
        Offer storage offer = editionOffers[_editionId];
        require(offer.bidder != address(0), "No open bid");
        require(koda.getCreatorOfEdition(_editionId) == _msgSender(), "Not creator");

        // send money back to top bidder
        _refundBidder(offer.bidder, offer.offer);

        // delete offer
        delete editionOffers[_editionId];

        emit EditionBidRejected(_editionId, _msgSender(), offer.offer);
    }

    function acceptEditionBid(uint256 _editionId, uint256 _offerPrice) public override nonReentrant {
        Offer storage offer = editionOffers[_editionId];
        require(offer.bidder != address(0), "No open bid");
        require(offer.offer == _offerPrice, "Offer price has changed");
        require(koda.getCreatorOfEdition(_editionId) == _msgSender(), "Not creator");

        uint256 tokenId = facilitateNextPrimarySale(_editionId, offer.offer, offer.bidder);

        // clear open offer
        delete editionOffers[_editionId];

        emit EditionBidAccepted(_editionId, tokenId, offer.bidder, offer.offer);
    }

    /////////////////////////////////////////
    // Primary sale "stepped pricing" flow //
    /////////////////////////////////////////

    function listSteppedEditionAuction(address _creator, uint256 _editionId, uint128 _basePrice, uint128 _stepPrice, uint128 _startDate) public override {
        require(accessControls.hasContractRole(_msgSender()), "Caller must have contract role");
        require(_basePrice >= minBidAmount, "Base price not enough");
        require(editionStep[_editionId].seller == address(0), "Unable to setup listing again");
        require(koda.editionExists(_editionId) == true, "Nonexistent edition");
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
        uint16 nextStep = step + 1; // no safemath for uint16
        steppedAuction.currentStep = nextStep;

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

        // Clear up the step logic
        delete editionStep[_editionId];

        emit EditionListed(_editionId, _listingPrice, 0);

        // TODO do we need an event to signify the conversion?
    }

    // get the current state of a stepped auction
    function getSteppedAuctionState(uint256 _editionId)
    public
    view
    returns (
        address creator,
        uint128 basePrice,
        uint128 stepPrice,
        uint128 startDate,
        uint16 currentStep
    ) {
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

    //////////////////////////
    // primary sale helpers //
    //////////////////////////

    function facilitateNextPrimarySale(uint256 _editionId, uint256 _paymentAmount, address _buyer) internal returns (uint256) {
        // get next token to sell along with the royalties recipient and the original creator
        (address receiver, address creator, uint256 tokenId) = koda.facilitateNextPrimarySale(_editionId);

        // split money
        handleEditionSaleFunds(receiver, _paymentAmount);

        // send token to buyer (assumes approval has been made, if not then this will fail)
        koda.safeTransferFrom(creator, _buyer, tokenId);

        // FIXME we could in theory remove this
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

        // TODO could we save gas here by maintaining a counter for KO platform funds and having a drain method?

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

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////

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

    /////////////////////////////////
    // Secondary sale "offer" flow //
    /////////////////////////////////

    function placeTokenBid(uint256 _tokenId) public payable override nonReentrant {
        Offer storage offer = tokenOffers[_tokenId];
        require(offer.offer.add(minBidAmount) >= msg.value, "Bid not high enough");

        // No contracts can place a bid to prevent money lockups on refunds
        require(!Address.isContract(_msgSender()), "Cannot make an offer as a contract");

        // send money back to top bidder if existing offer found
        if (offer.offer > 0) {
            _refundSecondaryBidder(offer.bidder, offer.offer);
        }

        // setup offer
        tokenOffers[_tokenId] = Offer(msg.value, _msgSender());

        emit TokenBidPlaced(_tokenId, koda.ownerOf(_tokenId), _msgSender(), msg.value);
    }

    function withdrawTokenBid(uint256 _tokenId) public override nonReentrant {
        Offer storage offer = tokenOffers[_tokenId];
        require(offer.bidder == _msgSender(), "Not bidder");

        // send money back to top bidder
        _refundSecondaryBidder(offer.bidder, offer.offer);

        // delete offer
        delete tokenOffers[_tokenId];

        emit TokenBidWithdrawn(_tokenId, _msgSender());
    }

    function rejectTokenBid(uint256 _tokenId) public override nonReentrant {
        Offer storage offer = tokenOffers[_tokenId];
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
        Offer storage offer = tokenOffers[_tokenId];
        require(offer.bidder != address(0), "No open bid");
        require(offer.offer == _offerPrice, "Offer price has changed");

        address currentOwner = koda.ownerOf(_tokenId);
        require(currentOwner == _msgSender(), "Not current owner");

        facilitateSecondarySale(_tokenId, offer.offer, currentOwner, offer.bidder);

        // clear open offer
        delete tokenOffers[_tokenId];

        emit TokenBidAccepted(_tokenId, currentOwner, offer.bidder, offer.offer);
    }

    //////////////////////////////
    // Secondary sale "helpers" //
    //////////////////////////////

    /// sales and funds

    function facilitateSecondarySale(uint256 _tokenId, uint256 _paymentAmount, address _seller, address _buyer) internal {
        address originalCreator = koda.getCreatorOfToken(_tokenId);

        // split money
        handleSecondarySaleFunds(_seller, originalCreator, _paymentAmount);

        // N:B. open offers are left for the bidder to withdraw or the new token owner to reject

        // send token to buyer
        koda.safeTransferFrom(_seller, _buyer, _tokenId);
    }

    function handleSecondarySaleFunds(address _receiver, address _originalCreator, uint256 _paymentAmount) internal {

        // TODO could we save gas here by maintaining a counter for KO platform funds and having a drain method?

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

    /// Token accessors

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

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////

    ///////////////////////////
    // General Query Methods //
    ///////////////////////////

    // TODO

    /////////////////////
    // Setters Methods //
    /////////////////////

    // TODO


    /////////////////////
    // Admin Methods //
    /////////////////////

    function updateSecondaryRoyalty(uint256 _secondarySaleRoyalty) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller not admin");
        secondarySaleRoyalty = _secondarySaleRoyalty;
        emit AdminUpdateSecondaryRoyalty(_secondarySaleRoyalty);
    }

    function updatePlatformPrimarySaleCommission(uint256 _platformPrimarySaleCommission) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller not admin");
        platformPrimarySaleCommission = _platformPrimarySaleCommission;
        emit AdminUpdatePlatformPrimarySaleCommission(_platformPrimarySaleCommission);
    }

    function updatePlatformSecondarySaleCommission(uint256 _platformSecondarySaleCommission) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller not admin");
        platformSecondarySaleCommission = _platformSecondarySaleCommission;
        emit AdminUpdateSecondarySaleCommission(_platformSecondarySaleCommission);
    }

    function updateModulo(uint256 _modulo) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller not admin");
        modulo = _modulo;
        emit AdminUpdateModulo(_modulo);
    }

    function updateMinBidAmount(uint256 _minBidAmount) public {
        require(accessControls.hasAdminRole(_msgSender()), "KODA: Caller not admin");
        minBidAmount = _minBidAmount;
        emit AdminUpdateMinBidAmount(_minBidAmount);
    }
}
