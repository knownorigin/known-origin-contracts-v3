const {BN, constants, time, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;
const _ = require('lodash');
const {ether} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3PrimaryMarketplace = artifacts.require('KODAV3PrimaryMarketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

contract('Primary market sales scenarios', function (accounts) {
  const [owner, minter, koCommission, contract, collectorA, collectorB, collectorC, collectorD] = accounts;

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = '10000';

  const _0_1_ETH = ether('0.1');

  const firstEditionTokenId = new BN('11000');
  const secondEditionTokenId = new BN('12000');

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
    this.marketplace = await KODAV3PrimaryMarketplace.new(this.accessControls.address, this.token.address, koCommission, {from: owner});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.marketplace.address, {from: owner});

    this.minBidAmount = await this.marketplace.minBidAmount();

    // approve marketplace from the collectors
    await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});
    await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorA});
    await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorB});
    await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorC});
    await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorD});

    // create 3 tokens to the minter
    await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

    // mint edition of 1 for reserve auctions
    await this.token.mintBatchEdition(1, minter, TOKEN_URI, {from: contract});
  });

  describe('scenario 1 - mint, list as buy now, sell one, convert to offers, sell as offers, convert to buy now and sell last one', () => {
    it('can fulfil scenario', async () => {

      // list
      await this.marketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, '0', {from: contract});

      // buy from primary
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});

      // convert to offers
      await this.marketplace.convertFromBuyNowToOffers(firstEditionTokenId, '0', {from: minter});

      // place an offer + sell one
      await this.marketplace.placeEditionBid(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});
      await this.marketplace.acceptEditionBid(firstEditionTokenId, _0_1_ETH, {from: minter});

      // convert back to buy now and sell the last one
      await this.marketplace.convertOffersToBuyItNow(firstEditionTokenId, _0_1_ETH, '0', {from: minter});
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});

      // Confirm its sold out
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH}),
        'Primary market exhausted'
      );
    });
  });

  describe('scenario 2 - mint, list as reserve, place bid trigger reserve, and fail to covert', () => {
    it('can fulfil scenario', async () => {

      // list for reserve
      await this.marketplace.listForReserveAuction(
        minter,
        secondEditionTokenId,
        _0_1_ETH,
        '0',
        {from: contract}
      );

      // place a bid
      await this.marketplace.placeBidOnReserveAuction(secondEditionTokenId, {from: collectorA, value: ether('0.2')});

      // convert it to reserve should fail as reserve has been met
      await expectRevert(
        this.marketplace.convertReserveAuctionToBuyItNow(secondEditionTokenId, ether('0.1'), '0', {
          from: minter
        }),
        'Can only convert before reserve met'
      );
    });
  });

  describe('scenario 3 - mint, list as reserve, place bid under reserve, convert to buy now and sell', () => {
    it('can fulfil scenario', async () => {
      // list for reserve
      await this.marketplace.listForReserveAuction(
        minter,
        secondEditionTokenId,
        _0_1_ETH,
        '0',
        {from: contract}
      );

      // place a bid under reserve
      await this.marketplace.placeBidOnReserveAuction(secondEditionTokenId, {from: collectorA, value: ether('0.05')});

      // convert to buy now as under the reserve
      await this.marketplace.convertReserveAuctionToBuyItNow(secondEditionTokenId, ether('0.1'), '0', {
        from: minter
      });

      // buy now
      await this.marketplace.buyEditionToken(secondEditionTokenId, {from: collectorB, value: _0_1_ETH});
      expect(await this.token.ownerOf(secondEditionTokenId)).to.be.equal(collectorB);
    });
  });

  describe('scenario 4 - mint, list as stepped sale, sell one, convert to offers, sell as offers, convert to buy now and sell last one', () => {
    it('can fulfil scenario', async () => {

      // list stepped sale
      await this.marketplace.listSteppedEditionAuction(minter, firstEditionTokenId, _0_1_ETH, _0_1_ETH, '0', {from: contract});

      // buy the first one
      await this.marketplace.buyNextStep(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});
      expect(await this.token.ownerOf('11002')).to.be.equal(collectorA);

      // convert to offers
      await this.marketplace.convertSteppedAuctionToOffers(firstEditionTokenId, '0', {from: minter});

      // place an offer + sell one
      await this.marketplace.placeEditionBid(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});
      const {receipt} = await this.marketplace.acceptEditionBid(firstEditionTokenId, _0_1_ETH, {from: minter});
      await expectEvent(receipt, 'EditionBidAccepted', {
        _tokenId: '11000',
        _bidder: collectorB,
        _amount: _0_1_ETH
      });
      expect(await this.token.ownerOf('11000')).to.be.equal(collectorB);

      // convert back to buy now and sell the last one
      await this.marketplace.convertOffersToBuyItNow(firstEditionTokenId, _0_1_ETH, '0', {from: minter});
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorC, value: _0_1_ETH});
      expect(await this.token.ownerOf('11001')).to.be.equal(collectorC);

      // Confirm its sold out
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH}),
        'Primary market exhausted'
      );
    });
  });

});
