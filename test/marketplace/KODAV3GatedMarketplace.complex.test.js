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

contract('BasicGatedSale complex tests...', function () {

  const STARTING_EDITION = '10000';
  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';
  const MOCK_MERKLE_HASH = '0x7B502C3A1F48C8609AE212CDFB639DEE39673F5E';
  const ZERO = new BN('0');
  const ONE = new BN('1');
  const TWO = new BN('2');
  const THREE = new BN('3');

  const FIRST_MINTED_TOKEN_ID = new BN('11000'); // this is implied
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
      {initializer: 'initialize'}
    );

    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.basicGatedSale.address, {from: owner.address});

    // create 22 tokens to the minter
    await this.token.mintBatchEdition(29, artist.address, TOKEN_URI, {from: contract.address});

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

  describe('BasicGatedSale - Complex', async () => {

    it.only('can create a sale with multiple phases and manage mints from each', async () => {
      // Make the sale
      const creationReceipt = await this.basicGatedSale.connect(artist).createSaleWithPhase(
        FIRST_MINTED_TOKEN_ID.toString(),
        this.phase1Start.toString(),
        this.phase1End.toString(),
        THREE.toString(),
        this.merkleProof1.merkleRoot,
        MOCK_MERKLE_HASH,
        ether('0.1').toString(),
        '0'
      );

      await expectEvent.inTransaction(creationReceipt.hash, KODAV3UpgradableGatedMarketplace, 'SaleWithPhaseCreated', {
        saleId: ONE,
        editionId: FIRST_MINTED_TOKEN_ID
      });

      // Add a second phase
      const phase2Receipt = await this.basicGatedSale.connect(artist).createPhase(
        FIRST_MINTED_TOKEN_ID.toString(),
        this.phase2Start.toString(),
        this.phase2End.toString(),
        new BN('5').toString(),
        this.merkleProof2.merkleRoot,
        MOCK_MERKLE_HASH,
        ether('0.3').toString(),
        '0'
      );

      await expectEvent.inTransaction(phase2Receipt.hash, KODAV3UpgradableGatedMarketplace, 'PhaseCreated', {
        saleId: ONE,
        editionId: FIRST_MINTED_TOKEN_ID,
        phaseId: ONE
      });

      // Add a third phase
      const phase3Receipt = await this.basicGatedSale.connect(artist).createPhase(
        FIRST_MINTED_TOKEN_ID.toString(),
        this.phase2Start.toString(),
        this.phase2End.toString(),
        new BN('10').toString(),
        this.merkleProof3.merkleRoot,
        MOCK_MERKLE_HASH,
        ether('0.5').toString(),
        '0'
      );

      await expectEvent.inTransaction(phase3Receipt.hash, KODAV3UpgradableGatedMarketplace, 'PhaseCreated', {
        saleId: ONE,
        editionId: FIRST_MINTED_TOKEN_ID,
        phaseId: TWO
      });

      // Delete a phase
      const phase3DeleteReceipt = await this.basicGatedSale.connect(artist).removePhase(
        FIRST_MINTED_TOKEN_ID.toString(),
        TWO.toString()
      );

      await expectEvent.inTransaction(phase3DeleteReceipt.hash, KODAV3UpgradableGatedMarketplace, 'PhaseRemoved', {
        saleId: ONE,
        editionId: FIRST_MINTED_TOKEN_ID,
        phaseId: TWO
      });

      // Simulate someone else trying to add a phase
      await expectRevert(this.basicGatedSale.connect(buyer4).createPhase(
          FIRST_MINTED_TOKEN_ID.toString(),
          this.phase2Start.toString(),
          this.phase2End.toString(),
          new BN('5').toString(),
          this.merkleProof3.merkleRoot,
          MOCK_MERKLE_HASH,
          ether('0.7').toString(),
          '0'),
        'Caller not creator or admin');

      // Add the third phase again
      const phase3NewReceipt = await this.basicGatedSale.connect(artist).createPhase(
        FIRST_MINTED_TOKEN_ID.toString(),
        this.phase3Start.toString(),
        this.phase3End.toString(),
        new BN('10').toString(),
        this.merkleProof3.merkleRoot,
        MOCK_MERKLE_HASH,
        ether('0.7').toString(),
        '0'
      );

      await expectEvent.inTransaction(phase3NewReceipt.hash, KODAV3UpgradableGatedMarketplace, 'PhaseCreated', {
        saleId: ONE,
        editionId: FIRST_MINTED_TOKEN_ID,
        phaseId: THREE
      });

      // Try and mint before the test starts
      await expectRevert(this.basicGatedSale.connect(buyer1).mint(
        ONE.toString(),
        ZERO.toString(),
        ONE.toString(),
        this.merkleProof1.claims[buyer1.address].index,
        this.merkleProof1.claims[buyer1.address].proof,
        {
          value: ether('0.1').toString()
        }), 'sale phase not in progress');

      // Advance time to the first phase
      await time.increaseTo(this.phase1Start.add(time.duration.minutes(1)));

      // Max out buyer1's allowance and prove you can't go over
      const b1p1MintReceipt = await this.basicGatedSale.connect(buyer1).mint(
        ONE.toString(),
        ZERO.toString(),
        THREE.toString(),
        this.merkleProof1.claims[buyer1.address].index,
        this.merkleProof1.claims[buyer1.address].proof,
        {
          value: ether('0.3').toString()
        });

      await expectEvent.inTransaction(b1p1MintReceipt.hash, KODAV3UpgradableGatedMarketplace, 'MintFromSale', {
        saleId: ONE,
        editionId: FIRST_MINTED_TOKEN_ID,
        phaseId: ZERO,
        account: buyer1.address,
        mintCount: THREE
      });

      // expect(await this.token.ownerOf(FIRST_MINTED_TOKEN_ID)).to.be.equal(buyer1.address);
      //
      // CURRENT_TOKEN_ID = FIRST_MINTED_TOKEN_ID.add(ONE);
      // expect(await this.token.ownerOf(CURRENT_TOKEN_ID)).to.be.equal(buyer1.address);
      //
      // CURRENT_TOKEN_ID = CURRENT_TOKEN_ID.add(ONE);
      // expect(await this.token.ownerOf(CURRENT_TOKEN_ID)).to.be.equal(buyer1.address);
      //
      // await expectRevert(this.basicGatedSale.connect(buyer1).mint(
      //   ONE.toString(),
      //   ZERO.toString(),
      //   ONE.toString(),
      //   this.merkleProof1.claims[buyer1.address].index,
      //   this.merkleProof1.claims[buyer1.address].proof,
      //   {
      //     value: ether('0.1').toString()
      //   }), 'cannot exceed total mints for sale phase');
      //
      // // Mint from buyer 2 as well
      // let b2p1MintReceipt = await this.basicGatedSale.connect(buyer2).mint(
      //   ONE.toString(),
      //   ZERO.toString(),
      //   TWO.toString(),
      //   this.merkleProof1.claims[buyer2.address].index,
      //   this.merkleProof1.claims[buyer2.address].proof,
      //   {
      //     value: ether('0.2').toString()
      //   });
      //
      // await expectEvent.inTransaction(b2p1MintReceipt.hash, KODAV3UpgradableGatedMarketplace, 'MintFromSale', {
      //   saleId: ONE,
      //   editionId: FIRST_MINTED_TOKEN_ID,
      //   phaseId: ZERO,
      //   account: buyer2.address,
      //   mintCount: TWO
      // });
      //
      // CURRENT_TOKEN_ID = CURRENT_TOKEN_ID.add(ONE);
      // expect(await this.token.ownerOf(CURRENT_TOKEN_ID)).to.be.equal(buyer2.address);
      //
      // CURRENT_TOKEN_ID = CURRENT_TOKEN_ID.add(ONE);
      // expect(await this.token.ownerOf(CURRENT_TOKEN_ID)).to.be.equal(buyer2.address);
      //
      // // Try and mint from someone not in the phase whitelist
      // await expectRevert(this.basicGatedSale.connect(buyer4).mint(
      //   ONE.toString(),
      //   ZERO.toString(),
      //   ONE.toString(),
      //   this.merkleProof1.claims[buyer1.address].index,
      //   this.merkleProof1.claims[buyer1.address].proof,
      //   {
      //     value: ether('0.1').toString()
      //   }), 'address not able to mint from sale');
      //
      // // Advance time to phase2 and move the sale on
      // await time.increaseTo(this.phase2Start.add(time.duration.minutes(1)));
      //
      // // Check you can no longer mint from the first phase if it has finished
      // await expectRevert(this.basicGatedSale.connect(buyer2).mint(
      //   ONE.toString(),
      //   ZERO.toString(),
      //   ONE.toString(),
      //   this.merkleProof1.claims[buyer2.address].index,
      //   this.merkleProof1.claims[buyer2.address].proof,
      //   {
      //     value: ether('0.1').toString()
      //   }), 'sale phase not in progress');
      //
      // // You can mint from phase 2 now though
      // let b2p2MintReceipt = await this.basicGatedSale.connect(buyer2).mint(
      //   ONE.toString(),
      //   ONE.toString(),
      //   THREE.toString(),
      //   this.merkleProof2.claims[buyer2.address].index,
      //   this.merkleProof2.claims[buyer2.address].proof,
      //   {
      //     value: ether('0.9').toString()
      //   });
      //
      // await expectEvent.inTransaction(b2p2MintReceipt.hash, KODAV3UpgradableGatedMarketplace, 'MintFromSale', {
      //   saleId: ONE,
      //   editionId: FIRST_MINTED_TOKEN_ID,
      //   phaseId: ONE,
      //   account: buyer2.address,
      //   mintCount: THREE
      // });
      //
      // // And new members of the prelist can also mint
      // let b4p2MintReceipt = await this.basicGatedSale.connect(buyer4).mint(
      //   ONE.toString(),
      //   ONE.toString(),
      //   ONE.toString(),
      //   this.merkleProof2.claims[buyer4.address].index,
      //   this.merkleProof2.claims[buyer4.address].proof,
      //   {
      //     value: ether('0.3').toString()
      //   });
      //
      // await expectEvent.inTransaction(b4p2MintReceipt.hash, KODAV3UpgradableGatedMarketplace, 'MintFromSale', {
      //   saleId: ONE,
      //   editionId: FIRST_MINTED_TOKEN_ID,
      //   phaseId: ONE,
      //   account: buyer4.address,
      //   mintCount: ONE
      // });
      //
      // // but not if they don't send enough ETH
      // await expectRevert(this.basicGatedSale.connect(buyer3).mint(
      //   ONE.toString(),
      //   ONE.toString(),
      //   TWO.toString(),
      //   this.merkleProof2.claims[buyer3.address].index,
      //   this.merkleProof2.claims[buyer3.address].proof,
      //   {
      //     value: ether('0.5').toString()
      //   }), 'not enough wei sent to complete mint');
      //
      // // buyer5 should still not be able to mint as well
      // await expectRevert(this.basicGatedSale.connect(buyer3).mint(
      //   ONE.toString(),
      //   ONE.toString(),
      //   ONE.toString(),
      //   this.merkleProof2.claims[buyer3.address].index,
      //   this.merkleProof2.claims[buyer3.address].proof,
      //   {
      //     value: ether('0.3').toString()
      //   }), 'address not able to mint from sale');
      //
      // // You are also unable to mint if you give the deleted phase id
      // await expectRevert(this.basicGatedSale.connect(buyer3).mint(
      //   ONE.toString(),
      //   TWO.toString(),
      //   ONE.toString(),
      //   this.merkleProof2.claims[buyer3.address].index,
      //   this.merkleProof2.claims[buyer3.address].proof,
      //   {
      //     value: ether('0.3').toString()
      //   }), 'sale phase not in progress');
      //
      // // They will be able to mint when we advance to phase 3 though
      // await time.increaseTo(this.phase3Start);
      //
      // let b5p3MintReceipt = await this.basicGatedSale.connect(buyer5).mint(
      //   ONE.toString(),
      //   THREE.toString(),
      //   new BN('10').toString(),
      //   this.merkleProof3.claims[buyer5.address].index,
      //   this.merkleProof3.claims[buyer5.address].proof,
      //   {
      //     value: ether('7').toString()
      //   });
      //
      // await expectEvent.inTransaction(b5p3MintReceipt.hash, KODAV3UpgradableGatedMarketplace, 'MintFromSale', {
      //   saleId: ONE,
      //   editionId: FIRST_MINTED_TOKEN_ID,
      //   phaseId: THREE,
      //   account: buyer5.address,
      //   mintCount: new BN('10')
      // });
      //
      // // Lets get someone else to buy a load as well
      // let b2p3MintReceipt = await this.basicGatedSale.connect(buyer2).mint(
      //   ONE.toString(),
      //   THREE.toString(),
      //   new BN('10').toString(),
      //   this.merkleProof3.claims[buyer2.address].index,
      //   this.merkleProof3.claims[buyer2.address].proof,
      //   {
      //     value: ether('7').toString()
      //   });
      //
      // await expectEvent.inTransaction(b2p3MintReceipt.hash, KODAV3UpgradableGatedMarketplace, 'MintFromSale', {
      //   saleId: ONE,
      //   editionId: FIRST_MINTED_TOKEN_ID,
      //   phaseId: THREE,
      //   account: buyer2.address,
      //   mintCount: new BN('10')
      // });
      //
      // // The sale should now be sold out so should revert
      // await expectRevert(this.basicGatedSale.connect(buyer1).mint(
      //   ONE.toString(),
      //   THREE.toString(),
      //   ONE.toString(),
      //   this.merkleProof3.claims[buyer1.address].index,
      //   this.merkleProof3.claims[buyer1.address].proof,
      //   {
      //     value: ether('0.7').toString()
      //   }), 'the sale is sold out');
    });
  });
});
