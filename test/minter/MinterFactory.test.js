const {BN, constants, expectEvent, expectRevert, balance, time, ether} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3Marketplace = artifacts.require('KODAV3PrimaryMarketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const MinterFactory = artifacts.require('MockMintingFactory');
const MockERC20 = artifacts.require('MockERC20');
const CollabRoyaltiesRegistry = artifacts.require('CollabRoyaltiesRegistry');
const ClaimableFundsReceiverV1 = artifacts.require('ClaimableFundsReceiverV1');

const {parseBalanceMap} = require('../utils/parse-balance-map');
const {buildArtistMerkleInput} = require('../utils/merkle-tools');

contract('MinterFactory', function (accounts) {
  const [superAdmin, admin, deployer, koCommission, artist, anotherArtist, oneMoreArtist, proxy] = accounts;

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
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Set up access controls with artist roles
    this.merkleProof = parseBalanceMap(buildArtistMerkleInput(1, artist, anotherArtist));
    await this.accessControls.updateArtistMerkleRoot(this.merkleProof.merkleRoot, {from: deployer});

    this.artistProofIndex = this.merkleProof.claims[artist].index;
    this.artistProof = this.merkleProof.claims[artist].proof;

    // Create token V3
    this.token = await KnownOriginDigitalAssetV3.new(
      this.accessControls.address,
      ZERO_ADDRESS, // no royalties address
      STARTING_EDITION,
      {from: deployer}
    );

    // composable
    this.erc20Token1 = await MockERC20.new({from: deployer});

    await this.erc20Token1.transfer(artist, ether('1000'), {from: deployer});

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
      ZERO_ADDRESS, // no royalties address
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

      const receipt = await this.factory.mintToken(
        SaleType.BUY_NOW,
        this.startDate,
        ETH_ONE,
        0,
        TOKEN_URI,
        this.artistProofIndex,
        this.artistProof,
        ZERO_ADDRESS,
        {from: artist}
      );

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
      const {
        seller: _seller,
        price: _listingPrice,
        startDate: _startDate
      } = await this.marketplace.editionOrTokenListings(firstEditionTokenId);
      expect(_seller).to.equal(artist, 'Failed edition details edition validation');
      expect(_startDate).to.bignumber.equal(this.startDate.toString(), 'Failed edition details size validation');
      expect(_listingPrice).to.bignumber.equal(ETH_ONE, 'Failed edition details uri validation');
    });
  });

  describe('minting as proxy', () => {
    beforeEach(async () => {
      await this.accessControls.setVerifiedArtistProxy(
        proxy,
        this.merkleProof.claims[artist].index,
        this.merkleProof.claims[artist].proof,
        {from: artist}
      );
    });

    it('can mint token as proxy', async () => {
      this.startDate = Date.now();

      const receipt = await this.factory.mintTokenAsProxy(
        artist,
        SaleType.BUY_NOW,
        this.startDate,
        ETH_ONE,
        0,
        TOKEN_URI,
        ZERO_ADDRESS,
        {from: proxy}
      );

      await expectEvent.inTransaction(receipt.tx, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist,
        tokenId: firstEditionTokenId
      });
    });

    it('can mint batch edition as proxy', async () => {
      this.startDate = Date.now();
      const receipt = await this.factory.mintBatchEditionAsProxy(
        artist,
        SaleType.BUY_NOW,
        '10',
        this.startDate,
        ETH_ONE,
        0,
        TOKEN_URI,
        ZERO_ADDRESS,
        {from: proxy}
      );

      await expectEvent.inTransaction(receipt.tx, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist,
        tokenId: firstEditionTokenId
      });
    });

    it('can mint cosecutive batch as proxy', async () => {
      this.startDate = Date.now();
      const receipt = await this.factory.mintConsecutiveBatchEditionAsProxy(
        artist,
        SaleType.BUY_NOW,
        '10',
        this.startDate,
        ETH_ONE,
        0,
        TOKEN_URI,
        ZERO_ADDRESS,
        {from: proxy}
      );

      const start = firstEditionTokenId.toNumber();
      const end = start + parseInt('10');
      await expectEvent.inTransaction(receipt.tx, KnownOriginDigitalAssetV3, 'ConsecutiveTransfer', {
        fromAddress: ZERO_ADDRESS,
        toAddress: artist,
        fromTokenId: start.toString(),
        toTokenId: end.toString()
      });
    });

    it('can mint and compose as proxy', async () => {
      this.startDate = Date.now();

      await this.erc20Token1.approve(this.token.address, ether('1000'), {from: artist});

      await this.factory.mintBatchEditionAndComposeERC20sAsProxy(
        artist,
        SaleType.BUY_NOW,
        [
          '10',
          this.startDate,
          ETH_ONE,
          0
        ],
        TOKEN_URI,
        [this.erc20Token1.address],
        [ether('1000')],
        {from: proxy}
      );
    });
  });

  describe('mintBatchEdition() - Buy Now - edition size 10', () => {

    const editionSize = '10';

    beforeEach(async () => {
      this.startDate = Date.now();
      const receipt = await this.factory.mintBatchEdition(
        SaleType.BUY_NOW,
        editionSize,
        this.startDate,
        ETH_ONE,
        0,
        TOKEN_URI,
        this.artistProofIndex,
        this.artistProof,
        ZERO_ADDRESS,
        {from: artist}
      );

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
      const {
        seller: _seller,
        price: _listingPrice,
        startDate: _startDate
      } = await this.marketplace.editionOrTokenListings(firstEditionTokenId);
      expect(_seller).to.equal(artist, 'Failed edition details edition validation');
      expect(_startDate).to.bignumber.equal(this.startDate.toString(), 'Failed edition details size validation');
      expect(_listingPrice).to.bignumber.equal(ETH_ONE, 'Failed edition details uri validation');
    });

    it('After freeze window can mint again', async () => {
      await this.factory.setMintingPeriod('1', {from: admin});

      this.startDate = Date.now();
      const receipt = await this.factory.mintBatchEdition(
        SaleType.BUY_NOW,
        editionSize,
        this.startDate,
        ETH_ONE,
        0,
        TOKEN_URI,
        this.artistProofIndex,
        this.artistProof,
        ZERO_ADDRESS,
        {from: artist}
      );

      await expectEvent.inTransaction(receipt.tx, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist,
        tokenId: firstEditionTokenId.addn(1000)
      });
    });
  });

  describe('mintConsecutiveBatchEdition() - Buy Now - edition size 10', () => {

    const editionSize = '10';

    beforeEach(async () => {
      this.startDate = Date.now();
      const receipt = await this.factory.mintConsecutiveBatchEdition(
        SaleType.BUY_NOW,
        editionSize,
        this.startDate,
        ETH_ONE,
        0,
        TOKEN_URI,
        this.artistProofIndex,
        this.artistProof,
        ZERO_ADDRESS,
        {from: artist}
      );

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
      const {
        seller: _seller,
        price: _listingPrice,
        startDate: _startDate
      } = await this.marketplace.editionOrTokenListings(firstEditionTokenId);
      expect(_seller).to.equal(artist, 'Failed edition details edition validation');
      expect(_startDate).to.bignumber.equal(this.startDate.toString(), 'Failed edition details size validation');
      expect(_listingPrice).to.bignumber.equal(ETH_ONE, 'Failed edition details uri validation');
    });

    it('After freeze window can mint again', async () => {
      await this.factory.setMintingPeriod('1', {from: admin});
      await this.factory.setMaxMintsInPeriod('1', {from: admin});

      this.startDate = Date.now();
      const receipt = await this.factory.mintConsecutiveBatchEdition(
        SaleType.BUY_NOW,
        editionSize,
        this.startDate,
        ETH_ONE,
        0,
        TOKEN_URI,
        this.artistProofIndex,
        this.artistProof,
        ZERO_ADDRESS,
        {from: artist}
      );

      const start = firstEditionTokenId.addn(1000).toNumber();
      const end = start + parseInt(editionSize);
      await expectEvent.inTransaction(receipt.tx, KnownOriginDigitalAssetV3, 'ConsecutiveTransfer', {
        fromAddress: ZERO_ADDRESS,
        toAddress: artist,
        fromTokenId: start.toString(),
        toTokenId: end.toString()
      });
    });
  });

  describe('mintBatchEditionAndComposeERC20s()', () => {
    const editionSize = new BN('10');

    beforeEach(async () => {
      this.startDate = Date.now();

      await this.erc20Token1.approve(this.token.address, ether('1000'), {from: artist});

      const receipt = await this.factory.mintBatchEditionAndComposeERC20s(
        SaleType.BUY_NOW,
        [
          this.artistProofIndex,
          editionSize,
          this.startDate,
          ETH_ONE,
          0
        ],
        TOKEN_URI,
        [this.erc20Token1.address],
        [ether('1000')],
        this.artistProof,
        {from: artist}
      );
    });

    it('edition created', async () => {
      const editionDetails = await this.token.getEditionDetails(firstEditionTokenId);
      expect(editionDetails._originalCreator).to.equal(artist, 'Failed edition details creator validation');
      expect(editionDetails._owner).to.equal(artist, 'Failed edition details owner validation');
      expect(editionDetails._editionId).to.bignumber.equal(firstEditionTokenId, 'Failed edition details edition validation');
      expect(editionDetails._size).to.bignumber.equal(editionSize, 'Failed edition details size validation');
      expect(editionDetails._uri).to.equal(TOKEN_URI, 'Failed edition details uri validation');
    });

    it('composed correctly', async () => {
      const ONE_THOUSAND_TOKENS = ether('1000');

      expect(
        await this.token.ERC20Balances(firstEditionTokenId, this.erc20Token1.address)
      ).to.be.bignumber.equal('0');

      expect(
        await this.token.editionTokenERC20Balances(await this.token.getEditionIdOfToken(firstEditionTokenId), this.erc20Token1.address)
      ).to.be.bignumber.equal(ONE_THOUSAND_TOKENS);

      // first and second token of edition should be enough to give us confidence
      expect(
        await this.token.balanceOfERC20(firstEditionTokenId, this.erc20Token1.address)
      ).to.be.bignumber.equal(ONE_THOUSAND_TOKENS.div(editionSize));

      expect(
        await this.token.balanceOfERC20(firstEditionTokenId.addn(1), this.erc20Token1.address)
      ).to.be.bignumber.equal(ONE_THOUSAND_TOKENS.div(editionSize));

      expect(
        await this.token.totalERC20Contracts(firstEditionTokenId)
      ).to.be.bignumber.equal('1');

      expect(
        await this.token.erc20ContractByIndex(firstEditionTokenId, '0')
      ).to.be.equal(this.erc20Token1.address);

      expect(
        await this.erc20Token1.balanceOf(this.token.address)
      ).to.be.bignumber.equal(ONE_THOUSAND_TOKENS);
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
        const receipt = await this.factory.mintToken(SaleType.BUY_NOW, this.startDate, ETH_ONE, 0, TOKEN_URI, this.artistProofIndex, this.artistProof, ZERO_ADDRESS, {from: artist});
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
        this.factory.mintToken(SaleType.BUY_NOW, this.startDate, ETH_ONE, 0, TOKEN_URI, this.artistProofIndex, this.artistProof, ZERO_ADDRESS, {from: artist}),
        'Caller unable to create yet'
      );

      // move time along to the next period and then try again
      this.startDate = Date.now() + _30_DAYS_IN_SECONDS + 1;
      await this.factory.setNow(this.startDate);

      // can mint again
      let receipt = await this.factory.mintToken(SaleType.BUY_NOW, this.startDate, ETH_ONE, 0, TOKEN_URI, this.artistProofIndex, this.artistProof, ZERO_ADDRESS, {from: artist});
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
      receipt = await this.factory.mintToken(SaleType.BUY_NOW, this.startDate, ETH_ONE, 0, TOKEN_URI, this.artistProofIndex, this.artistProof, ZERO_ADDRESS, {from: artist});
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
        const receipt = await this.factory.mintToken(SaleType.BUY_NOW, this.startDate, ETH_ONE, 0, TOKEN_URI, this.artistProofIndex, this.artistProof, ZERO_ADDRESS, {from: artist});
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
        this.factory.mintToken(SaleType.BUY_NOW, this.startDate, ETH_ONE, 0, TOKEN_URI, this.artistProofIndex, this.artistProof, ZERO_ADDRESS, {from: artist}),
        'Caller unable to create yet'
      );
    });
  });

  describe('minting batch and setting royalty in the same transaction', async () => {

    const editionSize = '10';

    let royaltiesRegistry, claimableFundsReceiverV1, predetermineAddress;

    const HALF = new BN(5000000);
    const QUARTER = new BN(2500000);

    const RECIPIENTS = [artist, anotherArtist, oneMoreArtist];
    const SPLITS = [HALF, QUARTER, QUARTER];

    beforeEach(async () => {
      this.startDate = Date.now();

      // Create royalty registry
      royaltiesRegistry = await CollabRoyaltiesRegistry.new(this.accessControls.address);
      royaltiesRegistry.setKoda(this.token.address, {from: admin});

      await this.token.setRoyaltiesRegistryProxy(royaltiesRegistry.address, {from: admin});

      // Fund handler base
      claimableFundsReceiverV1 = await ClaimableFundsReceiverV1.new({from: admin});
      await royaltiesRegistry.addHandler(claimableFundsReceiverV1.address, {from: admin});

      // Predetermine address - but do not deploy it yet
      predetermineAddress = await royaltiesRegistry.predictedRoyaltiesHandler(claimableFundsReceiverV1.address, RECIPIENTS, SPLITS);

      // TODO confirm that we want the handler to be deployed

      // Deploy a funds splitter
      let receipt = await royaltiesRegistry.createRoyaltiesRecipient(
        claimableFundsReceiverV1.address,
        RECIPIENTS,
        SPLITS,
        {from: artist}
      );

      // Expect event
      expectEvent(receipt, 'RoyaltyRecipientCreated', {
        creator: artist,
        handler: claimableFundsReceiverV1.address,
        deployedHandler: predetermineAddress,
        recipients: RECIPIENTS,
        //splits: SPLITS // disable due to inability to perform equality check on arrays within events (tested below)
      });

      await this.factory.setRoyaltiesRegistry(royaltiesRegistry.address, {from: admin});

      // mint a new edition
      receipt = await this.factory.mintBatchEdition(
        SaleType.BUY_NOW,
        editionSize,
        this.startDate,
        ETH_ONE,
        0,
        TOKEN_URI,
        this.artistProofIndex,
        this.artistProof,
        predetermineAddress,
        {from: artist}
      );

      await expectEvent(receipt, 'EditionMintedAndListed', {
        _editionId: firstEditionTokenId,
        _saleType: SaleType.BUY_NOW.toString()
      });

      await expectEvent.inTransaction(receipt.tx, KnownOriginDigitalAssetV3, 'Transfer', {
        from: ZERO_ADDRESS,
        to: artist,
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
          {from: artist}
        ),
        'Funds handler already registered'
      );
    });

    it('reverts if funds handler has not been deployed', async () => {
      await expectRevert(
        this.factory.mintBatchEdition(
          SaleType.BUY_NOW,
          editionSize,
          this.startDate,
          ETH_ONE,
          0,
          TOKEN_URI,
          this.artistProofIndex,
          this.artistProof,
          proxy, // <= invalid funds handler
          {from: artist}
        ),
        'No deployed handler found'
      );
    });

  });
});
