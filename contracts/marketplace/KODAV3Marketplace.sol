// SPDX-License-Identifier: MIT

pragma solidity 0.7.4;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "../core/storage/EditionRegistry.sol";
import "../access/KOAccessControls.sol";
import "../core/KODAV3Core.sol";
import "../core/IKODAV3.sol";

import "hardhat/console.sol";

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
    event EditionListed(uint256 indexed _editionId, uint256 _price);
    event EditionDeListed(uint256 indexed _editionId);
    event EditionPurchased(uint256 indexed _editionId, uint256 indexed _tokenId, address indexed _buyer, uint256 _price);

    // edition offers
    event EditionBidPlaced(uint256 indexed _editionId, address indexed _bidder, uint256 _amount);
    event EditionBidWithdrawn(uint256 indexed _editionId, address indexed _bidder);
    event EditionBidAccepted(uint256 indexed _editionId, uint256 indexed _tokenId, address indexed _buyer, uint256 _amount);
    event EditionBidRejected(uint256 indexed _editionId, address indexed _bidder, uint256 _amount);

    struct Offer {
        uint256 offer;
        address bidder;
    }

    struct Listing {
        uint256 price;
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

    constructor(KOAccessControls _accessControls, IKODAV3 _koda, address _platformAccount) KODAV3Core(_accessControls) {
        koda = _koda;
        platformAccount = _platformAccount;
    }

    // should work for primary and secondary
    // should handle payment splits differently for primary and secondary
    // should support
    //      - buy now price for edition (primary)
    //      - buy now price for token (secondary)
    //      - offers for editions (primary)
    //      - offers for token (secondary)

    /////////////////////////////////
    // Primary 'buy now' sale flow //
    /////////////////////////////////

    // assumes frontend protects against from these things from being called when:
    //  - they dont need to be e.g. listing an edition when its sold out
    //  - they cannot be done e.g. accepting an offer when the edition is sold out

    function listEdition(uint256 _editionId, uint256 _listingPrice) public {
        require(_listingPrice >= minBidAmount, "Listing price not enough");
        address creator = koda.getEditionCreator(_editionId);
        require(creator == _msgSender(), "Not creator");

        editionListings[_editionId] = Listing(_listingPrice, creator);

        emit EditionListed(_editionId, _listingPrice);
    }

    function delistEdition(uint256 _editionId) public {
        require(editionListings[_editionId].seller == _msgSender(), "Caller not the lister");

        delete editionListings[_editionId];

        // TODO - do we send back any open offer?

        emit EditionDeListed(_editionId);
    }

    function buyEditionToken(uint256 _editionId) public payable nonReentrant {
        Listing storage listing = editionListings[_editionId];
        require(listing.seller != address(0), "No listing found");
        require(listing.price == msg.value, "List price not satisfied"); // FIXME use >= ?

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
        require(koda.getEditionCreator(_editionId) == _msgSender(), "Not creator");

        // send money back to top bidder
        refundBidder(offer.bidder, offer.offer);

        // delete offer
        delete editionOffers[_editionId];

        emit EditionBidRejected(_editionId, _msgSender(), offer.offer);
    }

    // FIXME nice work - covers the "problem"
    function acceptEditionBid(uint256 _editionId, uint256 _offerPrice) public nonReentrant {
        Offer storage offer = editionOffers[_editionId];
        require(offer.bidder != address(0), "No open bid");
        require(offer.offer == _offerPrice, "Offer price has changed");
        require(koda.getEditionCreator(_editionId) == _msgSender(), "Not creator");

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

        // if we about to sellout - send any open offers back to the bidder
        if (tokenId == koda.maxEditionTokenId(_editionId)) {

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
        require(listing.price == msg.value, "Not enough money");

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

    function rejectTokenBid(uint256 _tokenId) public {
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
        address originalCreator = koda.getEditionCreatorOfToken(_tokenId);

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

    // TODO

    /////////////////////
    // Setters Methods //
    /////////////////////

    // TODO
}
