// SPDX-License-Identifier: MIT

pragma solidity 0.7.4;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "../access/KOAccessControls.sol";
import "../core/KODAV3Core.sol";
import "../core/IKODAV3.sol";

import "hardhat/console.sol";

// TODO CREATE2 to generate vanity deployment address
//  - https://blog.cotten.io/ethereums-eip-1014-create-2-d17b1a184498
//  - https://ethgasstation.info/blog/what-is-create2/

contract KODAV3Marketplace is KODAV3Core, ReentrancyGuard {
    using SafeMath for uint256;

    // token buy now
    event TokenListed(uint256 indexed _tokenId, address indexed _seller, uint256 _price);
    event TokenDeListed(uint256 indexed _tokenId);
    event TokenPurchased(uint256 indexed _tokenId, address indexed _buyer, address indexed _seller, uint256 _price);

    // token offers
    // FIXME is it a bid or an offer?
    event TokenBidPlaced(uint256 indexed _tokenId, address indexed _currentOwner, address indexed _bidder, uint256 _amount);
    event TokenBidAccepted(uint256 indexed _tokenId, address indexed _currentOwner, address indexed _bidder, uint256 _amount);
    event TokenBidRejected(uint256 indexed _tokenId, address indexed _currentOwner, address indexed _bidder, uint256 _amount);
    event TokenBidWithdrawn(uint256 indexed _tokenId, address indexed _bidder);

    // edition buy now
    event EditionListed(uint256 indexed _editionId, uint256 _price, uint256 _startDate);
    event EditionDeListed(uint256 indexed _editionId);
    event EditionPurchased(uint256 indexed _editionId, uint256 indexed _tokenId, address indexed _buyer, uint256 _price);

    // edition offers
    event EditionBidPlaced(uint256 indexed _editionId, address indexed _bidder, uint256 _amount);
    event EditionBidWithdrawn(uint256 indexed _editionId, address indexed _bidder);
    event EditionBidAccepted(uint256 indexed _editionId, uint256 indexed _tokenId, address indexed _buyer, uint256 _amount);
    event EditionBidRejected(uint256 indexed _editionId, address indexed _bidder, uint256 _amount);

    // TODO 24hr countdown timer
    // TODO admin functions for fixing issues/draining tokens & ETH

    struct Offer {
        uint256 offer;
        address bidder;
    }

    struct Listing {
        uint256 listingConfig; // uint128(price)|uint128(startDate)
        address seller;
    }

    // Token ID to Offer mapping
    mapping(uint256 => Offer) public tokenOffers;

    // Edition ID to Offer mapping
    mapping(uint256 => Offer) public editionOffers;

    // Token ID to Listing
    mapping(uint256 => Listing) public tokenListings;

    // Edition ID to Listing
    mapping(uint256 => Listing) public editionListings;

    // KODA token
    IKODAV3 public koda;

    // platform funds collector
    address public platformAccount;

    constructor(IKOAccessControlsLookup _accessControls, IKODAV3 _koda, address _platformAccount) KODAV3Core(_accessControls) {
        koda = _koda;
        platformAccount = _platformAccount;
    }

    // Buy now
    //  - set price and optional start date
    //  - cannot be in order sales modes ?
    //  - edition (primary)
    //  - token (secondary)

    // Offers
    // - optional start date
    // - off-chain reserve price for signalling only
    // - editions (primary)
    // - token (secondary)

    // Stepped auctions
    //  - optional start date
    //  - base price and step
    //  - cannot be changed once triggered
    //  - edition (primary)
    //  - token (secondary)

    /////////////////////////////////
    // Primary 'buy now' sale flow //
    /////////////////////////////////

    // assumes frontend protects against from these things from being called when:
    //  - they dont need to be e.g. listing an edition when its sold out
    //  - they cannot be done e.g. accepting an offer when the edition is sold out
    //  - approvals go astray/removed - approvals may need to be mapped in subgraph

    // TODO expose both contract & minter listing access protected methods - contract takes in creator, minter assumes creator and needs to check KODA for edition creator

    function listEdition(address _creator, uint256 _editionId, uint256 _listingPrice, uint256 _startDate) public {
        require(accessControls.hasContractRole(_msgSender()), "KODA: Caller must have contract role");
        require(_listingPrice >= minBidAmount, "Listing price not enough");

        // TODO add lots of tests about scaling up and down to store these things

        // 32 bytes / 2 = 16 bytes = 16 * 8 = 128 | uint256(uint128(price),uint128(date))
        uint256 listingConfig = uint256(_listingPrice);
        listingConfig |= _startDate << 128;

        // Store listing data
        editionListings[_editionId] = Listing(listingConfig, _creator);

        emit EditionListed(_editionId, _listingPrice, _startDate);
    }

    function delistEdition(uint256 _editionId) public {
        require(editionListings[_editionId].seller == _msgSender(), "Caller not the lister");

        delete editionListings[_editionId];

        // TODO - do we send back any open offer?

        emit EditionDeListed(_editionId);
    }

    function buyEditionToken(uint256 _editionId) public payable nonReentrant {
        (address _seller, uint128 _listingPrice, uint128 _startDate) = _getEditionListing(_editionId);
        require(address(0) != _seller, "No listing found");
        require(msg.value >= _listingPrice, "List price not satisfied");
        require(block.timestamp >= _startDate, "List not available yet");

        uint256 tokenId = facilitateNextPrimarySale(_editionId, msg.value, _msgSender());

        emit EditionPurchased(_editionId, tokenId, _msgSender(), msg.value);
    }

    ////////////////////////////////
    // Primary 'offers' sale flow //
    ////////////////////////////////

    function placeEditionBid(uint256 _editionId) public payable nonReentrant {
        Offer storage offer = editionOffers[_editionId];
        require(offer.offer.add(minBidAmount) >= msg.value, "Bid not high enough");

        // No contracts can bid to prevent money lockups on reverts
        require(!Address.isContract(_msgSender()), "Cannot offer as a contract");

        // send money back to top bidder if existing offer found
        if (offer.offer > 0) {
            refundBidder(offer.bidder, offer.offer);
        }

        // setup offer
        editionOffers[_editionId] = Offer(msg.value, _msgSender());

        emit EditionBidPlaced(_editionId, _msgSender(), msg.value);
    }

    // TODO lock in period for 24hrs?
    function withdrawEditionBid(uint256 _editionId) public nonReentrant {
        Offer storage offer = editionOffers[_editionId];
        require(offer.bidder == _msgSender(), "Not bidder");

        // send money back to top bidder
        refundBidder(offer.bidder, offer.offer);

        // delete offer
        delete editionOffers[_editionId];

        emit EditionBidWithdrawn(_editionId, _msgSender());
    }

    function rejectEditionBid(uint256 _editionId) public nonReentrant {
        Offer storage offer = editionOffers[_editionId];
        require(offer.bidder != address(0), "No open bid");
        require(koda.getCreatorOfEdition(_editionId) == _msgSender(), "Not creator");

        // send money back to top bidder
        refundBidder(offer.bidder, offer.offer);

        // delete offer
        delete editionOffers[_editionId];

        emit EditionBidRejected(_editionId, _msgSender(), offer.offer);
    }

    function acceptEditionBid(uint256 _editionId, uint256 _offerPrice) public nonReentrant {
        Offer storage offer = editionOffers[_editionId];
        require(offer.bidder != address(0), "No open bid");
        require(offer.offer == _offerPrice, "Offer price has changed");
        require(koda.getCreatorOfEdition(_editionId) == _msgSender(), "Not creator");

        uint256 tokenId = facilitateNextPrimarySale(_editionId, offer.offer, offer.bidder);

        // clear open offer
        delete editionOffers[_editionId];

        emit EditionBidAccepted(_editionId, tokenId, offer.bidder, offer.offer);
    }

    //////////////////////////
    // primary sale helpers //
    //////////////////////////

    function facilitateNextPrimarySale(uint256 _editionId, uint256 _paymentAmount, address _buyer) internal returns (uint256) {
        // get next token to sell along with the royalties recipient and the original creator
        (address receiver, address creator, uint256 tokenId) = koda.facilitateNextPrimarySale(_editionId);

        // console.log("receiver %s | creator %s | tokenId %s", receiver, creator, tokenId);

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
                refundBidder(offer.bidder, offer.offer);
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

    function refundBidder(address _receiver, uint256 _paymentAmount) internal {
        (bool success,) = _receiver.call{value : _paymentAmount}("");
        require(success, "Edition offer refund failed");
    }

    function getEditionListing(uint256 _editionId) public view returns (address _seller, uint128 _listingPrice, uint128 _startDate) {
        return _getEditionListing(_editionId);
    }

    function _getEditionListing(uint256 _editionId) internal view returns (address _seller, uint128 _listingPrice, uint128 _startDate) {
        Listing storage listing = editionListings[_editionId];
        return (
        listing.seller, // original seller
        uint128(listing.listingConfig), // price
        uint128(listing.listingConfig >> 128) // date
        );
    }

    function getEditionListingSeller(uint256 _editionId) public view returns (address _seller) {
        return editionListings[_editionId].seller;
    }

    function getEditionListingPrice(uint256 _editionId) public view returns (uint128 _listingPrice) {
        return uint128(editionListings[_editionId].listingConfig);
    }

    function getEditionListingDate(uint256 _editionId) public view returns (uint128 _startDate) {
        return uint128(editionListings[_editionId].listingConfig >> 128);
    }

    ///////////////////////////////////
    // Secondary sale 'buy now' flow //
    ///////////////////////////////////

    function listToken(uint256 _tokenId, uint256 _listingPrice) public {
        // Check ownership before listing
        require(koda.ownerOf(_tokenId) == _msgSender(), "Not token owner");

        // No contracts can list to prevent money lockups on transfer
        require(!Address.isContract(_msgSender()), "Cannot list as a contract");

        // Check price over min bid
        require(_listingPrice >= minBidAmount, "Listing price not enough");

        // List the token
        tokenListings[_tokenId] = Listing(_listingPrice, _msgSender());

        emit TokenListed(_tokenId, _msgSender(), _listingPrice);
    }

    function delistToken(uint256 _tokenId) public {
        // check listing found
        require(tokenListings[_tokenId].seller != address(0), "No listing found");

        // check owner is caller
        require(koda.ownerOf(_tokenId) == _msgSender(), "Not token owner");

        // remove the listing
        delete tokenListings[_tokenId];

        emit TokenDeListed(_tokenId);
    }

    function buyToken(uint256 _tokenId) public payable nonReentrant {
        Listing storage listing = tokenListings[_tokenId];

        // check listing found
        require(listing.seller != address(0), "No listing found");

        // check payment
        require(listing.listingConfig == msg.value, "Not enough money");

        // check current owner is the lister as it may have changed hands
        address currentOwner = koda.ownerOf(_tokenId);
        require(listing.seller == currentOwner, "Listing not valid, token owner has changed");

        // trade the token
        facilitateTokenSale(_tokenId, msg.value, currentOwner, _msgSender());

        // remove the listing
        delete tokenListings[_tokenId];

        emit TokenPurchased(_tokenId, _msgSender(), currentOwner, msg.value);
    }

    /////////////////////////////////
    // Secondary sale 'offer' flow //
    /////////////////////////////////

    function placeTokenBid(uint256 _tokenId) public payable nonReentrant {
        Offer storage offer = tokenOffers[_tokenId];
        require(offer.offer.add(minBidAmount) >= msg.value, "Bid not high enough");

        // No contracts can place a bid to prevent money lockups on refunds
        require(!Address.isContract(_msgSender()), "Cannot make an offer as a contract");

        // send money back to top bidder if existing offer found
        if (offer.offer > 0) {
            refundTokenBidder(offer.bidder, offer.offer);
        }

        // setup offer
        tokenOffers[_tokenId] = Offer(msg.value, _msgSender());

        emit TokenBidPlaced(_tokenId, koda.ownerOf(_tokenId), _msgSender(), msg.value);
    }

    function withdrawTokenBid(uint256 _tokenId) public nonReentrant {
        Offer storage offer = tokenOffers[_tokenId];
        require(offer.bidder == _msgSender(), "Not bidder");

        // send money back to top bidder
        refundTokenBidder(offer.bidder, offer.offer);

        // delete offer
        delete tokenOffers[_tokenId];

        emit TokenBidWithdrawn(_tokenId, _msgSender());
    }

    function rejectTokenBid(uint256 _tokenId) public nonReentrant {
        Offer storage offer = tokenOffers[_tokenId];
        require(offer.bidder != address(0), "No open bid");

        address currentOwner = koda.ownerOf(_tokenId);
        require(currentOwner == _msgSender(), "Not current owner");

        // send money back to top bidder
        refundTokenBidder(offer.bidder, offer.offer);

        // delete offer
        delete tokenOffers[_tokenId];

        emit TokenBidRejected(_tokenId, currentOwner, offer.bidder, offer.offer);
    }

    function acceptTokenBid(uint256 _tokenId, uint256 _offerPrice) public nonReentrant {
        Offer storage offer = tokenOffers[_tokenId];
        require(offer.bidder != address(0), "No open bid");
        require(offer.offer == _offerPrice, "Offer price has changed");

        address currentOwner = koda.ownerOf(_tokenId);
        require(currentOwner == _msgSender(), "Not current owner");

        facilitateTokenSale(_tokenId, offer.offer, currentOwner, offer.bidder);

        // clear open offer
        delete tokenOffers[_tokenId];

        emit TokenBidAccepted(_tokenId, currentOwner, offer.bidder, offer.offer);
    }

    //////////////////////////////
    // Secondary sale 'helpers' //
    //////////////////////////////

    function facilitateTokenSale(uint256 _tokenId, uint256 _paymentAmount, address _seller, address _buyer) internal {
        address originalCreator = koda.getCreatorOfToken(_tokenId);

        // split money
        handleTokenSaleFunds(_seller, originalCreator, _paymentAmount);

        // N:B. open offers are left for the bidder to withdraw or the new token owner to reject

        // send token to buyer
        koda.safeTransferFrom(_seller, _buyer, _tokenId);
    }

    function handleTokenSaleFunds(address _receiver, address _originalCreator, uint256 _paymentAmount) internal {

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

    function refundTokenBidder(address _receiver, uint256 _paymentAmount) internal {
        (bool success,) = _receiver.call{value : _paymentAmount}("");
        require(success, "Token offer refund failed");
    }

    ///////////////////
    // Query Methods //
    ///////////////////

    /////////////////////
    // Setters Methods //
    /////////////////////

    // TODO
}
