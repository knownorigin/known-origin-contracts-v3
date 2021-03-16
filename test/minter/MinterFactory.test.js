const {BN, constants, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const web3 = require('web3');
const {ether} = require('@openzeppelin/test-helpers');

const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3Marketplace = artifacts.require('KODAV3Marketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const MinterFactory = artifacts.require('MintingFactory');

const {validateEditionAndToken} = require('../test-helpers');

contract('MinterFactory', function (accounts) {
  const [_, deployer, koCommission, artist, collectorA, collectorB, collectorC, collectorD] = accounts;

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = '10000';

  const ETH_ONE = ether('1');

  const SaleType = {
    BUY_NOW: 0, OFFERS: 1, STEPPED: 2
  };

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
    this.marketplace = await KODAV3Marketplace.new(this.accessControls.address, this.token.address, koCommission, {from: deployer});
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

  describe.only('mintToken() - Buy Now', () => {

    beforeEach(async () => {
      this.startDate = Date.now();
      const receipt = await this.factory.mintToken(SaleType.BUY_NOW, this.startDate, ETH_ONE, 0, TOKEN_URI, {from: artist});
      await expectEvent.inTransaction(receipt.tx, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist,
        tokenId: firstEditionTokenId
      });

      // ensure that the artist cannot mint again within the freeze window
      await expectRevert(
        this.factory.mintToken(SaleType.BUY_NOW, this.startDate, ETH_ONE, 0, TOKEN_URI, {from: artist}),
        "KODA: Caller unable to create yet"
      )
    });

    it('edition created', async () => {
      const editionDetails = await this.token.getEditionDetails(firstEditionTokenId);
      expect(editionDetails._originalCreator).to.equal(artist, 'Failed edition details creator validation');
      expect(editionDetails._owner).to.equal(artist, 'Failed edition details owner validation');
      expect(editionDetails._editionId).to.bignumber.equal(firstEditionTokenId, 'Failed edition details edition validation');
      expect(editionDetails._size).to.bignumber.equal('1', 'Failed edition details size validation');
      expect(editionDetails._uri).to.equal(TOKEN_URI, 'Failed edition details uri validation');
    });

    it('edition listed', async () => {
      const {_seller, _listingPrice, _startDate} = await this.marketplace.getEditionListing(firstEditionTokenId);
      expect(_seller).to.equal(artist, 'Failed edition details edition validation');
      expect(_startDate).to.bignumber.equal(this.startDate.toString(), 'Failed edition details size validation');
      expect(_listingPrice).to.bignumber.equal(ETH_ONE, 'Failed edition details uri validation');
    });
  });

  describe.only('mintBatchEdition() - Buy Now - edition size 10', () => {

    const editionSize = '10';

    beforeEach(async () => {
      this.startDate = Date.now();
      const receipt = await this.factory.mintBatchEdition(SaleType.BUY_NOW, editionSize, this.startDate, ETH_ONE, 0, TOKEN_URI, {from: artist});
      await expectEvent.inTransaction(receipt.tx, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist,
        tokenId: firstEditionTokenId
      });

      // ensure that the artist cannot mint again within the freeze window
      await expectRevert(
        this.factory.mintBatchEdition(SaleType.BUY_NOW, editionSize, this.startDate, ETH_ONE, 0, TOKEN_URI, {from: artist}),
        "KODA: Caller unable to create yet"
      )
    });

    it('edition created', async () => {
      const editionDetails = await this.token.getEditionDetails(firstEditionTokenId);
      expect(editionDetails._originalCreator).to.equal(artist, 'Failed edition details creator validation');
      expect(editionDetails._owner).to.equal(artist, 'Failed edition details owner validation');
      expect(editionDetails._editionId).to.bignumber.equal(firstEditionTokenId, 'Failed edition details edition validation');
      expect(editionDetails._size).to.bignumber.equal(editionSize, 'Failed edition details size validation');
      expect(editionDetails._uri).to.equal(TOKEN_URI, 'Failed edition details uri validation');
    });

    it('edition listed', async () => {
      const {_seller, _listingPrice, _startDate} = await this.marketplace.getEditionListing(firstEditionTokenId);
      expect(_seller).to.equal(artist, 'Failed edition details edition validation');
      expect(_startDate).to.bignumber.equal(this.startDate.toString(), 'Failed edition details size validation');
      expect(_listingPrice).to.bignumber.equal(ETH_ONE, 'Failed edition details uri validation');
    });

  });

  describe.only('mintConsecutiveBatchEdition() - Buy Now - edition size 10', () => {

    const editionSize = '10';

    beforeEach(async () => {
      this.startDate = Date.now();
      const receipt = await this.factory.mintConsecutiveBatchEdition(SaleType.BUY_NOW, editionSize, this.startDate, ETH_ONE, 0, TOKEN_URI, {from: artist});
      const start = firstEditionTokenId.toNumber();
      const end = start + parseInt(editionSize);
      await expectEvent.inTransaction(receipt.tx, KnownOriginDigitalAssetV3, 'ConsecutiveTransfer', {
        fromAddress: ZERO_ADDRESS,
        toAddress: artist,
        fromTokenId: start.toString(),
        toTokenId: end.toString()
      });

      // ensure that the artist cannot mint again within the freeze window
      await expectRevert(
        this.factory.mintConsecutiveBatchEdition(SaleType.BUY_NOW, editionSize, this.startDate, ETH_ONE, 0, TOKEN_URI, {from: artist}),
        "KODA: Caller unable to create yet"
      )
    });

    it('edition created', async () => {
      const editionDetails = await this.token.getEditionDetails(firstEditionTokenId);
      expect(editionDetails._originalCreator).to.equal(artist, 'Failed edition details creator validation');
      expect(editionDetails._owner).to.equal(artist, 'Failed edition details owner validation');
      expect(editionDetails._editionId).to.bignumber.equal(firstEditionTokenId, 'Failed edition details edition validation');
      expect(editionDetails._size).to.bignumber.equal(editionSize, 'Failed edition details size validation');
      expect(editionDetails._uri).to.equal(TOKEN_URI, 'Failed edition details uri validation');
    });

    it('edition listed', async () => {
      const {_seller, _listingPrice, _startDate} = await this.marketplace.getEditionListing(firstEditionTokenId);
      expect(_seller).to.equal(artist, 'Failed edition details edition validation');
      expect(_startDate).to.bignumber.equal(this.startDate.toString(), 'Failed edition details size validation');
      expect(_listingPrice).to.bignumber.equal(ETH_ONE, 'Failed edition details uri validation');
    });
  });

});
