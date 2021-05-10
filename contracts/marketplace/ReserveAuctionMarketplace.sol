// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../core/IKODAV3.sol";

import {BaseMarketplace} from "./BaseMarketplace.sol";

interface IReserveAuctionMarketplace {
    event ListedForReserveAuction(uint256 indexed _id, uint256 _reservePrice, uint128 _startDate);
    event BidPlacedOnReserveAuction(uint256 indexed _id, address indexed _bidder, uint256 _amount);
    event ReserveAuctionResulted(uint256 indexed _id, uint256 _finalPrice, address indexed _winner, address indexed _resulter);
    event BidWithdrawnFromReserveAuction(uint256 _id, address indexed _bidder, uint128 _bid);
    event ReservePriceUpdated(uint256 indexed _id, uint256 _reservePrice);
    event ReserveAuctionConvertedToBuyItNow(uint256 indexed _id, uint128 _listingPrice, uint128 _startDate);

    function placeBidOnReserveAuction(uint256 _id) external payable;
    function listForReserveAuction(address _creator, uint256 _id, uint128 _reservePrice, uint128 _startDate) external;
    function resultReserveAuction(uint256 _id) external;
    function withdrawBidFromReserveAuction(uint256 _id) external;
    function updateReservePriceForReserveAuction(uint256 _id, uint128 _reservePrice) external;
    function convertReserveAuctionToBuyItNow(uint256 _id, uint128 _listingPrice, uint128 _startDate) external;
}

contract ReserveAuctionMarketplace is BaseMarketplace, IReserveAuctionMarketplace {
    event AdminUpdateReserveAuctionBidExtensionWindow(uint128 _reserveAuctionBidExtensionWindow);
    event AdminUpdateReserveAuctionLengthOnceReserveMet(uint128 _reserveAuctionLengthOnceReserveMet);

    // Reserve auction definition
    struct ReserveAuction {
        address seller;
        address bidder;
        uint128 reservePrice;
        uint128 bid;
        uint128 startDate;
        uint128 biddingEnd;
    }

    /// @notice 1 of 1 edition ID to reserve auction definition
    mapping(uint256 => ReserveAuction) public editionOrTokenWithReserveAuctions;

    /// @notice A reserve auction will be extended by this amount of time if a bid is received near the end
    uint128 public reserveAuctionBidExtensionWindow = 15 minutes;

    /// @notice Length that bidding window remains open once the reserve price for an auction has been met
    uint128 public reserveAuctionLengthOnceReserveMet = 24 hours;

    constructor(IKOAccessControlsLookup _accessControls, IKODAV3 _koda, address _platformAccount)
    BaseMarketplace(_accessControls, _koda, _platformAccount) {}

    function listForReserveAuction(
        address _creator,
        uint256 _id,
        uint128 _reservePrice,
        uint128 _startDate
    ) public
    override
    whenNotPaused
    onlyContract {
        require(editionOrTokenWithReserveAuctions[_id].reservePrice == 0, "Auction already in flight");
        require(koda.getSizeOfEdition(_id) == 1, "Only 1 of 1 editions are supported");
        require(_reservePrice >= minBidAmount, "Reserve price must be at least min bid");

        editionOrTokenWithReserveAuctions[_id] = ReserveAuction({
            seller: _creator,
            bidder: address(0),
            reservePrice: _reservePrice,
            startDate: _startDate,
            biddingEnd: 0,
            bid: 0
        });

        emit ListedForReserveAuction(_id, _reservePrice, _startDate);
    }

    function placeBidOnReserveAuction(uint256 _id)
    public
    override
    payable
    whenNotPaused
    nonReentrant {
        ReserveAuction storage reserveAuction = editionOrTokenWithReserveAuctions[_id];
        require(reserveAuction.reservePrice > 0, "Edition not set up for reserve auction");
        require(block.timestamp >= reserveAuction.startDate, "Edition not accepting bids yet");
        require(msg.value >= reserveAuction.bid + minBidAmount, "You have not exceeded previous bid by min bid amount");

        // if a bid has been placed, then we will have a bidding end timestamp and we need to ensure no one
        // can bid beyond this
        if (reserveAuction.biddingEnd > 0) {
            require(block.timestamp < reserveAuction.biddingEnd, "Edition is no longer accepting bids");
        }

        // If the reserve has been met, then bidding will end in 24 hours
        // if we are near the end, we have bids, then extend the bidding end
        if (reserveAuction.bid + msg.value >= reserveAuction.reservePrice && reserveAuction.biddingEnd == 0) {
            reserveAuction.biddingEnd = uint128(block.timestamp) + reserveAuctionLengthOnceReserveMet;
        } else if (reserveAuction.biddingEnd > 0) {
            uint128 secondsUntilBiddingEnd = reserveAuction.biddingEnd - uint128(block.timestamp);
            if (secondsUntilBiddingEnd <= reserveAuctionBidExtensionWindow) {
                reserveAuction.biddingEnd = reserveAuction.biddingEnd + reserveAuctionBidExtensionWindow;
            }
        }

        // if someone else has previously bid, there is a bid we need to refund
        if (reserveAuction.bid > 0) {
            _refundBidder(reserveAuction.bidder, reserveAuction.bid);
        }

        reserveAuction.bid = uint128(msg.value);
        reserveAuction.bidder = _msgSender();

        emit BidPlacedOnReserveAuction(_id, _msgSender(), msg.value);
    }

    function resultReserveAuction(uint256 _id)
    public
    override
    whenNotPaused
    nonReentrant {
        ReserveAuction storage reserveAuction = editionOrTokenWithReserveAuctions[_id];

        require(reserveAuction.reservePrice > 0, "No active auction");
        require(reserveAuction.bid > 0, "No bids received");
        require(reserveAuction.bid >= reserveAuction.reservePrice, "Reserve not met");
        require(block.timestamp > reserveAuction.biddingEnd, "Bidding has not yet ended");
        require(
            reserveAuction.bidder == _msgSender() ||
            reserveAuction.seller == _msgSender() ||
            accessControls.hasContractOrAdminRole(_msgSender()),
            "Only winner, seller, contract or admin can result"
        );

        address winner = reserveAuction.bidder;
        uint256 winningBid = reserveAuction.bid;
        delete editionWithReserveAuctions[_id];

        facilitateNextPrimarySale(_id, winningBid, winner, false);

        emit ReserveAuctionResulted(_id, winningBid, winner, _msgSender());
    }

    function updateReserveAuctionBidExtensionWindow(uint128 _reserveAuctionBidExtensionWindow) onlyAdmin public {
        reserveAuctionBidExtensionWindow = _reserveAuctionBidExtensionWindow;
        emit AdminUpdateReserveAuctionBidExtensionWindow(_reserveAuctionBidExtensionWindow);
    }

    function updateReserveAuctionLengthOnceReserveMet(uint128 _reserveAuctionLengthOnceReserveMet) onlyAdmin public {
        reserveAuctionLengthOnceReserveMet = _reserveAuctionLengthOnceReserveMet;
        emit AdminUpdateReserveAuctionLengthOnceReserveMet(_reserveAuctionLengthOnceReserveMet);
    }
}
