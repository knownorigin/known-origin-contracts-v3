const {BN, constants, time, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;
const _ = require('lodash');
const {ether} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3PrimaryMarketplace = artifacts.require('KODAV3PrimaryMarketplace');
const KODAV3SecondaryMarketplace = artifacts.require('KODAV3SecondaryMarketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

contract('Secondary market sales scenarios', function (accounts) {
  const [owner, minter, anotherMinter, koCommission, contract, collectorA, collectorB, collectorC, collectorD] = accounts;

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = '10000';

  const _0_1_ETH = ether('0.1');
  const _0_2_ETH = ether('0.2');
  const _0_3_ETH = ether('0.3');
  const ONE = new BN('1');
  const ZERO = new BN('0');

  const firstEditionTokenId = new BN('11000');
  const secondEditionTokenId = new BN('12000');
  const thirdEditionTokenId = new BN('13000');

  const LOCKUP_HOURS = 6;

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
    this.primaryMarketplace = await KODAV3PrimaryMarketplace.new(this.accessControls.address, this.token.address, koCommission, {from: owner});
    this.marketplace = await KODAV3SecondaryMarketplace.new(this.accessControls.address, this.token.address, koCommission, {from: owner});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.marketplace.address, {from: owner});

    this.minBidAmount = await this.marketplace.minBidAmount();

    // approve marketplace from the collectors
    await this.token.setApprovalForAll(this.primaryMarketplace.address, true, {from: minter});
    await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});
    await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorA});
    await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorB});
    await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorC});
    await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorD});
  });

  // scenario 1 (list and relist)
  describe('scenario 1 - mint, list and sell, relist and sell on secondary', () => {
    it('can fulfil scenario', async () => {
      // Mint an edition of 3
      await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

      // Mint and sell 1 token to collector A
      await this.primaryMarketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, '0', {from: contract});
      await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);

      // list and sell from collector A to collector B
      await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: collectorA});
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorB);

      // unable to buy as ownership has changed
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorD, value: _0_1_ETH}),
        'Owner mismatch'
      );

      // list and sell from collector B to collector A
      await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: collectorB});
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorC, value: _0_1_ETH});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorC);

      // unable to buy as ownership has changed
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorD, value: _0_1_ETH}),
        'Owner mismatch'
      );
    });
  });

  // scenario 2 (list and transfer, relist)
  describe('scenario 2 - mint, list and sell, transfer then relist and sell on secondary', () => {
    it('can fulfil scenario', async () => {

      // Mint an edition of 3
      await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

      // Mint and sell 1 token to collector A
      await this.primaryMarketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, '0', {from: contract});
      await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);

      // lists and sell from A -> B
      await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: collectorA});
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorB);

      // unable to buy as ownership has changed
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorD, value: _0_1_ETH}),
        'Owner mismatch'
      );

      // new owner B lists and then transfers to C
      await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: collectorB});
      await this.token.transferFrom(collectorB, collectorC, firstEditionTokenId, {from: collectorB});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorC);

      // unable to buy as ownership has changed
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorD, value: _0_1_ETH}),
        'Owner mismatch'
      );

      // list and sell from collector C to collector D
      await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: collectorC});
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorD, value: _0_1_ETH});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorD);

      // unable to buy as ownership has changed
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorD, value: _0_1_ETH}),
        'Owner mismatch'
      );
    });
  });

  // scenario 3 (mixed listing with transfer in the middle)
  describe('scenario 3 - list and sell in various types with transfer mid-flow', () => {
    it('can fulfil scenario', async () => {

      // Mint an edition of 3
      await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

      // Mint and sell 1 token to collector A
      await this.primaryMarketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, '0', {from: contract});
      await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);

      // lists and sell from A -> B
      await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: collectorA});
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorB);

      // unable to buy as ownership has changed
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorD, value: _0_1_ETH}),
        'Owner mismatch'
      );

      // unable to place bid as its a buy now
      await expectRevert(
        this.marketplace.placeBidOnReserveAuction(firstEditionTokenId, {from: collectorC, value: ether('0.3')}),
        'Not set up for reserve auction'
      );

      // list as reserve and sell B -> C
      await this.marketplace.listForReserveAuction(collectorB, firstEditionTokenId, ether('0.25'), '0', {from: collectorB});
      await this.marketplace.placeBidOnReserveAuction(firstEditionTokenId, {from: collectorC, value: ether('0.3')});

      // unable to buy as no longer buy now
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorD, value: _0_1_ETH}),
        'Owner mismatch'
      );

      // increase time beyond end
      const {biddingEnd} = await this.marketplace.editionOrTokenWithReserveAuctions(firstEditionTokenId);
      await time.increaseTo(biddingEnd);

      // result reserve auction - new owner of C
      await this.marketplace.resultReserveAuction(firstEditionTokenId);
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorC);

      // unable to place bid as no longer listed with reserve
      await expectRevert(
        this.marketplace.placeBidOnReserveAuction(firstEditionTokenId, {from: collectorC, value: ether('0.3')}),
        'Not set up for reserve auction'
      );

      // C lists item but then transfer to D
      await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: collectorC});
      await this.token.transferFrom(collectorC, collectorD, firstEditionTokenId, {from: collectorC});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorD);

      // unable to buy as no longer buy now
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH}),
        'Owner mismatch'
      );

      // D final lists and sells back to A
      await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: collectorD});
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);

      // unable to buy as no longer buy now
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorD, value: _0_1_ETH}),
        'Owner mismatch'
      );
    });
  });

  // scenario 4 (mixed listing with transfers after revere with emergency exit and further listing)
  describe('scenario 4 - mixed listing with transfer after bidding has ended', () => {
    it('can fulfil scenario', async () => {

      // Mint an edition of 3
      await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

      // Mint and sell 1 token to collector A
      await this.primaryMarketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, '0', {from: contract});
      await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);

      // unable to buy as changed owner
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorD, value: _0_1_ETH}),
        'No listing found'
      );

      // lists and sell from A -> B
      await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: collectorA});
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorB);

      // unable to buy as changed owner
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorD, value: _0_1_ETH}),
        'Owner mismatch'
      );

      // list as reserve and sell B -> C
      await this.marketplace.listForReserveAuction(collectorB, firstEditionTokenId, ether('0.25'), '0', {from: collectorB});
      await this.marketplace.placeBidOnReserveAuction(firstEditionTokenId, {from: collectorC, value: ether('0.3')});

      // unable to buy as changed owner
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorD, value: _0_1_ETH}),
        'Owner mismatch'
      );

      // increase time beyond end
      const {biddingEnd} = await this.marketplace.editionOrTokenWithReserveAuctions(firstEditionTokenId);
      await time.increaseTo(biddingEnd);

      // transfer the token post bidding end -> sends from B -> C
      await this.token.transferFrom(collectorB, collectorC, firstEditionTokenId, {from: collectorB});

      // unable to place bid as bidding closed
      await expectRevert(
        this.marketplace.placeBidOnReserveAuction(firstEditionTokenId, {from: collectorC, value: ether('0.4')}),
        'No longer accepting bids'
      );

      // trigger emergency exit to return funds
      await this.marketplace.emergencyExitBidFromReserveAuction(firstEditionTokenId, {from: contract});

      // C lists item but then transfer to D
      await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: collectorC});
      await this.token.transferFrom(collectorC, collectorD, firstEditionTokenId, {from: collectorC});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorD);

      // unable to buy as changed owner
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorC, value: _0_1_ETH}),
        'Owner mismatch'
      );

      // D final lists and sells back to A
      await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: collectorD});
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);

      // unable to buy as changed owner
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorD, value: _0_1_ETH}),
        'Owner mismatch'
      );
    });
  });

  // scenario 5 (mixed listing with transfers after revere with emergency exit and further listing)
  describe('scenario 5 - mixed listing with transfer after bidding has ended', () => {
    it('can fulfil scenario', async () => {

      // Mint an edition of 3
      await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

      // Mint and sell 1 token to collector A
      await this.primaryMarketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, '0', {from: contract});
      await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);

      // unable to buy as changed owner
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorD, value: _0_1_ETH}),
        'No listing found'
      );

      // lists and sell from A -> B
      await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: collectorA});
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorB);

      // unable to buy as changed owner
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorD, value: _0_1_ETH}),
        'Owner mismatch'
      );

      // list as reserve and sell B -> C
      await this.marketplace.listForReserveAuction(collectorB, firstEditionTokenId, ether('0.25'), '0', {from: collectorB});
      await this.marketplace.placeBidOnReserveAuction(firstEditionTokenId, {from: collectorC, value: ether('0.3')});

      // unable to buy as not listed
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorD, value: _0_1_ETH}),
        'Owner mismatch'
      );

      // transfer the token post bidding end -> sends from B -> C
      await this.token.transferFrom(collectorB, collectorC, firstEditionTokenId, {from: collectorB});

      // a new bid comes in even after transfer
      await this.marketplace.placeBidOnReserveAuction(firstEditionTokenId, {from: collectorC, value: ether('0.4')});

      // trigger emergency exit to return funds
      await this.marketplace.emergencyExitBidFromReserveAuction(firstEditionTokenId, {from: contract});

      // a new bid comes in even after transfer and emergency exit
      await expectRevert(
        this.marketplace.placeBidOnReserveAuction(firstEditionTokenId, {from: collectorC, value: ether('0.5')}),
        'Not set up for reserve auction'
      );

      // unable to buy as changed owner
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorC, value: _0_1_ETH}),
        'Owner mismatch'
      );

      // C lists item but then transfer to D
      await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: collectorC});
      await this.token.transferFrom(collectorC, collectorD, firstEditionTokenId, {from: collectorC});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorD);

      // unable to buy as changed owner
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorC, value: _0_1_ETH}),
        'Owner mismatch'
      );

      // D final lists and sells back to A
      await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: collectorD});
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);

      // unable to buy as changed owner
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorD, value: _0_1_ETH}),
        'Owner mismatch'
      );
    });
  });

  describe('scenario 6 - list, transfer to new owner, new owner transfer back', () => {
    it('can fulfil scenario', async () => {

      // Mint an edition of 1
      await this.token.mintBatchEdition(1, minter, TOKEN_URI, {from: contract});

      // list token
      await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: minter});

      // transfer token to new account
      await this.token.transferFrom(minter, collectorA, firstEditionTokenId, {from: minter});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);

      // unable to buy as ownership has changed
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorD, value: _0_1_ETH}),
        'Owner mismatch'
      );

      // transfer back to original owner
      await this.token.transferFrom(collectorA, minter, firstEditionTokenId, {from: collectorA});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(minter);

      // can now buy as token back in original hands with listing
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorD, value: _0_1_ETH});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorD);

      // unable to buy as now sold out
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH}),
        'Owner mismatch'
      );
    });
  });

  describe('scenario 7 - list, transfer to new owner, new owner lists, transfer back to original', () => {
    it('can fulfil scenario', async () => {

      // Mint an edition of 1
      await this.token.mintBatchEdition(1, minter, TOKEN_URI, {from: contract});

      // list token
      await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: minter});

      // transfer token to new account
      await this.token.transferFrom(minter, collectorA, firstEditionTokenId, {from: minter});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);

      // unable to buy as ownership has changed
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorD, value: _0_1_ETH}),
        'Owner mismatch'
      );

      // new owner lists token
      await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: collectorA});

      // transfer back to original owner
      await this.token.transferFrom(collectorA, minter, firstEditionTokenId, {from: collectorA});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(minter);

      // unable to buy as ownership has changed and listing points to previous owner
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH}),
        'Owner mismatch'
      );
    });
  });

});
