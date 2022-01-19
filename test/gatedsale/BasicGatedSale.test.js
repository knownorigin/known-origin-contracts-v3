const {expect} = require("chai");
const {BN, expectEvent, expectRevert, time, constants, ether, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const {parseBalanceMap} = require('../utils/parse-balance-map');
const {buildArtistMerkleInput} = require('../utils/merkle-tools');
const {ethers} = require("ethers");

const BasicGatedSale = artifacts.require('BasicGatedSale');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const MockERC20 = artifacts.require('MockERC20');

const STARTING_EDITION = '10000';
const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

async function mockTime() {
    const timeNow = await time.latest()

    const saleStart = new Date(Number(timeNow.toString()));
    saleStart.setDate(saleStart.getDate() + 1);
    const saleEnd = new Date(Number(timeNow.toString()));
    saleEnd.setDate(saleEnd.getDate() + 3);

    return {
        timeNow: timeNow,
        saleStart: new BN(saleStart.getTime().toString()),
        saleEnd: new BN(saleEnd.getTime().toString())
    }
}

contract('BasicGatedSale Test Tests...', function (accounts) {

    const [owner, admin, koCommission, contract, artist1, artist2, artist3, artistDodgy, newAccessControls] = accounts;

    beforeEach(async () => {
        this.merkleProof = parseBalanceMap(buildArtistMerkleInput(1, artist1, artist2, artist3));

        this.legacyAccessControls = await SelfServiceAccessControls.new();

        // setup access controls
        this.accessControls = await KOAccessControls.new(this.legacyAccessControls.address, {from: owner});

        // grab the roles
        this.DEFAULT_ADMIN_ROLE = await this.accessControls.DEFAULT_ADMIN_ROLE();
        this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

        // Create token V3
        this.token = await KnownOriginDigitalAssetV3.new(
            this.accessControls.address,
            ZERO_ADDRESS, // no royalties address
            STARTING_EDITION,
            {from: owner}
        );

        // Set contract roles
        await this.accessControls.grantRole(this.DEFAULT_ADMIN_ROLE, admin, {from: owner});

        await this.accessControls.grantRole(this.CONTRACT_ROLE, this.token.address, {from: owner});

        // Note: this is a test hack so we can mint tokens direct
        await this.accessControls.grantRole(this.CONTRACT_ROLE, contract, {from: owner});

        this.basicGatedSale = await BasicGatedSale.new(this.accessControls.address, this.token.address, koCommission, {from: owner});
        await this.accessControls.grantRole(this.CONTRACT_ROLE, this.basicGatedSale.address, {from: owner});

        // create 3 tokens to the minter
        await this.token.mintBatchEdition(3, artist1, TOKEN_URI, {from: contract});

        // Ensure basic gated sale has approval to sell tokens
        await this.token.setApprovalForAll(this.basicGatedSale.address, true, {from: artist1});

        this.start = await time.latest();

        // just for stuck tests
        this.erc20Token = await MockERC20.new({from: owner});
    });

    describe.only('BasicGatedSale', async () => {

        beforeEach(async () => {
            const receipt = await this.basicGatedSale.createSale(STARTING_EDITION, {from: admin});
            expectEvent(receipt, 'SaleCreated', {id: new BN('1')});

            const {saleStart, saleEnd} = await mockTime();

            await this.basicGatedSale.addPhase(
                new BN('1'),
                saleStart,
                saleEnd,
                new BN('10'),
                this.merkleProof.merkleRoot,
                ether('0.1'),
                {from: admin}
            )
        });

        describe('createSale', async () => {

            it('can create a new sale with correct arguments', async () => {
                const {id, editionId} = await this.basicGatedSale.sales(1)

                expect(id.toString()).to.be.equal('1')
                expect(editionId.toString()).to.be.equal(STARTING_EDITION)
            });

            it('cannot create a sale without the right role', async () => {
                await expectRevert(
                    this.basicGatedSale.createSale(STARTING_EDITION, {from: artistDodgy}),
                    'Caller not admin'
                )
            });
        })

        describe('addPhase', async () => {
            it('can create a new phase of a sale', async () => {
                const {startTime, endTime, mintLimit, merkleRoot, priceInWei} = await this.basicGatedSale.phases(1, 0);

                expect(startTime.toString()).to.not.equal('0')
                expect(endTime.toString()).to.not.equal('0')
                expect(mintLimit.toString()).to.be.equal('10')
                expect(merkleRoot).to.be.equal(this.merkleProof.merkleRoot)
                expect(priceInWei.toString()).to.be.equal(ether('0.1').toString())
            });

            it('cannot create a phase without the right role', async () => {
                let {saleStart, saleEnd} = await mockTime()

                await expectRevert(
                    this.basicGatedSale.addPhase(
                        new BN('1'),
                        saleStart,
                        saleEnd,
                        new BN('10'),
                        this.merkleProof.merkleRoot,
                        ether('0.1'),
                        {from: artistDodgy}
                    ),
                    'Caller not admin'
                )
            });

            it('should revert if given an invalid start time', async () => {
                let {timeNow, saleStart} = await mockTime()

                const saleEnd = new Date(Number(timeNow.toString()));
                saleEnd.setDate(saleEnd.getDate() - 4);

                await expectRevert(
                    this.basicGatedSale.addPhase(
                        new BN('1'),
                        saleStart,
                        new BN(saleEnd.getTime().toString()),
                        new BN('10'),
                        this.merkleProof.merkleRoot,
                        ether('0.1'),
                        {from: admin}
                    ),
                    'phase end time must be after start time'
                )
            });

            it('should revert if given an end time before the start time', async () => {
                let {timeNow, saleEnd} = await mockTime()

                const saleStart = new Date(Number(timeNow.toString()));
                saleStart.setDate(saleStart.getDate() - 4);

                await expectRevert(
                    this.basicGatedSale.addPhase(
                        new BN('1'),
                        new BN(saleStart.getTime().toString()),
                        saleEnd,
                        new BN('10'),
                        this.merkleProof.merkleRoot,
                        ether('0.1'),
                        {from: admin}
                    ),
                    'phase start time must be in the future'
                )
            });

            it('should revert if given an invalid mint limit', async () => {
                let {saleStart, saleEnd} = await mockTime()

                await expectRevert(
                    this.basicGatedSale.addPhase(
                        new BN('1'),
                        saleStart,
                        saleEnd,
                        new BN('0'),
                        this.merkleProof.merkleRoot,
                        ether('0.1'),
                        {from: admin}
                    ),
                    'phase mint limit must be greater than 0'
                )
            });

            it('should revert if given an invalid merkle root', async () => {
                let {saleStart, saleEnd} = await mockTime()

                await expectRevert(
                    this.basicGatedSale.addPhase(
                        new BN('1'),
                        saleStart,
                        saleEnd,
                        new BN('10'),
                        ethers.utils.formatBytes32String(""),
                        ether('0.1'),
                        {from: admin}
                    ),
                    'phase must have a valid merkle root'
                )
            });

            it('should revert if given an invalid price', async () => {
                let {saleStart, saleEnd} = await mockTime()

                await expectRevert(
                    this.basicGatedSale.addPhase(
                        new BN('1'),
                        saleStart,
                        saleEnd,
                        new BN('10'),
                        this.merkleProof.merkleRoot,
                        ether('0'),
                        {from: admin}
                    ),
                    'phase price must be greater than 0'
                )
            });
        })

        describe('mintFromSale', async () => {
            let {saleStart} = await mockTime()

            await time.increaseTo(saleStart.toString())
            await time.increase(time.duration.hours(1))

            it('can mint one item from a valid sale', async () => {

                const salesReceipt = await this.basicGatedSale.mintFromSale(new BN('1'), 0, new BN('1'), this.merkleProof.claims[artist1].index, this.merkleProof.claims[artist1].proof, {
                    from: artist1,
                    value: ether('0.1')
                })

                expectEvent(salesReceipt, 'MintFromSale', {
                    saleID: new BN('1'),
                    account: artist1,
                    mintCount: new BN('1')
                });

                it('can mint multiple items from a valid sale', async () => {

                    const salesReceipt = await this.basicGatedSale.mintFromSale(new BN('1'), 0, new BN('3'), this.merkleProof.claims[artist1].index, this.merkleProof.claims[artist1].proof, {
                        from: artist1,
                        value: ether('0.3')
                    })

                    expectEvent(salesReceipt, 'MintFromSale', {
                        saleID: new BN('1'),
                        account: artist1,
                        mintCount: new BN('3')
                    });
                })

                it('reverts if the given sale phase is not in progress', async () => {
                    await expectRevert(
                        this.basicGatedSale.mintFromSale(
                            new BN('1'),
                            1,
                            new BN('1'),
                            this.merkleProof.claims[artist1].index,
                            this.merkleProof.claims[artist1].proof,
                            {from: artist1, value: ether('0.1')}
                        ),
                        'sale phase not in progress'
                    )
                })

                it('reverts if not enough eth is sent', async () => {
                    await expectRevert(
                        this.basicGatedSale.mintFromSale(
                            new BN('1'),
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
                    await expectRevert(
                        this.basicGatedSale.mintFromSale(
                            new BN('1'),
                            0,
                            new BN('1'),
                            this.merkleProof.claims[artistDodgy].index,
                            this.merkleProof.claims[artistDodgy].proof,
                            {from: artistDodgy, value: ether('0.1')}
                        ),
                        'address not able to mint from sale'
                    )
                })

                it('reverts if an address has exceeded its mint limit', async () => {

                    const salesReceipt = await this.basicGatedSale.mintFromSale(new BN('1'), 0, new BN('9'), this.merkleProof.claims[artist1].index, this.merkleProof.claims[artist1].proof, {
                        from: artist1,
                        value: ether('0.9')
                    })

                    expectEvent(salesReceipt, 'MintFromSale', {
                        saleID: new BN('1'),
                        account: artist1,
                        mintCount: new BN('9')
                    });

                    await expectRevert(
                        this.basicGatedSale.mintFromSale(
                            new BN('1'),
                            0,
                            new BN('2'),
                            this.merkleProof.claims[artist1].index,
                            this.merkleProof.claims[artist1].proof,
                            {from: artist1, value: ether('0.2')}
                        ),
                        'cannot exceed total mints for sale phase'
                    )
                })
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

            describe('updateModulo()', () => {
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

            describe('updateMinBidAmount()', () => {
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

            describe('updateAccessControls()', () => {
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

            describe('updateBidLockupPeriod()', () => {
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

            describe('updatePlatformAccount()', () => {
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
        });

        describe('MerkleTree', async () => {

            describe('createMerkleTree', async () => {

                it('can create a new merkle tree', async () => {
                    this.merkleProof = parseBalanceMap(buildArtistMerkleInput(1, artist1, artist2, artist3));

                    expect(await this.basicGatedSale.onPreList.call(
                        new BN('1'),
                        0,
                        this.merkleProof.claims[artist1].index,
                        artist1,
                        this.merkleProof.claims[artist1].proof)
                    ).to.be.equal(true);

                    expect(await this.basicGatedSale.onPreList.call(
                        new BN('1'),
                        0,
                        this.merkleProof.claims[artist1].index,
                        artistDodgy,
                        this.merkleProof.claims[artist1].proof)
                    ).to.be.equal(false);
                })
            })
        });
    });
});
