// SPDX-License-Identifier: MIT

pragma solidity 0.7.4;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/GSN/Context.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "../core/storage/EditionRegistry.sol";
import "../access/KOAccessControls.sol";
import "../core/Konstants.sol";
import "../core/IKODAV3.sol";

import "hardhat/console.sol";

contract KODAV3Marketplace is ReentrancyGuard, Context {
    using SafeMath for uint256;

    // TODO handle changes / updates
    // Default KO commission of 15%
    uint256 public KO_COMMISSION_FEE = 1500;
    uint256 public modulo = 10000; // TODO increase accuracy

    // Minimum bid/list amount
    uint256 public minBidAmount = 0.01 ether;

    struct Offer {
        uint256 offer;
        address bidder;
    }

    struct Listing {
        uint256 price;
        address seller;
    }

    KOAccessControls public accessControls;
    IKODAV3 public koda;

    // Token ID to Offer mapping
    mapping(uint256 => Offer) public tokenOffers;

    // Edition ID to Offer mapping
    mapping(uint256 => Offer) public editionOffers;

    // Token ID to Listing
    mapping(uint256 => Listing) public tokenListings;

    // Edition ID to Listing
    mapping(uint256 => Listing) public editionListings;

    constructor(KOAccessControls _accessControls, IKODAV3 _koda) {
        accessControls = _accessControls;
        koda = _koda;
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

        // TODO event
    }

    function delistEdition(uint256 _editionId) public {
        require(editionListings[_editionId].seller == _msgSender(), "Caller not the lister");

        delete editionListings[_editionId];

        // TODO - do we send back any open offer?

        // TODO event
    }

    function buyEditionToken(uint256 _editionId) public payable nonReentrant {
        Listing storage listing = editionListings[_editionId];
        require(listing.seller != address(0), "No listing found");
        require(listing.price == msg.value, "List price not satisfied");

        // TODO refund any offers if this trade sells out primary sale edition?

        facilitateNextPrimarySale(_editionId, msg.value, _msgSender());

        // TODO record primary sale for token somewhere?

        // TODO event
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

        // TODO event
    }

    // TODO lock in period for 24hrs?
    function withdrawEditionBid(uint256 _editionId) public nonReentrant {
        Offer storage offer = editionOffers[_editionId];
        require(offer.bidder == _msgSender(), "Not bidder");

        // send money back to top bidder
        refundBidder(offer.bidder, offer.offer);

        // delete offer
        delete editionOffers[_editionId];

        // TODO event
    }

    function rejectEditionBid(uint256 _editionId) public nonReentrant {
        Offer storage offer = editionOffers[_editionId];
        require(offer.bidder != address(0), "No open bid");
        require(koda.getEditionCreator(_editionId) == _msgSender(), "Not creator");

        // send money back to top bidder
        refundBidder(offer.bidder, offer.offer);

        // delete offer
        delete editionOffers[_editionId];

        // TODO event
    }

    function acceptEditionBid(uint256 _editionId, uint256 _offerPrice) public nonReentrant {
        Offer storage offer = editionOffers[_editionId];
        require(offer.bidder != address(0), "No open bid");
        require(offer.offer == _offerPrice, "Offer price has changed");

        require(koda.getEditionCreator(_editionId) == _msgSender(), "Not creator");

        facilitateNextPrimarySale(_editionId, offer.offer, offer.bidder);

        // clear open offer
        delete editionOffers[_editionId];

        // TODO event
    }

    //////////////////////////
    // primary sale helpers //
    //////////////////////////

    function facilitateNextPrimarySale(uint256 _editionId, uint256 _paymentAmount, address _buyer) internal {
        // get next token to sell along with the royalties recipient and the original creator
        (address receiver, address creator, uint256 tokenId) = koda.facilitateNextPrimarySale(_editionId);

        // split money
        handleEditionSaleFunds(receiver, _paymentAmount);

        // send token to buyer (assumes approval has been made, if not then this will fail)
        koda.safeTransferFrom(creator, _buyer, tokenId);
    }

    function handleEditionSaleFunds(address _receiver, uint256 _paymentAmount) internal {
        (bool success,) = _receiver.call{value : _paymentAmount}("");
        require(success, "Edition sale payment failed");
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

        // TODO event
    }

    function delistToken(uint256 _tokenId) public {
        // check listing found
        require(tokenListings[_tokenId].seller != address(0), "No listing found");

        // check owner is caller
        require(koda.ownerOf(_tokenId) == _msgSender(), "Not token owner");

        // remove the listing
        delete tokenListings[_tokenId];

        // TODO event
    }

    function buyToken(uint256 _tokenId) public payable nonReentrant {
        Listing storage listing = tokenListings[_tokenId];

        // check listing found
        require(listing.seller != address(0), "No listing found");

        // check payment
        require(tokenListings[_tokenId].price == msg.value, "Not enough money");

        // check current owner is the lister as it may have changed hands
        address currentOwner = koda.ownerOf(_tokenId);
        require(listing.seller == currentOwner, "Listing not valid, token owner has changed");

        // TODO refund any open offers?

        // trade the token
        facilitateTokenSale(_tokenId, msg.value, currentOwner, _msgSender());

        // remove the listing
        delete tokenListings[_tokenId];

        // TODO event
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

        // TODO event
    }

    function withdrawTokenBid(uint256 _tokenId) public nonReentrant {
        Offer storage offer = tokenOffers[_tokenId];
        require(offer.bidder == _msgSender(), "Not bidder");

        // send money back to top bidder
        refundTokenBidder(offer.bidder, offer.offer);

        // delete offer
        delete tokenOffers[_tokenId];

        // TODO event
    }

    function rejectTokenBid(uint256 _tokenId) public {
        Offer storage offer = tokenOffers[_tokenId];
        require(offer.bidder != address(0), "No open bid");
        require(koda.ownerOf(_tokenId) == _msgSender(), "Not current owner");

        // send money back to top bidder
        refundTokenBidder(offer.bidder, offer.offer);

        // delete offer
        delete tokenOffers[_tokenId];

        // TODO event
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

        // TODO event
    }

    //////////////////////////////
    // Secondary sale 'helpers' //
    //////////////////////////////

    function facilitateTokenSale(uint256 _tokenId, uint256 _paymentAmount, address _seller, address _buyer) internal {
        // split money
        handleTokenSaleFunds(_seller, _paymentAmount);

        // send token to buyer
        koda.safeTransferFrom(_seller, _buyer, _tokenId);
    }

    function handleTokenSaleFunds(address _receiver, uint256 _paymentAmount) internal {
        (bool success,) = _receiver.call{value : _paymentAmount}("");
        require(success, "Token sale payment failed");
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
