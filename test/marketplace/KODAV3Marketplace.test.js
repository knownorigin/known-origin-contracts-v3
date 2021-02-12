const {BN, constants, time, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const web3 = require('web3');
const {ether} = require("@openzeppelin/test-helpers");

const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3Marketplace = artifacts.require('KODAV3Marketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

const {validateEditionAndToken} = require('../test-helpers');

contract('ERC721', function (accounts) {
  const [owner, minter, koCommission, contract, collectorA, collectorB, collectorC, collectorD] = accounts;

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = '10000';

  const ETH_ONE = ether('1');
  const ONE = new BN('1');
  const ZERO = new BN('0');

  const firstEditionTokenId = new BN('11000');
  const secondEditionTokenId = new BN('12000');
  const thirdEditionTokenId = new BN('13000');
  const nonExistentTokenId = new BN('99999999999');

  beforeEach(async () => {
    const legacyAccessControls = await SelfServiceAccessControls.new();
    // setup access controls
    this.accessControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

    // grab the roles
    this.MINTER_ROLE = await this.accessControls.MINTER_ROLE();
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Set up access controls with minter roles
    await this.accessControls.grantRole(this.MINTER_ROLE, owner, {from: owner});
    await this.accessControls.grantRole(this.MINTER_ROLE, minter, {from: owner});

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

  describe("two primary sales via 'buy now' purchase and re-sold on secondary", () => {

    const _0_1_ETH = ether('0.1');

    beforeEach(async () => {
      // Ensure owner is approved as this will fail if not
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // create 100 tokens to the minter
      await this.token.mintBatchEdition(100, minter, TOKEN_URI, {from: contract});

      // list edition for sale at 0.1 ETH per token
      await this.marketplace.listEdition(minter, firstEditionTokenId, _0_1_ETH, await time.latest(), {from: contract});
    });

    it('initial primary sale, resold on secondary', async () => {

      //////////////////////////////
      // collector A buys 1 token //
      //////////////////////////////

      const token1 = firstEditionTokenId;

      // collector A buys a token
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});

      // owner of token 1 is the collector
      expect(await this.token.ownerOf(token1)).to.be.equal(collectorA);

      // Minter now owns 9 and collector owns 1
      await validateEditionAndToken.call(this, {
        tokenId: token1,
        editionId: firstEditionTokenId,
        owner: collectorA,
        ownerBalance: '1',
        creator: minter,
        creatorBalance: '99',
        size: '100',
        uri: TOKEN_URI
      });

      //////////////////////////////
      // collector B buys 1 token //
      //////////////////////////////

      const token2 = firstEditionTokenId.add(new BN('1'));

      // collector A buys a token
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});

      // owner of token 1 is the collector
      expect(await this.token.ownerOf(token2)).to.be.equal(collectorB);

      // Minter now owns 8, collectorA owns 1, collector B owns 1
      await validateEditionAndToken.call(this, {
        tokenId: token2,
        editionId: firstEditionTokenId,
        owner: collectorB,
        ownerBalance: '1',
        creator: minter,
        creatorBalance: '98',
        size: '100',
        uri: TOKEN_URI
      });

      ///////////////////////////////////////////////////////////////
      // collector A lists token - collector B buys it - secondary //
      ///////////////////////////////////////////////////////////////

      // Ensure collector a approves marketplace
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorA});

      // listed
      await this.marketplace.listToken(token1, _0_1_ETH, {from: collectorA});

      // bought buy collector 1
      await this.marketplace.buyToken(token1, {from: collectorB, value: _0_1_ETH});

      // collector B owns both
      expect(await this.token.ownerOf(token1)).to.be.equal(collectorB);
      expect(await this.token.ownerOf(token2)).to.be.equal(collectorB);

      await validateEditionAndToken.call(this, {
        tokenId: token1,
        editionId: firstEditionTokenId,
        owner: collectorB,
        ownerBalance: '2',
        creator: minter,
        creatorBalance: '98',
        size: '100',
        uri: TOKEN_URI
      });
    });

    it('all tokens bought on primary and sold on the secondary', async () => {
      const start = _.toNumber(firstEditionTokenId);
      const end = start + 100;
      const tokenIds = _.range(start, end);

      // collector A buys all
      for (const id of tokenIds) {
        await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});
        expect(await this.token.ownerOf(id)).to.be.equal(collectorA);
      }

      // Ensure collector a approves marketplace
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorA});

      // collector A lists all and then collector B buys them all
      for (const id of tokenIds) {
        await this.marketplace.listToken(id, _0_1_ETH, {from: collectorA});
        await this.marketplace.buyToken(id, {from: collectorB, value: _0_1_ETH});
        expect(await this.token.ownerOf(id)).to.be.equal(collectorB);
      }
    }).timeout(300000);

  });

  describe("listEdition()", () => {

    const _0_1_ETH = ether('0.1');

    beforeEach(async () => {
      // Ensure owner is approved as this will fail if not
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // create 100 tokens to the minter
      await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});
    });

    it('can list and purchase upto limit (of 3)', async () => {

      // list edition for sale at 0.1 ETH per token
      const start = await time.latest();
      await this.marketplace.listEdition(minter, firstEditionTokenId, _0_1_ETH, start, {from: contract});

      const listing = await this.marketplace.getEditionListing(firstEditionTokenId);
      expect(listing._seller).to.be.equal(minter);
      expect(listing._listingPrice).to.be.bignumber.equal(_0_1_ETH);
      expect(listing._startDate).to.be.bignumber.equal(start);

      const token1 = firstEditionTokenId;
      const token2 = firstEditionTokenId.add(ONE);
      const token3 = token2.add(ONE);

      // collector A buys a token
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});

      // collector B buys a token
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});

      // collector C buys a token
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorC, value: _0_1_ETH});

      expect(await this.token.ownerOf(token1)).to.be.equal(collectorA);
      expect(await this.token.ownerOf(token2)).to.be.equal(collectorB);
      expect(await this.token.ownerOf(token3)).to.be.equal(collectorC);
    });

    it('reverts if not contract role', async () => {
      await expectRevert(
        this.marketplace.listEdition(minter, firstEditionTokenId, _0_1_ETH, await time.latest(), {from: collectorA}),
        "KODA: Caller must have contract role"
      );
    });

    it('reverts if under min bid amount listing price', async () => {
      await expectRevert(
        this.marketplace.listEdition(minter, firstEditionTokenId, this.minBidAmount.sub(ONE), await time.latest(), {from: contract}),
        "Listing price not enough"
      );
    });
  });

  describe("buyEditionToken()", () => {

    const _0_1_ETH = ether('0.1');

    beforeEach(async () => {
      // Ensure owner is approved as this will fail if not
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // create 100 tokens to the minter
      await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

      this.start = await time.latest();
      await this.marketplace.listEdition(minter, firstEditionTokenId, _0_1_ETH, this.start, {from: contract});
    });

    it('happy path', async () => {
      // collector A buys a token
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});

      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);
    });

    it('reverts if no listing', async () => {
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId.sub(ONE), {from: collectorA, value: _0_1_ETH}),
        "No listing found"
      );
    });

    it('reverts if List price not satisfied', async () => {
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: contract, value: _0_1_ETH.sub(ONE)}),
        "List price not satisfied"
      );
    });

    it('reverts if List not available yet', async () => {
      await this.marketplace.listEdition(minter, firstEditionTokenId, _0_1_ETH, this.start.mul(new BN('2')), {from: contract});
      await expectRevert(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: contract, value: _0_1_ETH}),
        "List not available yet"
      );
    });

    it('reverts if none left', async () => {
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorC, value: _0_1_ETH});

      await expectRevert.unspecified(
        this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH}),
        "KODA: No tokens left on the primary market"
      );
    });

  });

  describe("listToken()", () => {

    const _0_1_ETH = ether('0.1');

    beforeEach(async () => {
      // Ensure owner is approved as this will fail if not
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // create 100 tokens to the minter
      await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

      const start = await time.latest();
      await this.marketplace.listEdition(minter, firstEditionTokenId, _0_1_ETH, start, {from: contract});

      // collector A buys a token (primary)
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});

      // collector B buys a token (primary)
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});

      // collector C buys a token (primary)
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorC, value: _0_1_ETH});
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
      expect(listing._listingPrice).to.be.bignumber.equal(new BN);
      expect(listing._startDate).to.be.bignumber.equal(start);
    });

    it('reverts if not owner', async () => {
      await expectRevert(
        this.marketplace.listToken(firstEditionTokenId, _0_1_ETH, await time.latest(), {from: collectorD}),
        "Not token owner"
      );
    });

    it('reverts if under min bid amount listing price', async () => {
      await expectRevert(
        this.marketplace.listToken(firstEditionTokenId, this.minBidAmount.sub(ONE), await time.latest(), {from: collectorA}),
        "Listing price not enough"
      );
    });
  });

  describe("delistToken()", () => {

    const _0_1_ETH = ether('0.1');

    beforeEach(async () => {
      // Ensure owner is approved as this will fail if not
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // create 100 tokens to the minter
      await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

      const start = await time.latest();
      await this.marketplace.listEdition(minter, firstEditionTokenId, _0_1_ETH, start, {from: contract});

      // collector A buys a token (primary)
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});

      // collector B buys a token (primary)
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});

      // collector C buys a token (primary)
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorC, value: _0_1_ETH});
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
        "Not token owner"
      );
    });

    it('reverts if not listed', async () => {
      const start = await time.latest();
      await this.marketplace.listToken(firstEditionTokenId, _0_1_ETH, start, {from: collectorA});
      await expectRevert(
        this.marketplace.delistToken(firstEditionTokenId.sub(ONE), {from: collectorA}),
        "No listing found"
      );
    });
  });

  describe("buyToken()", () => {

    const _0_1_ETH = ether('0.1');

    beforeEach(async () => {
      // Ensure owner is approved as this will fail if not
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // create 100 tokens to the minter
      await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

      const start = await time.latest();
      await this.marketplace.listEdition(minter, firstEditionTokenId, _0_1_ETH, start, {from: contract});

      // collector A buys a token (primary)
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});

      // collector B buys a token (primary)
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});

      // collector C buys a token (primary)
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorC, value: _0_1_ETH});

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

    it('reverts if no listing', async () => {
      const token1 = firstEditionTokenId;
      await expectRevert(
        this.marketplace.buyToken(token1, {from: collectorA, value: _0_1_ETH}),
        "No listing found"
      );
    });

    it('reverts if List price not satisfied', async () => {
      const token1 = firstEditionTokenId;

      const start = await time.latest();
      await this.marketplace.listToken(token1, _0_1_ETH, start, {from: collectorA});

      await expectRevert(
        this.marketplace.buyToken(token1, {from: collectorD, value: _0_1_ETH.sub(ONE)}),
        "List price not satisfied"
      );
    });

    it('reverts if List not available yet', async () => {
      const token1 = firstEditionTokenId;

      // in future
      const start = await time.latest();
      await this.marketplace.listToken(token1, _0_1_ETH, start.mul(new BN('2')), {from: collectorA});

      await expectRevert(
        this.marketplace.buyToken(token1, {from: collectorD, value: _0_1_ETH}),
        "List not available yet"
      );
    });
  });
});
