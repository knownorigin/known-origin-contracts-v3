// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import {IKOAccessControlsLookup} from "../access/IKOAccessControlsLookup.sol";
import {IKODAV3} from "../core/IKODAV3.sol";

import {BaseMarketplace} from "./BaseMarketplace.sol";
import {IReserveAuctionMarketplace} from "./IKODAV3Marketplace.sol";

abstract contract ReserveAuctionMarketplace is IReserveAuctionMarketplace, BaseMarketplace {
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

    function listForReserveAuction(
        address _creator,
        uint256 _id,
        uint128 _reservePrice,
        uint128 _startDate
    ) public
    override
    whenNotPaused
    onlyContract { // todo only contract or owner like buy now marketplace
        require(editionOrTokenWithReserveAuctions[_id].reservePrice == 0, "Auction already in flight");
        require(koda.getSizeOfEdition(_id) == 1, "Only 1 of 1 editions are supported"); // todo discuss primary vs secondary
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
        require(reserveAuction.reservePrice > 0, "Not set up for reserve auction");
        require(block.timestamp >= reserveAuction.startDate, "Not accepting bids yet");
        require(msg.value >= reserveAuction.bid + minBidAmount, "You have not exceeded previous bid by min bid amount");

        // if a bid has been placed, then we will have a bidding end timestamp and we need to ensure no one
        // can bid beyond this
        if (reserveAuction.biddingEnd > 0) {
            require(block.timestamp < reserveAuction.biddingEnd, "No longer accepting bids");
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
        address seller = reserveAuction.seller;
        uint256 winningBid = reserveAuction.bid;
        delete editionOrTokenWithReserveAuctions[_id];

        _processSale(_id, winningBid, winner, seller, false);

        emit ReserveAuctionResulted(_id, winningBid, winner, _msgSender());
    }

    // Only permit bid withdrawals if reserve not met
    function withdrawBidFromReserveAuction(uint256 _id)
    public
    override
    whenNotPaused
    nonReentrant {
        ReserveAuction storage reserveAuction = editionOrTokenWithReserveAuctions[_id];

        require(reserveAuction.reservePrice > 0, "No reserve auction in flight");
        require(reserveAuction.bid < reserveAuction.reservePrice, "Bids can only be withdrawn if reserve not met");
        require(reserveAuction.bidder == _msgSender(), "Only the bidder can withdraw their bid");

        uint256 bidToRefund = reserveAuction.bid;
        _refundBidder(reserveAuction.bidder, bidToRefund);

        reserveAuction.bidder = address(0);
        reserveAuction.bid = 0;

        emit BidWithdrawnFromReserveAuction(_id, _msgSender(), uint128(bidToRefund));
    }

    // can only do this if the reserve has not been met
    function updateReservePriceForReserveAuction(uint256 _id, uint128 _reservePrice)
    public
    override
    whenNotPaused
    nonReentrant {
        ReserveAuction storage reserveAuction = editionOrTokenWithReserveAuctions[_id];

        require(reserveAuction.reservePrice > 0, "No reserve auction in flight");
        require(reserveAuction.seller == _msgSender(), "Not the seller");
        require(reserveAuction.bid == 0, "Due to the active bid the reserve cannot be adjusted");
        require(_reservePrice >= minBidAmount, "Reserve must be at least min bid");

        // todo allow when bids in flight and trigger countdown if we go below active bid in flight

        reserveAuction.reservePrice = _reservePrice;

        emit ReservePriceUpdated(_id, _reservePrice);
    }

    function updateReserveAuctionBidExtensionWindow(uint128 _reserveAuctionBidExtensionWindow) onlyAdmin public {
        reserveAuctionBidExtensionWindow = _reserveAuctionBidExtensionWindow;
        emit AdminUpdateReserveAuctionBidExtensionWindow(_reserveAuctionBidExtensionWindow);
    }

    function updateReserveAuctionLengthOnceReserveMet(uint128 _reserveAuctionLengthOnceReserveMet) onlyAdmin public {
        reserveAuctionLengthOnceReserveMet = _reserveAuctionLengthOnceReserveMet;
        emit AdminUpdateReserveAuctionLengthOnceReserveMet(_reserveAuctionLengthOnceReserveMet);
    }

    function _emergencyExitBidFromReserveAuction(uint256 _id) internal {
        ReserveAuction storage reserveAuction = editionOrTokenWithReserveAuctions[_id];

        require(reserveAuction.reservePrice > 0, "No reserve auction in flight");
        require(reserveAuction.bid > 0, "No bid in flight");

        bool isSeller = reserveAuction.seller == _msgSender();
        bool isBidder = reserveAuction.bidder == _msgSender();
        require(
            isSeller || isBidder || accessControls.hasContractOrAdminRole(_msgSender()),
            "Only seller, bidder, contract or platform admin"
        ); // external call done last as a gas optimisation i.e. it wont be called if isSeller || isBidder is true

        _refundBidder(reserveAuction.bidder, reserveAuction.bid);

        emit EmergencyBidWithdrawFromReserveAuction(_id, reserveAuction.bidder, reserveAuction.bid);

        reserveAuction.bidder = address(0);
        reserveAuction.bid = 0;

        // todo clear struct
    }
}
