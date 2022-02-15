const {BN, expectEvent, expectRevert, time, constants, ether, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const {parseBalanceMap} = require('../utils/parse-balance-map');
const {buildArtistMerkleInput} = require('../utils/merkle-tools');

const KODAV3UpgradableGatedMarketplace = artifacts.require('KODAV3UpgradableGatedMarketplace');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const MockERC20 = artifacts.require('MockERC20');

contract('BasicGatedSale tests...', function (accounts) {
    const [owner, admin, koCommission, contract, artist1, artist2, artist3, artistDodgy, newAccessControls] = accounts;

    const STARTING_EDITION = '10000';
    const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';
    const MOCK_MERKLE_HASH = '0x7B502C3A1F48C8609AE212CDFB639DEE39673F5E'
    const ZERO = new BN('0');
    const ONE = new BN('1');
    const TWO = new BN('2');

    const FIRST_MINTED_TOKEN_ID = new BN('11000'); // this is implied

    const gasPrice = new BN(web3.utils.toWei('1', 'gwei').toString());
    const modulo = 10000000;
    const platformCommission = 1500000;

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

        this.basicGatedSale = await KODAV3UpgradableGatedMarketplace.new(this.accessControls.address, this.token.address, koCommission, {from: owner});

        await this.accessControls.grantRole(this.CONTRACT_ROLE, this.basicGatedSale.address, {from: owner});

        // create a batch of 15 tokens from the minter
        await this.token.mintBatchEdition(15, artist1, TOKEN_URI, {from: contract});

        // Ensure basic gated sale has approval to sell tokens
        await this.token.setApprovalForAll(this.basicGatedSale.address, true, {from: artist1});

        // create  a second edition and approve it minter
        await this.token.mintBatchEdition(15, artist2, TOKEN_URI, {from: contract});
        await this.token.setApprovalForAll(this.basicGatedSale.address, true, {from: artist2});

        // just for stuck tests
        this.erc20Token = await MockERC20.new({from: owner});

        // Set a root time, then a start and end time, simulating sale running for a day
        this.rootTime = await time.latest()
        this.saleStart = this.rootTime.add(time.duration.hours(1))
        this.saleEnd = this.rootTime.add(time.duration.hours(25))

        const receipt = await this.basicGatedSale.createSaleWithPhase(
            FIRST_MINTED_TOKEN_ID,
            this.saleStart,
            this.saleEnd,
            new BN('10'),
            this.merkleProof.merkleRoot,
            MOCK_MERKLE_HASH,
            ether('0.1'),
            0,
            {from: artist1});

        expectEvent(receipt, 'SaleWithPhaseCreated', {
            saleId: ONE,
            editionId: FIRST_MINTED_TOKEN_ID
        });
    });

    describe('BasicGatedSale', async () => {

        describe('createSaleWithPhase', async () => {

            it('can create a new sale and phase with correct arguments', async () => {
                const {id, editionId, paused} = await this.basicGatedSale.sales(1)

                expect(id.toString()).to.be.equal('1')
                expect(editionId.toString()).to.be.equal(FIRST_MINTED_TOKEN_ID.toString())
                expect(paused).to.be.equal(false)

                const {
                    startTime,
                    endTime,
                    walletMintLimit,
                    merkleRoot,
                    merkleIPFSHash,
                    priceInWei,
                    mintCap
                } = await this.basicGatedSale.phases(1, 0)

                expect(startTime.toString()).to.not.equal('0')
                expect(endTime.toString()).to.not.equal('0')
                expect(walletMintLimit.toString()).to.be.equal('10')
                expect(merkleRoot).to.be.equal(this.merkleProof.merkleRoot)
                expect(merkleIPFSHash).to.be.equal(MOCK_MERKLE_HASH)
                expect(priceInWei.toString()).to.be.equal(ether('0.1').toString())
                expect(mintCap.toString()).to.be.equal('0')

                const mappingId = await this.basicGatedSale.editionToSale(editionId)
                expect(mappingId.toString()).to.be.equal(id.toString())
            })

            it('can create a new sale and phase if admin', async () => {
                const receipt = await this.basicGatedSale.createSaleWithPhase(
                    FIRST_MINTED_TOKEN_ID,
                    this.saleStart,
                    this.saleEnd,
                    new BN('10'),
                    this.merkleProof.merkleRoot,
                    MOCK_MERKLE_HASH,
                    ether('0.1'),
                    10,
                    {from: admin})

                expectEvent(receipt, 'SaleWithPhaseCreated', {
                    saleId: new BN('2'),
                    editionId: FIRST_MINTED_TOKEN_ID
                });
            })


            it('cannot create a sale without the right role', async () => {
                await expectRevert(
                    this.basicGatedSale.createSaleWithPhase(
                        FIRST_MINTED_TOKEN_ID,
                        this.saleStart,
                        this.saleEnd,
                        new BN('10'),
                        this.merkleProof.merkleRoot,
                        MOCK_MERKLE_HASH,
                        ether('0.1'),
                        10,
                        {from: artistDodgy}),
                    'Caller not creator or admin'
                )
            });

            it('should revert if given a non existent edition ID', async () => {
                await expectRevert(
                    this.basicGatedSale.createSaleWithPhase(
                        FIRST_MINTED_TOKEN_ID.add(new BN('5000')),
                        this.saleStart,
                        this.saleEnd,
                        new BN('10'),
                        this.merkleProof.merkleRoot,
                        MOCK_MERKLE_HASH,
                        ether('0.1'),
                        10,
                        {from: admin}),
                    'edition does not exist'
                )
            });

            it('should revert if given an invalid end time', async () => {
                await expectRevert(
                    this.basicGatedSale.createSaleWithPhase(
                        FIRST_MINTED_TOKEN_ID,
                        this.saleStart,
                        this.saleEnd.sub(time.duration.days(7)),
                        new BN('10'),
                        this.merkleProof.merkleRoot,
                        MOCK_MERKLE_HASH,
                        ether('0.1'),
                        10,
                        {from: admin}),
                    'phase end time must be after start time'
                )
            });

            it('should revert if given an invalid mint limit', async () => {
                await expectRevert(
                    this.basicGatedSale.createSaleWithPhase(
                        FIRST_MINTED_TOKEN_ID,
                        this.saleStart,
                        this.saleEnd,
                        new BN('0'),
                        this.merkleProof.merkleRoot,
                        MOCK_MERKLE_HASH,
                        ether('0.1'),
                        10,
                        {from: admin}),
                    'phase mint limit must be greater than 0'
                )
            });
        });

        describe('createSaleWithPhases', async () => {
            it('can create a new sale with one phase', async () => {
                const receipt = await this.basicGatedSale.createSaleWithPhases(
                    FIRST_MINTED_TOKEN_ID,
                    [this.saleStart],
                    [this.saleEnd],
                    [new BN('10')],
                    [this.merkleProof.merkleRoot],
                    [MOCK_MERKLE_HASH],
                    [ether('0.1')],
                    [10],
                    {from: admin})

                expectEvent(receipt, 'SaleWithPhaseCreated', {
                    saleId: new BN('2'),
                    editionId: FIRST_MINTED_TOKEN_ID
                });

                let {priceInWei, mintCap} = await this.basicGatedSale.phases(2, 0)

                expect(priceInWei.toString()).to.be.equal(ether('0.1').toString())
                expect(mintCap.toString()).to.be.equal('10')
            })

            it('can create a new sale with multiple phases', async () => {
                const receipt = await this.basicGatedSale.createSaleWithPhases(
                    FIRST_MINTED_TOKEN_ID,
                    [this.saleStart, this.saleStart.add(time.duration.days(1))],
                    [this.saleEnd, this.saleEnd.add(time.duration.days(1))],
                    [new BN('10'), new BN('10')],
                    [this.merkleProof.merkleRoot, this.merkleProof.merkleRoot],
                    [MOCK_MERKLE_HASH, MOCK_MERKLE_HASH],
                    [ether('0.1'), ether('0.2')],
                    [10, 20],
                    {from: admin})

                expectEvent(receipt, 'SaleWithPhaseCreated', {
                    saleId: new BN('2'),
                    editionId: FIRST_MINTED_TOKEN_ID
                });

                let phase1 = await this.basicGatedSale.phases(2, 0)

                expect(phase1.priceInWei.toString()).to.be.equal(ether('0.1').toString())
                expect(phase1.mintCap.toString()).to.be.equal('10')

                let phase2 = await this.basicGatedSale.phases(2, 1)

                expect(phase2.priceInWei.toString()).to.be.equal(ether('0.2').toString())
                expect(phase2.mintCap.toString()).to.be.equal('20')
            })
        })

        describe('createPhase', async () => {

            it('can create a new phase and mint from it', async () => {
                const receipt = await this.basicGatedSale.createPhase(
                    FIRST_MINTED_TOKEN_ID,
                    this.saleStart.add(time.duration.days(6)),
                    this.saleStart.add(time.duration.days(8)),
                    new BN('5'),
                    this.merkleProof.merkleRoot,
                    MOCK_MERKLE_HASH,
                    ether('0.3'),
                    10,
                    {from: artist1})

                expectEvent(receipt, 'PhaseCreated', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID,
                    phaseId: ONE
                });

                const {
                    startTime,
                    endTime,
                    walletMintLimit,
                    merkleRoot,
                    merkleIPFSHash,
                    priceInWei,
                    mintCap
                } = await this.basicGatedSale.phases(1, 1)

                expect(startTime.toString()).to.not.equal('0')
                expect(endTime.toString()).to.not.equal('0')
                expect(walletMintLimit.toString()).to.be.equal('5')
                expect(merkleRoot).to.be.equal(this.merkleProof.merkleRoot)
                expect(merkleIPFSHash).to.be.equal(MOCK_MERKLE_HASH)
                expect(priceInWei.toString()).to.be.equal(ether('0.3').toString())
                expect(mintCap.toString()).to.be.equal('10')

                await time.increaseTo(this.saleStart.add(time.duration.days(7)))

                const salesReceipt = await this.basicGatedSale.mint(
                    ONE,
                    1,
                    ONE,
                    this.merkleProof.claims[artist3].index,
                    this.merkleProof.claims[artist3].proof,
                    {
                        from: artist3,
                        value: ether('0.3')
                    })

                expectEvent(salesReceipt, 'MintFromSale', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID,
                    phaseId: ONE,
                    account: artist3,
                    mintCount: ONE
                });
            })

            it('reverts if not called by an admin or creator', async () => {
                await expectRevert(this.basicGatedSale.createPhase(
                        FIRST_MINTED_TOKEN_ID,
                        this.saleStart,
                        this.saleEnd,
                        new BN('5'),
                        this.merkleProof.merkleRoot,
                        MOCK_MERKLE_HASH,
                        ether('0.3'),
                        0,
                        {from: artist2}),
                    'Caller not creator or admin')
            })

            it('reverts if the contract is paused', async () => {
                let receipt = await this.basicGatedSale.pause({from: admin});
                expectEvent(receipt, 'Paused', {
                    account: admin
                });

                await expectRevert(this.basicGatedSale.createPhase(
                        FIRST_MINTED_TOKEN_ID,
                        this.saleStart,
                        this.saleEnd,
                        new BN('5'),
                        this.merkleProof.merkleRoot,
                        MOCK_MERKLE_HASH,
                        ether('0.3'),
                        0,
                        {from: artist2}),
                    'Pausable: paused')
            })

            it('reverts if given an invalid edition', async () => {
                await expectRevert(this.basicGatedSale.createPhase(
                        FIRST_MINTED_TOKEN_ID.add(new BN('5000')),
                        this.saleStart,
                        this.saleEnd,
                        new BN('5'),
                        this.merkleProof.merkleRoot,
                        MOCK_MERKLE_HASH,
                        ether('0.3'),
                        0,
                        {from: admin}),
                    'edition does not exist')
            })

            it('reverts if given an end time', async () => {
                await expectRevert(this.basicGatedSale.createPhase(
                        FIRST_MINTED_TOKEN_ID,
                        this.saleStart,
                        this.saleEnd.sub(time.duration.days(8)),
                        new BN('5'),
                        this.merkleProof.merkleRoot,
                        MOCK_MERKLE_HASH,
                        ether('0.3'),
                        0,
                        {from: artist1}),
                    'phase end time must be after start time')
            })

            it('reverts if given an invalid mint limit', async () => {
                await expectRevert(this.basicGatedSale.createPhase(
                        FIRST_MINTED_TOKEN_ID,
                        this.saleStart,
                        this.saleEnd,
                        new BN('500'),
                        this.merkleProof.merkleRoot,
                        MOCK_MERKLE_HASH,
                        ether('0.3'),
                        0,
                        {from: artist1}),
                    'phase mint limit must be greater than 0')

                await expectRevert(this.basicGatedSale.createPhase(
                        FIRST_MINTED_TOKEN_ID,
                        this.saleStart,
                        this.saleEnd,
                        new BN('0'),
                        this.merkleProof.merkleRoot,
                        MOCK_MERKLE_HASH,
                        ether('0.3'),
                        0,
                        {from: artist1}),
                    'phase mint limit must be greater than 0')
            })

            it('reverts if given an edition id with no associated sale', async () => {
                await expectRevert(this.basicGatedSale.createPhase(
                        FIRST_MINTED_TOKEN_ID.add(new BN('1000')),
                        this.saleStart,
                        this.saleEnd,
                        new BN('5'),
                        this.merkleProof.merkleRoot,
                        MOCK_MERKLE_HASH,
                        ether('0.3'),
                        0,
                        {from: artist2}),
                    'no sale associated with edition id')
            })
        })

        describe('remove phase', async () => {

            it('can delete a phase if available', async () => {
                const createReceipt = await this.basicGatedSale.createPhase(
                    FIRST_MINTED_TOKEN_ID,
                    this.saleStart.add(time.duration.days(6)),
                    this.saleStart.add(time.duration.days(8)),
                    new BN('5'),
                    this.merkleProof.merkleRoot,
                    MOCK_MERKLE_HASH,
                    ether('0.3'),
                    0,
                    {from: artist1})

                expectEvent(createReceipt, 'PhaseCreated', {
                    saleId: ONE,
                    phaseId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID
                });

                const deleteReceipt = await this.basicGatedSale.removePhase(
                    FIRST_MINTED_TOKEN_ID,
                    ONE,
                    {from: artist1})

                expectEvent(deleteReceipt, 'PhaseRemoved', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID,
                    phaseId: ONE
                });
            })

            it('reverts if not called by a creator or admin', async () => {
                await expectRevert(this.basicGatedSale.removePhase(
                        FIRST_MINTED_TOKEN_ID,
                        ONE,
                        {from: artist3}),
                    'Caller not creator or admin')
            })

            it('reverts if the contract is called', async () => {
                let receipt = await this.basicGatedSale.pause({from: admin});
                expectEvent(receipt, 'Paused', {
                    account: admin
                });

                await expectRevert(this.basicGatedSale.removePhase(
                        FIRST_MINTED_TOKEN_ID,
                        ONE,
                        {from: artist3}),
                    'Pausable: paused')
            })

            it('reverts if given an invalid edition id', async () => {
                await expectRevert(this.basicGatedSale.removePhase(
                        FIRST_MINTED_TOKEN_ID.add(new BN('5000')),
                        ONE,
                        {from: admin}),
                    'edition does not exist')
            })

            it('reverts if given an edition id with no associated sale', async () => {
                await expectRevert(this.basicGatedSale.removePhase(
                        FIRST_MINTED_TOKEN_ID.add(new BN('1000')),
                        ONE,
                        {from: artist2}),
                    'no sale associated with edition id')
            })
        })

        describe('mint', async () => {

            it('can mint one item from a valid sale', async () => {
                const mintPrice = ether('0.1')

                const platformBalanceTracker = await balance.tracker(await this.basicGatedSale.platformAccount())
                const artistBalanceTracker = await balance.tracker(artist1)
                const minterBalanceTracker = await balance.tracker(artist2)

                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)))

                const salesReceipt = await this.basicGatedSale.mint(
                    ONE,
                    0,
                    ONE,
                    this.merkleProof.claims[artist2].index,
                    this.merkleProof.claims[artist2].proof,
                    {
                        from: artist2,
                        value: mintPrice,
                        gasPrice
                    })

                expectEvent(salesReceipt, 'MintFromSale', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID,
                    phaseId: ZERO,
                    account: artist2,
                    mintCount: ONE
                });

                expect(await this.token.ownerOf(FIRST_MINTED_TOKEN_ID)).to.be.equal(artist2);

                const platformFunds = mintPrice.divn(modulo).muln(platformCommission)
                const artistFunds = mintPrice.sub(platformFunds);

                expect(await artistBalanceTracker.delta()).to.be.bignumber.equal(artistFunds)
                expect(await platformBalanceTracker.delta()).to.be.bignumber.equal(platformFunds)

                const txCost = new BN(salesReceipt.receipt.cumulativeGasUsed).mul(gasPrice)
                const totalCost = mintPrice.add(txCost)

                expect(await minterBalanceTracker.delta()).to.be.bignumber.equal(totalCost.neg())
            });

            it('can mint multiple items from a valid sale', async () => {
                const mintPrice = ether('0.3')
                const platformBalanceTracker = await balance.tracker(await this.basicGatedSale.platformAccount())
                const artistBalanceTracker = await balance.tracker(artist1)
                const minterBalanceTracker = await balance.tracker(artist2)

                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)))

                const salesReceipt = await this.basicGatedSale.mint(
                    ONE,
                    0,
                    new BN('3'),
                    this.merkleProof.claims[artist2].index,
                    this.merkleProof.claims[artist2].proof,
                    {
                        from: artist2,
                        value: mintPrice,
                        gasPrice
                    })

                expectEvent(salesReceipt, 'MintFromSale', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID,
                    phaseId: ZERO,
                    account: artist2,
                    mintCount: new BN('3')
                });

                expect(await this.token.ownerOf(FIRST_MINTED_TOKEN_ID)).to.be.equal(artist2);
                expect(await this.token.ownerOf(FIRST_MINTED_TOKEN_ID.add(ONE))).to.be.equal(artist2);
                expect(await this.token.ownerOf(FIRST_MINTED_TOKEN_ID.add(TWO))).to.be.equal(artist2);


                const platformFunds = mintPrice.divn(modulo).muln(platformCommission)
                const artistFunds = mintPrice.sub(platformFunds);

                expect(await artistBalanceTracker.delta()).to.be.bignumber.equal(artistFunds)
                expect(await platformBalanceTracker.delta()).to.be.bignumber.equal(platformFunds)

                const txCost = new BN(salesReceipt.receipt.cumulativeGasUsed).mul(gasPrice)
                const totalCost = mintPrice.add(txCost)

                expect(await minterBalanceTracker.delta()).to.be.bignumber.equal(totalCost.neg())
            })

            it('reverts if the sale is already sold out', async () => {
                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)))

                const a1SalesReceipt = await this.basicGatedSale.mint(
                    ONE,
                    0,
                    new BN('10'),
                    this.merkleProof.claims[artist1].index,
                    this.merkleProof.claims[artist1].proof,
                    {
                        from: artist1,
                        value: ether('1')
                    })

                expectEvent(a1SalesReceipt, 'MintFromSale', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID,
                    phaseId: ZERO,
                    account: artist1,
                    mintCount: new BN('10')
                });

                const a2SalesReceipt = await this.basicGatedSale.mint(
                    ONE,
                    0,
                    new BN('5'),
                    this.merkleProof.claims[artist2].index,
                    this.merkleProof.claims[artist2].proof,
                    {
                        from: artist2,
                        value: ether('0.5')
                    })

                expectEvent(a2SalesReceipt, 'MintFromSale', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID,
                    phaseId: ZERO,
                    account: artist2,
                    mintCount: new BN('5')
                });

                await expectRevert(this.basicGatedSale.mint(
                    ONE,
                    0,
                    ONE,
                    this.merkleProof.claims[artist3].index,
                    this.merkleProof.claims[artist3].proof,
                    {
                        from: artist3,
                        value: ether('0.1')
                    }), 'sale is sold out')
            })

            it('reverts if the phase cap has been reached', async () => {
                await this.basicGatedSale.createPhase(
                    FIRST_MINTED_TOKEN_ID,
                    this.saleStart.add(time.duration.days(6)),
                    this.saleStart.add(time.duration.days(8)),
                    new BN('5'),
                    this.merkleProof.merkleRoot,
                    MOCK_MERKLE_HASH,
                    ether('0.5'),
                    5,
                    {from: artist1})

                await time.increaseTo(this.saleStart.add(time.duration.days(6)))

                let firstMintReceipt = await this.basicGatedSale.mint(
                    ONE,
                    ONE,
                    new BN('5'),
                    this.merkleProof.claims[artist3].index,
                    this.merkleProof.claims[artist3].proof,
                    {
                        from: artist3,
                        value: ether('2.5')
                    })

                expectEvent(firstMintReceipt, 'MintFromSale', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID,
                    phaseId: ONE,
                    account: artist3,
                    mintCount: new BN('5')
                });

                await expectRevert(this.basicGatedSale.mint(
                    ONE,
                    ONE,
                    ONE,
                    this.merkleProof.claims[artist2].index,
                    this.merkleProof.claims[artist2].proof,
                    {
                        from: artist2,
                        value: ether('0.5')
                    }), 'phase mint cap reached')

            })

            it('reverts if the sale is paused', async () => {
                const pauseReceipt = await this.basicGatedSale.toggleSalePause(
                    ONE,
                    FIRST_MINTED_TOKEN_ID
                )

                expectEvent(pauseReceipt, 'SalePaused', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID
                });

                await expectRevert(this.basicGatedSale.mint(
                    ONE,
                    0,
                    ONE,
                    this.merkleProof.claims[artist3].index,
                    this.merkleProof.claims[artist3].proof,
                    {
                        from: artist3,
                        value: ether('0.1')
                    }), 'sale is paused')
            })

            it('reverts if the sale is not in progress yet', async () => {

                await expectRevert(
                    this.basicGatedSale.mint(
                        ONE,
                        0,
                        ONE,
                        this.merkleProof.claims[artist1].index,
                        this.merkleProof.claims[artist1].proof,
                        {from: artist1, value: ether('0.1')}
                    ),
                    'sale phase not in progress'
                )
            })

            it('reverts if given an invalid phase ID', async () => {
                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)))

                await expectRevert(
                    this.basicGatedSale.mint(
                        ONE,
                        3,
                        ONE,
                        this.merkleProof.claims[artist1].index,
                        this.merkleProof.claims[artist1].proof,
                        {from: artist1, value: ether('0.1')}
                    ),
                    'phase id does not exist'
                )
            })

            it('reverts if the sale phase has ended', async () => {
                await time.increaseTo(this.saleEnd.add(time.duration.minutes(10)))

                await expectRevert(
                    this.basicGatedSale.mint(
                        ONE,
                        0,
                        ONE,
                        this.merkleProof.claims[artist1].index,
                        this.merkleProof.claims[artist1].proof,
                        {from: artist1, value: ether('0.1')}
                    ),
                    'sale phase not in progress'
                )
            })

            it('reverts if not enough eth is sent', async () => {
                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)))

                await expectRevert(
                    this.basicGatedSale.mint(
                        ONE,
                        0,
                        new BN('3'),
                        this.merkleProof.claims[artist1].index,
                        this.merkleProof.claims[artist1].proof,
                        {from: artist1, value: ether('0.2')}
                    ),
                    'not enough wei sent to complete mint'
                )
            })

            it('reverts if the address is not on the prelist', async () => {
                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)))

                await expectRevert(
                    this.basicGatedSale.mint(
                        ONE,
                        0,
                        ONE,
                        this.merkleProof.claims[artist1].index,
                        this.merkleProof.claims[artist1].proof,
                        {from: artistDodgy, value: ether('0.1')}
                    ),
                    'address not able to mint from sale'
                )
            })

            it('reverts if an address has exceeded its mint limit', async () => {
                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)))

                const salesReceipt = await this.basicGatedSale.mint(ONE, 0, new BN('9'), this.merkleProof.claims[artist2].index, this.merkleProof.claims[artist2].proof, {
                    from: artist2,
                    value: ether('0.9')
                })

                expectEvent(salesReceipt, 'MintFromSale', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID,
                    phaseId: ZERO,
                    account: artist2,
                    mintCount: new BN('9')
                });

                await expectRevert(
                    this.basicGatedSale.mint(
                        ONE,
                        0,
                        new BN('2'),
                        this.merkleProof.claims[artist2].index,
                        this.merkleProof.claims[artist2].proof,
                        {from: artist2, value: ether('0.2')}
                    ),
                    'cannot exceed total mints for sale phase'
                )
            })
        });

        describe('toggleSalePause', async () => {
            it('an admin should be able to pause and resume a sale', async () => {
                const pauseReceipt = await this.basicGatedSale.toggleSalePause(
                    ONE,
                    FIRST_MINTED_TOKEN_ID,
                    {from: admin}
                )

                expectEvent(pauseReceipt, 'SalePaused', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID
                });

                let pausedSale = await this.basicGatedSale.sales(1)

                expect(pausedSale.paused).to.be.equal(true)

                const resumeReceipt = await this.basicGatedSale.toggleSalePause(
                    ONE,
                    FIRST_MINTED_TOKEN_ID,
                    {from: admin}
                )

                expectEvent(resumeReceipt, 'SaleResumed', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID
                });

                let resumedSale = await this.basicGatedSale.sales(1)

                expect(resumedSale.paused).to.be.equal(false)
            })

            it('an owner should be able to pause and resume a sale', async () => {
                const pauseReceipt = await this.basicGatedSale.toggleSalePause(
                    ONE,
                    FIRST_MINTED_TOKEN_ID,
                    {from: artist1}
                )

                expectEvent(pauseReceipt, 'SalePaused', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID
                });

                let pausedSale = await this.basicGatedSale.sales(1)

                expect(pausedSale.paused).to.be.equal(true)

                const resumeReceipt = await this.basicGatedSale.toggleSalePause(
                    ONE,
                    FIRST_MINTED_TOKEN_ID,
                    {from: artist1}
                )

                expectEvent(resumeReceipt, 'SaleResumed', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID
                });

                let resumedSale = await this.basicGatedSale.sales(1)

                expect(resumedSale.paused).to.be.equal(false)
            })

            it('should revert if called by someone who isnt an admin or creator', async () => {
                await expectRevert(this.basicGatedSale.toggleSalePause(
                    ONE,
                    FIRST_MINTED_TOKEN_ID,
                    {from: artistDodgy}
                ), 'Caller not creator or admin')
            })
        })

        describe('onPhaseMintList', async () => {
            it('should return true if given a valid account', async () => {
                let check = await this.basicGatedSale.onPhaseMintList(
                    ONE,
                    ZERO,
                    this.merkleProof.claims[artist1].index,
                    artist1,
                    this.merkleProof.claims[artist1].proof
                )

                expect(check).to.be.true
            })

            it('should return false if given a valid account who isnt on the list', async () => {
               let check = await this.basicGatedSale.onPhaseMintList(
                    ONE,
                    ZERO,
                    this.merkleProof.claims[artist1].index,
                    artistDodgy,
                    this.merkleProof.claims[artist1].proof
                )

                expect(check).to.be.false
            })

            it('should revert if given an invalid phase id', async () => {
                await expectRevert(this.basicGatedSale.onPhaseMintList(
                    ONE,
                    TWO,
                    this.merkleProof.claims[artist1].index,
                    artistDodgy,
                    this.merkleProof.claims[artist1].proof
                ), 'reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)')
            })

            it('should revert if given an invalid sale id', async () => {
                await expectRevert(this.basicGatedSale.onPhaseMintList(
                    TWO,
                    ZERO,
                    this.merkleProof.claims[artist1].index,
                    artistDodgy,
                    this.merkleProof.claims[artist1].proof
                ), 'reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)')
            })
        })

        describe('remainingPhaseMintAllowance', async () => {
            it('returns a full allowance for a valid account that hasnt minted', async () => {
                let allowance = await this.basicGatedSale.remainingPhaseMintAllowance(
                    ONE,
                    ZERO,
                    this.merkleProof.claims[artist1].index,
                    artist1,
                    this.merkleProof.claims[artist1].proof
                )

                expect(allowance.toString()).to.be.equal('10')
            })

            it('returns an updated allowance for a valid account that has minted', async () => {
                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)))

                let mintReceipt = await this.basicGatedSale.mint(
                    ONE,
                    ZERO,
                    new BN('5'),
                    this.merkleProof.claims[artist1].index,
                    this.merkleProof.claims[artist1].proof,
                    {from: artist1, value: ether('0.5')}
                )

                expectEvent(mintReceipt, 'MintFromSale', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID,
                    phaseId: ZERO,
                    account: artist1,
                    mintCount: new BN('5')
                });

                let allowance = await this.basicGatedSale.remainingPhaseMintAllowance(
                    ONE,
                    ZERO,
                    this.merkleProof.claims[artist1].index,
                    artist1,
                    this.merkleProof.claims[artist1].proof
                )

                expect(allowance.toString()).to.be.equal('5')
            })

            it('reverts if given a user not able to mint', async () => {
                await expectRevert(this.basicGatedSale.remainingPhaseMintAllowance(
                    ONE,
                    ZERO,
                    this.merkleProof.claims[artist1].index,
                    artistDodgy,
                    this.merkleProof.claims[artist1].proof
                ),'address not able to mint from sale')
            })

            it('should revert if given an invalid phase id', async () => {
                await expectRevert(this.basicGatedSale.remainingPhaseMintAllowance(
                    ONE,
                    TWO,
                    this.merkleProof.claims[artist1].index,
                    artistDodgy,
                    this.merkleProof.claims[artist1].proof
                ), 'reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)')
            })

            it('should revert if given an invalid sale id', async () => {
                await expectRevert(this.basicGatedSale.remainingPhaseMintAllowance(
                    TWO,
                    ZERO,
                    this.merkleProof.claims[artist1].index,
                    artistDodgy,
                    this.merkleProof.claims[artist1].proof
                ), 'reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)')
            })
        })

        describe('core base tests', () => {

            describe('recoverERC20', () => {
                const _0_1_Tokens = ether('0.1');

                it('Can recover an amount of ERC20 as admin', async () => {
                    //send tokens 'accidentally' to the marketplace
                    await this.erc20Token.transfer(this.basicGatedSale.address, _0_1_Tokens, {from: owner});

                    expect(await this.erc20Token.balanceOf(this.basicGatedSale.address)).to.be.bignumber.equal(_0_1_Tokens);

                    // recover the tokens to an admin controlled address
                    const {receipt} = await this.basicGatedSale.recoverERC20(
                        this.erc20Token.address,
                        admin,
                        _0_1_Tokens,
                        {
                            from: owner
                        }
                    );

                    await expectEvent(receipt, 'AdminRecoverERC20', {
                        _recipient: admin,
                        _amount: _0_1_Tokens
                    });

                    expect(await this.erc20Token.balanceOf(admin)).to.be.bignumber.equal(_0_1_Tokens);
                });

                it('Reverts if not admin', async () => {
                    await expectRevert(
                        this.basicGatedSale.recoverERC20(
                            this.erc20Token.address,
                            admin,
                            _0_1_Tokens,
                            {
                                from: contract
                            }
                        ),
                        'Caller not admin'
                    );
                });
            });

            describe('recoverStuckETH', () => {
                const _0_5_ETH = ether('0.5');

                it.skip('Can recover eth if problem with contract', async () => {

                    // send money to pre-determined address
                    const [ownerSigner] = await ethers.getSigners();
                    await ownerSigner.sendTransaction({
                        to: this.basicGatedSale.address,
                        value: ethers.utils.parseEther('1')
                    });
                    expect(
                        await balance.current(expectedDeploymentAddress)
                    ).to.bignumber.equal(ethers.utils.parseEther('1').toString());

                    // something wrong, recover the eth
                    const adminBalTracker = await balance.tracker(admin);

                    const {receipt} = await this.basicGatedSale.recoverStuckETH(admin, _0_5_ETH, {from: owner});
                    await expectEvent(receipt, 'AdminRecoverETH', {
                        _recipient: admin,
                        _amount: _0_5_ETH
                    });

                    expect(await adminBalTracker.delta()).to.be.bignumber.equal(_0_5_ETH);
                });

                it('Reverts if not admin', async () => {
                    await expectRevert(
                        this.basicGatedSale.recoverStuckETH(admin, ether('1'), {from: artist1}),
                        'Caller not admin'
                    );
                });
            });

            describe('updateModulo', () => {
                const new_modulo = new BN('10000');

                it('updates the reserve auction length as admin', async () => {
                    const {receipt} = await this.basicGatedSale.updateModulo(new_modulo, {from: owner});

                    await expectEvent(receipt, 'AdminUpdateModulo', {
                        _modulo: new_modulo
                    });
                });

                it('Reverts when not admin', async () => {
                    await expectRevert(
                        this.basicGatedSale.updateModulo(new_modulo, {from: artist1}),
                        'Caller not admin'
                    );
                });
            });

            describe('updateMinBidAmount', () => {
                const new_min_bid = ether('0.3');

                it('updates the reserve auction length as admin', async () => {
                    const {receipt} = await this.basicGatedSale.updateMinBidAmount(new_min_bid, {from: owner});

                    await expectEvent(receipt, 'AdminUpdateMinBidAmount', {
                        _minBidAmount: new_min_bid
                    });
                });

                it('Reverts when not admin', async () => {
                    await expectRevert(
                        this.basicGatedSale.updateMinBidAmount(new_min_bid, {from: artist1}),
                        'Caller not admin'
                    );
                });
            });

            describe('updateAccessControls', () => {
                it('updates the reserve auction length as admin', async () => {
                    const oldAccessControlAddress = this.accessControls.address;
                    this.accessControls = await KOAccessControls.new(this.legacyAccessControls.address, {from: owner});
                    const {receipt} = await this.basicGatedSale.updateAccessControls(this.accessControls.address, {from: owner});

                    await expectEvent(receipt, 'AdminUpdateAccessControls', {
                        _oldAddress: oldAccessControlAddress,
                        _newAddress: this.accessControls.address
                    });
                });

                it('Reverts when not admin', async () => {
                    await expectRevert(
                        this.basicGatedSale.updateAccessControls(newAccessControls, {from: artist1}),
                        'Caller not admin'
                    );
                });

                it('Reverts when updating to an EOA', async () => {
                    await expectRevert(
                        this.basicGatedSale.updateAccessControls(newAccessControls, {from: owner}),
                        'function call to a non-contract account'
                    );
                });

                it('Reverts when to a contract where sender is not admin', async () => {
                    this.accessControls = await KOAccessControls.new(this.legacyAccessControls.address, {from: artist1});
                    await expectRevert(
                        this.basicGatedSale.updateAccessControls(this.accessControls.address, {from: owner}),
                        'Sender must have admin role in new contract'
                    );
                });
            });

            describe('updateBidLockupPeriod', () => {
                const new_lock_up = ether((6 * 60).toString());

                it('updates the reserve auction length as admin', async () => {
                    const {receipt} = await this.basicGatedSale.updateBidLockupPeriod(new_lock_up, {from: owner});

                    await expectEvent(receipt, 'AdminUpdateBidLockupPeriod', {
                        _bidLockupPeriod: new_lock_up
                    });
                });

                it('Reverts when not admin', async () => {
                    await expectRevert(
                        this.basicGatedSale.updateBidLockupPeriod(new_lock_up, {from: artist1}),
                        'Caller not admin'
                    );
                });
            });

            describe('updatePlatformAccount', () => {
                it('updates the reserve auction length as admin', async () => {
                    const {receipt} = await this.basicGatedSale.updatePlatformAccount(owner, {from: owner});

                    await expectEvent(receipt, 'AdminUpdatePlatformAccount', {
                        _oldAddress: koCommission,
                        _newAddress: owner
                    });
                });

                it('Reverts when not admin', async () => {
                    await expectRevert(
                        this.basicGatedSale.updatePlatformAccount(owner, {from: artist1}),
                        'Caller not admin'
                    );
                });
            });


            describe('pause & unpause', async () => {

                it('can be paused and unpaused by admin', async () => {
                    let receipt = await this.basicGatedSale.pause({from: admin});
                    expectEvent(receipt, 'Paused', {
                        account: admin
                    });

                    let isPaused = await this.basicGatedSale.paused();
                    expect(isPaused).to.be.equal(true);


                    receipt = await this.basicGatedSale.unpause({from: admin});
                    expectEvent(receipt, 'Unpaused', {
                        account: admin
                    });

                    isPaused = await this.basicGatedSale.paused();
                    expect(isPaused).to.be.equal(false);
                });

                it('pause - reverts when not admin', async () => {
                    await expectRevert(
                        this.basicGatedSale.pause({from: artist3}),
                        "Caller not admin"
                    )
                });

                it('unpause - reverts when not admin', async () => {
                    await expectRevert(
                        this.basicGatedSale.unpause({from: artist3}),
                        "Caller not admin"
                    )
                });

                it('minting is disabled when the contract is paused', async () => {
                    await time.increaseTo(this.saleStart.add(time.duration.minutes(10)))

                    let receipt = await this.basicGatedSale.pause({from: admin});
                    expectEvent(receipt, 'Paused', {
                        account: admin
                    });

                    let isPaused = await this.basicGatedSale.paused();
                    expect(isPaused).to.be.equal(true);

                    await expectRevert(
                        this.basicGatedSale.mint(
                            ONE,
                            0,
                            ONE,
                            this.merkleProof.claims[artist2].index,
                            this.merkleProof.claims[artist2].proof,
                            {
                                from: artist2,
                                value: ether('0.1')
                            }),
                        'Pausable: paused'
                    )

                    receipt = await this.basicGatedSale.unpause({from: admin});
                    expectEvent(receipt, 'Unpaused', {
                        account: admin
                    });

                    isPaused = await this.basicGatedSale.paused();
                    expect(isPaused).to.be.equal(false);


                    const salesReceipt = await this.basicGatedSale.mint(ONE, 0, ONE, this.merkleProof.claims[artist2].index, this.merkleProof.claims[artist2].proof, {
                        from: artist2,
                        value: ether('0.1')
                    })

                    expectEvent(salesReceipt, 'MintFromSale', {
                        saleId: ONE,
                        editionId: FIRST_MINTED_TOKEN_ID,
                        phaseId: ZERO,
                        account: artist2,
                        mintCount: ONE
                    });

                    expect(await this.token.ownerOf(FIRST_MINTED_TOKEN_ID)).to.be.equal(artist2);
                })
            });
        });

        describe('updatePlatformPrimarySaleCommission', () => {
            const new_commission = new BN('1550000');

            it('updates the platform primary sale commission as admin', async () => {
                const {receipt} = await this.basicGatedSale.updatePlatformPrimarySaleCommission(ONE, new_commission, {from: admin});

                await expectEvent(receipt, 'AdminUpdatePlatformPrimarySaleCommissionGatedSale', {
                    saleId: ONE,
                    platformPrimarySaleCommission: new_commission
                });
            });

            it('Reverts when not admin', async () => {
                await expectRevert(
                    this.basicGatedSale.updatePlatformPrimarySaleCommission(ONE, new_commission, {from: artist3}),
                    'Caller not admin'
                );
            });
        });

        describe('MerkleTree', async () => {

            describe('createMerkleTree', async () => {

                it('can create a new merkle tree', async () => {
                    this.merkleProof = parseBalanceMap(buildArtistMerkleInput(1, artist1, artist2, artist3));

                    expect(await this.basicGatedSale.onPhaseMintList(
                        ONE,
                        0,
                        this.merkleProof.claims[artist1].index,
                        artist1,
                        this.merkleProof.claims[artist1].proof)
                    ).to.be.equal(true);

                    expect(await this.basicGatedSale.onPhaseMintList(
                        ONE,
                        0,
                        this.merkleProof.claims[artist1].index,
                        artistDodgy,
                        this.merkleProof.claims[artist1].proof)
                    ).to.be.equal(false);
                })
            })
        });

    })
})
