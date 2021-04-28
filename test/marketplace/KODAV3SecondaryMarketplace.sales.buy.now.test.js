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

const {validateEditionAndToken} = require('../test-helpers');

contract('KODAV3Marketplace', function (accounts) {
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
    this.secondarySaleRoyalty = await this.marketplace.secondarySaleRoyalty();
  });

  describe('secondary sale token listing', async () => {
    describe('listToken()', () => {

      const _0_1_ETH = ether('0.1');

      beforeEach(async () => {
        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.primaryMarketplace.address, true, {from: minter});

        // create 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

        const start = await time.latest();
        await this.primaryMarketplace.listEdition(minter, firstEditionTokenId, _0_1_ETH, start, {from: contract});

        // collector A buys a token (primary)
        await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});

        // collector B buys a token (primary)
        await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});

        // collector C buys a token (primary)
        await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorC, value: _0_1_ETH});
      });

      it('can list token', async () => {

        const token1 = firstEditionTokenId;
        const token2 = firstEditionTokenId.add(ONE);
        const token3 = token2.add(ONE);

        // list token for sale at 0.1 ETH per token
        const start = await time.latest();
        await this.marketplace.listToken(token1, _0_1_ETH, start, {from: collectorA});
        await this.marketplace.listToken(token2, _0_1_ETH, start, {from: collectorB});
        await this.marketplace.listToken(token3, _0_1_ETH, start, {from: collectorC});

        let listing = await this.marketplace.getTokenListing(token1);
        expect(listing._seller).to.be.equal(collectorA);
        expect(listing._listingPrice).to.be.bignumber.equal(_0_1_ETH);
        expect(listing._startDate).to.be.bignumber.equal(start);

        listing = await this.marketplace.getTokenListing(token2);
        expect(listing._seller).to.be.equal(collectorB);
        expect(listing._listingPrice).to.be.bignumber.equal(_0_1_ETH);
        expect(listing._startDate).to.be.bignumber.equal(start);

        listing = await this.marketplace.getTokenListing(token3);
        expect(listing._seller).to.be.equal(collectorC);
        expect(listing._listingPrice).to.be.bignumber.equal(_0_1_ETH);
        expect(listing._startDate).to.be.bignumber.equal(start);

        const seller = await this.marketplace.getTokenListingSeller(token1);
        expect(seller).to.be.equal(collectorA);

        const listingPrice = await this.marketplace.getTokenListingPrice(token1);
        expect(listingPrice).to.be.bignumber.equal(_0_1_ETH);

        const startDate = await this.marketplace.getTokenListingDate(token1);
        expect(startDate).to.be.bignumber.equal(start);
      });

      it('reverts if not owner', async () => {
        await expectRevert(
          this.marketplace.listToken(firstEditionTokenId, _0_1_ETH, await time.latest(), {from: collectorD}),
          'Not token owner'
        );
      });

      it('reverts if under min bid amount listing price', async () => {
        await expectRevert(
          this.marketplace.listToken(firstEditionTokenId, this.minBidAmount.sub(ONE), await time.latest(), {from: collectorA}),
          'Listing price not enough'
        );
      });
    });

    describe('delistToken()', () => {

      const _0_1_ETH = ether('0.1');

      beforeEach(async () => {
        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.primaryMarketplace.address, true, {from: minter});

        // create 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

        const start = await time.latest();
        await this.primaryMarketplace.listEdition(minter, firstEditionTokenId, _0_1_ETH, start, {from: contract});

        // collector A buys a token (primary)
        await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});

        // collector B buys a token (primary)
        await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});

        // collector C buys a token (primary)
        await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorC, value: _0_1_ETH});
      });

      it('can delist token', async () => {

        const token1 = firstEditionTokenId;

        const start = await time.latest();
        await this.marketplace.listToken(token1, _0_1_ETH, start, {from: collectorA});

        let listing = await this.marketplace.getTokenListing(token1);
        expect(listing._seller).to.be.equal(collectorA);
        expect(listing._listingPrice).to.be.bignumber.equal(_0_1_ETH);
        expect(listing._startDate).to.be.bignumber.equal(start);

        await this.marketplace.delistToken(token1, {from: collectorA});
        listing = await this.marketplace.getTokenListing(token1);
        expect(listing._seller).to.be.equal(ZERO_ADDRESS);
        expect(listing._listingPrice).to.be.bignumber.equal(ZERO);
        expect(listing._startDate).to.be.bignumber.equal(ZERO);
      });

      it('reverts if not owner', async () => {
        const start = await time.latest();
        await this.marketplace.listToken(firstEditionTokenId, _0_1_ETH, start, {from: collectorA});
        await expectRevert(
          this.marketplace.delistToken(firstEditionTokenId, {from: collectorD}),
          'Not token owner'
        );
      });

      it('reverts if not listed', async () => {
        const start = await time.latest();
        await this.marketplace.listToken(firstEditionTokenId, _0_1_ETH, start, {from: collectorA});
        await expectRevert(
          this.marketplace.delistToken(firstEditionTokenId.sub(ONE), {from: collectorA}),
          'No listing found'
        );
      });
    });

    describe('buyToken()', () => {

      const _0_1_ETH = ether('0.1');

      beforeEach(async () => {
        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.primaryMarketplace.address, true, {from: minter});

        // create 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

        const start = await time.latest();
        await this.primaryMarketplace.listEdition(minter, firstEditionTokenId, _0_1_ETH, start, {from: contract});

        // collector A buys a token (primary)
        await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});

        // collector B buys a token (primary)
        await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});

        // collector C buys a token (primary)
        await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorC, value: _0_1_ETH});

        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorA});
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorB});
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorC});
      });

      it('can buy token', async () => {

        const token1 = firstEditionTokenId;
        const token2 = firstEditionTokenId.add(ONE);
        const token3 = token2.add(ONE);

        // list token for sale at 0.1 ETH per token
        const start = await time.latest();
        await this.marketplace.listToken(token1, _0_1_ETH, start, {from: collectorA});
        await this.marketplace.listToken(token2, _0_1_ETH, start, {from: collectorB});
        await this.marketplace.listToken(token3, _0_1_ETH, start, {from: collectorC});

        await this.marketplace.buyToken(token1, {from: collectorD, value: _0_1_ETH});
        await this.marketplace.buyToken(token2, {from: collectorD, value: _0_1_ETH});
        await this.marketplace.buyToken(token3, {from: collectorD, value: _0_1_ETH});

        expect(await this.token.ownerOf(token1)).to.be.equal(collectorD);
        expect(await this.token.ownerOf(token2)).to.be.equal(collectorD);
        expect(await this.token.ownerOf(token3)).to.be.equal(collectorD);
      });

      it('reverts if owner has changed', async () => {

        const token1 = firstEditionTokenId;

        const start = await time.latest();
        await this.marketplace.listToken(token1, _0_1_ETH, start, {from: collectorA});
        expect(await this.token.ownerOf(token1)).to.be.equal(collectorA);

        this.token.transferFrom(collectorA, collectorB, token1, {from: collectorA});

        await expectRevert(
          this.marketplace.buyToken(token1, {from: collectorD, value: _0_1_ETH}),
          'Listing not valid, token owner has changed'
        );

      });

      it('reverts if no listing', async () => {
        const token1 = firstEditionTokenId;
        await expectRevert(
          this.marketplace.buyToken(token1, {from: collectorA, value: _0_1_ETH}),
          'No listing found'
        );
      });

      it('reverts if List price not satisfied', async () => {
        const token1 = firstEditionTokenId;

        const start = await time.latest();
        await this.marketplace.listToken(token1, _0_1_ETH, start, {from: collectorA});

        await expectRevert(
          this.marketplace.buyToken(token1, {from: collectorD, value: _0_1_ETH.sub(ONE)}),
          'List price not satisfied'
        );
      });

      it('reverts if List not available yet', async () => {
        const token1 = firstEditionTokenId;

        // in future
        const start = await time.latest();
        await this.marketplace.listToken(token1, _0_1_ETH, start.mul(new BN('2')), {from: collectorA});

        await expectRevert(
          this.marketplace.buyToken(token1, {from: collectorD, value: _0_1_ETH}),
          'List not available yet'
        );
      });
    });

    describe('buyTokenFor()', () => {

      const _0_1_ETH = ether('0.1');

      beforeEach(async () => {
        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.primaryMarketplace.address, true, {from: minter});

        // create 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

        const start = await time.latest();
        await this.primaryMarketplace.listEdition(minter, firstEditionTokenId, _0_1_ETH, start, {from: contract});

        // collector A buys a token (primary)
        await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});

        // collector B buys a token (primary)
        await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});

        // collector C buys a token (primary)
        await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorC, value: _0_1_ETH});

        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorA});
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorB});
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorC});
      });

      it('can buy token', async () => {

        const token1 = firstEditionTokenId;
        const token2 = firstEditionTokenId.add(ONE);
        const token3 = token2.add(ONE);

        // list token for sale at 0.1 ETH per token
        const start = await time.latest();
        await this.marketplace.listToken(token1, _0_1_ETH, start, {from: collectorA});
        await this.marketplace.listToken(token2, _0_1_ETH, start, {from: collectorB});
        await this.marketplace.listToken(token3, _0_1_ETH, start, {from: collectorC});

        // collectorC bought it for collectorD
        await this.marketplace.buyTokenFor(token1, collectorD, {from: collectorC, value: _0_1_ETH});
        await this.marketplace.buyTokenFor(token2, collectorD, {from: collectorC, value: _0_1_ETH});
        await this.marketplace.buyTokenFor(token3, collectorD, {from: collectorC, value: _0_1_ETH});

        expect(await this.token.ownerOf(token1)).to.be.equal(collectorD);
        expect(await this.token.ownerOf(token2)).to.be.equal(collectorD);
        expect(await this.token.ownerOf(token3)).to.be.equal(collectorD);
      });

      it('reverts if owner has changed', async () => {

        const token1 = firstEditionTokenId;

        const start = await time.latest();
        await this.marketplace.listToken(token1, _0_1_ETH, start, {from: collectorA});
        expect(await this.token.ownerOf(token1)).to.be.equal(collectorA);

        this.token.transferFrom(collectorA, collectorB, token1, {from: collectorA});

        await expectRevert(
          this.marketplace.buyTokenFor(token1, collectorD, {from: collectorD, value: _0_1_ETH}),
          'Listing not valid, token owner has changed'
        );

      });

      it('reverts if no listing', async () => {
        const token1 = firstEditionTokenId;
        await expectRevert(
          this.marketplace.buyTokenFor(token1, collectorD, {from: collectorA, value: _0_1_ETH}),
          'No listing found'
        );
      });

      it('reverts if List price not satisfied', async () => {
        const token1 = firstEditionTokenId;

        const start = await time.latest();
        await this.marketplace.listToken(token1, _0_1_ETH, start, {from: collectorA});

        await expectRevert(
          this.marketplace.buyTokenFor(token1, collectorD, {from: collectorD, value: _0_1_ETH.sub(ONE)}),
          'List price not satisfied'
        );
      });

      it('reverts if List not available yet', async () => {
        const token1 = firstEditionTokenId;

        // in future
        const start = await time.latest();
        await this.marketplace.listToken(token1, _0_1_ETH, start.mul(new BN('2')), {from: collectorA});

        await expectRevert(
          this.marketplace.buyTokenFor(token1, collectorD, {from: collectorD, value: _0_1_ETH}),
          'List not available yet'
        );
      });
    });
  });

});
