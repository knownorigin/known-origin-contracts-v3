const {expect} = require("chai");
const {BN, expectEvent, expectRevert, time, constants, ether} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const {parseBalanceMap} = require('../utils/parse-balance-map');
const {buildArtistMerkleInput} = require('../utils/merkle-tools');

const KODAV3GatedMarketplace = artifacts.require('KODAV3GatedMarketplace');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const MockERC20 = artifacts.require('MockERC20');


contract('BasicGatedSale complex tests...', function (accounts) {
    const [owner, admin, koCommission, contract, artist, buyer1, buyer2, buyer3, buyer4, buyer5] = accounts;

    const STARTING_EDITION = '10000';
    const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';
    const MOCK_MERKLE_HASH = '0x7B502C3A1F48C8609AE212CDFB639DEE39673F5E'
    const ONE_HUNDRED = new BN('100');
    const ZERO = new BN('0');
    const ONE = new BN('1');
    const TWO = new BN('2');
    const THREE = new BN('3');

    const FIRST_MINTED_TOKEN_ID = new BN('11000'); // this is implied
    let CURRENT_TOKEN_ID = FIRST_MINTED_TOKEN_ID

    beforeEach(async () => {
        this.merkleProof1 = parseBalanceMap(buildArtistMerkleInput(1, buyer1, buyer2));
        this.merkleProof2 = parseBalanceMap(buildArtistMerkleInput(1, buyer1, buyer2, buyer3, buyer4));
        this.merkleProof3 = parseBalanceMap(buildArtistMerkleInput(1, buyer1, buyer2, buyer3, buyer4, buyer5));

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

        this.basicGatedSale = await KODAV3GatedMarketplace.new(this.accessControls.address, this.token.address, koCommission, {from: owner});

        await this.accessControls.grantRole(this.CONTRACT_ROLE, this.basicGatedSale.address, {from: owner});

        // create 100 tokens to the minter
        await this.token.mintBatchEdition(30, artist, TOKEN_URI, {from: contract});

        // Ensure basic gated sale has approval to sell tokens
        await this.token.setApprovalForAll(this.basicGatedSale.address, true, {from: artist});

        // just for stuck tests
        this.erc20Token = await MockERC20.new({from: owner});

        // Set a root time, then a start and end time, simulating sale running for a day
        this.rootTime = await time.latest()

        this.phase1Start = this.rootTime.add(time.duration.hours(1))
        this.phase1End = this.rootTime.add(time.duration.hours(25))

        this.phase2Start = this.phase1End
        this.phase2End = this.phase2Start.add(time.duration.days(2))

        this.phase3Start = this.phase2End
        this.phase3End = this.phase3Start.add(time.duration.days(7))
    })

    describe.only('BasicGatedSale - Complex', async () => {

        it('can create a sale with multiple phases and manage mints from each', async () => {
            // Make the sale
            const creationReceipt = await this.basicGatedSale.createSaleWithPhase(
                FIRST_MINTED_TOKEN_ID,
                this.phase1Start,
                this.phase1End,
                new BN('3'),
                this.merkleProof1.merkleRoot,
                MOCK_MERKLE_HASH,
                ether('0.1'),
                {from: artist});

            expectEvent(creationReceipt, 'SaleWithPhaseCreated', {
                saleId: ONE,
                editionId: FIRST_MINTED_TOKEN_ID
            });

            // Add a second phase
            const phase2Receipt = await this.basicGatedSale.createPhase(
                FIRST_MINTED_TOKEN_ID,
                this.phase2Start,
                this.phase2End,
                new BN('5'),
                this.merkleProof2.merkleRoot,
                MOCK_MERKLE_HASH,
                ether('0.3'),
                {from: artist})

            expectEvent(phase2Receipt, 'PhaseCreated', {
                saleId: ONE,
                editionId: FIRST_MINTED_TOKEN_ID,
                phaseId: ONE
            });

            // Add a third phase
            const phase3Receipt = await this.basicGatedSale.createPhase(
                FIRST_MINTED_TOKEN_ID,
                this.phase2Start,
                this.phase2End,
                new BN('10'),
                this.merkleProof3.merkleRoot,
                MOCK_MERKLE_HASH,
                ether('0.5'),
                {from: artist})

            expectEvent(phase3Receipt, 'PhaseCreated', {
                saleId: ONE,
                editionId: FIRST_MINTED_TOKEN_ID,
                phaseId: TWO
            });

            // Delete a phase
            const phase3DeleteReceipt = await this.basicGatedSale.removePhase(
                FIRST_MINTED_TOKEN_ID,
                TWO,
                {from: artist}
            )

            expectEvent(phase3DeleteReceipt, 'PhaseRemoved', {
                saleId: ONE,
                editionId: FIRST_MINTED_TOKEN_ID,
                phaseId: TWO
            });

            // Simulate someone else trying to add a phase
            await expectRevert(this.basicGatedSale.createPhase(
                    FIRST_MINTED_TOKEN_ID,
                    this.phase2Start,
                    this.phase2End,
                    new BN('5'),
                    this.merkleProof3.merkleRoot,
                    MOCK_MERKLE_HASH,
                    ether('0.7'),
                    {from: buyer4}),
                'Caller not creator or admin')

            // Add the third phase again
            const phase3NewReceipt = await this.basicGatedSale.createPhase(
                FIRST_MINTED_TOKEN_ID,
                this.phase3Start,
                this.phase3End,
                new BN('10'),
                this.merkleProof3.merkleRoot,
                MOCK_MERKLE_HASH,
                ether('0.7'),
                {from: artist})

            expectEvent(phase3NewReceipt, 'PhaseCreated', {
                saleId: ONE,
                editionId: FIRST_MINTED_TOKEN_ID,
                phaseId: THREE
            });

            // Try and mint before the test starts
            await expectRevert(this.basicGatedSale.mint(
                ONE,
                ZERO,
                ONE,
                this.merkleProof1.claims[buyer1].index,
                this.merkleProof1.claims[buyer1].proof,
                {
                    from: buyer1,
                    value: ether('0.1')
                }), 'sale phase not in progress')

            // Try and change the sales phase to suit a dodgy actor
            await expectRevert(this.basicGatedSale.changePhaseTimes(
                FIRST_MINTED_TOKEN_ID,
                ZERO,
                this.rootTime,
                this.rootTime.add(time.duration.days(1)),
                {from: buyer1}), 'Caller not creator or admin')

            // Advance time to the first phase
            await time.increaseTo(this.phase1Start.add(time.duration.minutes(1)))

            // Max out buyer1's allowance and prove you can't go over
            const b1p1MintReceipt = await this.basicGatedSale.mint(
                ONE,
                ZERO,
                THREE,
                this.merkleProof1.claims[buyer1].index,
                this.merkleProof1.claims[buyer1].proof,
                {
                    from: buyer1,
                    value: ether('0.3')
                })

            expectEvent(b1p1MintReceipt, 'MintFromSale', {
                saleId: ONE,
                editionId: FIRST_MINTED_TOKEN_ID,
                phaseId: ZERO,
                account: buyer1,
                mintCount: THREE
            });

            expect(await this.token.ownerOf(FIRST_MINTED_TOKEN_ID)).to.be.equal(buyer1);

            CURRENT_TOKEN_ID = FIRST_MINTED_TOKEN_ID.add(ONE);
            expect(await this.token.ownerOf(CURRENT_TOKEN_ID)).to.be.equal(buyer1);

            CURRENT_TOKEN_ID = CURRENT_TOKEN_ID.add(ONE);
            expect(await this.token.ownerOf(CURRENT_TOKEN_ID)).to.be.equal(buyer1);

            await expectRevert(this.basicGatedSale.mint(
                ONE,
                ZERO,
                ONE,
                this.merkleProof1.claims[buyer1].index,
                this.merkleProof1.claims[buyer1].proof,
                {
                    from: buyer1,
                    value: ether('0.1')
                }), 'cannot exceed total mints for sale phase')

            // Mint from buyer 2 as well
            let b2p1MintReceipt = await this.basicGatedSale.mint(
                ONE,
                ZERO,
                TWO,
                this.merkleProof1.claims[buyer2].index,
                this.merkleProof1.claims[buyer2].proof,
                {
                    from: buyer2,
                    value: ether('0.2')
                })

            expectEvent(b2p1MintReceipt, 'MintFromSale', {
                saleId: ONE,
                editionId: FIRST_MINTED_TOKEN_ID,
                phaseId: ZERO,
                account: buyer2,
                mintCount: TWO
            });

            CURRENT_TOKEN_ID = CURRENT_TOKEN_ID.add(ONE);
            expect(await this.token.ownerOf(CURRENT_TOKEN_ID)).to.be.equal(buyer2);

            CURRENT_TOKEN_ID = CURRENT_TOKEN_ID.add(ONE);
            expect(await this.token.ownerOf(CURRENT_TOKEN_ID)).to.be.equal(buyer2);

            // Try and mint from someone not in the phase whitelist
            await expectRevert(this.basicGatedSale.mint(
                ONE,
                ZERO,
                ONE,
                this.merkleProof1.claims[buyer1].index,
                this.merkleProof1.claims[buyer1].proof,
                {
                    from: buyer4,
                    value: ether('0.1')
                }), 'address not able to mint from sale')

            // Advance time to phase2 and move the sale on
            await time.increaseTo(this.phase2Start.add(time.duration.minutes(1)))

            // Check you can no longer mint from the first phase if it has finished
            await expectRevert(this.basicGatedSale.mint(
                ONE,
                ZERO,
                ONE,
                this.merkleProof1.claims[buyer2].index,
                this.merkleProof1.claims[buyer2].proof,
                {
                    from: buyer2,
                    value: ether('0.1')
                }), 'sale phase not in progress')

            // You can mint from phase 2 now though
            let b2p2MintReceipt = await this.basicGatedSale.mint(
                ONE,
                ONE,
                THREE,
                this.merkleProof2.claims[buyer2].index,
                this.merkleProof2.claims[buyer2].proof,
                {
                    from: buyer2,
                    value: ether('0.9')
                })

            expectEvent(b2p2MintReceipt, 'MintFromSale', {
                saleId: ONE,
                editionId: FIRST_MINTED_TOKEN_ID,
                phaseId: ONE,
                account: buyer2,
                mintCount: THREE
            });

            // And new members of the prelist can also mint
            let b4p2MintReceipt = await this.basicGatedSale.mint(
                ONE,
                ONE,
                ONE,
                this.merkleProof2.claims[buyer4].index,
                this.merkleProof2.claims[buyer4].proof,
                {
                    from: buyer4,
                    value: ether('0.3')
                })

            expectEvent(b4p2MintReceipt, 'MintFromSale', {
                saleId: ONE,
                editionId: FIRST_MINTED_TOKEN_ID,
                phaseId: ONE,
                account: buyer4,
                mintCount: ONE
            });

            // but not if they don't send enough ETH
            await expectRevert(this.basicGatedSale.mint(
                ONE,
                ONE,
                TWO,
                this.merkleProof2.claims[buyer3].index,
                this.merkleProof2.claims[buyer3].proof,
                {
                    from: buyer3,
                    value: ether('0.5')
                }), 'not enough wei sent to complete mint')

            // buyer5 should still not be able to mint as well
            await expectRevert(this.basicGatedSale.mint(
                ONE,
                ONE,
                ONE,
                this.merkleProof2.claims[buyer3].index,
                this.merkleProof2.claims[buyer3].proof,
                {
                    from: buyer5,
                    value: ether('0.3')
                }), 'address not able to mint from sale')

            // You are also unable to mint if you give the deleted phase id
            await expectRevert(this.basicGatedSale.mint(
                ONE,
                TWO,
                ONE,
                this.merkleProof2.claims[buyer3].index,
                this.merkleProof2.claims[buyer3].proof,
                {
                    from: buyer3,
                    value: ether('0.3')
                }), 'sale phase not in progress')

            // They will be able to mint when we advance to phase 3 though
            await time.increaseTo(this.phase3Start)

            let b5p3MintReceipt = await this.basicGatedSale.mint(
                ONE,
                THREE,
                new BN('10'),
                this.merkleProof3.claims[buyer5].index,
                this.merkleProof3.claims[buyer5].proof,
                {
                    from: buyer5,
                    value: ether('7')
                })

            expectEvent(b5p3MintReceipt, 'MintFromSale', {
                saleId: ONE,
                editionId: FIRST_MINTED_TOKEN_ID,
                phaseId: THREE,
                account: buyer5,
                mintCount: new BN('10')
            });


            // Lets get someone else to buy a load as well
            let b2p3MintReceipt = await this.basicGatedSale.mint(
                ONE,
                THREE,
                new BN('10'),
                this.merkleProof3.claims[buyer2].index,
                this.merkleProof3.claims[buyer2].proof,
                {
                    from: buyer2,
                    value: ether('7')
                })

            expectEvent(b2p3MintReceipt, 'MintFromSale', {
                saleId: ONE,
                editionId: FIRST_MINTED_TOKEN_ID,
                phaseId: THREE,
                account: buyer2,
                mintCount: new BN('10')
            });

            // The sale should now be sold out so should revert
            await expectRevert(this.basicGatedSale.mint(
                ONE,
                THREE,
                new BN('2'),
                this.merkleProof3.claims[buyer1].index,
                this.merkleProof3.claims[buyer1].proof,
                {
                    from: buyer1,
                    value: ether('1.4')
                }), 'Primary market exhausted')
        })
    });
})
