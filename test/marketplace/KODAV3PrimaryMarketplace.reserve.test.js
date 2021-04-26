const {BN, constants, time, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const web3 = require('web3');
const {ether} = require("@openzeppelin/test-helpers");
const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3Marketplace = artifacts.require('KODAV3PrimaryMarketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

contract('KODAV3Marketplace reserve auction tests', function (accounts) {
  const [owner, minter, koCommission, contract, bidder1, bidder2] = accounts

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = new BN('10000');
  const EDITION_ONE_ID = STARTING_EDITION.addn(1000)
  const EDITION_TWO_ID = STARTING_EDITION.addn(2000)

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

  describe.only('End to end reserve auctions', () => {
    beforeEach(async () => {
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // reserve is only for 1 of 1
      await this.token.mintBatchEdition(1, minter, TOKEN_URI, {from: contract})
    })

    it('Successfully results a full reserve auction with no start date', async () => {
      const reservePrice = ether('0.5')

      const editionId = EDITION_ONE_ID
      const { receipt } = await this.marketplace.listEditionForReserveAuction(
        minter,
        editionId,
        reservePrice,
        '0',
        {from: contract}
      )

      await expectEvent(receipt, 'EditionListedForReserveAuction', {
        _editionId: editionId,
        _reservePrice: reservePrice,
        _startDate: '0'
      })

      // place a bid as bidder 1
      await this.marketplace.placeBidOnReserveAuction(editionId, {from: bidder1, value: ether('1')})

      // outbid by bidder 2 - bidder 1 gets money back
      const bidder1Tracker = await balance.tracker(bidder1)

      const bidder2Bid = ether('1.2')
      await this.marketplace.placeBidOnReserveAuction(editionId, {from: bidder2, value: bidder2Bid})

      expect(await bidder1Tracker.delta()).to.be.bignumber.equal(ether('1'))

      const reserveAuctionDetailsAfterBid = await this.marketplace.editionWithReserveAuctions(editionId)

      expect(reserveAuctionDetailsAfterBid.bidder).to.be.equal(bidder2)

      // move past bidding end to result the auction
      await time.increaseTo(
        parseInt(reserveAuctionDetailsAfterBid.biddingEnd.toString()) + 5
      )

      const platformTracker = await balance.tracker(koCommission)
      const sellerTracker = await balance.tracker(minter)

      await this.marketplace.resultReserveAuction(editionId, {from: bidder2})

      expect(await this.token.ownerOf(editionId)).to.be.bignumber.equal(bidder2)

      const platformCommission = bidder2Bid.divn(10000000).muln(1500000)
      expect(await platformTracker.delta()).to.be.bignumber.equal(platformCommission)

      const sellerCommission = bidder2Bid.sub(platformCommission)
      expect(await sellerTracker.delta()).to.be.bignumber.equal(sellerCommission)
    })
  })

  describe.only('listEditionForReserveAuction()', () => {
    beforeEach(async () => {
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // reserve is only for 1 of 1
      await this.token.mintBatchEdition(1, minter, TOKEN_URI, {from: contract})
    })

    it('Reverts when reserve auction already in flight', async () => {
      const editionId = EDITION_ONE_ID
      await this.marketplace.listEditionForReserveAuction(minter, editionId, ether('0.25'), '0', {from: contract})

      await expectRevert(
        this.marketplace.listEditionForReserveAuction(minter, editionId, ether('0.25'), '0', {from: contract}),
        "Auction already in flight"
      )
    })

    it('Reverts for editions that are not 1 of 1', async () => {
      await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract})

      const editionId = EDITION_TWO_ID

      expect(await this.token.getSizeOfEdition(editionId)).to.be.bignumber.equal('3')

      await expectRevert(
        this.marketplace.listEditionForReserveAuction(minter, editionId, ether('0.25'), '0', {from: contract}),
        "Only 1 of 1 editions are supported"
      )
    })

    it('Reverts when reserve price is below min bid', async () => {
      await expectRevert(
        this.marketplace.listEditionForReserveAuction(minter, EDITION_ONE_ID, '1', '0', {from: contract}),
        "Reserve price must be at least min bid"
      )
    })
  })

  describe.only('placeBidOnReserveAuction()', () => {
    beforeEach(async () => {
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // reserve is only for 1 of 1
      await this.token.mintBatchEdition(1, minter, TOKEN_URI, {from: contract})

      // list the token for reserve auction
      await this.marketplace.listEditionForReserveAuction(minter, EDITION_ONE_ID, ether('0.25'), '0', {from: contract})

      // mint another batch of tokens for further testing
      await this.token.mintBatchEdition(2, minter, TOKEN_URI, {from: contract})
    })

    it('Reverts when edition not set up for reserve auction', async () => {
      await expectRevert(
        this.marketplace.placeBidOnReserveAuction(EDITION_TWO_ID),
        "Edition not set up for reserve auction"
      )
    })

    // it('Reverts when reserve auction not yet started', async () => {
    //
    // })

    // it('Reverts when bidding as a contract', async () => {})

    it('Reverts when first bid is not above min bid', async () => {
      await expectRevert(
        this.marketplace.placeBidOnReserveAuction(EDITION_ONE_ID),
        "You have not exceeded previous bid by min bid amount"
      )
    })

    it('Reverts when user does not outbid someone by min bid amount', async () => {
      const bid = ether('0.5')
      await this.marketplace.placeBidOnReserveAuction(EDITION_ONE_ID, {from: bidder1, value: bid})

      await expectRevert(
        this.marketplace.placeBidOnReserveAuction(EDITION_ONE_ID, {from: bidder2, value: bid}),
        "You have not exceeded previous bid by min bid amount"
      )
    })

    // it('Reverts when beyond the bid end window', async () => {})
  })
})
