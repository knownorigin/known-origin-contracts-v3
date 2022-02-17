const {expect} = require("chai");
const {BN, expectEvent, expectRevert, time, constants, ether} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const {parseBalanceMap} = require('../utils/parse-balance-map');
const {buildArtistMerkleInput} = require('../utils/merkle-tools');
const {upgrades} = require("hardhat");

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const MockERC20 = artifacts.require('MockERC20');

this.erc20Token = undefined;

contract('KODAV3UpgradableGatedMarketplace tests...', function (accounts) {
    const [owner, admin, koCommission, contract, artist1, artist2, artist3, artistDodgy, newAccessControls] = accounts;

    const STARTING_EDITION = '10000';
    const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';
    const MOCK_MERKLE_HASH = 'Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

    const ONE_HUNDRED = new BN('100').toString();
    const ZERO = new BN('0').toString();
    const ONE = new BN('1').toString();
    const TWO = new BN('2').toString();

    const FIRST_MINTED_TOKEN_ID = new BN('11000').toString(); // this is implied

    beforeEach(async () => {
        this.merkleProof = parseBalanceMap(buildArtistMerkleInput(1, artist1, artist2, artist3));

        this.legacyAccessControls = await SelfServiceAccessControls.new();

        // setup access controls
        this.accessControls = await KOAccessControls.new(this.legacyAccessControls.address, {from: owner});

        // grab the roles
        this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();
        this.DEFAULT_ADMIN_ROLE = await this.accessControls.DEFAULT_ADMIN_ROLE();

        // Create token V3
        this.token = await KnownOriginDigitalAssetV3.new(
            this.accessControls.address,
            ZERO_ADDRESS, // no royalties address
            STARTING_EDITION,
            {from: owner}
        );

        await this.accessControls.grantRole(this.DEFAULT_ADMIN_ROLE, admin, {from: owner});
        await this.accessControls.grantRole(this.CONTRACT_ROLE, this.token.address, {from: owner});

        // Note: this is a test hack so we can mint tokens direct
        await this.accessControls.grantRole(this.CONTRACT_ROLE, contract, {from: owner});

        const KODAV3UpgradableGatedMarketplace = await ethers.getContractFactory('KODAV3UpgradableGatedMarketplace');

        this.basicGatedSale = await upgrades.deployProxy(
          KODAV3UpgradableGatedMarketplace,
          [this.accessControls.address, this.token.address, koCommission,],
          {initializer: 'initialize' }
          );

        await this.basicGatedSale.deployed();
        console.log('KODAV3UpgradableGatedMarketplace deployed to:', this.basicGatedSale.address);

        await this.accessControls.grantRole(this.CONTRACT_ROLE, this.basicGatedSale.address, {from: owner});

        // create 100 tokens to the minter
        await this.token.mintBatchEdition(ONE_HUNDRED, artist1, TOKEN_URI, {from: contract});

        // Ensure basic gated sale has approval to sell tokens
        await this.token.setApprovalForAll(this.basicGatedSale.address, true, {from: artist1});

        // create  a second edition and approve it minter
        await this.token.mintBatchEdition(ONE_HUNDRED, artist2, TOKEN_URI, {from: contract});
        await this.token.setApprovalForAll(this.basicGatedSale.address, true, {from: artist2});

        // just for stuck tests
        this.erc20Token = await MockERC20.new({from: owner});

        // Set a root time, then a start and end time, simulating sale running for a day
        this.rootTime = await time.latest()
        this.saleStart = this.rootTime.add(time.duration.hours(1))
        this.saleEnd = this.rootTime.add(time.duration.hours(25))

        const receipt = await this.basicGatedSale.createSaleWithPhases(
          '11000',
          [this.saleStart.toString()],
          [this.saleEnd.toString()],
          ['10'],
          [this.merkleProof.merkleRoot],
          [MOCK_MERKLE_HASH],
          ['100000000000000000'],
          ['15']
        );

        // FIXME broken
        // expectEvent(receipt, 'SaleWithPhaseCreated', {
        //     saleId: ONE,
        //     editionId: FIRST_MINTED_TOKEN_ID
        // });
    });

    describe('KODAV3UpgradableGatedMarketplace v1', async () => {

        describe('createSaleWithPhases', async () => {

            it('can create a new sale and phase with correct arguments', async () => {
                const {id, editionId} = await this.basicGatedSale.sales('1')

                expect(id.toString()).to.be.equal('1')
                expect(editionId.toString()).to.be.equal(FIRST_MINTED_TOKEN_ID.toString())

                const {
                    startTime,
                    endTime,
                    walletMintLimit,
                    priceInWei,
                    merkleRoot,
                    merkleIPFSHash,
                    mintCap,
                    mintCounter
                } = await this.basicGatedSale.phases('1', '0')

                expect(startTime.toString()).to.not.equal('0')
                expect(endTime.toString()).to.not.equal('0')
                expect(walletMintLimit.toString()).to.be.equal('10')
                expect(merkleRoot).to.be.equal(this.merkleProof.merkleRoot)
                expect(merkleIPFSHash).to.be.equal(MOCK_MERKLE_HASH)
                expect(priceInWei.toString()).to.be.equal(ether('0.1').toString())
                expect(mintCap.toString()).to.be.equal("15")
                expect(mintCounter.toString()).to.be.equal("0")

                const mappingId = await this.basicGatedSale.editionToSale(editionId)
                expect(mappingId.toString()).to.be.equal(id.toString())
            })
        });
    })

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

                const {id, editionId} = await this.basicGatedSale.sales('1')

                expect(id.toString()).to.be.equal('1')
                expect(editionId.toString()).to.be.equal(FIRST_MINTED_TOKEN_ID.toString())

                const {
                    startTime,
                    endTime,
                    walletMintLimit,
                    priceInWei,
                    merkleRoot,
                    merkleIPFSHash,
                    mintCap,
                    mintCounter
                } = await this.basicGatedSale.phases('1', '0')

                expect(startTime.toString()).to.not.equal('0')
                expect(endTime.toString()).to.not.equal('0')
                expect(walletMintLimit.toString()).to.be.equal('10')
                expect(merkleRoot).to.be.equal(this.merkleProof.merkleRoot)
                expect(merkleIPFSHash).to.be.equal(MOCK_MERKLE_HASH)
                expect(priceInWei.toString()).to.be.equal(ether('0.1').toString())
                expect(mintCap.toString()).to.be.equal("15")
                expect(mintCounter.toString()).to.be.equal("0")

                const mappingId = await this.basicGatedSale.editionToSale(editionId)
                expect(mappingId.toString()).to.be.equal(id.toString())
            })
        });
    })
});
