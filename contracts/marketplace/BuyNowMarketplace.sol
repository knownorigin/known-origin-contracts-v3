// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import {BaseMarketplace} from "./BaseMarketplace.sol";
import {IBuyNowMarketplace} from "./IKODAV3Marketplace.sol";

// "buy now" sale flow
abstract contract BuyNowMarketplace is IBuyNowMarketplace, BaseMarketplace {
    // Buy now listing definition
    struct Listing {
        uint128 price;
        uint128 startDate;
        address seller;
    }

    /// @notice Edition or Token ID to Listing
    mapping(uint256 => Listing) public editionOrTokenListings;

    // list edition with "buy now" price and start date
    function listForBuyNow(address _seller, uint256 _id, uint128 _listingPrice, uint128 _startDate)
    public
    override
    whenNotPaused {
        require(
            accessControls.hasContractRole(_msgSender()) || koda.ownerOf(_id) == _msgSender(),
            "Only owner or contract"
        );
        require(editionOrTokenListings[_id].seller == address(0), "Already listed");
        require(_listingPrice >= minBidAmount, "Listing price not enough");

        // Store listing data
        editionOrTokenListings[_id] = Listing(_listingPrice, _startDate, _seller);

        emit ListedForBuyNow(_id, _listingPrice, _startDate);
    }

    // Buy an token from the edition on the primary market
    function buyEditionToken(uint256 _id)
    public
    override
    payable
    whenNotPaused
    nonReentrant {
        _facilitateBuyNow(_id, _msgSender());
    }

    // Buy an token from the edition on the primary market, ability to define the recipient
    function buyEditionTokenFor(uint256 _id, address _recipient)
    public
    override
    payable
    whenNotPaused
    nonReentrant {
        _facilitateBuyNow(_id, _recipient);
    }

    function getListing(uint256 _id)
    public
    view
    returns (address _seller, uint128 _listingPrice, uint128 _startDate) {
        Listing storage listing = editionOrTokenListings[_id];
        return (
            listing.seller, // original seller
            listing.price,
            listing.startDate
        );
    }

    function getListingSeller(uint256 _id) public view returns (address _seller) {
        return editionOrTokenListings[_id].seller;
    }

    function getListingPrice(uint256 _id) public view returns (uint128 _listingPrice) {
        return uint128(editionOrTokenListings[_id].price);
    }

    function getListingDate(uint256 _id) public view returns (uint128 _startDate) {
        return uint128(editionOrTokenListings[_id].startDate);
    }

    // update the "buy now" price
    function _setBuyNowPriceListing(uint256 _id, uint128 _listingPrice) internal {
        require(
            editionOrTokenListings[_id].seller == _msgSender() || accessControls.hasContractRole(_msgSender()),
            "Only seller or contract"
        );

        // Set price
        editionOrTokenListings[_id].price = _listingPrice;

        // Emit event
        emit BuyNowPriceChanged(_id, _listingPrice);
    }

    function _facilitateBuyNow(uint256 _id, address _recipient) internal {
        Listing storage listing = editionOrTokenListings[_id];
        require(address(0) != listing.seller, "No listing found");
        require(msg.value >= listing.price, "List price not satisfied");
        require(block.timestamp >= listing.startDate, "List not available yet");

        uint256 tokenId = _processSale(_id, msg.value, _recipient, listing.seller, false);

        emit BuyNowPurchased(tokenId, _recipient, msg.value);
    }
}