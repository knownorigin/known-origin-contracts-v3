const {expect} = require("chai");
const {BN, expectEvent, expectRevert, time, constants, ether} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const {parseBalanceMap} = require('../utils/parse-balance-map');
const {buildArtistMerkleInput} = require('../utils/merkle-tools');

const KODAV3CollectorOnlyMarketplace = artifacts.require('KODAV3CollectorOnlyMarketplace');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const MockERC20 = artifacts.require('MockERC20');

let erc20Token;

contract('CollectorOnlyMarketplace tests...', function (accounts) {
    const [owner, admin, koCommission, contract, newAccessControls, artist1, artist2, buyer1, buyer2, buyer3] = accounts;

    const STARTING_EDITION = '10000';
    const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';
    const MOCK_MERKLE_HASH = '0x7B502C3A1F48C8609AE212CDFB639DEE39673F5E'
    const ONE_HUNDRED = new BN('100');
    const ZERO = new BN('0');
    const ONE = new BN('1');
    const TWO = new BN('2');

    const FIRST_MINTED_TOKEN_ID = new BN('11000'); // this is implied

    beforeEach(async () => {
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

        this.collectorOnlySale = await KODAV3CollectorOnlyMarketplace.new(this.accessControls.address, this.token.address, koCommission, {from: owner})

        await this.accessControls.grantRole(this.CONTRACT_ROLE, this.collectorOnlySale.address, {from: owner});

        // create a batch of 15 tokens from the minter
        await this.token.mintBatchEdition(15, artist1, TOKEN_URI, {from: contract});

        // Ensure basic gated sale has approval to sell tokens
        await this.token.setApprovalForAll(this.collectorOnlySale.address, true, {from: artist1});

        // just for stuck tests
        this.erc20Token = await MockERC20.new({from: owner});

        // Set a root time, then a start and end time, simulating sale running for a day
        this.rootTime = await time.latest()
        this.saleStart = this.rootTime.add(time.duration.hours(1))
        this.saleEnd = this.rootTime.add(time.duration.hours(25))

        const salesReceipt = await this.collectorOnlySale.createSale(
            FIRST_MINTED_TOKEN_ID,
            this.saleStart,
            this.saleEnd,
            new BN('10'),
            ether('0.1'),
            {from: artist1});

        expectEvent(salesReceipt, 'SaleCreated', {
            saleId: ONE,
            editionId: FIRST_MINTED_TOKEN_ID
        });

    })

    describe.only('CollectorOnlySale', async () => {

        describe('createSale', async () => {

            it('can create a new sale with the correct arguments', async () => {
                const {id, owner, editionId, startTime, endTime, mintLimit, priceInWei} = await this.collectorOnlySale.sales(1)

                expect(id.toString()).to.be.equal('1')
                expect(owner).to.be.equal(artist1)
                expect(editionId.toString()).to.be.equal(FIRST_MINTED_TOKEN_ID.toString())
                expect(startTime.toString()).to.not.equal('0')
                expect(endTime.toString()).to.not.equal('0')
                expect(mintLimit.toString()).to.be.equal('10')
                expect(priceInWei.toString()).to.be.equal(ether('0.1').toString())

            })

            it('can create a new sale if admin', async () => {
                const salesReceipt = await this.collectorOnlySale.createSale(
                    FIRST_MINTED_TOKEN_ID,
                    this.saleStart,
                    this.saleEnd,
                    new BN('10'),
                    ether('0.1'),
                    {from: admin});

                expectEvent(salesReceipt, 'SaleCreated', {
                    saleId: new BN('2'),
                    editionId: FIRST_MINTED_TOKEN_ID
                });
            })

            it('cannot create a sale without the right role', async () => {
                await expectRevert(this.collectorOnlySale.createSale(
                    FIRST_MINTED_TOKEN_ID,
                    this.saleStart,
                    this.saleEnd,
                    new BN('10'),
                    ether('0.1'),
                    {from: buyer1}), 'Caller not creator or admin')
            })

            it('should revert if given an invalid edition id', async () => {
                await expectRevert(this.collectorOnlySale.createSale(
                    FIRST_MINTED_TOKEN_ID.add(new BN('5000')),
                    this.saleStart,
                    this.saleEnd,
                    new BN('10'),
                    ether('0.1'),
                    {from: admin}), 'edition does not exist')
            })

            it('should revert if given an end time', async () => {
                await expectRevert(this.collectorOnlySale.createSale(
                    FIRST_MINTED_TOKEN_ID,
                    this.saleStart,
                    this.saleStart.sub(time.duration.days(2)),
                    new BN('10'),
                    ether('0.1'),
                    {from: artist1}), 'sale end time must be after start time')
            })

            it('should revert if given an invalid mint limit', async () => {
               await expectRevert(this.collectorOnlySale.createSale(
                    FIRST_MINTED_TOKEN_ID,
                    this.saleStart,
                    this.saleEnd,
                    new BN('0'),
                    ether('0.1'),
                    {from: artist1}), 'mint limit must be greater than 0 and smaller than edition size')

                await expectRevert(this.collectorOnlySale.createSale(
                    FIRST_MINTED_TOKEN_ID,
                    this.saleStart,
                    this.saleEnd,
                    new BN('30'),
                    ether('0.1'),
                    {from: artist1}), 'mint limit must be greater than 0 and smaller than edition size')
            })
        })
    });
})
