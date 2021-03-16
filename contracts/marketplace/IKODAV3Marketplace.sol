// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

// TODO populate with all required methods for the marketplace

interface IEditionBuyNowMarketplace {

    event EditionListed(uint256 indexed _editionId, uint256 _price, uint256 _startDate);
    event EditionDeListed(uint256 indexed _editionId);
    event EditionPurchased(uint256 indexed _editionId, uint256 indexed _tokenId, address indexed _buyer, uint256 _price);

    function listEdition(address _creator, uint256 _editionId, uint128 _listingPrice, uint128 _startDate) external;

    function delistEdition(uint256 _editionId) external;

    function buyEditionToken(uint256 _editionId) external payable;

}

interface IEditionOffersMarketplace {

    event EditionBidPlaced(uint256 indexed _editionId, address indexed _bidder, uint256 _amount);
    event EditionBidWithdrawn(uint256 indexed _editionId, address indexed _bidder);
    event EditionBidAccepted(uint256 indexed _editionId, uint256 indexed _tokenId, address indexed _bidder, uint256 _amount);
    event EditionBidRejected(uint256 indexed _editionId, address indexed _bidder, uint256 _amount);

    function enableEditionOffers(address _creator, uint256 _editionId, uint128 _startDate) external;

    function placeEditionBid(uint256 _editionId) external payable;

    function withdrawEditionBid(uint256 _editionId) external;

    function rejectEditionBid(uint256 _editionId) external;

    function acceptEditionBid(uint256 _editionId, uint256 _offerPrice) external;
}

interface IEditionSteppedMarketplace {

    event EditionSteppedSaleListed(uint256 indexed _editionId, uint128 _basePrice, uint128 _stepPrice, uint128 _startDate);
    event EditionSteppedSaleBuy(uint256 indexed _editionId, uint256 indexed _tokenId, address indexed _buyer, uint256 _price, uint16 _currentStep);

    function listSteppedEditionAuction(address _creator, uint256 _editionId, uint128 _basePrice, uint128 _stepPrice, uint128 _startDate) external;

    function buyNextStep(uint256 _editionId) external payable;

    function convertSteppedAuctionToListing(uint256 _editionId, uint128 _listingPrice) external;

}


interface IKODAV3PrimarySaleMarketplace is IEditionBuyNowMarketplace, IEditionSteppedMarketplace, IEditionOffersMarketplace {
    // combo
}


interface IKODAV3SecondarySaleMarketplace is IEditionBuyNowMarketplace, IEditionSteppedMarketplace, IEditionOffersMarketplace {

    // token buy now
    event TokenListed(uint256 indexed _tokenId, address indexed _seller, uint256 _price);
    event TokenDeListed(uint256 indexed _tokenId);
    event TokenPurchased(uint256 indexed _tokenId, address indexed _buyer, address indexed _seller, uint256 _price);

    function acceptTokenBid(uint256 _tokenId, uint256 _offerPrice) external;

    function rejectTokenBid(uint256 _tokenId) external;

    function withdrawTokenBid(uint256 _tokenId) external;

    function placeTokenBid(uint256 _tokenId) external payable;

    // token offers
    event TokenBidPlaced(uint256 indexed _tokenId, address indexed _currentOwner, address indexed _bidder, uint256 _amount);
    event TokenBidAccepted(uint256 indexed _tokenId, address indexed _currentOwner, address indexed _bidder, uint256 _amount);
    event TokenBidRejected(uint256 indexed _tokenId, address indexed _currentOwner, address indexed _bidder, uint256 _amount);
    event TokenBidWithdrawn(uint256 indexed _tokenId, address indexed _bidder);

    function listToken(uint256 _tokenId, uint128 _listingPrice, uint128 _startDate) external;

    function delistToken(uint256 _tokenId) external;

    function buyToken(uint256 _tokenId) external payable;
}
