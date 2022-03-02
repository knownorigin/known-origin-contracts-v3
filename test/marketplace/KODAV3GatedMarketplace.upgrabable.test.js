const {expect} = require('chai');
const {BN, expectEvent, expectRevert, time, constants, ether} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const {parseBalanceMap} = require('../utils/parse-balance-map');
const {buildArtistMerkleInput} = require('../utils/merkle-tools');
const {upgrades} = require('hardhat');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const MockERC20 = artifacts.require('MockERC20');
const KODAV3UpgradableGatedMarketplace = artifacts.require('KODAV3UpgradableGatedMarketplace');

contract('KODAV3UpgradableGatedMarketplace tests...', function () {
  const STARTING_EDITION = '10000';
  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';
  const MOCK_MERKLE_HASH = 'Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const ONE_HUNDRED = new BN('100').toString();
  const ZERO = new BN('0').toString();
  const ONE = new BN('1').toString();
  const TWO = new BN('2').toString();

  const FIRST_MINTED_TOKEN_ID = new BN('11000').toString(); // this is implied

  let owner, admin, koCommission, contract, artist1, artist2, artist3, buyer1, buyer2, buyer3;

  beforeEach(async () => {
    [owner, admin, koCommission, contract, artist1, artist2, artist3, buyer1, buyer2, buyer3] = await ethers.getSigners();

    this.merkleProof = parseBalanceMap(buildArtistMerkleInput(1, artist1.address, artist2.address, artist3.address));

    this.legacyAccessControls = await SelfServiceAccessControls.new();

    // setup access controls
    this.accessControls = await KOAccessControls.new(this.legacyAccessControls.address, {from: owner.address});

    // grab the roles
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();
    this.DEFAULT_ADMIN_ROLE = await this.accessControls.DEFAULT_ADMIN_ROLE();

    // Create token V3
    this.token = await KnownOriginDigitalAssetV3.new(
      this.accessControls.address,
      ZERO_ADDRESS, // no royalties address
      STARTING_EDITION,
      {from: owner.address}
    );

    await this.accessControls.grantRole(this.DEFAULT_ADMIN_ROLE, admin.address, {from: owner.address});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.token.address, {from: owner.address});

    // Note: this is a test hack so we can mint tokens direct
    await this.accessControls.grantRole(this.CONTRACT_ROLE, contract.address, {from: owner.address});


    this.basicGatedSale = await upgrades.deployProxy(
      await ethers.getContractFactory('KODAV3UpgradableGatedMarketplace'),
      [this.accessControls.address, this.token.address, koCommission.address],
      {initializer: 'initialize', kind: 'uups'}
    );

    await this.basicGatedSale.deployed();
    console.log('KODAV3UpgradableGatedMarketplace deployed to:', this.basicGatedSale.address);

    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.basicGatedSale.address, {from: owner.address});

    // create 100 tokens to the minter
    await this.token.mintBatchEdition(ONE_HUNDRED, artist1.address, TOKEN_URI, {from: contract.address});

    // Ensure basic gated sale has approval to sell tokens
    await this.token.setApprovalForAll(this.basicGatedSale.address, true, {from: artist1.address});

    // create  a second edition and approve it minter
    await this.token.mintBatchEdition(ONE_HUNDRED, artist2.address, TOKEN_URI, {from: contract.address});
    await this.token.setApprovalForAll(this.basicGatedSale.address, true, {from: artist2.address});

    // just for stuck tests
    this.erc20Token = await MockERC20.new({from: owner.address});

    // Set a root time, then a start and end time, simulating sale running for a day
    this.rootTime = await time.latest();
    this.saleStart = this.rootTime.add(time.duration.hours(1));
    this.saleEnd = this.rootTime.add(time.duration.hours(25));

    const receipt = await this.basicGatedSale.connect(artist1).createSaleWithPhases(
      '11000',
      [this.saleStart.toString()],
      [this.saleEnd.toString()],
      ['100000000000000000'],
      ['10'],
      ['15'],
      [this.merkleProof.merkleRoot],
      [MOCK_MERKLE_HASH],
    );

    await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'SaleWithPhaseCreated', {
      _saleId: ONE
    });
  });

  describe('KODAV3UpgradableGatedMarketplace v1', async () => {
    describe('createSaleWithPhases', async () => {

      it('can create a new sale and phase with correct arguments', async () => {
        const {id, editionId} = await this.basicGatedSale.sales('1');

        expect(id.toString()).to.be.equal('1');
        expect(editionId.toString()).to.be.equal(FIRST_MINTED_TOKEN_ID.toString());

        const {
          startTime,
          endTime,
          walletMintLimit,
          priceInWei,
          merkleRoot,
          merkleIPFSHash,
          mintCap,
          mintCounter
        } = await this.basicGatedSale.phases('1', '0');

        expect(startTime.toString()).to.not.equal('0');
        expect(endTime.toString()).to.not.equal('0');
        expect(mintCap.toString()).to.be.equal('10');
        expect(walletMintLimit.toString()).to.be.equal('15');
        expect(merkleRoot).to.be.equal(this.merkleProof.merkleRoot);
        expect(merkleIPFSHash).to.be.equal(MOCK_MERKLE_HASH);
        expect(priceInWei.toString()).to.be.equal(ether('0.1').toString());
        expect(mintCounter.toString()).to.be.equal('0');

        const mappingId = await this.basicGatedSale.editionToSale(editionId);
        expect(mappingId.toString()).to.be.equal(id.toString());
      });
    });
  });

  describe('KODAV3UpgradableGatedMarketplace v2', async () => {

    describe('upgrade', async () => {

      it('can upgrade and see sale', async () => {

        const MockKODAV3UpgradableGatedMarketplace = await ethers.getContractFactory('MockKODAV3UpgradableGatedMarketplace');
        console.log('Upgrading to MockKODAV3UpgradableGatedMarketplace...');

        await upgrades.upgradeProxy(this.basicGatedSale.address, MockKODAV3UpgradableGatedMarketplace);
        console.log('MockKODAV3UpgradableGatedMarketplace upgraded');

        this.basicGatedSale = await MockKODAV3UpgradableGatedMarketplace.attach(this.basicGatedSale.address);

        const res = await this.basicGatedSale.getGreatestFootballTeam();
        console.log('new v2 function res: ', res);
        expect(res).to.be.equal('Hull City');

        // and if by magic....we still have the state from v1...

        const {id, editionId} = await this.basicGatedSale.sales('1');

        expect(id.toString()).to.be.equal('1');
        expect(editionId.toString()).to.be.equal(FIRST_MINTED_TOKEN_ID.toString());

        const {
          startTime,
          endTime,
          walletMintLimit,
          priceInWei,
          merkleRoot,
          merkleIPFSHash,
          mintCap,
          mintCounter
        } = await this.basicGatedSale.phases('1', '0');

        expect(startTime.toString()).to.not.equal('0');
        expect(endTime.toString()).to.not.equal('0');
        expect(walletMintLimit.toString()).to.be.equal('15');
        expect(mintCap.toString()).to.be.equal('10');
        expect(merkleRoot).to.be.equal(this.merkleProof.merkleRoot);
        expect(merkleIPFSHash).to.be.equal(MOCK_MERKLE_HASH);
        expect(priceInWei.toString()).to.be.equal(ether('0.1').toString());
        expect(mintCounter.toString()).to.be.equal('0');

        const mappingId = await this.basicGatedSale.editionToSale(editionId);
        expect(mappingId.toString()).to.be.equal(id.toString());
      });
    });
  });
});
