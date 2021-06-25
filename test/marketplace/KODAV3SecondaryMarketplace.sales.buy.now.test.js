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
  });

  describe('secondary sale token listing', async () => {
    describe('listTokenForBuyNow()', () => {

      const _0_1_ETH = ether('0.1');

      beforeEach(async () => {
        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.primaryMarketplace.address, true, {from: minter});

        // create 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

        const start = await time.latest();
        await this.primaryMarketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, start, {from: contract});

        // collector A buys a token (primary)
        await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});

        // collector B buys a token (primary)
        await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});

        // collector C buys a token (primary)
        await this.primaryMarketplace.buyEditionToken(firstEditionTokenId, {from: collectorC, value: _0_1_ETH});
      });

      it('Reverts when already listed', async () => {
        await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: collectorA})
        await expectRevert(
          this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: collectorA}),
          "Listing is not permitted"
        )
      })

      it('User can withdraw their bid if a token is listed for buy now', async () => {
        const tokenBid = ether('0.2')
        await this.marketplace.placeTokenBid(firstEditionTokenId, {from: collectorA, value: tokenBid});

        await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, '0', {from: collectorA})

        // Back to the future...
        await time.increase(time.duration.hours(LOCKUP_HOURS));

        const bidderTracker = await balance.tracker(collectorA)

        const gasPrice = new BN(web3.utils.toWei('1', 'gwei').toString());
        const tx = await this.marketplace.withdrawTokenBid(firstEditionTokenId, {from: collectorA, gasPrice})

        const gasUsed = new BN(tx.receipt.cumulativeGasUsed);
        const txCost = gasUsed.mul(gasPrice);

        expect(await bidderTracker.delta()).to.be.bignumber.equal(tokenBid.sub(txCost))
      })

      it('can list token', async () => {

        const token1 = firstEditionTokenId;
        const token2 = firstEditionTokenId.add(ONE);
        const token3 = token2.add(ONE);

        // list token for sale at 0.1 ETH per token
        const start = await time.latest();
        await this.marketplace.listTokenForBuyNow(token1, _0_1_ETH, start, {from: collectorA});
        await this.marketplace.listTokenForBuyNow(token2, _0_1_ETH, start, {from: collectorB});
        await this.marketplace.listTokenForBuyNow(token3, _0_1_ETH, start, {from: collectorC});

        let listing = await this.marketplace.editionOrTokenListings(token1);
        expect(listing.seller).to.be.equal(collectorA);
        expect(listing.price).to.be.bignumber.equal(_0_1_ETH);
        expect(listing.startDate).to.be.bignumber.equal(start);

        listing = await this.marketplace.editionOrTokenListings(token2);
        expect(listing.seller).to.be.equal(collectorB);
        expect(listing.price).to.be.bignumber.equal(_0_1_ETH);
        expect(listing.startDate).to.be.bignumber.equal(start);

        listing = await this.marketplace.editionOrTokenListings(token3);
        expect(listing.seller).to.be.equal(collectorC);
        expect(listing.price).to.be.bignumber.equal(_0_1_ETH);
        expect(listing.startDate).to.be.bignumber.equal(start);

        const {seller} = await this.marketplace.editionOrTokenListings(token1);
        expect(seller).to.be.equal(collectorA);

        const {price} = await this.marketplace.editionOrTokenListings(token1);
        expect(price).to.be.bignumber.equal(_0_1_ETH);

        const {startDate} = await this.marketplace.editionOrTokenListings(token1);
        expect(startDate).to.be.bignumber.equal(start);
      });

      it('reverts if not owner', async () => {
        await expectRevert(
          this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, await time.latest(), {from: collectorD}),
          'Buy now listing invalid'
        );
      });

      it('reverts if under min bid amount listing price', async () => {
        await expectRevert(
          this.marketplace.listTokenForBuyNow(firstEditionTokenId, this.minBidAmount.sub(ONE), await time.latest(), {from: collectorA}),
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
        await this.primaryMarketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, start, {from: contract});

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
        await this.marketplace.listTokenForBuyNow(token1, _0_1_ETH, start, {from: collectorA});

        let listing = await this.marketplace.editionOrTokenListings(token1);
        expect(listing.seller).to.be.equal(collectorA);
        expect(listing.price).to.be.bignumber.equal(_0_1_ETH);
        expect(listing.startDate).to.be.bignumber.equal(start);

        await this.marketplace.delistToken(token1, {from: collectorA});
        listing = await this.marketplace.editionOrTokenListings(token1);
        expect(listing.seller).to.be.equal(ZERO_ADDRESS);
        expect(listing.price).to.be.bignumber.equal(ZERO);
        expect(listing.startDate).to.be.bignumber.equal(ZERO);
      });

      it('reverts if not owner', async () => {
        const start = await time.latest();
        await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, start, {from: collectorA});
        await expectRevert(
          this.marketplace.delistToken(firstEditionTokenId, {from: collectorD}),
          'Not token owner'
        );
      });

      it('reverts if not listed', async () => {
        const start = await time.latest();
        await this.marketplace.listTokenForBuyNow(firstEditionTokenId, _0_1_ETH, start, {from: collectorA});
        await expectRevert(
          this.marketplace.delistToken(firstEditionTokenId.sub(ONE), {from: collectorA}),
          'No listing found'
        );
      });
    });

    describe('buyEditionToken()', () => {

      const _0_1_ETH = ether('0.1');

      beforeEach(async () => {
        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.primaryMarketplace.address, true, {from: minter});

        // create 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

        const start = await time.latest();
        await this.primaryMarketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, start, {from: contract});

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
        await this.marketplace.listTokenForBuyNow(token1, _0_1_ETH, start, {from: collectorA});
        await this.marketplace.listTokenForBuyNow(token2, _0_1_ETH, start, {from: collectorB});
        await this.marketplace.listTokenForBuyNow(token3, _0_1_ETH, start, {from: collectorC});

        await this.marketplace.buyEditionToken(token1, {from: collectorD, value: _0_1_ETH});
        await this.marketplace.buyEditionToken(token2, {from: collectorD, value: _0_1_ETH});
        await this.marketplace.buyEditionToken(token3, {from: collectorD, value: _0_1_ETH});

        expect(await this.token.ownerOf(token1)).to.be.equal(collectorD);
        expect(await this.token.ownerOf(token2)).to.be.equal(collectorD);
        expect(await this.token.ownerOf(token3)).to.be.equal(collectorD);
      });

      it('reverts if owner has changed', async () => {

        const token1 = firstEditionTokenId;

        const start = await time.latest();
        await this.marketplace.listTokenForBuyNow(token1, _0_1_ETH, start, {from: collectorA});
        expect(await this.token.ownerOf(token1)).to.be.equal(collectorA);

        this.token.transferFrom(collectorA, collectorB, token1, {from: collectorA});

        await expectRevert(
          this.marketplace.buyEditionToken(token1, {from: collectorD, value: _0_1_ETH}),
          'ERC721_OWNER_MISMATCH'
        );

      });

      it('reverts if no listing', async () => {
        const token1 = firstEditionTokenId;
        await expectRevert(
          this.marketplace.buyEditionToken(token1, {from: collectorA, value: _0_1_ETH}),
          'No listing found'
        );
      });

      it('reverts if List price not satisfied', async () => {
        const token1 = firstEditionTokenId;

        const start = await time.latest();
        await this.marketplace.listTokenForBuyNow(token1, _0_1_ETH, start, {from: collectorA});

        await expectRevert(
          this.marketplace.buyEditionToken(token1, {from: collectorD, value: _0_1_ETH.sub(ONE)}),
          'List price not satisfied'
        );
      });

      it('reverts if List not available yet', async () => {
        const token1 = firstEditionTokenId;

        // in future
        const start = await time.latest();
        await this.marketplace.listTokenForBuyNow(token1, _0_1_ETH, start.mul(new BN('2')), {from: collectorA});

        await expectRevert(
          this.marketplace.buyEditionToken(token1, {from: collectorD, value: _0_1_ETH}),
          'List not available yet'
        );
      });
    });

    describe('buyEditionTokenFor()', () => {

      const _0_1_ETH = ether('0.1');

      beforeEach(async () => {
        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.primaryMarketplace.address, true, {from: minter});

        // create 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

        const start = await time.latest();
        await this.primaryMarketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, start, {from: contract});

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
        await this.marketplace.listTokenForBuyNow(token1, _0_1_ETH, start, {from: collectorA});
        await this.marketplace.listTokenForBuyNow(token2, _0_1_ETH, start, {from: collectorB});
        await this.marketplace.listTokenForBuyNow(token3, _0_1_ETH, start, {from: collectorC});

        // collectorC bought it for collectorD
        await this.marketplace.buyEditionTokenFor(token1, collectorD, {from: collectorC, value: _0_1_ETH});
        await this.marketplace.buyEditionTokenFor(token2, collectorD, {from: collectorC, value: _0_1_ETH});
        await this.marketplace.buyEditionTokenFor(token3, collectorD, {from: collectorC, value: _0_1_ETH});

        expect(await this.token.ownerOf(token1)).to.be.equal(collectorD);
        expect(await this.token.ownerOf(token2)).to.be.equal(collectorD);
        expect(await this.token.ownerOf(token3)).to.be.equal(collectorD);
      });

      it('reverts if owner has changed', async () => {

        const token1 = firstEditionTokenId;

        const start = await time.latest();
        await this.marketplace.listTokenForBuyNow(token1, _0_1_ETH, start, {from: collectorA});
        expect(await this.token.ownerOf(token1)).to.be.equal(collectorA);

        this.token.transferFrom(collectorA, collectorB, token1, {from: collectorA});

        await expectRevert(
          this.marketplace.buyEditionTokenFor(token1, collectorD, {from: collectorD, value: _0_1_ETH}),
          'ERC721_OWNER_MISMATCH'
        );

      });

      it('reverts if no listing', async () => {
        const token1 = firstEditionTokenId;
        await expectRevert(
          this.marketplace.buyEditionTokenFor(token1, collectorD, {from: collectorA, value: _0_1_ETH}),
          'No listing found'
        );
      });

      it('reverts if List price not satisfied', async () => {
        const token1 = firstEditionTokenId;

        const start = await time.latest();
        await this.marketplace.listTokenForBuyNow(token1, _0_1_ETH, start, {from: collectorA});

        await expectRevert(
          this.marketplace.buyEditionTokenFor(token1, collectorD, {from: collectorD, value: _0_1_ETH.sub(ONE)}),
          'List price not satisfied'
        );
      });

      it('reverts if List not available yet', async () => {
        const token1 = firstEditionTokenId;

        // in future
        const start = await time.latest();
        await this.marketplace.listTokenForBuyNow(token1, _0_1_ETH, start.mul(new BN('2')), {from: collectorA});

        await expectRevert(
          this.marketplace.buyEditionTokenFor(token1, collectorD, {from: collectorD, value: _0_1_ETH}),
          'List not available yet'
        );
      });
    });
  });

});
