// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

interface IBuyNowMarketplace {
    event ListedForBuyNow(uint256 indexed _id, uint256 _price, uint256 _startDate);
    event BuyNowPriceChanged(uint256 indexed _id, uint256 _price);
    event BuyNowDeListed(uint256 indexed _id);
    event BuyNowPurchased(uint256 indexed _tokenId, address indexed _buyer, uint256 _price);

    function listForBuyNow(address _creator, uint256 _id, uint128 _listingPrice, uint128 _startDate) external;

    function buyEditionToken(uint256 _id) external payable;

    function buyEditionTokenFor(uint256 _id, address _recipient) external payable;

    function setBuyNowPriceListing(uint256 _editionId, uint128 _listingPrice) external;
}

interface IEditionOffersMarketplace {
    event EditionAcceptingOffer(uint256 indexed _editionId, uint128 _startDate);
    event EditionBidPlaced(uint256 indexed _editionId, address indexed _bidder, uint256 _amount);
    event EditionBidWithdrawn(uint256 indexed _editionId, address indexed _bidder);
    event EditionBidAccepted(uint256 indexed _editionId, uint256 indexed _tokenId, address indexed _bidder, uint256 _amount);
    event EditionBidRejected(uint256 indexed _editionId, address indexed _bidder, uint256 _amount);
    event EditionConvertedFromOffersToBuyItNow(uint256 indexed _editionId, uint128 _price, uint128 _startDate);

    function enableEditionOffers(uint256 _editionId, uint128 _startDate) external;

    function placeEditionBid(uint256 _editionId) external payable;

    function withdrawEditionBid(uint256 _editionId) external;

    function rejectEditionBid(uint256 _editionId) external;

    function acceptEditionBid(uint256 _editionId, uint256 _offerPrice) external;

    function convertOffersToBuyItNow(uint256 _editionId, uint128 _listingPrice, uint128 _startDate) external;
}

interface IEditionSteppedMarketplace {
    event EditionSteppedSaleListed(uint256 indexed _editionId, uint128 _basePrice, uint128 _stepPrice, uint128 _startDate);
    event EditionSteppedSaleBuy(uint256 indexed _editionId, uint256 indexed _tokenId, address indexed _buyer, uint256 _price, uint16 _currentStep);
    event EditionSteppedAuctionUpdated(uint256 indexed _editionId, uint128 _basePrice, uint128 _stepPrice);

    function listSteppedEditionAuction(address _creator, uint256 _editionId, uint128 _basePrice, uint128 _stepPrice, uint128 _startDate) external;

    function buyNextStep(uint256 _editionId) external payable;

    function convertSteppedAuctionToListing(uint256 _editionId, uint128 _listingPrice) external;

    function updateSteppedAuction(uint256 _editionId, uint128 _basePrice, uint128 _stepPrice) external;
}

interface IReserveAuctionExit {
    function emergencyExitBidFromReserveAuction(uint256 _editionId) external;
}

interface IReserveAuctionMarketplace {
    event ListedForReserveAuction(uint256 indexed _id, uint256 _reservePrice, uint128 _startDate);
    event BidPlacedOnReserveAuction(uint256 indexed _id, address indexed _bidder, uint256 _amount);
    event ReserveAuctionResulted(uint256 indexed _id, uint256 _finalPrice, address indexed _winner, address indexed _resulter);
    event BidWithdrawnFromReserveAuction(uint256 _id, address indexed _bidder, uint128 _bid);
    event ReservePriceUpdated(uint256 indexed _id, uint256 _reservePrice);
    event ReserveAuctionConvertedToBuyItNow(uint256 indexed _id, uint128 _listingPrice, uint128 _startDate);
    event EmergencyBidWithdrawFromReserveAuction(uint256 indexed _id, address _bidder, uint128 _bid);

    function placeBidOnReserveAuction(uint256 _id) external payable;
    function listForReserveAuction(address _creator, uint256 _id, uint128 _reservePrice, uint128 _startDate) external;
    function resultReserveAuction(uint256 _id) external;
    function withdrawBidFromReserveAuction(uint256 _id) external;
    function updateReservePriceForReserveAuction(uint256 _id, uint128 _reservePrice) external;
}

interface IKODAV3PrimarySaleMarketplace is IEditionSteppedMarketplace, IEditionOffersMarketplace, IReserveAuctionExit {
    // combo
}

interface ITokenBuyNowMarketplace {
    event TokenDeListed(uint256 indexed _tokenId);

    function delistToken(uint256 _tokenId) external;
}

interface ITokenOffersMarketplace {
    event TokenBidPlaced(uint256 indexed _tokenId, address indexed _currentOwner, address indexed _bidder, uint256 _amount);
    event TokenBidAccepted(uint256 indexed _tokenId, address indexed _currentOwner, address indexed _bidder, uint256 _amount);
    event TokenBidRejected(uint256 indexed _tokenId, address indexed _currentOwner, address indexed _bidder, uint256 _amount);
    event TokenBidWithdrawn(uint256 indexed _tokenId, address indexed _bidder);

    function acceptTokenBid(uint256 _tokenId, uint256 _offerPrice) external;

    function rejectTokenBid(uint256 _tokenId) external;

    function withdrawTokenBid(uint256 _tokenId) external;

    function placeTokenBid(uint256 _tokenId) external payable;
}

interface IBuyNowSecondaryMarketplace {
    function listTokenForBuyNow(uint256 _tokenId, uint128 _listingPrice, uint128 _startDate) external;
}

interface IKODAV3SecondarySaleMarketplace is ITokenBuyNowMarketplace, ITokenOffersMarketplace, IReserveAuctionExit, IBuyNowSecondaryMarketplace {
    // combo
}
