const {BN, constants, time, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;
const _ = require('lodash');
const {ether} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3PrimaryMarketplace = artifacts.require('KODAV3PrimaryMarketplace');
const KODAV3Marketplace = artifacts.require('KODAV3SecondaryMarketplace');
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
    this.marketplace = await KODAV3Marketplace.new(this.accessControls.address, this.token.address, koCommission, {from: owner});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.marketplace.address, {from: owner});

    this.minBidAmount = await this.marketplace.minBidAmount();

    // approve marketplace from the collectors
    await this.token.setApprovalForAll(this.primaryMarketplace.address, true, {from: minter});
    await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorA});
    await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorB});
    await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorC});

    // Mint an edition of 3
    await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});
  });

  // scenario 1 (list and relist)
  // mint primary
  // list & sell secondary
  // list and sell a second time
  describe('scenario 1 - mint, list and sell, relist and sell on secondary', () => {

    const _0_1_ETH = ether('0.1');

    it('can fulfil scenario', async () => {
      // Mint and sell 1 token to collector A
      await this.primaryMarketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, '0', {from: contract});
      await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);

      // list and sell from collector A to collector B
      await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: collectorA});
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorB);

      // list and sell from collector B to collector A
      await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: collectorB});
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorC, value: _0_1_ETH});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorC);
    });
  });

  // scenario 2 (list and transfer)
  // mint primary
  // list of secondary
  // transfer to owner
  // list and sell as new owner
  describe('scenario 2 - mint, list and sell, transfer then relist and sell on secondary', () => {
    it('can fulfil scenario', async () => {

    });
  });

  // scenario 3 (mixed listing)
  // mint primary
  // list & sell on secondary
  // list and sell as reserve
  // list & sell on secondary
  // list and sell as reserve from new buyer
  describe('scenario 1 - list and sell in various types', () => {
    it('can fulfil scenario', async () => {

    });
  });

});
