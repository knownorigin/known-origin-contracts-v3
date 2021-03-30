const {BN, constants, expectEvent, expectRevert, time} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const {ether} = require('@openzeppelin/test-helpers');

const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3Marketplace = artifacts.require('KODAV3Marketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const MinterFactory = artifacts.require('MockMintingFactory');

contract('MinterFactory', function (accounts) {
  const [superAdmin, admin, deployer, koCommission, artist] = accounts;

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = '10000';
  const ONE = new BN('1');
  const _30_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;

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
    this.DEFAULT_ADMIN_ROLE = await this.accessControls.DEFAULT_ADMIN_ROLE();
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
    await this.accessControls.grantRole(this.DEFAULT_ADMIN_ROLE, admin, {from: deployer});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.factory.address, {from: deployer});

    this.MAX_EDITION_SIZE = await this.token.MAX_EDITION_SIZE();
    this.mintingPeriod = await this.factory.mintingPeriod();
    this.maxMintsInPeriod = await this.factory.maxMintsInPeriod();
  });

  describe('configs are setup accordingly', async () => {

    it('mintingPeriod()', async () => {
      expect(await this.factory.mintingPeriod()).to.be.bignumber.equal(this.mintingPeriod);
    });

    it('maxMintsInPeriod', async () => {
      expect(await this.factory.maxMintsInPeriod()).to.be.bignumber.equal(this.maxMintsInPeriod);
    });

    it('canCreateNewEdition', async () => {
      expect(await this.factory.canCreateNewEdition(artist)).to.be.equal(true);
    });

    it('empty mintingPeriodConfig() by default', async () => {
      const {mints, firstMintInPeriod} = await this.factory.currentMintConfig(artist);
      expect(mints).to.be.bignumber.equal('0');
      expect(firstMintInPeriod).to.be.bignumber.equal('0');
    });
  });

  describe('mintToken() - Buy Now', () => {

    beforeEach(async () => {
      this.startDate = Date.now();
      const receipt = await this.factory.mintToken(SaleType.BUY_NOW, this.startDate, ETH_ONE, 0, TOKEN_URI, {from: artist});
      await expectEvent.inTransaction(receipt.tx, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist,
        tokenId: firstEditionTokenId
      });
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

  describe('mintBatchEdition() - Buy Now - edition size 10', () => {

    const editionSize = '10';

    beforeEach(async () => {
      this.startDate = Date.now();
      const receipt = await this.factory.mintBatchEdition(SaleType.BUY_NOW, editionSize, this.startDate, ETH_ONE, 0, TOKEN_URI, {from: artist});
      await expectEvent.inTransaction(receipt.tx, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist,
        tokenId: firstEditionTokenId
      });
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

  describe('mintConsecutiveBatchEdition() - Buy Now - edition size 10', () => {

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

  describe('minting rules in a 30 day period', () => {

    it('can mint up to maxMintsInPeriod within a period, but fails afterwards', async () => {
      this.startDate = Date.now();
      await this.factory.setNow(this.startDate);

      let editionId = firstEditionTokenId;
      const range = _.range(0, _.toNumber(this.maxMintsInPeriod));

      // exhaust all tokens
      for (const id of range) {
        const receipt = await this.factory.mintToken(SaleType.BUY_NOW, this.startDate, ETH_ONE, 0, TOKEN_URI, {from: artist});
        await expectEvent.inTransaction(receipt.tx, KnownOriginDigitalAssetV3, 'Transfer', {
          from: ZERO_ADDRESS,
          to: artist,
          tokenId: editionId
        });

        // bump ID
        editionId = new BN(editionId).add(this.MAX_EDITION_SIZE);
      }

      // check 15 mints are recorded
      const {mints, firstMintInPeriod} = await this.factory.currentMintConfig(artist);
      expect(mints).to.be.bignumber.equal('15');
      expect(firstMintInPeriod).to.be.bignumber.equal(this.startDate.toString());

      // check cannot mint another one
      expect(await this.factory.canCreateNewEdition(artist)).to.be.equal(false);

      // confirm next mint will revert
      await expectRevert(
        this.factory.mintToken(SaleType.BUY_NOW, this.startDate, ETH_ONE, 0, TOKEN_URI, {from: artist}),
        'Caller unable to create yet'
      );

      // move time along to the next period and then try again
      this.startDate = Date.now() + _30_DAYS_IN_SECONDS + 1;
      await this.factory.setNow(this.startDate);

      // can mint again
      let receipt = await this.factory.mintToken(SaleType.BUY_NOW, this.startDate, ETH_ONE, 0, TOKEN_URI, {from: artist});
      await expectEvent.inTransaction(receipt.tx, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist,
        tokenId: editionId
      });

      // resets counter
      let config = await this.factory.currentMintConfig(artist);
      expect(config.mints).to.be.bignumber.equal('1');
      expect(config.firstMintInPeriod).to.be.bignumber.equal(this.startDate.toString());

      // check can mint another one
      expect(await this.factory.canCreateNewEdition(artist)).to.be.equal(true);

      // can mint again
      receipt = await this.factory.mintToken(SaleType.BUY_NOW, this.startDate, ETH_ONE, 0, TOKEN_URI, {from: artist});
      await expectEvent.inTransaction(receipt.tx, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist,
        tokenId: new BN(editionId).add(this.MAX_EDITION_SIZE)
      });

      // counter moves up by 1
      config = await this.factory.currentMintConfig(artist);
      expect(config.mints).to.be.bignumber.equal('2');
      expect(config.firstMintInPeriod).to.be.bignumber.equal(this.startDate.toString());

      // check can mint another one
      expect(await this.factory.canCreateNewEdition(artist)).to.be.equal(true);
    });

  });

  describe('setMintingPeriod()', async () => {
    it('can change the config', async () => {
      expect(await this.factory.mintingPeriod()).to.be.bignumber.equal(_30_DAYS_IN_SECONDS.toString());
      const receipt = await this.factory.setMintingPeriod('10', {from: admin});
      expectEvent.inLogs(receipt.logs, 'AdminMintingPeriodChanged', {
        _mintingPeriod: '10'
      });
      expect(await this.factory.mintingPeriod()).to.be.bignumber.equal('10');
    });
  });

  describe('setMaxMintsInPeriod()', async () => {
    it('can change the config', async () => {
      expect(await this.factory.maxMintsInPeriod()).to.be.bignumber.equal('15');
      const receipt = await this.factory.setMaxMintsInPeriod('1', {from: admin});
      expectEvent.inLogs(receipt.logs, 'AdminMaxMintsInPeriodChanged', {
        _maxMintsInPeriod: '1'
      });
      expect(await this.factory.maxMintsInPeriod()).to.be.bignumber.equal('1');
    });
  });

  describe('Frequency Override', async () => {

    beforeEach(async () => {
      // set override
      await this.factory.setFrequencyOverride(artist, true, {from: admin});
    });

    it('once frequency override is set, can mint more than max limit', async () => {
      this.startDate = Date.now();
      await this.factory.setNow(this.startDate);

      let editionId = firstEditionTokenId;

      // mint 50 editions
      for (const id of _.range(0, 50)) {
        const receipt = await this.factory.mintToken(SaleType.BUY_NOW, this.startDate, ETH_ONE, 0, TOKEN_URI, {from: artist});
        await expectEvent.inTransaction(receipt.tx, KnownOriginDigitalAssetV3, 'Transfer', {
          from: ZERO_ADDRESS,
          to: artist,
          tokenId: editionId
        });

        // bump ID
        editionId = new BN(editionId).add(this.MAX_EDITION_SIZE);
      }

      // check 15 mints are recorded
      const {mints, firstMintInPeriod} = await this.factory.currentMintConfig(artist);
      expect(mints).to.be.bignumber.equal('50');
      expect(firstMintInPeriod).to.be.bignumber.equal(this.startDate.toString());

      // check cannot mint another one
      expect(await this.factory.canCreateNewEdition(artist)).to.be.equal(true);

      // turn off frequency override
      await this.factory.setFrequencyOverride(artist, false, {from: admin});

      // confirm next mint will revert
      await expectRevert(
        this.factory.mintToken(SaleType.BUY_NOW, this.startDate, ETH_ONE, 0, TOKEN_URI, {from: artist}),
        'Caller unable to create yet'
      );
    });


  });
});
