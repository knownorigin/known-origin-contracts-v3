const {BN, expectEvent, expectRevert, time, constants, ether, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const {parseBalanceMap} = require('../utils/parse-balance-map');
const {buildArtistMerkleInput} = require('../utils/merkle-tools');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const MockERC20 = artifacts.require('MockERC20');
const KODAV3UpgradableGatedMarketplace = artifacts.require('KODAV3UpgradableGatedMarketplace');

contract('BasicGatedSale tests...', function () {
    const STARTING_EDITION = '10000';
    const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';
    const MOCK_MERKLE_HASH = 'Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';
    const ZERO = new BN('0');
    const ONE = new BN('1');
    const TWO = new BN('2');
    const TEN = new BN('10');

    const FIRST_MINTED_TOKEN_ID = new BN('11000'); // this is implied
    const SECOND_MINTED_TOKEN_ID = new BN('12000'); // this is implied

    const gasPrice = new BN(web3.utils.toWei('1', 'gwei').toString());
    const modulo = 10000000;
    const platformCommission = 1500000;

    let owner, admin, koCommission, contract, artist1, artist2, artist3, artistDodgy, newAccessControls;

    beforeEach(async () => {
        [owner, admin, koCommission, contract, artist1, artist2, artist3, artistDodgy, newAccessControls] = await ethers.getSigners();

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

        await this.accessControls.grantRole(this.CONTRACT_ROLE, this.basicGatedSale.address, {from: owner.address});

        // create a batch of 15 tokens from the minter
        await this.token.mintBatchEdition(15, artist1.address, TOKEN_URI, {from: contract.address});

        // Ensure basic gated sale has approval to sell tokens
        await this.token.setApprovalForAll(this.basicGatedSale.address, true, {from: artist1.address});

        // create  a second edition and approve it minter
        await this.token.mintBatchEdition(15, artist2.address, TOKEN_URI, {from: contract.address});
        await this.token.setApprovalForAll(this.basicGatedSale.address, true, {from: artist2.address});

        // just for stuck tests
        this.erc20Token = await MockERC20.new({from: owner.address});

        // Set a root time, then a start and end time, simulating sale running for a day
        this.rootTime = await time.latest();
        this.saleStart = this.rootTime.add(time.duration.hours(1));
        this.saleEnd = this.rootTime.add(time.duration.hours(25));

        const receipt = await this.basicGatedSale.connect(artist1).createSaleWithPhases(
            FIRST_MINTED_TOKEN_ID.toString(),
            [this.saleStart.toString()],
            [this.saleEnd.toString()],
            [ether('0.1').toString()],
            ['15'],
            ['10'],
            [this.merkleProof.merkleRoot],
            [MOCK_MERKLE_HASH]
        )

        await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'SaleWithPhaseCreated', {
            saleId: ONE,
            editionId: FIRST_MINTED_TOKEN_ID
        });
    });

    describe.only('BasicGatedSale', async () => {

        describe.only('createSaleWithPhases', async () => {
            it.only('can create a new sale and phase with correct arguments', async () => {

                const {id, editionId, paused} = await this.basicGatedSale.sales(1);

                expect(id.toString()).to.be.equal('1');
                expect(editionId.toString()).to.be.equal(FIRST_MINTED_TOKEN_ID.toString());
                expect(paused).to.be.equal(false);

                const {
                    startTime,
                    endTime,
                    walletMintLimit,
                    merkleRoot,
                    merkleIPFSHash,
                    priceInWei,
                    mintCap
                } = await this.basicGatedSale.phases(1, 0);

                expect(startTime.toString()).to.not.equal('0');
                expect(endTime.toString()).to.not.equal('0');
                expect(walletMintLimit.toString()).to.be.equal('10');
                expect(merkleRoot).to.be.equal(this.merkleProof.merkleRoot);
                expect(merkleIPFSHash).to.be.equal(MOCK_MERKLE_HASH);
                expect(priceInWei.toString()).to.be.equal(ether('0.1').toString());
                expect(mintCap.toString()).to.be.equal('15');

                const mappingId = await this.basicGatedSale.editionToSale(editionId);
                expect(mappingId.toString()).to.be.equal(id.toString());
            });

            it('can create a new sale and phase if admin', async () => {
                const receipt = await this.basicGatedSale.connect(admin).createSaleWithPhases(
                    SECOND_MINTED_TOKEN_ID.toString(),
                    [this.saleStart.toString()],
                    [this.saleEnd.toString()],
                    [new BN('10').toString()],
                    [this.merkleProof.merkleRoot],
                    [MOCK_MERKLE_HASH],
                    [ether('0.1').toString()],
                    [10]
                );

                await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'SaleWithPhaseCreated', {
                    saleId: new BN('2').toString(),
                    editionId: SECOND_MINTED_TOKEN_ID
                });
            });

            it('cannot create a sale without the right role', async () => {
                const txs = this.basicGatedSale.connect(artistDodgy).createSaleWithPhases(
                    FIRST_MINTED_TOKEN_ID.toString(),
                    [this.saleStart.toString()],
                    [this.saleEnd.toString()],
                    [new BN('10').toString()],
                    [this.merkleProof.merkleRoot],
                    [MOCK_MERKLE_HASH],
                    [ether('0.1').toString()],
                    [10]
                );

                await expectRevert(txs, 'Caller not creator or admin');
            });

            it('should revert if given a non existent edition ID', async () => {
                const txs = this.basicGatedSale.connect(admin).createSaleWithPhases(
                    FIRST_MINTED_TOKEN_ID.add(new BN('5000')).toString(),
                    [this.saleStart.toString()],
                    [this.saleEnd.toString()],
                    [new BN('10').toString()],
                    [this.merkleProof.merkleRoot],
                    [MOCK_MERKLE_HASH],
                    [ether('0.1').toString()],
                    [10]
                );

                await expectRevert(txs, 'edition does not exist');
            });

            it('should revert if given an invalid end time', async () => {
                const txs = this.basicGatedSale.connect(admin).createSaleWithPhases(
                    SECOND_MINTED_TOKEN_ID.toString(),
                    [this.saleStart.toString()],
                    [this.saleEnd.sub(time.duration.days(7)).toString()],
                    [new BN('10').toString()],
                    [this.merkleProof.merkleRoot],
                    [MOCK_MERKLE_HASH],
                    [ether('0.1').toString()],
                    [10]
                );

                await expectRevert(txs, 'phase end time must be after start time');
            });

            it('should revert if given an invalid mint limit', async () => {
                const txs = this.basicGatedSale.connect(admin).createSaleWithPhases(
                    SECOND_MINTED_TOKEN_ID.toString(),
                    [this.saleStart.toString()],
                    [this.saleEnd.toString()],
                    [new BN('0').toString()],
                    [this.merkleProof.merkleRoot],
                    [MOCK_MERKLE_HASH],
                    [ether('0.1').toString()],
                    [10]
                );

                await expectRevert(txs, 'phase mint limit must be greater than 0');
            });
        });

        describe('createSaleWithPhases', async () => {
            it('can create a new sale with one phase', async () => {
                const receipt = await this.basicGatedSale.connect(admin).createSaleWithPhases(
                    SECOND_MINTED_TOKEN_ID.toString(),
                    [this.saleStart.toString()],
                    [this.saleEnd.toString()],
                    [new BN('10').toString()],
                    [this.merkleProof.merkleRoot],
                    [MOCK_MERKLE_HASH],
                    [ether('0.1').toString()],
                    ['10']
                );

                await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'SaleWithPhaseCreated', {
                    saleId: new BN('2'),
                    editionId: SECOND_MINTED_TOKEN_ID
                });

                let {priceInWei, mintCap} = await this.basicGatedSale.phases(2, 0);

                expect(priceInWei.toString()).to.be.equal(ether('0.1').toString());
                expect(mintCap.toString()).to.be.equal('10');
            });

            it('can create a new sale with multiple phases', async () => {
                const receipt = await this.basicGatedSale.connect(admin).createSaleWithPhases(
                    SECOND_MINTED_TOKEN_ID.toString(),
                    [this.saleStart.toString(), this.saleStart.add(time.duration.days(1)).toString()],
                    [this.saleEnd.toString(), this.saleEnd.add(time.duration.days(1)).toString()],
                    [new BN('10').toString(), new BN('10').toString()],
                    [this.merkleProof.merkleRoot, this.merkleProof.merkleRoot],
                    [MOCK_MERKLE_HASH, MOCK_MERKLE_HASH],
                    [ether('0.1').toString(), ether('0.2').toString()],
                    ['10', '20']
                );

                await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'SaleWithPhaseCreated', {
                    saleId: new BN('2'),
                    editionId: SECOND_MINTED_TOKEN_ID
                });

                let phase1 = await this.basicGatedSale.phases(2, 0);

                expect(phase1.priceInWei.toString()).to.be.equal(ether('0.1').toString());
                expect(phase1.mintCap.toString()).to.be.equal('10');

                let phase2 = await this.basicGatedSale.phases(2, 1);

                expect(phase2.priceInWei.toString()).to.be.equal(ether('0.2').toString());
                expect(phase2.mintCap.toString()).to.be.equal('20');
            });
        });

        describe('createPhase', async () => {

            it('can create a new phase and mint from it', async () => {
                const receipt = await this.basicGatedSale.connect(artist1).createPhase(
                    FIRST_MINTED_TOKEN_ID.toString(),
                    this.saleStart.add(time.duration.days(6)).toString(),
                    this.saleStart.add(time.duration.days(8)).toString(),
                    new BN('5').toString(),
                    this.merkleProof.merkleRoot,
                    MOCK_MERKLE_HASH,
                    ether('0.3').toString(),
                    '10'
                );

                await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'PhaseCreated', {
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
                } = await this.basicGatedSale.phases(1, 1);

                expect(startTime.toString()).to.not.equal('0');
                expect(endTime.toString()).to.not.equal('0');
                expect(walletMintLimit.toString()).to.be.equal('5');
                expect(merkleRoot).to.be.equal(this.merkleProof.merkleRoot);
                expect(merkleIPFSHash).to.be.equal(MOCK_MERKLE_HASH);
                expect(priceInWei.toString()).to.be.equal(ether('0.3').toString());
                expect(mintCap.toString()).to.be.equal('10');

                await time.increaseTo(this.saleStart.add(time.duration.days(7)));

                const salesReceipt = await this.basicGatedSale.connect(artist3).mint(
                    ONE.toString(),
                    '1',
                    ONE.toString(),
                    this.merkleProof.claims[artist3.address].index,
                    this.merkleProof.claims[artist3.address].proof,
                    {value: ether('0.3').toString()}
                );

                await expectEvent.inTransaction(salesReceipt.hash, KODAV3UpgradableGatedMarketplace, 'MintFromSale', {
                    saleId: ONE,
                    tokenId: FIRST_MINTED_TOKEN_ID,
                    phaseId: ONE,
                    account: artist3.address,
                    mintCount: ONE
                });
            });

            it('reverts if not called by an admin or creator', async () => {
                const txs = this.basicGatedSale.connect(artist2).createPhase(
                    FIRST_MINTED_TOKEN_ID.toString(),
                    this.saleStart.toString(),
                    this.saleEnd.toString(),
                    new BN('5').toString(),
                    this.merkleProof.merkleRoot,
                    MOCK_MERKLE_HASH,
                    ether('0.3').toString(),
                    '0'
                );

                await expectRevert(txs, 'Caller not creator or admin');
            });

            it('reverts if the contract is paused', async () => {
                let receipt = await this.basicGatedSale.connect(admin).pause();
                await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'Paused', {
                    account: admin.address
                });

                const txs = this.basicGatedSale.connect(artist2).createPhase(
                    FIRST_MINTED_TOKEN_ID.toString(),
                    this.saleStart.toString(),
                    this.saleEnd.toString(),
                    new BN('5').toString(),
                    this.merkleProof.merkleRoot,
                    MOCK_MERKLE_HASH,
                    ether('0.3').toString(),
                    '0'
                );

                await expectRevert(txs, 'Pausable: paused');
            });

            it('reverts if given an invalid edition', async () => {
                const txs = this.basicGatedSale.connect(admin).createPhase(
                    FIRST_MINTED_TOKEN_ID.add(new BN('5000')).toString(),
                    this.saleStart.toString(),
                    this.saleEnd.toString(),
                    new BN('5').toString(),
                    this.merkleProof.merkleRoot,
                    MOCK_MERKLE_HASH,
                    ether('0.3').toString(),
                    '0'
                );

                await expectRevert(txs, 'edition does not exist');
            });

            it('reverts if given an end time', async () => {
                const txs = this.basicGatedSale.connect(artist1).createPhase(
                    FIRST_MINTED_TOKEN_ID.toString(),
                    this.saleStart.toString(),
                    this.saleEnd.sub(time.duration.days(8)).toString(),
                    new BN('5').toString(),
                    this.merkleProof.merkleRoot,
                    MOCK_MERKLE_HASH,
                    ether('0.3').toString(),
                    '0'
                );

                await expectRevert(txs, 'phase end time must be after start time');
            });

            it('reverts if given an invalid mint limit', async () => {

                // FIXME do we need to check not bigger than edition?

                // const txs = this.basicGatedSale.connect(artist1).createPhase(
                //   FIRST_MINTED_TOKEN_ID.toString(),
                //   this.saleStart.toString(),
                //   this.saleEnd.toString(),
                //   new BN('500').toString(),
                //   this.merkleProof.merkleRoot,
                //   MOCK_MERKLE_HASH,
                //   ether('0.3').toString(),
                //   '0'
                // );
                //
                // await expectRevert(txs, 'phase mint limit must be greater than 0');

                const txs2 = this.basicGatedSale.connect(artist1).createPhase(
                    FIRST_MINTED_TOKEN_ID.toString(),
                    this.saleStart.toString(),
                    this.saleEnd.toString(),
                    new BN('0').toString(),
                    this.merkleProof.merkleRoot,
                    MOCK_MERKLE_HASH,
                    ether('0.3').toString(),
                    '0'
                );

                await expectRevert(txs2, 'phase mint limit must be greater than 0');
            });

            it('reverts if given an edition id with no associated sale', async () => {
                const txs = this.basicGatedSale.connect(artist2).createPhase(
                    FIRST_MINTED_TOKEN_ID.add(new BN('1000')).toString(),
                    this.saleStart.toString(),
                    this.saleEnd.toString(),
                    new BN('5').toString(),
                    this.merkleProof.merkleRoot,
                    MOCK_MERKLE_HASH,
                    ether('0.3').toString(),
                    '15'
                );

                await expectRevert(txs, 'no sale associated with edition id');
            });
        });

        describe('remove phase', async () => {

            it('can delete a phase if available', async () => {
                const createReceipt = await this.basicGatedSale.connect(artist1).createPhase(
                    FIRST_MINTED_TOKEN_ID.toString(),
                    this.saleStart.add(time.duration.days(6)).toString(),
                    this.saleStart.add(time.duration.days(8)).toString(),
                    new BN('5').toString(),
                    this.merkleProof.merkleRoot,
                    MOCK_MERKLE_HASH,
                    ether('0.3').toString(),
                    '15'
                );

                await expectEvent.inTransaction(createReceipt.hash, KODAV3UpgradableGatedMarketplace, 'PhaseCreated', {
                    saleId: ONE,
                    phaseId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID
                });

                const deleteReceipt = await this.basicGatedSale.connect(artist1).removePhase(
                    FIRST_MINTED_TOKEN_ID.toString(),
                    ONE.toString()
                );

                await expectEvent.inTransaction(deleteReceipt.hash, KODAV3UpgradableGatedMarketplace, 'PhaseRemoved', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID,
                    phaseId: ONE
                });
            });

            it('reverts if not called by a creator or admin', async () => {
                const txs = this.basicGatedSale.connect(artist3).removePhase(
                    FIRST_MINTED_TOKEN_ID.toString(),
                    ONE.toString()
                );
                await expectRevert(txs, 'Caller not creator or admin');
            });

            it('reverts if the contract is called', async () => {
                let receipt = await this.basicGatedSale.connect(admin).pause();
                await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'Paused', {
                    account: admin.address
                });

                const txs = this.basicGatedSale.connect(artist3).removePhase(
                    FIRST_MINTED_TOKEN_ID.toString(),
                    ONE.toString()
                );

                await expectRevert(txs, 'Pausable: paused');
            });

            it('reverts if given an invalid edition id', async () => {
                const txs = this.basicGatedSale.connect(admin).removePhase(
                    FIRST_MINTED_TOKEN_ID.add(new BN('5000')).toString(),
                    ONE.toString()
                );

                await expectRevert(txs, 'edition does not exist');
            });

            it('reverts if given an edition id with no associated sale', async () => {
                const txs = this.basicGatedSale.connect(artist2).removePhase(
                    FIRST_MINTED_TOKEN_ID.add(new BN('1000')).toString(),
                    ONE.toString()
                );

                await expectRevert(txs, 'no sale associated with edition id');
            });
        });

        describe('mint', async () => {

            it('can mint one item from a valid sale', async () => {
                const mintPrice = ether('0.1');

                const platformBalanceTracker = await balance.tracker(await this.basicGatedSale.platformAccount());
                const artistBalanceTracker = await balance.tracker(artist1.address);
                const minterBalanceTracker = await balance.tracker(artist2.address);

                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)));

                const salesReceipt = await this.basicGatedSale.connect(artist2).mint(
                    ONE.toString(),
                    '0',
                    ONE.toString(),
                    this.merkleProof.claims[artist2.address].index,
                    this.merkleProof.claims[artist2.address].proof,
                    {
                        value: mintPrice.toString(),
                        gasPrice: gasPrice.toString()
                    });

                await expectEvent.inTransaction(salesReceipt.hash, KODAV3UpgradableGatedMarketplace, 'MintFromSale', {
                    saleId: ONE,
                    tokenId: FIRST_MINTED_TOKEN_ID,
                    phaseId: ZERO,
                    account: artist2.address,
                    mintCount: ONE
                });

                expect(await this.token.ownerOf(FIRST_MINTED_TOKEN_ID)).to.be.equal(artist2.address);

                const platformFunds = mintPrice.divn(modulo).muln(platformCommission);
                const artistFunds = mintPrice.sub(platformFunds);

                expect(await artistBalanceTracker.delta()).to.be.bignumber.equal(artistFunds);
                expect(await platformBalanceTracker.delta()).to.be.bignumber.equal(platformFunds);

                const txReceipt = await salesReceipt.wait();
                const txCost = new BN(txReceipt.cumulativeGasUsed.toString()).mul(gasPrice);
                const totalCost = mintPrice.add(txCost);

                expect(await minterBalanceTracker.delta()).to.be.bignumber.equal(totalCost.neg());
            });

            it('can mint multiple items from a valid sale', async () => {
                const mintPrice = ether('0.3');
                const platformBalanceTracker = await balance.tracker(await this.basicGatedSale.platformAccount());
                const artistBalanceTracker = await balance.tracker(artist1.address);
                const minterBalanceTracker = await balance.tracker(artist2.address);

                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)));

                const salesReceipt = await this.basicGatedSale.connect(artist2).mint(
                    ONE.toString(),
                    '0',
                    new BN('3').toString(),
                    this.merkleProof.claims[artist2.address].index,
                    this.merkleProof.claims[artist2.address].proof,
                    {
                        value: mintPrice.toString(),
                        gasPrice: gasPrice.toString()
                    });

                await expectEvent.inTransaction(salesReceipt.hash, KODAV3UpgradableGatedMarketplace, 'MintFromSale', {
                    saleId: ONE,
                    tokenId: FIRST_MINTED_TOKEN_ID,
                    phaseId: ZERO,
                    account: artist2.address,
                    mintCount: new BN('3')
                });

                expect(await this.token.ownerOf(FIRST_MINTED_TOKEN_ID)).to.be.equal(artist2.address);
                expect(await this.token.ownerOf(FIRST_MINTED_TOKEN_ID.add(ONE))).to.be.equal(artist2.address);
                expect(await this.token.ownerOf(FIRST_MINTED_TOKEN_ID.add(TWO))).to.be.equal(artist2.address);

                const platformFunds = mintPrice.divn(modulo).muln(platformCommission);
                const artistFunds = mintPrice.sub(platformFunds);

                expect(await artistBalanceTracker.delta()).to.be.bignumber.equal(artistFunds);
                expect(await platformBalanceTracker.delta()).to.be.bignumber.equal(platformFunds);

                const txReceipt = await salesReceipt.wait();
                const txCost = new BN(txReceipt.cumulativeGasUsed.toString()).mul(gasPrice);
                const totalCost = mintPrice.add(txCost);

                expect(await minterBalanceTracker.delta()).to.be.bignumber.equal(totalCost.neg());
            });

            it('reverts if the sale is already sold out', async () => {
                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)));

                const a1SalesReceipt = await this.basicGatedSale.connect(artist1).mint(
                    ONE.toString(),
                    '0',
                    new BN('10').toString(),
                    this.merkleProof.claims[artist1.address].index,
                    this.merkleProof.claims[artist1.address].proof,
                    {
                        value: ether('1').toString()
                    });

                await expectEvent.inTransaction(a1SalesReceipt.hash, KODAV3UpgradableGatedMarketplace, 'MintFromSale', {
                    saleId: ONE,
                    tokenId: FIRST_MINTED_TOKEN_ID,
                    phaseId: ZERO,
                    account: artist1.address,
                    mintCount: new BN('10')
                });

                const a2SalesReceipt = await this.basicGatedSale.connect(artist2).mint(
                    ONE.toString(),
                    '0',
                    new BN('5').toString(),
                    this.merkleProof.claims[artist2.address].index,
                    this.merkleProof.claims[artist2.address].proof,
                    {
                        value: ether('0.5').toString()
                    });

                await expectEvent.inTransaction(a2SalesReceipt.hash, KODAV3UpgradableGatedMarketplace, 'MintFromSale', {
                    saleId: ONE,
                    tokenId: FIRST_MINTED_TOKEN_ID.add(new BN('10')),
                    phaseId: ZERO,
                    account: artist2.address,
                    mintCount: new BN('5')
                });

                const txs = this.basicGatedSale.connect(artist3).mint(
                    ONE.toString(),
                    '0',
                    ONE.toString(),
                    this.merkleProof.claims[artist3.address].index,
                    this.merkleProof.claims[artist3.address].proof,
                    {
                        value: ether('0.1').toString()
                    });
                await expectRevert(txs, 'phase mint cap reached');
            });

            it('reverts if the phase cap has been reached', async () => {
                await this.basicGatedSale.connect(artist1).createPhase(
                    FIRST_MINTED_TOKEN_ID.toString(),
                    this.saleStart.add(time.duration.days(6)).toString(),
                    this.saleStart.add(time.duration.days(8)).toString(),
                    new BN('5').toString(),
                    this.merkleProof.merkleRoot,
                    MOCK_MERKLE_HASH,
                    ether('0.5').toString(),
                    '5'
                );
                await time.increaseTo(this.saleStart.add(time.duration.days(6)));

                let firstMintReceipt = await this.basicGatedSale.connect(artist3).mint(
                    ONE.toString(),
                    ONE.toString(),
                    new BN('5').toString(),
                    this.merkleProof.claims[artist3.address].index,
                    this.merkleProof.claims[artist3.address].proof,
                    {
                        value: ether('2.5').toString()
                    });

                await expectEvent.inTransaction(firstMintReceipt.hash, KODAV3UpgradableGatedMarketplace, 'MintFromSale', {
                    saleId: ONE,
                    tokenId: FIRST_MINTED_TOKEN_ID,
                    phaseId: ONE,
                    account: artist3.address,
                    mintCount: new BN('5')
                });

                const txs = this.basicGatedSale.connect(artist2).mint(
                    ONE.toString(),
                    ONE.toString(),
                    ONE.toString(),
                    this.merkleProof.claims[artist2.address].index,
                    this.merkleProof.claims[artist2.address].proof,
                    {
                        value: ether('0.5').toString()
                    });
                await expectRevert(txs, 'phase mint cap reached');
            });

            it('reverts if the sale is paused', async () => {
                const pauseReceipt = await this.basicGatedSale.connect(artist1).toggleSalePause(
                    ONE.toString(),
                    FIRST_MINTED_TOKEN_ID.toString()
                );

                await expectEvent.inTransaction(pauseReceipt.hash, KODAV3UpgradableGatedMarketplace, 'SalePaused', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID
                });

                const txs = this.basicGatedSale.connect(artist1).mint(
                    ONE.toString(),
                    '0',
                    ONE.toString(),
                    this.merkleProof.claims[artist1.address].index,
                    this.merkleProof.claims[artist1.address].proof,
                    {value: ether('0.1').toString()});
                await expectRevert(txs, 'sale is paused');
            });

            it('reverts if the sale is not in progress yet', async () => {
                const txs = this.basicGatedSale.connect(artist1).mint(
                    ONE.toString(),
                    '0',
                    ONE.toString(),
                    this.merkleProof.claims[artist1.address].index,
                    this.merkleProof.claims[artist1.address].proof,
                    {value: ether('0.1').toString()}
                );
                await expectRevert(txs, 'sale phase not in progress');
            });

            it('reverts if given an invalid phase ID', async () => {
                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)));
                const txs = this.basicGatedSale.connect(artist1).mint(
                    ONE.toString(),
                    '3',
                    ONE.toString(),
                    this.merkleProof.claims[artist1.address].index,
                    this.merkleProof.claims[artist1.address].proof,
                    {value: ether('0.1').toString()}
                );
                await expectRevert.unspecified(txs);
            });

            it('reverts if the sale phase has ended', async () => {
                await time.increaseTo(this.saleEnd.add(time.duration.minutes(10)));
                const txs = this.basicGatedSale.connect(artist1).mint(
                    ONE.toString(),
                    '0',
                    ONE.toString(),
                    this.merkleProof.claims[artist1.address].index,
                    this.merkleProof.claims[artist1.address].proof,
                    {value: ether('0.1').toString()}
                );
                await expectRevert(txs, 'sale phase not in progress');
            });

            it('reverts if not enough eth is sent', async () => {
                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)));

                const txs = this.basicGatedSale.connect(artist1).mint(
                    ONE.toString(),
                    '0',
                    new BN('3').toString(),
                    this.merkleProof.claims[artist1.address].index,
                    this.merkleProof.claims[artist1.address].proof,
                    {value: ether('0.2').toString()}
                );
                await expectRevert(txs, 'not enough wei sent to complete mint');
            });

            it('reverts if the address is not on the prelist', async () => {
                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)));

                const txs = this.basicGatedSale.connect(artistDodgy).mint(
                    ONE.toString(),
                    '0',
                    ONE.toString(),
                    this.merkleProof.claims[artist1.address].index,
                    this.merkleProof.claims[artist1.address].proof,
                    {value: ether('0.1').toString()}
                );
                await expectRevert(txs, 'address not able to mint from sale');
            });

            it('reverts if an address has exceeded its mint limit', async () => {
                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)));

                const salesReceipt = await this.basicGatedSale.connect(artist2).mint(
                    ONE.toString(),
                    '0',
                    new BN('9').toString(),
                    this.merkleProof.claims[artist2.address].index,
                    this.merkleProof.claims[artist2.address].proof,
                    {value: ether('0.9').toString()}
                );

                await expectEvent.inTransaction(salesReceipt.hash, KODAV3UpgradableGatedMarketplace, 'MintFromSale', {
                    saleId: ONE,
                    tokenId: FIRST_MINTED_TOKEN_ID,
                    phaseId: ZERO,
                    account: artist2.address,
                    mintCount: new BN('9')
                });

                const txs = this.basicGatedSale.connect(artist2).mint(
                    ONE.toString(),
                    '0',
                    new BN('2').toString(),
                    this.merkleProof.claims[artist2.address].index,
                    this.merkleProof.claims[artist2.address].proof,
                    {value: ether('0.2').toString()}
                );
                await expectRevert(txs, 'cannot exceed total mints for sale phase');
            });
        });

        describe('toggleSalePause', async () => {
            it('an admin should be able to pause and resume a sale', async () => {
                const pauseReceipt = await this.basicGatedSale.connect(admin).toggleSalePause(
                    ONE.toString(),
                    FIRST_MINTED_TOKEN_ID.toString()
                );

                await expectEvent.inTransaction(pauseReceipt.hash, KODAV3UpgradableGatedMarketplace, 'SalePaused', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID
                });

                let pausedSale = await this.basicGatedSale.sales(1);

                expect(pausedSale.paused).to.be.equal(true);

                const resumeReceipt = await this.basicGatedSale.connect(admin).toggleSalePause(
                    ONE.toString(),
                    FIRST_MINTED_TOKEN_ID.toString()
                );

                await expectEvent.inTransaction(resumeReceipt.hash, KODAV3UpgradableGatedMarketplace, 'SaleResumed', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID
                });

                let resumedSale = await this.basicGatedSale.sales(1);

                expect(resumedSale.paused).to.be.equal(false);
            });

            it('an owner should be able to pause and resume a sale', async () => {
                const pauseReceipt = await this.basicGatedSale.connect(artist1).toggleSalePause(
                    ONE.toString(),
                    FIRST_MINTED_TOKEN_ID.toString()
                );

                await expectEvent.inTransaction(pauseReceipt.hash, KODAV3UpgradableGatedMarketplace, 'SalePaused', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID
                });

                let pausedSale = await this.basicGatedSale.sales(1);

                expect(pausedSale.paused).to.be.equal(true);

                const resumeReceipt = await this.basicGatedSale.connect(artist1).toggleSalePause(
                    ONE.toString(),
                    FIRST_MINTED_TOKEN_ID.toString()
                );

                await expectEvent.inTransaction(resumeReceipt.hash, KODAV3UpgradableGatedMarketplace, 'SaleResumed', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID
                });

                let resumedSale = await this.basicGatedSale.sales(1);

                expect(resumedSale.paused).to.be.equal(false);
            });

            it('should revert if called by someone who isnt an admin or creator', async () => {
                const txs = this.basicGatedSale.connect(artistDodgy).toggleSalePause(
                    ONE.toString(),
                    FIRST_MINTED_TOKEN_ID.toString()
                );
                await expectRevert(txs, 'Caller not creator or admin');
            });
        });

        describe('onPhaseMintList', async () => {
            it('should return true if given a valid account', async () => {
                let check = await this.basicGatedSale.onPhaseMintList(
                    ONE.toString(),
                    ZERO.toString(),
                    this.merkleProof.claims[artist1.address].index,
                    artist1.address,
                    this.merkleProof.claims[artist1.address].proof
                );

                expect(check).to.be.true;
            });

            it('should return false if given a valid account who isnt on the list', async () => {
                let check = await this.basicGatedSale.onPhaseMintList(
                    ONE.toString(),
                    ZERO.toString(),
                    this.merkleProof.claims[artist1.address].index,
                    artistDodgy.address,
                    this.merkleProof.claims[artist1.address].proof
                );

                expect(check).to.be.false;
            });

            it('should revert if given an invalid phase id', async () => {
                const txs = this.basicGatedSale.onPhaseMintList(
                    ONE.toString(),
                    TWO.toString(),
                    this.merkleProof.claims[artist1.address].index,
                    artistDodgy.address,
                    this.merkleProof.claims[artist1.address].proof
                );
                await expectRevert(txs, 'reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)');
            });

            it('should revert if given an invalid sale id', async () => {
                const txs = this.basicGatedSale.onPhaseMintList(
                    TWO.toString(),
                    ZERO.toString(),
                    this.merkleProof.claims[artist1.address].index,
                    artistDodgy.address,
                    this.merkleProof.claims[artist1.address].proof
                );
                await expectRevert(txs, 'reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)');
            });
        });

        describe('remainingPhaseMintAllowance', async () => {
            it('returns a full allowance for a valid account that hasnt minted', async () => {
                let allowance = await this.basicGatedSale.remainingPhaseMintAllowance(
                    ONE.toString(),
                    ZERO.toString(),
                    this.merkleProof.claims[artist1.address].index,
                    artist1.address,
                    this.merkleProof.claims[artist1.address].proof
                );

                expect(allowance.toString()).to.be.equal('10');
            });

            it('returns an updated allowance for a valid account that has minted', async () => {
                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)));

                let mintReceipt = await this.basicGatedSale.connect(artist1).mint(
                    ONE.toString(),
                    ZERO.toString(),
                    new BN('5').toString(),
                    this.merkleProof.claims[artist1.address].index,
                    this.merkleProof.claims[artist1.address].proof,
                    {value: ether('0.5').toString()}
                );

                await expectEvent.inTransaction(mintReceipt.hash, KODAV3UpgradableGatedMarketplace, 'MintFromSale', {
                    saleId: ONE,
                    tokenId: FIRST_MINTED_TOKEN_ID,
                    phaseId: ZERO,
                    account: artist1.address,
                    mintCount: new BN('5')
                });

                let allowance = await this.basicGatedSale.remainingPhaseMintAllowance(
                    ONE.toString(),
                    ZERO.toString(),
                    this.merkleProof.claims[artist1.address].index,
                    artist1.address,
                    this.merkleProof.claims[artist1.address].proof
                );

                expect(allowance.toString()).to.be.equal('5');
            });

            it('reverts if given a user not able to mint', async () => {
                const txs = this.basicGatedSale.remainingPhaseMintAllowance(
                    ONE.toString(),
                    ZERO.toString(),
                    this.merkleProof.claims[artist1.address].index,
                    artistDodgy.address,
                    this.merkleProof.claims[artist1.address].proof
                );
                await expectRevert(txs, 'address not able to mint from sale');
            });

            it('should revert if given an invalid phase id', async () => {
                const txs = this.basicGatedSale.remainingPhaseMintAllowance(
                    ONE.toString(),
                    TWO.toString(),
                    this.merkleProof.claims[artist1.address].index,
                    artistDodgy.address,
                    this.merkleProof.claims[artist1.address].proof
                );
                await expectRevert(txs, 'reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)');
            });

            it('should revert if given an invalid sale id', async () => {
                const txs = this.basicGatedSale.remainingPhaseMintAllowance(
                    TWO.toString(),
                    ZERO.toString(),
                    this.merkleProof.claims[artist1.address].index,
                    artistDodgy.address,
                    this.merkleProof.claims[artist1.address].proof
                );
                await expectRevert(txs, 'reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)');
            });
        });

        describe('core base tests', () => {

            describe('recoverERC20', () => {
                const _0_1_Tokens = ether('0.1');

                it('Can recover an amount of ERC20 as admin', async () => {
                    //send tokens 'accidentally' to the marketplace
                    await this.erc20Token.transfer(this.basicGatedSale.address, _0_1_Tokens, {from: owner.address});

                    expect(await this.erc20Token.balanceOf(this.basicGatedSale.address)).to.be.bignumber.equal(_0_1_Tokens);

                    // recover the tokens to an admin controlled address
                    const receipt = await this.basicGatedSale.connect(owner).recoverERC20(
                        this.erc20Token.address,
                        admin.address,
                        _0_1_Tokens.toString()
                    );

                    await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'AdminRecoverERC20', {
                        _recipient: admin.address,
                        _amount: _0_1_Tokens
                    });

                    expect(await this.erc20Token.balanceOf(admin.address)).to.be.bignumber.equal(_0_1_Tokens);
                });

                it('Reverts if not admin', async () => {
                    const txs = this.basicGatedSale.connect(contract).recoverERC20(
                        this.erc20Token.address,
                        admin.address,
                        _0_1_Tokens.toString()
                    );
                    await expectRevert(txs, 'Caller not admin');
                });
            });

            describe('updateModulo', () => {
                const new_modulo = new BN('10000');

                it('updates the reserve auction length as admin', async () => {
                    const receipt = await this.basicGatedSale.connect(owner).updateModulo(new_modulo.toString());

                    await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'AdminUpdateModulo', {
                        _modulo: new_modulo
                    });
                });

                it('Reverts when not admin', async () => {
                    await expectRevert(
                        this.basicGatedSale.connect(artist1).updateModulo(new_modulo.toString()),
                        'Caller not admin'
                    );
                });
            });

            describe('updateMinBidAmount', () => {
                const new_min_bid = ether('0.3');

                it('updates the reserve auction length as admin', async () => {
                    const receipt = await this.basicGatedSale.connect(owner).updateMinBidAmount(new_min_bid.toString());

                    await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'AdminUpdateMinBidAmount', {
                        _minBidAmount: new_min_bid
                    });
                });

                it('Reverts when not admin', async () => {
                    await expectRevert(
                        this.basicGatedSale.connect(artist1).updateMinBidAmount(new_min_bid.toString()),
                        'Caller not admin'
                    );
                });
            });

            describe('updateAccessControls', () => {
                it('updates the reserve auction length as admin', async () => {
                    const oldAccessControlAddress = this.accessControls.address;
                    this.accessControls = await KOAccessControls.new(this.legacyAccessControls.address, {from: owner.address});
                    const receipt = await this.basicGatedSale.connect(owner).updateAccessControls(this.accessControls.address);

                    await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'AdminUpdateAccessControls', {
                        _oldAddress: oldAccessControlAddress,
                        _newAddress: this.accessControls.address
                    });
                });

                it('Reverts when not admin', async () => {
                    await expectRevert(
                        this.basicGatedSale.connect(artist1).updateAccessControls(newAccessControls.address),
                        'Caller not admin'
                    );
                });

                it('Reverts when updating to an EOA', async () => {
                    await expectRevert(
                        this.basicGatedSale.connect(owner).updateAccessControls(newAccessControls.address),
                        'function call to a non-contract account'
                    );
                });

                it('Reverts when to a contract where sender is not admin', async () => {
                    this.accessControls = await KOAccessControls.new(this.legacyAccessControls.address, {from: artist1.address});
                    await expectRevert(
                        this.basicGatedSale.connect(owner).updateAccessControls(this.accessControls.address),
                        'Sender must have admin role in new contract'
                    );
                });
            });

            describe('updateBidLockupPeriod', () => {
                const new_lock_up = ether((6 * 60).toString());

                it('updates the reserve auction length as admin', async () => {
                    const receipt = await this.basicGatedSale.connect(owner).updateBidLockupPeriod(new_lock_up.toString());

                    await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'AdminUpdateBidLockupPeriod', {
                        _bidLockupPeriod: new_lock_up
                    });
                });

                it('Reverts when not admin', async () => {
                    await expectRevert(
                        this.basicGatedSale.connect(artist1).updateBidLockupPeriod(new_lock_up.toString()),
                        'Caller not admin'
                    );
                });
            });

            describe('updatePlatformAccount', () => {
                it('updates the reserve auction length as admin', async () => {
                    const receipt = await this.basicGatedSale.connect(owner).updatePlatformAccount(owner.address);

                    await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'AdminUpdatePlatformAccount', {
                        _oldAddress: koCommission.address,
                        _newAddress: owner.address
                    });
                });

                it('Reverts when not admin', async () => {
                    await expectRevert(
                        this.basicGatedSale.connect(artist1).updatePlatformAccount(owner.address),
                        'Caller not admin'
                    );
                });
            });

            describe('pause & unpause', async () => {

                it('can be paused and unpaused by admin', async () => {
                    let receipt = await this.basicGatedSale.connect(admin).pause();
                    await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'Paused', {
                        account: admin.address
                    });

                    let isPaused = await this.basicGatedSale.paused();
                    expect(isPaused).to.be.equal(true);


                    receipt = await this.basicGatedSale.connect(admin).unpause();
                    await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'Unpaused', {
                        account: admin.address
                    });

                    isPaused = await this.basicGatedSale.paused();
                    expect(isPaused).to.be.equal(false);
                });

                it('pause - reverts when not admin', async () => {
                    const tx = this.basicGatedSale.connect(artist3).pause();
                    await expectRevert(tx, 'Caller not admin');
                });

                it('unpause - reverts when not admin', async () => {
                    const txs = this.basicGatedSale.connect(artist3).unpause();
                    await expectRevert(txs, 'Caller not admin');
                });

                it('minting is disabled when the contract is paused', async () => {
                    await time.increaseTo(this.saleStart.add(time.duration.minutes(10)));

                    let receipt = await this.basicGatedSale.connect(admin).pause();
                    await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'Paused', {
                        account: admin.address
                    });

                    let isPaused = await this.basicGatedSale.paused();
                    expect(isPaused).to.be.equal(true);

                    const txs = this.basicGatedSale.connect(artist2).mint(
                        ONE.toString(),
                        '0',
                        ONE.toString(),
                        this.merkleProof.claims[artist2.address].index,
                        this.merkleProof.claims[artist2.address].proof,
                        {
                            value: ether('0.1').toString()
                        });
                    await expectRevert(txs, 'Pausable: paused');

                    receipt = await this.basicGatedSale.connect(admin).unpause();
                    await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'Unpaused', {
                        account: admin.address
                    });

                    isPaused = await this.basicGatedSale.paused();
                    expect(isPaused).to.be.equal(false);

                    const salesReceipt = await this.basicGatedSale.connect(artist2).mint(
                        ONE.toString(),
                        '0',
                        ONE.toString(),
                        this.merkleProof.claims[artist2.address].index,
                        this.merkleProof.claims[artist2.address].proof,
                        {
                            value: ether('0.1').toString()
                        });

                    await expectEvent.inTransaction(salesReceipt.hash, KODAV3UpgradableGatedMarketplace, 'MintFromSale', {
                        saleId: ONE,
                        tokenId: FIRST_MINTED_TOKEN_ID,
                        phaseId: ZERO,
                        account: artist2.address,
                        mintCount: ONE
                    });

                    expect(await this.token.ownerOf(FIRST_MINTED_TOKEN_ID)).to.be.equal(artist2.address);
                });
            });
        });

        describe('updatePlatformPrimarySaleCommission', () => {
            const new_commission = new BN('1550000');

            it('updates the platform primary sale commission as admin', async () => {
                const receipt = await this.basicGatedSale.connect(admin).updatePlatformPrimarySaleCommission(
                    ONE.toString(),
                    new_commission.toString()
                );

                await expectEvent.inTransaction(receipt.hash, KODAV3UpgradableGatedMarketplace, 'AdminUpdatePlatformPrimarySaleCommissionGatedSale', {
                    saleId: ONE,
                    platformPrimarySaleCommission: new_commission
                });
            });

            it('Reverts when not admin', async () => {
                const txs = this.basicGatedSale.connect(artist3).updatePlatformPrimarySaleCommission(
                    ONE.toString(),
                    new_commission.toString()
                );
                await expectRevert(txs, 'Caller not admin');
            });
        });

        describe('MerkleTree', async () => {
            describe('createMerkleTree', async () => {

                it('can create a new merkle tree', async () => {
                    this.merkleProof = parseBalanceMap(buildArtistMerkleInput(1, artist1.address, artist2.address, artist3.address));

                    const validToMint = await this.basicGatedSale.onPhaseMintList(
                        ONE.toString(),
                        '0',
                        this.merkleProof.claims[artist1.address].index,
                        artist1.address,
                        this.merkleProof.claims[artist1.address].proof
                    );
                    expect(validToMint).to.be.equal(true);

                    const notValidToMint = await this.basicGatedSale.onPhaseMintList(
                        ONE.toString(),
                        '0',
                        this.merkleProof.claims[artist1.address].index,
                        artistDodgy.address,
                        this.merkleProof.claims[artist1.address].proof
                    );
                    expect(notValidToMint).to.be.equal(false);
                });
            });
        });

    });
});
