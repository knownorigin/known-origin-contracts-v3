const {BN, constants, expectEvent, expectRevert, balance, time, ether} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3UpgradableGatedMarketplace = artifacts.require('KODAV3UpgradableGatedMarketplace');
const KODAV3Marketplace = artifacts.require('KODAV3PrimaryMarketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const MinterFactory = artifacts.require('MockMintingFactoryV2');
const CollabRoyaltiesRegistry = artifacts.require('CollabRoyaltiesRegistry');
const ClaimableFundsReceiverV1 = artifacts.require('ClaimableFundsReceiverV1');

const {parseBalanceMap} = require('../utils/parse-balance-map');
const {buildArtistMerkleInput} = require('../utils/merkle-tools');

contract('MinterFactory V2', function () {
  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = '10000';
  const ONE = new BN('1');
  const _30_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;

  const HALF = new BN(5000000);
  const QUARTER = new BN(2500000);

  const ETH_ONE = ether('1');

  const SaleType = {
    BUY_NOW: 0, OFFERS: 1, STEPPED: 2
  };

  const firstEditionTokenId = new BN('11000');

  let superAdmin, admin, deployer, koCommission, artist, anotherArtist, oneMoreArtist, proxy;

  beforeEach(async () => {
    [superAdmin, admin, deployer, koCommission, artist, anotherArtist, oneMoreArtist, proxy] = await ethers.getSigners();

    // setup access controls
    const legacyAccessControls = await SelfServiceAccessControls.new();
    this.accessControls = await KOAccessControls.new(legacyAccessControls.address, {from: deployer.address});

    // grab the roles
    this.DEFAULT_ADMIN_ROLE = await this.accessControls.DEFAULT_ADMIN_ROLE();
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Set up access controls with artist.address roles
    this.merkleProof = parseBalanceMap(buildArtistMerkleInput(1, artist.address, anotherArtist.address));
    await this.accessControls.updateArtistMerkleRoot(this.merkleProof.merkleRoot, {from: deployer.address});

    this.artistProofIndex = this.merkleProof.claims[artist.address].index;
    this.artistProof = this.merkleProof.claims[artist.address].proof;

    // Create token V3
    this.token = await KnownOriginDigitalAssetV3.new(
      this.accessControls.address,
      ZERO_ADDRESS, // no royalties address
      STARTING_EDITION,
      {from: deployer.address}
    );
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.token.address, {from: deployer.address});

    // setup gated sale marketplace
    this.gatedSale = await upgrades.deployProxy(
      await ethers.getContractFactory('KODAV3UpgradableGatedMarketplace'),
      [this.accessControls.address, this.token.address, koCommission.address],
      {initializer: 'initialize', kind: 'uups'}
    );
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.gatedSale.address, {from: deployer.address});

    // Create marketplace and enable in whitelist
    this.marketplace = await KODAV3Marketplace.new(this.accessControls.address, this.token.address, koCommission.address, {from: deployer.address});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.marketplace.address, {from: deployer.address});

    this.factory = await upgrades.deployProxy(
      await ethers.getContractFactory('MockMintingFactoryV2'), // Use mock factory so we can override the time
      [this.accessControls.address, this.token.address, this.marketplace.address, this.gatedSale.address, ZERO_ADDRESS],
      {initializer: 'initialize', kind: 'uups'}
    );

    await this.accessControls.grantRole(this.DEFAULT_ADMIN_ROLE, admin.address, {from: deployer.address});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.factory.address, {from: deployer.address});

    this.MAX_EDITION_SIZE = await this.token.MAX_EDITION_SIZE();
    this.mintingPeriod = await this.factory.mintingPeriod();
    this.maxMintsInPeriod = await this.factory.maxMintsInPeriod();
  });

  describe('configs are setup accordingly', async () => {

    it('mintingPeriod()', async () => {
      expect((await this.factory.mintingPeriod()).toString()).to.be.equal(this.mintingPeriod.toString());
    });

    it('maxMintsInPeriod', async () => {
      expect((await this.factory.maxMintsInPeriod()).toString()).to.be.equal(this.maxMintsInPeriod.toString());
    });

    it('canCreateNewEdition', async () => {
      expect(await this.factory.canCreateNewEdition(artist.address)).to.be.equal(true);
    });

    it('empty mintingPeriodConfig() by default', async () => {
      const {mints, firstMintInPeriod} = await this.factory.currentMintConfig(artist.address);
      expect(mints.toString()).to.be.equal('0');
      expect(firstMintInPeriod.toString()).to.be.equal('0');
    });
  });

  describe('mintBatchEdition() - Buy Now', () => {

    beforeEach(async () => {
      this.startDate = Date.now();

      const receipt = await this.factory.connect(artist).mintBatchEdition(
        SaleType.BUY_NOW,
        '1',
        this.startDate,
        ETH_ONE.toString(),
        '0',
        TOKEN_URI,
        this.artistProofIndex,
        this.artistProof,
        ZERO_ADDRESS
      );

      await expectEvent.inTransaction(receipt.hash, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist.address,
        tokenId: firstEditionTokenId.toString()
      });
    });

    it('edition created', async () => {
      const editionDetails = await this.token.getEditionDetails(firstEditionTokenId);
      expect(editionDetails._originalCreator).to.equal(artist.address, 'Failed edition details creator validation');
      expect(editionDetails._owner).to.equal(artist.address, 'Failed edition details owner validation');
      expect(editionDetails._editionId).to.bignumber.equal(firstEditionTokenId, 'Failed edition details edition validation');
      expect(editionDetails._size).to.bignumber.equal('1', 'Failed edition details size validation');
      expect(editionDetails._uri).to.equal(TOKEN_URI, 'Failed edition details uri validation');
    });

    it('edition listed', async () => {
      const {
        seller: _seller,
        price: _listingPrice,
        startDate: _startDate
      } = await this.marketplace.editionOrTokenListings(firstEditionTokenId);
      expect(_seller).to.equal(artist.address, 'Failed edition details edition validation');
      expect(_startDate).to.bignumber.equal(this.startDate.toString(), 'Failed edition details size validation');
      expect(_listingPrice).to.bignumber.equal(ETH_ONE, 'Failed edition details uri validation');
    });
  });

  describe('minting as proxy', () => {
    beforeEach(async () => {
      await this.accessControls.setVerifiedArtistProxy(
        proxy.address,
        this.merkleProof.claims[artist.address].index,
        this.merkleProof.claims[artist.address].proof,
        {from: artist.address}
      );
    });

    it('can mint token as proxy.address', async () => {
      this.startDate = Date.now();

      const receipt = await this.factory.connect(proxy).mintBatchEditionAsProxy(
        artist.address,
        SaleType.BUY_NOW,
        '1',
        this.startDate,
        ETH_ONE.toString(),
        '0',
        TOKEN_URI,
        ZERO_ADDRESS
      );

      await expectEvent.inTransaction(receipt.hash, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist.address,
        tokenId: firstEditionTokenId.toString()
      });

      await expectEvent.inTransaction(receipt.hash, MinterFactory, 'EditionMintedAndListed', {
        _saleType: SaleType.BUY_NOW.toString(),
        _editionId: firstEditionTokenId.toString()
      });
    });

    it('can mint batch edition as proxy.address', async () => {
      this.startDate = Date.now();
      const receipt = await this.factory.connect(proxy).mintBatchEditionAsProxy(
        artist.address,
        SaleType.BUY_NOW,
        '10',
        this.startDate,
        ETH_ONE.toString(),
        '0',
        TOKEN_URI,
        ZERO_ADDRESS
      );

      await expectEvent.inTransaction(receipt.hash, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist.address,
        tokenId: firstEditionTokenId.toString()
      });

      await expectEvent.inTransaction(receipt.hash, MinterFactory, 'EditionMintedAndListed', {
        _saleType: SaleType.BUY_NOW.toString(),
        _editionId: firstEditionTokenId.toString()
      });
    });

  });

  describe('mintBatchEdition() - Buy Now - edition size 10', () => {

    const editionSize = '10';

    beforeEach(async () => {
      this.startDate = Date.now();
      const receipt = await this.factory.connect(artist).mintBatchEdition(
        SaleType.BUY_NOW,
        editionSize,
        this.startDate,
        ETH_ONE.toString(),
        '0',
        TOKEN_URI,
        this.artistProofIndex,
        this.artistProof,
        ZERO_ADDRESS
      );

      await expectEvent.inTransaction(receipt.hash, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist.address,
        tokenId: firstEditionTokenId
      });

      await expectEvent.inTransaction(receipt.hash, MinterFactory, 'EditionMintedAndListed', {
        _saleType: SaleType.BUY_NOW.toString(),
        _editionId: firstEditionTokenId.toString()
      });
    });

    it('edition created', async () => {
      const editionDetails = await this.token.getEditionDetails(firstEditionTokenId);
      expect(editionDetails._originalCreator).to.equal(artist.address, 'Failed edition details creator validation');
      expect(editionDetails._owner).to.equal(artist.address, 'Failed edition details owner validation');
      expect(editionDetails._editionId).to.bignumber.equal(firstEditionTokenId, 'Failed edition details edition validation');
      expect(editionDetails._size).to.bignumber.equal(editionSize, 'Failed edition details size validation');
      expect(editionDetails._uri).to.equal(TOKEN_URI, 'Failed edition details uri validation');
    });

    it('edition listed', async () => {
      const {
        seller: _seller,
        price: _listingPrice,
        startDate: _startDate
      } = await this.marketplace.editionOrTokenListings(firstEditionTokenId);
      expect(_seller).to.equal(artist.address, 'Failed edition details edition validation');
      expect(_startDate).to.bignumber.equal(this.startDate.toString(), 'Failed edition details size validation');
      expect(_listingPrice).to.bignumber.equal(ETH_ONE, 'Failed edition details uri validation');
    });

    it('After freeze window can mint again', async () => {
      await this.factory.connect(admin).setMintingPeriod('1');

      this.startDate = Date.now();
      const receipt = await this.factory.connect(artist).mintBatchEdition(
        SaleType.BUY_NOW,
        editionSize,
        this.startDate,
        ETH_ONE.toString(),
        '0',
        TOKEN_URI,
        this.artistProofIndex,
        this.artistProof,
        ZERO_ADDRESS
      );

      await expectEvent.inTransaction(receipt.hash, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist.address,
        tokenId: firstEditionTokenId.addn(1000)
      });

      await expectEvent.inTransaction(receipt.hash, MinterFactory, 'EditionMintedAndListed', {
        _saleType: SaleType.BUY_NOW.toString(),
        _editionId: firstEditionTokenId.addn(1000).toString()
      });
    });
  });

  describe('minting rules in a 30 day period', () => {

    it('can mint up to maxMintsInPeriod within a period, but fails afterwards', async () => {
      this.startDate = Date.now();
      await this.factory.connect(admin).setNow(this.startDate);

      let editionId = firstEditionTokenId;
      const range = _.range(0, _.toNumber(this.maxMintsInPeriod));

      // exhaust all tokens
      for (const id of range) {
        const receipt = await this.factory.connect(artist).mintBatchEdition(
          SaleType.BUY_NOW,
          '1',
          this.startDate,
          ETH_ONE.toString(),
          '0',
          TOKEN_URI,
          this.artistProofIndex,
          this.artistProof,
          ZERO_ADDRESS
        );

        await expectEvent.inTransaction(receipt.hash, KnownOriginDigitalAssetV3, 'Transfer', {
          from: ZERO_ADDRESS,
          to: artist.address,
          tokenId: editionId
        });

        await expectEvent.inTransaction(receipt.hash, MinterFactory, 'EditionMintedAndListed', {
          _saleType: SaleType.BUY_NOW.toString(),
          _editionId: editionId.toString()
        });

        // bump ID
        editionId = new BN(editionId).add(this.MAX_EDITION_SIZE);
      }

      // check 15 mints are recorded
      const {mints, firstMintInPeriod} = await this.factory.currentMintConfig(artist.address);
      expect(mints.toString()).to.be.equal('15');
      expect(firstMintInPeriod.toString()).to.be.equal(this.startDate.toString());

      // check cannot mint another one
      expect(await this.factory.canCreateNewEdition(artist.address)).to.be.equal(false);

      // confirm next mint will revert
      await expectRevert(
        this.factory.connect(artist).mintBatchEdition(
          SaleType.BUY_NOW,
          '1',
          this.startDate,
          ETH_ONE.toString(),
          '0',
          TOKEN_URI,
          this.artistProofIndex,
          this.artistProof,
          ZERO_ADDRESS
        ),
        'Caller unable to create yet'
      );

      // move time along to the next period and then try again
      this.startDate = Date.now() + _30_DAYS_IN_SECONDS + 1;
      await await this.factory.connect(admin).setNow(this.startDate);

      // can mint again
      let receipt = await this.factory.connect(artist).mintBatchEdition(
        SaleType.BUY_NOW,
        '1',
        this.startDate,
        ETH_ONE.toString(),
        '0',
        TOKEN_URI,
        this.artistProofIndex,
        this.artistProof,
        ZERO_ADDRESS
      );
      await expectEvent.inTransaction(receipt.hash, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist.address,
        tokenId: editionId
      });

      // resets counter
      let config = await this.factory.currentMintConfig(artist.address);
      expect(config.mints.toString()).to.be.equal('1');
      expect(config.firstMintInPeriod.toString()).to.be.equal(this.startDate.toString());

      // check can mint another one
      expect(await this.factory.canCreateNewEdition(artist.address)).to.be.equal(true);

      // can mint again
      receipt = await this.factory.connect(artist).mintBatchEdition(
        SaleType.BUY_NOW,
        '1',
        this.startDate,
        ETH_ONE.toString(),
        '0',
        TOKEN_URI,
        this.artistProofIndex,
        this.artistProof,
        ZERO_ADDRESS
      );
      await expectEvent.inTransaction(receipt.hash, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist.address,
        tokenId: new BN(editionId).add(this.MAX_EDITION_SIZE)
      });

      // counter moves up by 1
      config = await this.factory.currentMintConfig(artist.address);
      expect(config.mints.toString()).to.be.equal('2');
      expect(config.firstMintInPeriod.toString()).to.be.equal(this.startDate.toString());

      // check can mint another one
      expect(await this.factory.canCreateNewEdition(artist.address)).to.be.equal(true);
    });

  });

  describe('setMintingPeriod()', async () => {
    it('can change the config', async () => {
      expect((await this.factory.mintingPeriod()).toString()).to.be.equal(_30_DAYS_IN_SECONDS.toString());
      const receipt = await this.factory.connect(admin).setMintingPeriod('10');
      await expectEvent.inTransaction(receipt.hash, MinterFactory, 'AdminMintingPeriodChanged', {
        _mintingPeriod: '10'
      });
      expect((await this.factory.mintingPeriod()).toString()).to.be.equal('10');
    });
  });

  describe('setMaxMintsInPeriod()', async () => {
    it('can change the config', async () => {
      expect((await this.factory.maxMintsInPeriod()).toString()).to.be.equal('15');
      const receipt = await this.factory.connect(admin).setMaxMintsInPeriod('1');
      await expectEvent.inTransaction(receipt.hash, MinterFactory, 'AdminMaxMintsInPeriodChanged', {
        _maxMintsInPeriod: '1'
      });
      expect((await this.factory.maxMintsInPeriod()).toString()).to.be.equal('1');
    });
  });

  describe('Frequency Override', async () => {

    beforeEach(async () => {
      // set override
      await this.factory.connect(admin).setFrequencyOverride(artist.address, true);
    });

    it('once frequency override is set, can mint more than max limit', async () => {
      this.startDate = Date.now();
      await this.factory.connect(admin).setNow(this.startDate);

      let editionId = firstEditionTokenId;

      // mint 50 editions
      for (const id of _.range(0, 50)) {
        const receipt = await this.factory.connect(artist).mintBatchEdition(
          SaleType.BUY_NOW,
          '1',
          this.startDate,
          ETH_ONE.toString(),
          '0',
          TOKEN_URI,
          this.artistProofIndex,
          this.artistProof,
          ZERO_ADDRESS
        );
        await expectEvent.inTransaction(receipt.hash, KnownOriginDigitalAssetV3, 'Transfer', {
          from: ZERO_ADDRESS,
          to: artist.address,
          tokenId: editionId
        });

        // bump ID
        editionId = new BN(editionId).add(this.MAX_EDITION_SIZE);
      }

      // check 15 mints are recorded
      const {mints, firstMintInPeriod} = await this.factory.currentMintConfig(artist.address);
      expect(mints.toString()).to.be.equal('50');
      expect(firstMintInPeriod.toString()).to.be.equal(this.startDate.toString());

      // check cannot mint another one
      expect(await this.factory.canCreateNewEdition(artist.address)).to.be.equal(true);

      // turn off frequency override
      await this.factory.connect(admin).setFrequencyOverride(artist.address, false);

      // confirm next mint will revert
      await expectRevert(
        this.factory.connect(artist).mintBatchEdition(
          SaleType.BUY_NOW,
          '1',
          this.startDate,
          ETH_ONE.toString(),
          '0',
          TOKEN_URI,
          this.artistProofIndex,
          this.artistProof,
          ZERO_ADDRESS
        ),
        'Caller unable to create yet'
      );
    });
  });

  describe('minting batch and setting royalty in the same transaction', async () => {

    const editionSize = '10';

    let royaltiesRegistry, claimableFundsReceiverV1, predetermineAddress;

    let RECIPIENTS;
    const SPLITS = [HALF, QUARTER, QUARTER];

    beforeEach(async () => {
      RECIPIENTS = [artist.address, anotherArtist.address, oneMoreArtist.address];
      this.startDate = Date.now();

      // Create royalty registry
      royaltiesRegistry = await CollabRoyaltiesRegistry.new(this.accessControls.address);
      royaltiesRegistry.setKoda(this.token.address, {from: admin.address});

      await this.token.setRoyaltiesRegistryProxy(royaltiesRegistry.address, {from: admin.address});

      // Fund handler base
      claimableFundsReceiverV1 = await ClaimableFundsReceiverV1.new({from: admin.address});
      await royaltiesRegistry.addHandler(claimableFundsReceiverV1.address, {from: admin.address});

      // Predetermine address - but do not deploy it yet
      predetermineAddress = await royaltiesRegistry.predictedRoyaltiesHandler(claimableFundsReceiverV1.address, RECIPIENTS, SPLITS);

      // Deploy a funds splitter
      let receipt = await royaltiesRegistry.createRoyaltiesRecipient(
        claimableFundsReceiverV1.address,
        RECIPIENTS,
        SPLITS,
        {from: artist.address}
      );

      // Expect event
      expectEvent(receipt, 'RoyaltyRecipientCreated', {
        creator: artist.address,
        handler: claimableFundsReceiverV1.address,
        deployedHandler: predetermineAddress,
        recipients: RECIPIENTS,
        //splits: SPLITS // disable due to inability to perform equality check on arrays within events (tested below)
      });

      await this.factory.connect(admin).setRoyaltiesRegistry(royaltiesRegistry.address);

      // mint a new edition
      receipt = await this.factory.connect(artist).mintBatchEdition(
        SaleType.BUY_NOW,
        editionSize,
        this.startDate,
        ETH_ONE.toString(),
        '0',
        TOKEN_URI,
        this.artistProofIndex,
        this.artistProof,
        predetermineAddress
      );

      await expectEvent.inTransaction(receipt.hash, MinterFactory, 'EditionMintedAndListed', {
        _saleType: SaleType.BUY_NOW.toString(),
        _editionId: firstEditionTokenId.toString()
      });

      await expectEvent.inTransaction(receipt.hash, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist.address,
        tokenId: firstEditionTokenId
      });
    });

    it('royalties recipient is registered with the tokens', async () => {
      const info = await this.token.royaltyInfo(firstEditionTokenId, 0);
      expect(info._receiver).to.equal(predetermineAddress);
    });

    it('reverts if trying to set a funds handler when already set', async () => {
      await expectRevert(
        royaltiesRegistry.useRoyaltiesRecipient(
          firstEditionTokenId,
          predetermineAddress,
          {from: artist.address}
        ),
        'Funds handler already registered'
      );
    });

    it('reverts if funds handler has not been deployed', async () => {
      await expectRevert(
        this.factory.connect(artist).mintBatchEdition(
          SaleType.BUY_NOW,
          editionSize,
          this.startDate,
          ETH_ONE.toString(),
          '0',
          TOKEN_URI,
          this.artistProofIndex,
          this.artistProof,
          proxy.address // <= invalid funds handler
        ),
        'No deployed handler found'
      );
    });

  });

  describe('mintBatchEditionGatedOnly()', async () => {

    let royaltiesRegistry, claimableFundsReceiverV1, predetermineAddress;

    let RECIPIENTS;
    const SPLITS = [HALF, QUARTER, QUARTER];

    beforeEach(async () => {
      RECIPIENTS = [artist.address, anotherArtist.address, oneMoreArtist.address];

      // Create royalty registry
      royaltiesRegistry = await CollabRoyaltiesRegistry.new(this.accessControls.address);
      royaltiesRegistry.setKoda(this.token.address, {from: admin.address});

      // Fund handler base
      claimableFundsReceiverV1 = await ClaimableFundsReceiverV1.new({from: admin.address});
      await royaltiesRegistry.addHandler(claimableFundsReceiverV1.address, {from: admin.address});

      // Predetermine address - but do not deploy it yet
      predetermineAddress = await royaltiesRegistry.predictedRoyaltiesHandler(claimableFundsReceiverV1.address, RECIPIENTS, SPLITS);

      // Deploy a funds splitter
      let receipt = await royaltiesRegistry.createRoyaltiesRecipient(
        claimableFundsReceiverV1.address,
        RECIPIENTS,
        SPLITS,
        {from: artist.address}
      );

      // Expect event
      expectEvent(receipt, 'RoyaltyRecipientCreated', {
        creator: artist.address,
        handler: claimableFundsReceiverV1.address,
        deployedHandler: predetermineAddress,
        recipients: RECIPIENTS,
        //splits: SPLITS // disable due to inability to perform equality check on arrays within events (tested below)
      });

      await this.token.setRoyaltiesRegistryProxy(royaltiesRegistry.address, {from: admin.address});
      await this.factory.connect(admin).setRoyaltiesRegistry(royaltiesRegistry.address);

      receipt = await this.factory.connect(artist).mintBatchEditionGatedOnly(
        '10',
        this.artistProofIndex,
        this.artistProof,
        predetermineAddress,
        TOKEN_URI
      );

      await expectEvent.inTransaction(receipt.hash, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist.address,
        tokenId: firstEditionTokenId.toString()
      });

      await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'SaleCreated', {
        _saleId: '1'
      });
    });

    it('edition created', async () => {
      const editionDetails = await this.token.getEditionDetails(firstEditionTokenId);
      expect(editionDetails._originalCreator).to.equal(artist.address, 'Failed edition details creator validation');
      expect(editionDetails._owner).to.equal(artist.address, 'Failed edition details owner validation');
      expect(editionDetails._editionId).to.bignumber.equal(firstEditionTokenId, 'Failed edition details edition validation');
      expect(editionDetails._size).to.bignumber.equal('10', 'Failed edition details size validation');
      expect(editionDetails._uri).to.equal(TOKEN_URI, 'Failed edition details uri validation');
    });

    it('royalties recipient is registered with the tokens', async () => {
      const info = await this.token.royaltyInfo(firstEditionTokenId, 0);
      expect(info._receiver).to.equal(predetermineAddress);
    });

    it('sale created', async () => {
      const saleId = await this.gatedSale.editionToSale(firstEditionTokenId.toString());
      expect(saleId.toString()).to.equal('1');
    });

    it('royalties recipient is registered with the gated sale', async () => {
      const saleId = await this.gatedSale.editionToSale(firstEditionTokenId.toString());
      const sale = await this.gatedSale.sales(saleId);
      expect(sale.id.toString()).to.be.equal(saleId.toString());
      expect(sale.editionId.toString()).to.be.equal(firstEditionTokenId.toString());
      expect(sale.creator.toString()).to.be.equal(artist.address);
      expect(sale.fundsReceiver.toString()).to.be.equal(predetermineAddress);
      expect(sale.maxEditionId.toString()).to.be.equal('11009');
      expect(sale.mintCounter.toString()).to.be.equal('0');
      expect(sale.paused.toString()).to.be.equal('0');
    });

  });

  describe('mintBatchEditionGatedOnlyAsProxy()', async () => {

    let royaltiesRegistry, claimableFundsReceiverV1, predetermineAddress;

    let RECIPIENTS;
    const SPLITS = [HALF, QUARTER, QUARTER];

    beforeEach(async () => {
      RECIPIENTS = [artist.address, anotherArtist.address, oneMoreArtist.address];

      // Create royalty registry
      royaltiesRegistry = await CollabRoyaltiesRegistry.new(this.accessControls.address);
      royaltiesRegistry.setKoda(this.token.address, {from: admin.address});

      // Fund handler base
      claimableFundsReceiverV1 = await ClaimableFundsReceiverV1.new({from: admin.address});
      await royaltiesRegistry.addHandler(claimableFundsReceiverV1.address, {from: admin.address});

      // Predetermine address - but do not deploy it yet
      predetermineAddress = await royaltiesRegistry.predictedRoyaltiesHandler(claimableFundsReceiverV1.address, RECIPIENTS, SPLITS);

      // Deploy a funds splitter
      let receipt = await royaltiesRegistry.createRoyaltiesRecipient(
        claimableFundsReceiverV1.address,
        RECIPIENTS,
        SPLITS,
        {from: artist.address}
      );

      // Expect event
      expectEvent(receipt, 'RoyaltyRecipientCreated', {
        creator: artist.address,
        handler: claimableFundsReceiverV1.address,
        deployedHandler: predetermineAddress,
        recipients: RECIPIENTS,
        //splits: SPLITS // disable due to inability to perform equality check on arrays within events (tested below)
      });

      await this.token.setRoyaltiesRegistryProxy(royaltiesRegistry.address, {from: admin.address});
      await this.factory.connect(admin).setRoyaltiesRegistry(royaltiesRegistry.address);

      await this.accessControls.setVerifiedArtistProxy(
        proxy.address,
        this.merkleProof.claims[artist.address].index,
        this.merkleProof.claims[artist.address].proof,
        {from: artist.address}
      );

      receipt = await this.factory.connect(proxy).mintBatchEditionGatedOnlyAsProxy(
        artist.address,
        '10',
        predetermineAddress,
        TOKEN_URI
      );

      await expectEvent.inTransaction(receipt.hash, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist.address,
        tokenId: firstEditionTokenId.toString()
      });

      await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'SaleCreated', {
        _saleId: '1'
      });
    });

    it('edition created', async () => {
      const editionDetails = await this.token.getEditionDetails(firstEditionTokenId);
      expect(editionDetails._originalCreator).to.equal(artist.address, 'Failed edition details creator validation');
      expect(editionDetails._owner).to.equal(artist.address, 'Failed edition details owner validation');
      expect(editionDetails._editionId).to.bignumber.equal(firstEditionTokenId, 'Failed edition details edition validation');
      expect(editionDetails._size).to.bignumber.equal('10', 'Failed edition details size validation');
      expect(editionDetails._uri).to.equal(TOKEN_URI, 'Failed edition details uri validation');
    });

    it('royalties recipient is registered with the tokens', async () => {
      const info = await this.token.royaltyInfo(firstEditionTokenId, 0);
      expect(info._receiver).to.equal(predetermineAddress);
    });

    it('sale created', async () => {
      const saleId = await this.gatedSale.editionToSale(firstEditionTokenId.toString());
      expect(saleId.toString()).to.equal('1');
    });

    it('royalties recipient is registered with the gated sale', async () => {
      const saleId = await this.gatedSale.editionToSale(firstEditionTokenId.toString());
      const sale = await this.gatedSale.sales(saleId);
      expect(sale.id.toString()).to.be.equal(saleId.toString());
      expect(sale.editionId.toString()).to.be.equal(firstEditionTokenId.toString());
      expect(sale.creator.toString()).to.be.equal(artist.address);
      expect(sale.fundsReceiver.toString()).to.be.equal(predetermineAddress);
      expect(sale.maxEditionId.toString()).to.be.equal('11009');
      expect(sale.mintCounter.toString()).to.be.equal('0');
      expect(sale.paused.toString()).to.be.equal('0');
    });
  });

  describe('mintBatchEditionGatedAndPublic()', async () => {
    beforeEach(async () => {
      this.startDate = Date.now();
      const receipt = await this.factory.connect(artist).mintBatchEditionGatedAndPublic(
        '10',
        this.startDate.toString(),
        ETH_ONE.toString(),
        this.artistProofIndex,
        this.artistProof,
        ZERO_ADDRESS,
        TOKEN_URI
      );

      await expectEvent.inTransaction(receipt.hash, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist.address,
        tokenId: firstEditionTokenId.toString()
      });

      await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'SaleCreated', {
        _saleId: '1'
      });

      await expectEvent.inTransaction(receipt.hash, MinterFactory, 'EditionMintedAndListed', {
        _saleType: SaleType.BUY_NOW.toString(),
        _editionId: firstEditionTokenId.toString()
      });
    });

    it('edition created', async () => {
      const editionDetails = await this.token.getEditionDetails(firstEditionTokenId);
      expect(editionDetails._originalCreator).to.equal(artist.address, 'Failed edition details creator validation');
      expect(editionDetails._owner).to.equal(artist.address, 'Failed edition details owner validation');
      expect(editionDetails._editionId).to.bignumber.equal(firstEditionTokenId, 'Failed edition details edition validation');
      expect(editionDetails._size).to.bignumber.equal('10', 'Failed edition details size validation');
      expect(editionDetails._uri).to.equal(TOKEN_URI, 'Failed edition details uri validation');
    });

    it('sale created', async () => {
      const saleId = await this.gatedSale.editionToSale(firstEditionTokenId.toString());
      expect(saleId.toString()).to.equal('1');
    });

    it('edition listed', async () => {
      const {
        seller: _seller,
        price: _listingPrice,
        startDate: _startDate
      } = await this.marketplace.editionOrTokenListings(firstEditionTokenId);
      expect(_seller).to.equal(artist.address, 'Failed edition details edition validation');
      expect(_startDate).to.bignumber.equal(this.startDate.toString(), 'Failed edition details size validation');
      expect(_listingPrice).to.bignumber.equal(ETH_ONE, 'Failed edition details uri validation');
    });
  });

  describe('mintBatchEditionGatedAndPublicAsProxy()', async () => {
    beforeEach(async () => {
      this.startDate = Date.now();

      await this.accessControls.setVerifiedArtistProxy(
        proxy.address,
        this.merkleProof.claims[artist.address].index,
        this.merkleProof.claims[artist.address].proof,
        {from: artist.address}
      );

      const receipt = await this.factory.connect(proxy).mintBatchEditionGatedAndPublicAsProxy(
        artist.address,
        '10',
        this.startDate.toString(),
        ETH_ONE.toString(),
        ZERO_ADDRESS,
        TOKEN_URI
      );

      await expectEvent.inTransaction(receipt.hash, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist.address,
        tokenId: firstEditionTokenId.toString()
      });

      await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'SaleCreated', {
        _saleId: '1'
      });

      await expectEvent.inTransaction(receipt.hash, MinterFactory, 'EditionMintedAndListed', {
        _saleType: SaleType.BUY_NOW.toString(),
        _editionId: firstEditionTokenId.toString()
      });
    });

    it('edition created', async () => {
      const editionDetails = await this.token.getEditionDetails(firstEditionTokenId);
      expect(editionDetails._originalCreator).to.equal(artist.address, 'Failed edition details creator validation');
      expect(editionDetails._owner).to.equal(artist.address, 'Failed edition details owner validation');
      expect(editionDetails._editionId).to.bignumber.equal(firstEditionTokenId, 'Failed edition details edition validation');
      expect(editionDetails._size).to.bignumber.equal('10', 'Failed edition details size validation');
      expect(editionDetails._uri).to.equal(TOKEN_URI, 'Failed edition details uri validation');
    });

    it('sale created', async () => {
      const saleId = await this.gatedSale.editionToSale(firstEditionTokenId.toString());
      expect(saleId.toString()).to.equal('1');
    });

    it('edition listed', async () => {
      const {
        seller: _seller,
        price: _listingPrice,
        startDate: _startDate
      } = await this.marketplace.editionOrTokenListings(firstEditionTokenId);
      expect(_seller).to.equal(proxy.address, 'Failed edition details edition validation');
      expect(_startDate).to.bignumber.equal(this.startDate.toString(), 'Failed edition details size validation');
      expect(_listingPrice).to.bignumber.equal(ETH_ONE, 'Failed edition details uri validation');
    });
  });

  describe('mintBatchEditionOnly()', async () => {
    beforeEach(async () => {
      this.startDate = Date.now();
      const receipt = await this.factory.connect(artist).mintBatchEditionOnly(
        '10',
        this.artistProofIndex,
        this.artistProof,
        ZERO_ADDRESS,
        TOKEN_URI
      );

      await expectEvent.inTransaction(receipt.hash, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist.address,
        tokenId: firstEditionTokenId.toString()
      });

      await expectEvent.inTransaction(receipt.hash, MinterFactory, 'EditionMinted', {
        _editionId: firstEditionTokenId.toString()
      });
    });

    it('edition created', async () => {
      const editionDetails = await this.token.getEditionDetails(firstEditionTokenId);
      expect(editionDetails._originalCreator).to.equal(artist.address, 'Failed edition details creator validation');
      expect(editionDetails._owner).to.equal(artist.address, 'Failed edition details owner validation');
      expect(editionDetails._editionId).to.bignumber.equal(firstEditionTokenId, 'Failed edition details edition validation');
      expect(editionDetails._size).to.bignumber.equal('10', 'Failed edition details size validation');
      expect(editionDetails._uri).to.equal(TOKEN_URI, 'Failed edition details uri validation');
    });
  });

  describe('mintBatchEditionOnlyAsProxy()', async () => {
    beforeEach(async () => {
      this.startDate = Date.now();

      await this.accessControls.setVerifiedArtistProxy(
        proxy.address,
        this.merkleProof.claims[artist.address].index,
        this.merkleProof.claims[artist.address].proof,
        {from: artist.address}
      );

      const receipt = await this.factory.connect(proxy).mintBatchEditionOnlyAsProxy(
        artist.address,
        '10',
        ZERO_ADDRESS,
        TOKEN_URI
      );

      await expectEvent.inTransaction(receipt.hash, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist.address,
        tokenId: firstEditionTokenId.toString()
      });

      await expectEvent.inTransaction(receipt.hash, MinterFactory, 'EditionMinted', {
        _editionId: firstEditionTokenId.toString()
      });
    });

    it('edition created', async () => {
      const editionDetails = await this.token.getEditionDetails(firstEditionTokenId);
      expect(editionDetails._originalCreator).to.equal(artist.address, 'Failed edition details creator validation');
      expect(editionDetails._owner).to.equal(artist.address, 'Failed edition details owner validation');
      expect(editionDetails._editionId).to.bignumber.equal(firstEditionTokenId, 'Failed edition details edition validation');
      expect(editionDetails._size).to.bignumber.equal('10', 'Failed edition details size validation');
      expect(editionDetails._uri).to.equal(TOKEN_URI, 'Failed edition details uri validation');
    });
  });

});
