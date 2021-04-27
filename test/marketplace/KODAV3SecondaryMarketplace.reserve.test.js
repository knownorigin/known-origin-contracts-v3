const {BN, constants, time, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const web3 = require('web3');
const {ether} = require("@openzeppelin/test-helpers");
const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3Marketplace = artifacts.require('KODAV3SecondaryMarketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

contract('KODAV3SecondaryMarketplace reserve auction tests', function (accounts) {
  const [owner, minter, koCommission, contract, bidder1, bidder2] = accounts

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = new BN('10000');
  const FIRST_TOKEN_ID = STARTING_EDITION.addn(1000)
  const SECOND_TOKEN_ID = STARTING_EDITION.addn(2000)

  beforeEach(async () => {
    const legacyAccessControls = await SelfServiceAccessControls.new();
    // setup access controls
    this.accessControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

    // grab the roles
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Create token V3
    this.token = await KnownOriginDigitalAssetV3.new(
      this.accessControls.address,
      ZERO_ADDRESS, // no royalties address
      STARTING_EDITION,
      {from: owner}
    );

    // Set contract roles
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.token.address, {from: owner});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, contract, {from: owner});

    // Create marketplace and enable in whitelist
    this.marketplace = await KODAV3Marketplace.new(this.accessControls.address, this.token.address, koCommission, {from: owner});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.marketplace.address, {from: owner});

    this.minBidAmount = await this.marketplace.minBidAmount();
  });

  describe('End to end reserve auctions', () => {
    beforeEach(async () => {
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // reserve is only for 1 of 1
      await this.token.mintBatchEdition(1, minter, TOKEN_URI, {from: contract})
    })

    it('Successfully results a full reserve auction with no start date', async () => {
      const reservePrice = ether('0.5')

      const { receipt } = await this.marketplace.listTokenForReserveAuction(
        minter,
        FIRST_TOKEN_ID,
        reservePrice,
        '0',
        {from: contract}
      )

      await expectEvent(receipt, 'TokenListedForReserveAuction', {
        _tokenId: FIRST_TOKEN_ID,
        _reservePrice: reservePrice,
        _startDate: '0'
      })

      // place a bid as bidder 1
      await this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder1, value: ether('1')})

      // outbid by bidder 2 - bidder 1 gets money back
      const bidder1Tracker = await balance.tracker(bidder1)

      const bidder2Bid = ether('1.2')
      await this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder2, value: bidder2Bid})

      expect(await bidder1Tracker.delta()).to.be.bignumber.equal(ether('1'))

      const reserveAuctionDetailsAfterBid = await this.marketplace.tokenWithReserveAuctions(FIRST_TOKEN_ID)

      expect(reserveAuctionDetailsAfterBid.bidder).to.be.equal(bidder2)

      // move past bidding end to result the auction
      await time.increaseTo(
        parseInt(reserveAuctionDetailsAfterBid.biddingEnd.toString()) + 5
      )

      const platformTracker = await balance.tracker(koCommission)
      const sellerTracker = await balance.tracker(minter)

      await this.marketplace.resultReserveAuction(FIRST_TOKEN_ID, {from: bidder2})

      expect(await this.token.ownerOf(FIRST_TOKEN_ID)).to.be.bignumber.equal(bidder2)

      const platformCommission = bidder2Bid.divn(10000000).muln(250000)
      expect(await platformTracker.delta()).to.be.bignumber.equal(platformCommission)

      const sellerCommission = bidder2Bid.sub(platformCommission)
      expect(await sellerTracker.delta()).to.be.bignumber.equal(sellerCommission)
    })
  })

  describe('listTokenForReserveAuction()', () => {
    beforeEach(async () => {
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // reserve is only for 1 of 1
      await this.token.mintBatchEdition(1, minter, TOKEN_URI, {from: contract})
    })

    it('Reverts when reserve auction already in flight', async () => {
      await this.marketplace.listTokenForReserveAuction(minter, FIRST_TOKEN_ID, ether('0.25'), '0', {from: contract})

      await expectRevert(
        this.marketplace.listTokenForReserveAuction(minter, FIRST_TOKEN_ID, ether('0.25'), '0', {from: contract}),
        "Auction already in flight"
      )
    })

    it('Reverts for editions that are not 1 of 1', async () => {
      await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract})

      expect(await this.token.getSizeOfEdition(SECOND_TOKEN_ID)).to.be.bignumber.equal('3')

      await expectRevert(
        this.marketplace.listTokenForReserveAuction(minter, SECOND_TOKEN_ID, ether('0.25'), '0', {from: contract}),
        "Only 1 of 1 editions are supported"
      )
    })

    it('Reverts when reserve price is below min bid', async () => {
      await expectRevert(
        this.marketplace.listTokenForReserveAuction(minter, FIRST_TOKEN_ID, '1', '0', {from: contract}),
        "Reserve price must be at least min bid"
      )
    })
  })

  describe('placeBidOnReserveAuction()', () => {
    beforeEach(async () => {
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // reserve is only for 1 of 1
      await this.token.mintBatchEdition(1, minter, TOKEN_URI, {from: contract})

      // list the token for reserve auction
      await this.marketplace.listTokenForReserveAuction(minter, FIRST_TOKEN_ID, ether('0.25'), '0', {from: contract})

      // mint another batch of tokens for further testing
      await this.token.mintBatchEdition(1, minter, TOKEN_URI, {from: contract})
    })

    it('Extends the bidding window when bidding near the end of the aucton', async () => {
      const bid = ether('0.5')
      await this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder1, value: bid})

      const reserveAuctionMetadataPostBid = await this.marketplace.tokenWithReserveAuctions(FIRST_TOKEN_ID)
      const reserveAuctionBidExtensionWindow = await this.marketplace.reserveAuctionBidExtensionWindow()

      // place the time within the end window
      await time.increaseTo(reserveAuctionMetadataPostBid.biddingEnd.sub(reserveAuctionBidExtensionWindow).addn(60))

      // bid again
      await this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder2, value: bid.muln(2)})

      const reserveAuctionMetadataPostBid2 = await this.marketplace.tokenWithReserveAuctions(FIRST_TOKEN_ID)
      expect(reserveAuctionMetadataPostBid2.biddingEnd).to.be.bignumber.equal(reserveAuctionMetadataPostBid.biddingEnd.add(reserveAuctionBidExtensionWindow))
    })

    it('Reverts when token not set up for reserve auction', async () => {
      await expectRevert(
        this.marketplace.placeBidOnReserveAuction(SECOND_TOKEN_ID),
        "Token not set up for reserve auction"
      )
    })

    it('Reverts when reserve auction not yet started', async () => {
      const currentTime = await time.latest()
      const _5_Mins_In_The_Future = currentTime.addn(5 * 60)

      await this.marketplace.listTokenForReserveAuction(minter, SECOND_TOKEN_ID, ether('0.25'), _5_Mins_In_The_Future, {from: contract})

      await expectRevert(
        this.marketplace.placeBidOnReserveAuction(SECOND_TOKEN_ID),
        "Token not accepting bids yet"
      )
    })

    // todo it('Reverts when bidding as a contract', async () => {})

    it('Reverts when first bid is not above min bid', async () => {
      await expectRevert(
        this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID),
        "You have not exceeded previous bid by min bid amount"
      )
    })

    it('Reverts when user does not outbid someone by min bid amount', async () => {
      const bid = ether('0.5')
      await this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder1, value: bid})

      await expectRevert(
        this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder2, value: bid}),
        "You have not exceeded previous bid by min bid amount"
      )
    })

    it('Reverts when beyond the bid end window', async () => {
      const bid = ether('0.5')
      await this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder1, value: bid})

      // move beyond end
      const {biddingEnd} = await this.marketplace.tokenWithReserveAuctions(FIRST_TOKEN_ID)
      await time.increaseTo(biddingEnd)

      await expectRevert(
        this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder1, value: bid.muln(2)}),
        "Token is no longer accepting bids"
      )
    })
  })

  describe('resultReserveAuction()', () => {
    beforeEach(async () => {
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // reserve is only for 1 of 1
      await this.token.mintBatchEdition(1, minter, TOKEN_URI, {from: contract})

      // list the token for reserve auction
      await this.marketplace.listTokenForReserveAuction(minter, FIRST_TOKEN_ID, ether('0.25'), '0', {from: contract})

      // mint another batch of tokens for further testing
      await this.token.mintBatchEdition(1, minter, TOKEN_URI, {from: contract})
    })

    it('Reverts for no active auction', async () => {
      await expectRevert(
        this.marketplace.resultReserveAuction(SECOND_TOKEN_ID),
        "No active auction"
      )
    })

    it('Reverts when no bids received', async () => {
      await expectRevert(
        this.marketplace.resultReserveAuction(FIRST_TOKEN_ID),
        "No bids received"
      )
    })

    it('Reverts when reserve not reached', async () => {
      await this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder1, value: ether('0.1')})

      await expectRevert(
        this.marketplace.resultReserveAuction(FIRST_TOKEN_ID),
        "Reserve not met"
      )
    })

    it('Reverts when reserve not reached', async () => {
      await this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder1, value: ether('0.5')})

      await expectRevert(
        this.marketplace.resultReserveAuction(FIRST_TOKEN_ID),
        "Bidding has not yet ended"
      )
    })

    it('Reverts when not winner or seller when resulting', async () => {
      await this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder1, value: ether('0.5')})

      const {biddingEnd} = await this.marketplace.tokenWithReserveAuctions(FIRST_TOKEN_ID)

      await time.increaseTo(biddingEnd.addn(5))

      await expectRevert(
        this.marketplace.resultReserveAuction(FIRST_TOKEN_ID, {from: koCommission}),
        "Only winner or seller can result"
      )
    })

    it('Can result as winner', async () => {
      await this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder1, value: ether('0.5')})

      const {biddingEnd} = await this.marketplace.tokenWithReserveAuctions(FIRST_TOKEN_ID)

      await time.increaseTo(biddingEnd.addn(5))

      const {receipt} = await this.marketplace.resultReserveAuction(FIRST_TOKEN_ID, {from: bidder1})
      expectEvent(receipt, 'ReserveAuctionResulted', {
        _tokenId: FIRST_TOKEN_ID,
        _finalPrice: ether('0.5'),
        _winner: bidder1,
        _resulter: bidder1
      })
    })

    it('Can result as seller', async () => {
      await this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder1, value: ether('0.5')})

      const {biddingEnd} = await this.marketplace.tokenWithReserveAuctions(FIRST_TOKEN_ID)

      await time.increaseTo(biddingEnd.addn(5))

      const {receipt} = await this.marketplace.resultReserveAuction(FIRST_TOKEN_ID, {from: minter})
      expectEvent(receipt, 'ReserveAuctionResulted', {
        _tokenId: FIRST_TOKEN_ID,
        _finalPrice: ether('0.5'),
        _winner: bidder1,
        _resulter: minter
      })
    })
  })

  describe('withdrawBidFromReserveAuction()', () => {
    beforeEach(async () => {
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // reserve is only for 1 of 1
      await this.token.mintBatchEdition(1, minter, TOKEN_URI, {from: contract})

      // list the token for reserve auction
      await this.marketplace.listTokenForReserveAuction(minter, FIRST_TOKEN_ID, ether('0.25'), '0', {from: contract})

      // mint another batch of tokens for further testing
      await this.token.mintBatchEdition(1, minter, TOKEN_URI, {from: contract})
    })

    it('Can withdraw a bid before the reserve is met', async () => {
      // place a bid on edition one below reserve
      const bid = ether('0.2')
      await this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder1, value: bid})

      // withdrawal should be possible
      const bidder1Tracker = await balance.tracker(bidder1)

      const { receipt } = await this.marketplace.withdrawBidFromReserveAuction(FIRST_TOKEN_ID, {from: bidder1})

      expect(await bidder1Tracker.delta()).to.be.bignumber.equal(bid.sub(new BN(receipt.gasUsed.toString()).mul(new BN('8000000000'))))

      expectEvent(receipt, 'BidWithdrawnFromReserveAuction', {
        _tokenId: FIRST_TOKEN_ID,
        _bidder: bidder1,
        _bid: bid
      })
    })

    it('Reverts when no auction in flight', async () => {
      await expectRevert(
        this.marketplace.withdrawBidFromReserveAuction(SECOND_TOKEN_ID, {from: bidder1}),
        "No reserve auction in flight"
      )
    })

    it('Reverts when over reserve', async () => {
      await this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder1, value: ether('0.5')})

      await expectRevert(
        this.marketplace.withdrawBidFromReserveAuction(FIRST_TOKEN_ID, {from: bidder1}),
        "Bids can only be withdrawn if reserve not met"
      )
    })

    it('Reverts when not the bidder', async () => {
      await this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder1, value: ether('0.1')})

      await expectRevert(
        this.marketplace.withdrawBidFromReserveAuction(FIRST_TOKEN_ID, {from: bidder2}),
        "Only the bidder can withdraw their bid"
      )
    })
  })

  describe('updateReservePriceForReserveAuction()', () => {
    beforeEach(async () => {
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // reserve is only for 1 of 1
      await this.token.mintBatchEdition(1, minter, TOKEN_URI, {from: contract})

      // list the token for reserve auction
      await this.marketplace.listTokenForReserveAuction(minter, FIRST_TOKEN_ID, ether('0.25'), '0', {from: contract})

      // mint another batch of tokens for further testing
      await this.token.mintBatchEdition(1, minter, TOKEN_URI, {from: contract})
    })

    it('Can update reserve before any bids received', async () => {
      const newReserve = ether('0.6')
      await this.marketplace.updateReservePriceForReserveAuction(FIRST_TOKEN_ID, newReserve, {from: minter})

      const {
        reservePrice
      } = await this.marketplace.tokenWithReserveAuctions(FIRST_TOKEN_ID)

      expect(reservePrice).to.be.bignumber.equal(newReserve)
    })

    it('Reverts when auction not in flight', async () => {
      await expectRevert(
        this.marketplace.updateReservePriceForReserveAuction(SECOND_TOKEN_ID, '2'),
        "No reserve auction in flight"
      )
    })

    it('Reverts when not the seller', async () => {
      await expectRevert(
        this.marketplace.updateReservePriceForReserveAuction(FIRST_TOKEN_ID, '2', {from: bidder1}),
        "Not the seller"
      )
    })

    it('Reverts when bid in flight', async () => {
      await this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder1, value: ether('0.5')})

      await expectRevert(
        this.marketplace.updateReservePriceForReserveAuction(FIRST_TOKEN_ID, '2', {from: minter}),
        "Due to the active bid the reserve cannot be adjusted"
      )
    })

    it('Reverts when new reserve not greater than min bid', async () => {
      await expectRevert(
        this.marketplace.updateReservePriceForReserveAuction(FIRST_TOKEN_ID, '2', {from: minter}),
        "Reserve must be at least min bid"
      )
    })
  })

  describe('convertReserveAuctionToBuyItNow()', () => {
    beforeEach(async () => {
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // reserve is only for 1 of 1
      await this.token.mintBatchEdition(1, minter, TOKEN_URI, {from: contract})

      // list the token for reserve auction
      await this.marketplace.listTokenForReserveAuction(minter, FIRST_TOKEN_ID, ether('0.25'), '0', {from: contract})

      // mint another batch of tokens for further testing
      await this.token.mintBatchEdition(1, minter, TOKEN_URI, {from: contract})
    })

    it('Converts to buy it now with no bid', async () => {
      const now = await time.latest()

      const {receipt} = await this.marketplace.convertReserveAuctionToBuyItNow(FIRST_TOKEN_ID, ether('0.1'), now, {from: minter})
      await expectEvent(receipt, 'ReserveAuctionConvertedToBuyItNow', {
        _tokenId: FIRST_TOKEN_ID,
        _listingPrice: ether('0.1'),
        _startDate: now
      })

      // cant place a bid
      await expectRevert(
        this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder1, value: ether('0.2')}),
        "Token not set up for reserve auction"
      )

      // but can buy the token
      await this.marketplace.buyToken(FIRST_TOKEN_ID, {from: bidder1, value: ether('0.1')})

      expect(await this.token.ownerOf(FIRST_TOKEN_ID)).to.be.equal(bidder1)
    })

    it('Converts to buy it now with bid below reserve', async () => {
      await this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder1, value: ether('0.2')})

      const now = await time.latest()

      const bidder1Tracker = await balance.tracker(bidder1)

      const {receipt} = await this.marketplace.convertReserveAuctionToBuyItNow(FIRST_TOKEN_ID, ether('0.1'), now, {from: minter})
      await expectEvent(receipt, 'ReserveAuctionConvertedToBuyItNow', {
        _tokenId: FIRST_TOKEN_ID,
        _listingPrice: ether('0.1'),
        _startDate: now
      })

      expect(await bidder1Tracker.delta()).to.be.bignumber.equal(ether('0.2'))

      // cant place a bid
      await expectRevert(
        this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder1, value: ether('0.2')}),
        "Token not set up for reserve auction"
      )

      // but can buy the token
      await this.marketplace.buyToken(FIRST_TOKEN_ID, {from: bidder1, value: ether('0.1')})

      expect(await this.token.ownerOf(FIRST_TOKEN_ID)).to.be.equal(bidder1)
    })

    it('Reverts when no active auction in flight', async () => {
      await expectRevert(
        this.marketplace.convertReserveAuctionToBuyItNow(SECOND_TOKEN_ID, '0', '0'),
        "No active auction"
      )
    })

    it('Reverts when reserve has been met', async () => {
      await this.marketplace.placeBidOnReserveAuction(FIRST_TOKEN_ID, {from: bidder1, value: ether('0.5')})

      await expectRevert(
        this.marketplace.convertReserveAuctionToBuyItNow(FIRST_TOKEN_ID, '0', '0'),
        "Can only convert before reserve met"
      )
    })

    it('Reverts when not the seller', async () => {
      await expectRevert(
        this.marketplace.convertReserveAuctionToBuyItNow(FIRST_TOKEN_ID, '0', '0', {from: bidder1}),
        "Not the seller"
      )
    })

    it('Reverts when listing price is not above min bid', async () => {
      await expectRevert(
        this.marketplace.convertReserveAuctionToBuyItNow(FIRST_TOKEN_ID, '0', '0', {from: minter}),
        "Listing price not enough"
      )
    })
  })
})
