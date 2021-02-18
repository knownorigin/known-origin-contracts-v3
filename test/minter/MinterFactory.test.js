const {BN, constants, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const web3 = require('web3');
const {ether} = require("@openzeppelin/test-helpers");

const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3Marketplace = artifacts.require('KODAV3Marketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const MinterFactory = artifacts.require('MinterFactory');

const {validateEditionAndToken} = require('../test-helpers');

contract('MinterFactory', function (accounts) {
  const [_, deployer, koCommission, artist, collectorA, collectorB, collectorC, collectorD] = accounts;

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = '10000';

  const ETH_ONE = ether('1');

  const firstEditionTokenId = new BN('11000');

  beforeEach(async () => {
    // setup access controls
    const legacyAccessControls = await SelfServiceAccessControls.new();
    this.accessControls = await KOAccessControls.new(legacyAccessControls.address, {from: deployer});

    // grab the roles
    this.MINTER_ROLE = await this.accessControls.MINTER_ROLE();
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Set up access controls with artist roles
    await this.accessControls.grantRole(this.MINTER_ROLE, artist, {from: deployer});

    // Create token V3
    this.token = await KnownOriginDigitalAssetV3.new(
      this.accessControls.address,
      ZERO_ADDRESS, // no royalties address
      STARTING_EDITION,
      {from: deployer}
    );

    // Set contract roles
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.token.address, {from: deployer});

    // Create marketplace and enable in whitelist
    this.marketplace = await KODAV3Marketplace.new(this.accessControls.address, this.token.address, koCommission, {from: deployer})
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.marketplace.address, {from: deployer});

    // Create minting factory
    this.factory = await MinterFactory.new(
      this.accessControls.address,
      this.token.address,
      this.marketplace.address,
      {from: deployer}
    );
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.factory.address, {from: deployer});
  });

  describe("mintToken()", () => {

    beforeEach(async () => {
      this.startDate = Date.now();
      const receipt = await this.factory.mintTokenAndSetBuyNowPrice(ETH_ONE, this.startDate, TOKEN_URI, {from: artist});
      await expectEvent.inTransaction(receipt.tx, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist,
        tokenId: firstEditionTokenId
      });
    });

    it('edition created', async () => {
      const editionDetails = await this.token.getEditionDetails(firstEditionTokenId);
      expect(editionDetails._originalCreator).to.equal(artist, "Failed edition details creator validation")
      expect(editionDetails._owner).to.equal(artist, "Failed edition details owner validation")
      expect(editionDetails._editionId).to.bignumber.equal(firstEditionTokenId, "Failed edition details edition validation")
      expect(editionDetails._size).to.bignumber.equal('1', "Failed edition details size validation")
      expect(editionDetails._uri).to.equal(TOKEN_URI, "Failed edition details uri validation")
    });

    it('edition listed', async () => {
      const {_seller, _listingPrice, _startDate} = await this.marketplace.getEditionListing(firstEditionTokenId);
      expect(_seller).to.equal(artist, "Failed edition details edition validation")
      expect(_startDate).to.bignumber.equal(this.startDate.toString(), "Failed edition details size validation")
      expect(_listingPrice).to.bignumber.equal(ETH_ONE, "Failed edition details uri validation")
    });
  });

  describe("mintBatchEditionAndSetBuyNowPrice() - edition size 10", () => {

    const editionSize = '10';

    beforeEach(async () => {
      this.startDate = Date.now();
      const receipt = await this.factory.mintBatchEditionAndSetBuyNowPrice(editionSize, ETH_ONE, this.startDate, TOKEN_URI, {from: artist});
      await expectEvent.inTransaction(receipt.tx, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist,
        tokenId: firstEditionTokenId
      });
    });

    it('edition created', async () => {
      const editionDetails = await this.token.getEditionDetails(firstEditionTokenId);
      expect(editionDetails._originalCreator).to.equal(artist, "Failed edition details creator validation")
      expect(editionDetails._owner).to.equal(artist, "Failed edition details owner validation")
      expect(editionDetails._editionId).to.bignumber.equal(firstEditionTokenId, "Failed edition details edition validation")
      expect(editionDetails._size).to.bignumber.equal(editionSize, "Failed edition details size validation")
      expect(editionDetails._uri).to.equal(TOKEN_URI, "Failed edition details uri validation")
    });

    it('edition listed', async () => {
      const {_seller, _listingPrice, _startDate} = await this.marketplace.getEditionListing(firstEditionTokenId);
      expect(_seller).to.equal(artist, "Failed edition details edition validation")
      expect(_startDate).to.bignumber.equal(this.startDate.toString(), "Failed edition details size validation")
      expect(_listingPrice).to.bignumber.equal(ETH_ONE, "Failed edition details uri validation")
    });

  });

  describe("mintConsecutiveBatchEditionAndSetBuyNowPrice() - edition size 10", () => {

    const editionSize = '10';

    beforeEach(async () => {
      this.startDate = Date.now();
      const receipt = await this.factory.mintConsecutiveBatchEditionAndSetBuyNowPrice(editionSize, ETH_ONE, this.startDate, TOKEN_URI, {from: artist});
      const start = firstEditionTokenId.toNumber();
      const end = start + parseInt(editionSize);
      await expectEvent.inTransaction(receipt.tx, KnownOriginDigitalAssetV3, 'ConsecutiveTransfer', {
        fromAddress: ZERO_ADDRESS,
        toAddress: artist,
        fromTokenId: start.toString(),
        toTokenId: end.toString()
      });
    });

    it('edition created', async () => {
      const editionDetails = await this.token.getEditionDetails(firstEditionTokenId);
      expect(editionDetails._originalCreator).to.equal(artist, "Failed edition details creator validation")
      expect(editionDetails._owner).to.equal(artist, "Failed edition details owner validation")
      expect(editionDetails._editionId).to.bignumber.equal(firstEditionTokenId, "Failed edition details edition validation")
      expect(editionDetails._size).to.bignumber.equal(editionSize, "Failed edition details size validation")
      expect(editionDetails._uri).to.equal(TOKEN_URI, "Failed edition details uri validation")
    });

    it('edition listed', async () => {
      const {_seller, _listingPrice, _startDate} = await this.marketplace.getEditionListing(firstEditionTokenId);
      expect(_seller).to.equal(artist, "Failed edition details edition validation")
      expect(_startDate).to.bignumber.equal(this.startDate.toString(), "Failed edition details size validation")
      expect(_listingPrice).to.bignumber.equal(ETH_ONE, "Failed edition details uri validation")
    });
  });

});