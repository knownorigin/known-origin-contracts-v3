const {expect} = require('chai');
const {BN, expectEvent, expectRevert, time, constants, ether, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const {parseBalanceMap} = require('../utils/parse-balance-map');
const {buildArtistMerkleInput} = require('../utils/merkle-tools');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const MockERC20 = artifacts.require('MockERC20');
const KODAV3UpgradableGatedMarketplace = artifacts.require('KODAV3UpgradableGatedMarketplace');

contract('Gas golfing test ... ', function () {

  const STARTING_EDITION = '10000';
  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';
  const MOCK_MERKLE_HASH = 'Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';
  const ZERO = new BN('0');
  const ONE = new BN('1');
  const TWO = new BN('2');
  const THREE = new BN('3');

  const FIRST_MINTED_TOKEN_ID = new BN('11000'); // this is implied
  const SECOND_MINTED_TOKEN_ID = new BN('12000'); // this is implied
  let CURRENT_TOKEN_ID = FIRST_MINTED_TOKEN_ID;

  let owner, admin, koCommission, contract, artist, buyer1, buyer2, buyer3, buyer4, buyer5;

  beforeEach(async () => {
    [owner, admin, koCommission, contract, artist, buyer1, buyer2, buyer3, buyer4, buyer5] = await ethers.getSigners();

    this.merkleProof1 = parseBalanceMap(buildArtistMerkleInput(1, buyer1.address, buyer2.address));
    this.merkleProof2 = parseBalanceMap(buildArtistMerkleInput(1, buyer1.address, buyer2.address, buyer3.address, buyer4.address));
    this.merkleProof3 = parseBalanceMap(buildArtistMerkleInput(1, buyer1.address, buyer2.address, buyer3.address, buyer4.address, buyer5.address));

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

    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.basicGatedSale.address, {from: owner.address});

    // create 1000 tokens to the minter
    await this.token.mintBatchEdition(1000, artist.address, TOKEN_URI, {from: contract.address});

    // create 500 tokens to the minter
    await this.token.mintBatchEdition(500, artist.address, TOKEN_URI, {from: contract.address});

    // Ensure basic gated sale has approval to sell tokens
    await this.token.setApprovalForAll(this.basicGatedSale.address, true, {from: artist.address});

    // just for stuck tests
    this.erc20Token = await MockERC20.new({from: owner.address});

    // Set a root time, then a start and end time, simulating sale running for a day
    this.rootTime = await time.latest();

    this.phase1Start = this.rootTime.add(time.duration.hours(1));
    this.phase1End = this.rootTime.add(time.duration.hours(25));

    this.phase2Start = this.phase1End;
    this.phase2End = this.phase2Start.add(time.duration.days(2));

    this.phase3Start = this.phase2End;
    this.phase3End = this.phase3Start.add(time.duration.days(7));
  });

  beforeEach(async () => {
    console.log('Setting sale and phase');
    await this.basicGatedSale.connect(artist).createSaleWithPhases(
      FIRST_MINTED_TOKEN_ID.toString(),
      [this.phase1Start.toString()],
      [this.phase1End.toString()],
      [ether('0.01').toString()],
      ['1000'],
      ['1000'],
      [this.merkleProof1.merkleRoot],
      [MOCK_MERKLE_HASH]
    );

    await this.basicGatedSale.connect(artist).createSaleWithPhases(
      SECOND_MINTED_TOKEN_ID.toString(),
      [this.phase1Start.toString()],
      [this.phase1End.toString()],
      [ether('0.01').toString()],
      ['500'],
      ['500'],
      [this.merkleProof1.merkleRoot],
      [MOCK_MERKLE_HASH]
    );

    await time.increaseTo(this.phase1Start.add(time.duration.minutes(1)));
    console.log('Increased time to start sale');
  });

  describe('Buying all 1000', async () => {
    it('1 per account', async () => {
      for (let i = 0; i < 1000; i++) {
        console.log(`Minting ${i}`);
        await this.basicGatedSale.connect(buyer1).mint(
          ONE.toString(),
          ZERO.toString(),
          '1',
          this.merkleProof1.claims[buyer1.address].index,
          this.merkleProof1.claims[buyer1.address].proof,
          {
            value: ether('0.01').toString()
          });
      }

      console.log(`Tests complete`);
    }).timeout(5 * 60 * 1000);

    it('5 per account', async () => {
      for (let i = 0; i < 200; i++) {
        console.log(`Minting ${i}`);
        await this.basicGatedSale.connect(buyer1).mint(
          ONE.toString(),
          ZERO.toString(),
          '5',
          this.merkleProof1.claims[buyer1.address].index,
          this.merkleProof1.claims[buyer1.address].proof,
          {
            value: ether('0.05').toString()
          });
      }

      console.log(`Tests complete`);
    }).timeout(5 * 60 * 1000);
  });

  describe('Buying all 500 editions', async () => {
    it('1 per account', async () => {
      for (let i = 0; i < 500; i++) {
        console.log(`Minting ${i}`);
        await this.basicGatedSale.connect(buyer1).mint(
          TWO.toString(),
          ZERO.toString(),
          '1',
          this.merkleProof1.claims[buyer1.address].index,
          this.merkleProof1.claims[buyer1.address].proof,
          {
            value: ether('0.01').toString()
          });
      }

      console.log(`Tests complete`);
    }).timeout(5 * 60 * 1000);

    it('5 per account', async () => {
      for (let i = 0; i < 100; i++) {
        console.log(`Minting ${i}`);
        await this.basicGatedSale.connect(buyer1).mint(
          TWO.toString(),
          ZERO.toString(),
          '5',
          this.merkleProof1.claims[buyer1.address].index,
          this.merkleProof1.claims[buyer1.address].proof,
          {
            value: ether('0.05').toString()
          });
      }

      console.log(`Tests complete`);
    }).timeout(5 * 60 * 1000);
  });
});
