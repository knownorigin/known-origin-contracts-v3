const {expect} = require("chai");
const {BN, expectEvent, expectRevert, time, constants, ether, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const KODAV3CollectorOnlyMarketplace = artifacts.require('KODAV3CollectorOnlyMarketplace');
const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const MockERC20 = artifacts.require('MockERC20');

contract('CollectorOnlyMarketplace tests...', function (accounts) {
    const [owner, admin, koCommission, contract, newAccessControls, artist1, artist2, buyer1, buyer2, buyer3, buyer4] = accounts;

    const STARTING_EDITION = '10000';
    const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';
    const ONE = new BN('1');
    const TWO = new BN('2');

    const FIRST_MINTED_TOKEN_ID = new BN('11000');
    const SECOND_MINTED_TOKEN_ID = new BN('12000');
    const THIRD_MINTED_TOKEN_ID = new BN('13000');

    const gasPrice = new BN(web3.utils.toWei('1', 'gwei').toString());
    const modulo = 10000000;
    const platformCommission = 1500000;

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


        await this.token.mintBatchEdition(5, artist1, TOKEN_URI, {from: contract});
        await this.token.transferFrom(artist1, buyer1, SECOND_MINTED_TOKEN_ID, {from: artist1})
        await this.token.transferFrom(artist1, buyer2, SECOND_MINTED_TOKEN_ID.add(new BN('1')), {from: artist1})
        await this.token.transferFrom(artist1, buyer3, SECOND_MINTED_TOKEN_ID.add(new BN('2')), {from: artist1})

        await this.token.mintBatchEdition(5, artist2, TOKEN_URI, {from: contract});
        await this.token.transferFrom(artist2, buyer1, THIRD_MINTED_TOKEN_ID, {from: artist2})

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

    describe('CollectorOnlySale', async () => {

        describe('createSale', async () => {

            it('can create a new sale with the correct arguments', async () => {
                const {
                    id,
                    creator,
                    editionId,
                    startTime,
                    endTime,
                    mintLimit,
                    priceInWei
                } = await this.collectorOnlySale.sales(1)

                expect(id.toString()).to.be.equal('1')
                expect(creator).to.be.equal(artist1)
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

            it('reverts if the contract is paused', async () => {
                let receipt = await this.collectorOnlySale.pause({from: admin});
                expectEvent(receipt, 'Paused', {
                    account: admin
                });

                await expectRevert(this.collectorOnlySale.createSale(
                    FIRST_MINTED_TOKEN_ID,
                    this.saleStart,
                    this.saleEnd,
                    new BN('10'),
                    ether('0.1'),
                    {from: admin}), 'Pausable: paused')
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

        describe('mint', async () => {

            it('can mint one item from a sale', async () => {
                const mintPrice = ether('0.1')
                const platformBalanceTracker = await balance.tracker(await this.collectorOnlySale.platformAccount())
                const artistBalanceTracker = await balance.tracker(artist1)
                const minterBalanceTracker = await balance.tracker(buyer1)

                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)))

                const salesReceipt = await this.collectorOnlySale.mint(
                    ONE,
                    SECOND_MINTED_TOKEN_ID,
                    ONE,
                    {
                        from: buyer1,
                        value: mintPrice,
                        gasPrice
                    })

                expectEvent(salesReceipt, 'MintFromSale', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID,
                    account: buyer1,
                    mintCount: ONE
                });

                expect(await this.token.ownerOf(FIRST_MINTED_TOKEN_ID)).to.be.equal(buyer1);

                const platformFunds = mintPrice.divn(modulo).muln(platformCommission)
                const artistFunds = mintPrice.sub(platformFunds);

                expect(await artistBalanceTracker.delta()).to.be.bignumber.equal(artistFunds)
                expect(await platformBalanceTracker.delta()).to.be.bignumber.equal(platformFunds)

                const txCost = new BN(salesReceipt.receipt.cumulativeGasUsed).mul(gasPrice)
                const totalCost = mintPrice.add(txCost)

                expect(await minterBalanceTracker.delta()).to.be.bignumber.equal(totalCost.neg())
            })

            it('can mint multiple items from a sale', async () => {
                const mintPrice = ether('0.2')
                const platformBalanceTracker = await balance.tracker(await this.collectorOnlySale.platformAccount())
                const artistBalanceTracker = await balance.tracker(artist1)
                const minterBalanceTracker = await balance.tracker(buyer1)

                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)))

                const salesReceipt = await this.collectorOnlySale.mint(
                    ONE,
                    SECOND_MINTED_TOKEN_ID,
                    TWO,
                    {
                        from: buyer1,
                        value: mintPrice,
                        gasPrice
                    })

                expectEvent(salesReceipt, 'MintFromSale', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID,
                    account: buyer1,
                    mintCount: TWO
                });

                expect(await this.token.ownerOf(FIRST_MINTED_TOKEN_ID)).to.be.equal(buyer1);
                expect(await this.token.ownerOf(FIRST_MINTED_TOKEN_ID.add(new BN('1')))).to.be.equal(buyer1);

                const platformFunds = mintPrice.divn(modulo).muln(platformCommission)
                const artistFunds = mintPrice.sub(platformFunds);

                expect(await artistBalanceTracker.delta()).to.be.bignumber.equal(artistFunds)
                expect(await platformBalanceTracker.delta()).to.be.bignumber.equal(platformFunds)

                const txCost = new BN(salesReceipt.receipt.cumulativeGasUsed).mul(gasPrice)
                const totalCost = mintPrice.add(txCost)

                expect(await minterBalanceTracker.delta()).to.be.bignumber.equal(totalCost.neg())
            })

            it('reverts if the contract is paused', async () => {
                let receipt = await this.collectorOnlySale.pause({from: admin});
                expectEvent(receipt, 'Paused', {
                    account: admin
                });

                await expectRevert(this.collectorOnlySale.mint(
                    ONE,
                    SECOND_MINTED_TOKEN_ID,
                    ONE,
                    {from: buyer1, value: ether('0.1')}), 'Pausable: paused')
            })

            it('reverts if the sale is paused', async () => {
                const pauseReceipt = await this.collectorOnlySale.toggleSalePause(
                    ONE,
                    FIRST_MINTED_TOKEN_ID
                )

                expectEvent(pauseReceipt, 'SalePaused', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID
                });

                await expectRevert(this.collectorOnlySale.mint(
                    ONE,
                    SECOND_MINTED_TOKEN_ID,
                    TWO,
                    {
                        from: buyer1,
                        value: ether('0.2'),
                    }), 'sale is paused')
            })

            it('reverts if the caller does not own the token', async () => {
                await expectRevert(this.collectorOnlySale.mint(
                    ONE,
                    SECOND_MINTED_TOKEN_ID,
                    TWO,
                    {from: buyer4, value: ether('0.2')}), 'address unable to mint from sale')
            })

            it('reverts if the given token is not created by the artist', async () => {
                await expectRevert(this.collectorOnlySale.mint(
                    ONE,
                    THIRD_MINTED_TOKEN_ID,
                    ONE,
                    {from: buyer1, value: ether('0.1')}), 'address unable to mint from sale')
            })

            it('reverts when the sale is sold out', async () => {
                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)))

                const b1SalesReceipt = await this.collectorOnlySale.mint(
                    ONE,
                    SECOND_MINTED_TOKEN_ID,
                    new BN('10'),
                    {from: buyer1, value: ether('1')})

                expectEvent(b1SalesReceipt, 'MintFromSale', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID,
                    account: buyer1,
                    mintCount: new BN('10')
                });

                const b2SalesReceipt = await this.collectorOnlySale.mint(
                    ONE,
                    SECOND_MINTED_TOKEN_ID.add(new BN('1')),
                    new BN('5'),
                    {from: buyer2, value: ether('0.5')})

                expectEvent(b2SalesReceipt, 'MintFromSale', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID,
                    account: buyer2,
                    mintCount: new BN('5')
                });

                await expectRevert(this.collectorOnlySale.mint(
                    ONE,
                    SECOND_MINTED_TOKEN_ID.add(new BN('2')),
                    ONE,
                    {from: buyer3, value: ether('0.1')}), 'the sale is sold out')
            })

            it('reverts when the sale is not in progress', async () => {
                await expectRevert(this.collectorOnlySale.mint(
                        ONE,
                        SECOND_MINTED_TOKEN_ID,
                        ONE,
                        {from: buyer1, value: ether('0.1')}),
                    'sale not in progress')

                await time.increaseTo(this.saleEnd.add(time.duration.minutes(10)))

                await expectRevert(this.collectorOnlySale.mint(
                        ONE,
                        SECOND_MINTED_TOKEN_ID,
                        ONE,
                        {from: buyer1, value: ether('0.1')}),
                    'sale not in progress')
            })

            it('reverts if the buyer has exceeded their mint limit', async () => {
                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)))

                const b1SalesReceipt = await this.collectorOnlySale.mint(
                    ONE,
                    SECOND_MINTED_TOKEN_ID,
                    new BN('10'),
                    {from: buyer1, value: ether('1')})

                expectEvent(b1SalesReceipt, 'MintFromSale', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID,
                    account: buyer1,
                    mintCount: new BN('10')
                });

                await expectRevert(this.collectorOnlySale.mint(
                    ONE,
                    SECOND_MINTED_TOKEN_ID,
                    ONE,
                    {from: buyer1, value: ether('0.1')}), 'cannot exceed total mints for sale')

            })

            it('reverts if not enough eth is sent', async () => {
                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)))

                await expectRevert(this.collectorOnlySale.mint(
                    ONE,
                    SECOND_MINTED_TOKEN_ID,
                    TWO,
                    {from: buyer1, value: ether('0.1')}), 'not enough wei sent to complete mint')
            })
        })

        describe('toggleSalePause', async () => {
            it('an admin should be able to pause and resume a sale', async () => {
                const pauseReceipt = await this.collectorOnlySale.toggleSalePause(
                    ONE,
                    FIRST_MINTED_TOKEN_ID,
                    {from: admin}
                )

                expectEvent(pauseReceipt, 'SalePaused', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID
                });

                let pausedSale = await this.collectorOnlySale.sales(1)

                expect(pausedSale.paused).to.be.equal(true)

                const resumeReceipt = await this.collectorOnlySale.toggleSalePause(
                    ONE,
                    FIRST_MINTED_TOKEN_ID,
                    {from: admin}
                )

                expectEvent(resumeReceipt, 'SaleResumed', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID
                });

                let resumedSale = await this.collectorOnlySale.sales(1)

                expect(resumedSale.paused).to.be.equal(false)
            })

            it('an owner should be able to pause and resume a sale', async () => {
                const pauseReceipt = await this.collectorOnlySale.toggleSalePause(
                    ONE,
                    FIRST_MINTED_TOKEN_ID,
                    {from: artist1}
                )

                expectEvent(pauseReceipt, 'SalePaused', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID
                });

                let pausedSale = await this.collectorOnlySale.sales(1)

                expect(pausedSale.paused).to.be.equal(true)

                const resumeReceipt = await this.collectorOnlySale.toggleSalePause(
                    ONE,
                    FIRST_MINTED_TOKEN_ID,
                    {from: artist1}
                )

                expectEvent(resumeReceipt, 'SaleResumed', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID
                });

                let resumedSale = await this.collectorOnlySale.sales(1)

                expect(resumedSale.paused).to.be.equal(false)
            })

            it('should revert if called by someone who isnt an admin or creator', async () => {
                await expectRevert(this.collectorOnlySale.toggleSalePause(
                    ONE,
                    FIRST_MINTED_TOKEN_ID,
                    {from: buyer3}
                ), 'Caller not creator or admin')
            })
        })

        describe('canMint', async () => {
            it('should return true if given a valid account', async () => {
                let check = await this.collectorOnlySale.canMint(
                    ONE,
                    SECOND_MINTED_TOKEN_ID,
                    buyer1,
                    artist1)

                expect(check).to.be.true
            })

            it('should return false if the account doesnt own the token', async () => {
                let check = await this.collectorOnlySale.canMint(
                    ONE,
                    THIRD_MINTED_TOKEN_ID,
                    buyer4,
                    artist1)

                expect(check).to.be.false
            })

            it('should return false if the token was not made by the creator', async () => {
                let check = await this.collectorOnlySale.canMint(
                    ONE,
                    THIRD_MINTED_TOKEN_ID,
                    buyer1,
                    artist1)

                expect(check).to.be.false
            })

            it('should revert if given a sale id that doesnt match the creator', async () => {
                const salesReceipt = await this.collectorOnlySale.createSale(
                    THIRD_MINTED_TOKEN_ID,
                    this.saleStart,
                    this.saleEnd,
                    ONE,
                    ether('0.1'),
                    {from: artist2});

                expectEvent(salesReceipt, 'SaleCreated', {
                    saleId: new BN('2'),
                    editionId: THIRD_MINTED_TOKEN_ID
                });

                await expectRevert(this.collectorOnlySale.canMint(
                    TWO,
                    THIRD_MINTED_TOKEN_ID,
                    buyer1,
                    artist1), 'sale id does not match creator address')
            })
        })

        describe('remaining mint allowance', async () => {
            it('returns a full allowance for a valid account that hasnt minted', async () => {
                let allowance = await this.collectorOnlySale.remainingMintAllowance(
                    ONE,
                    SECOND_MINTED_TOKEN_ID,
                    buyer1,
                    artist1
                )

                expect(allowance.toString()).to.be.equal('10')
            })

            it('returns an updated allowance for a valid account that has minted', async () => {
                await time.increaseTo(this.saleStart.add(time.duration.minutes(10)))

                const b1SalesReceipt = await this.collectorOnlySale.mint(
                    ONE,
                    SECOND_MINTED_TOKEN_ID,
                    new BN('5'),
                    {from: buyer1, value: ether('0.5')})

                expectEvent(b1SalesReceipt, 'MintFromSale', {
                    saleId: ONE,
                    editionId: FIRST_MINTED_TOKEN_ID,
                    account: buyer1,
                    mintCount: new BN('5')
                });


                let allowance = await this.collectorOnlySale.remainingMintAllowance(
                    ONE,
                    SECOND_MINTED_TOKEN_ID,
                    buyer1,
                    artist1
                )

                expect(allowance.toString()).to.be.equal('5')
            })

            it('reverts if given a user not able to mint', async () => {
                await expectRevert(this.collectorOnlySale.remainingMintAllowance(
                        ONE,
                        SECOND_MINTED_TOKEN_ID,
                        buyer4,
                        artist1
                ),'address not able to mint from sale')
            })
        })

        describe('core base tests', () => {

            describe('recoverERC20', () => {
                const _0_1_Tokens = ether('0.1');

                it('Can recover an amount of ERC20 as admin', async () => {
                    //send tokens 'accidentally' to the marketplace
                    await this.erc20Token.transfer(this.collectorOnlySale.address, _0_1_Tokens, {from: owner});

                    expect(await this.erc20Token.balanceOf(this.collectorOnlySale.address)).to.be.bignumber.equal(_0_1_Tokens);

                    // recover the tokens to an admin controlled address
                    const {receipt} = await this.collectorOnlySale.recoverERC20(
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
                        this.collectorOnlySale.recoverERC20(
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
                        to: this.collectorOnlySale.address,
                        value: ethers.utils.parseEther('1')
                    });
                    expect(
                        await balance.current(expectedDeploymentAddress)
                    ).to.bignumber.equal(ethers.utils.parseEther('1').toString());

                    // something wrong, recover the eth
                    const adminBalTracker = await balance.tracker(admin);

                    const {receipt} = await this.collectorOnlySale.recoverStuckETH(admin, _0_5_ETH, {from: owner});
                    await expectEvent(receipt, 'AdminRecoverETH', {
                        _recipient: admin,
                        _amount: _0_5_ETH
                    });

                    expect(await adminBalTracker.delta()).to.be.bignumber.equal(_0_5_ETH);
                });

                it('Reverts if not admin', async () => {
                    await expectRevert(
                        this.collectorOnlySale.recoverStuckETH(admin, ether('1'), {from: artist1}),
                        'Caller not admin'
                    );
                });
            });

            describe('updateModulo', () => {
                const new_modulo = new BN('10000');

                it('updates the reserve auction length as admin', async () => {
                    const {receipt} = await this.collectorOnlySale.updateModulo(new_modulo, {from: owner});

                    await expectEvent(receipt, 'AdminUpdateModulo', {
                        _modulo: new_modulo
                    });
                });

                it('Reverts when not admin', async () => {
                    await expectRevert(
                        this.collectorOnlySale.updateModulo(new_modulo, {from: artist1}),
                        'Caller not admin'
                    );
                });
            });

            describe('updateMinBidAmount', () => {
                const new_min_bid = ether('0.3');

                it('updates the reserve auction length as admin', async () => {
                    const {receipt} = await this.collectorOnlySale.updateMinBidAmount(new_min_bid, {from: owner});

                    await expectEvent(receipt, 'AdminUpdateMinBidAmount', {
                        _minBidAmount: new_min_bid
                    });
                });

                it('Reverts when not admin', async () => {
                    await expectRevert(
                        this.collectorOnlySale.updateMinBidAmount(new_min_bid, {from: artist1}),
                        'Caller not admin'
                    );
                });
            });

            describe('updateAccessControls', () => {
                it('updates the reserve auction length as admin', async () => {
                    const oldAccessControlAddress = this.accessControls.address;
                    this.accessControls = await KOAccessControls.new(this.legacyAccessControls.address, {from: owner});
                    const {receipt} = await this.collectorOnlySale.updateAccessControls(this.accessControls.address, {from: owner});

                    await expectEvent(receipt, 'AdminUpdateAccessControls', {
                        _oldAddress: oldAccessControlAddress,
                        _newAddress: this.accessControls.address
                    });
                });

                it('Reverts when not admin', async () => {
                    await expectRevert(
                        this.collectorOnlySale.updateAccessControls(newAccessControls, {from: artist1}),
                        'Caller not admin'
                    );
                });

                it('Reverts when updating to an EOA', async () => {
                    await expectRevert(
                        this.collectorOnlySale.updateAccessControls(newAccessControls, {from: owner}),
                        'function call to a non-contract account'
                    );
                });

                it('Reverts when to a contract where sender is not admin', async () => {
                    this.accessControls = await KOAccessControls.new(this.legacyAccessControls.address, {from: artist1});
                    await expectRevert(
                        this.collectorOnlySale.updateAccessControls(this.accessControls.address, {from: owner}),
                        'Sender must have admin role in new contract'
                    );
                });
            });

            describe('updateBidLockupPeriod', () => {
                const new_lock_up = ether((6 * 60).toString());

                it('updates the reserve auction length as admin', async () => {
                    const {receipt} = await this.collectorOnlySale.updateBidLockupPeriod(new_lock_up, {from: owner});

                    await expectEvent(receipt, 'AdminUpdateBidLockupPeriod', {
                        _bidLockupPeriod: new_lock_up
                    });
                });

                it('Reverts when not admin', async () => {
                    await expectRevert(
                        this.collectorOnlySale.updateBidLockupPeriod(new_lock_up, {from: artist1}),
                        'Caller not admin'
                    );
                });
            });

            describe('updatePlatformAccount', () => {
                it('updates the reserve auction length as admin', async () => {
                    const {receipt} = await this.collectorOnlySale.updatePlatformAccount(owner, {from: owner});

                    await expectEvent(receipt, 'AdminUpdatePlatformAccount', {
                        _oldAddress: koCommission,
                        _newAddress: owner
                    });
                });

                it('Reverts when not admin', async () => {
                    await expectRevert(
                        this.collectorOnlySale.updatePlatformAccount(owner, {from: artist1}),
                        'Caller not admin'
                    );
                });
            });


            describe('pause & unpause', async () => {

                it('can be paused and unpaused by admin', async () => {
                    let receipt = await this.collectorOnlySale.pause({from: admin});
                    expectEvent(receipt, 'Paused', {
                        account: admin
                    });

                    let isPaused = await this.collectorOnlySale.paused();
                    expect(isPaused).to.be.equal(true);


                    receipt = await this.collectorOnlySale.unpause({from: admin});
                    expectEvent(receipt, 'Unpaused', {
                        account: admin
                    });

                    isPaused = await this.collectorOnlySale.paused();
                    expect(isPaused).to.be.equal(false);
                });

                it('pause - reverts when not admin', async () => {
                    await expectRevert(
                        this.collectorOnlySale.pause({from: buyer1}),
                        "Caller not admin"
                    )
                });

                it('unpause - reverts when not admin', async () => {
                    await expectRevert(
                        this.collectorOnlySale.unpause({from: buyer1}),
                        "Caller not admin"
                    )
                });
            });
        });

        describe('updatePlatformPrimarySaleCommission', () => {
            const new_commission = new BN('1550000');

            it('updates the platform primary sale commission as admin', async () => {
                const {receipt} = await this.collectorOnlySale.updatePlatformPrimarySaleCommission(ONE, new_commission, {from: admin});

                await expectEvent(receipt, 'AdminUpdatePlatformPrimarySaleCommissionGatedSale', {
                    saleId: ONE,
                    platformPrimarySaleCommission: new_commission
                });
            });

            it('Reverts when not admin', async () => {
                await expectRevert(
                    this.collectorOnlySale.updatePlatformPrimarySaleCommission(ONE, new_commission, {from: buyer1}),
                    'Caller not admin'
                );
            });
        });
    });
})
