const {expect} = require("chai");
const {BN, expectEvent, expectRevert, time, constants, ether} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const {parseBalanceMap} = require('../utils/parse-balance-map');
const {buildArtistMerkleInput} = require('../utils/merkle-tools');

const BasicGatedSale = artifacts.require('BasicGatedSale');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const MockERC20 = artifacts.require('MockERC20');

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

contract('BasicGatedSale tests...', function (accounts) {
    const [owner, admin, koCommission, contract, artist1, artist2, artist3, artistDodgy, newAccessControls] = accounts;

    const STARTING_EDITION = '10000';
    const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';
    const MOCK_MERKLE_HASH = '0x7B502C3A1F48C8609AE212CDFB639DEE39673F5E'
    const ONE_HUNDRED = new BN('100');
    const ZERO = new BN('0');
    const ONE = new BN('1');
    const TWO = new BN('2');

    // TODO this is the ID thats minted
    const FIRST_EDITION_TOKEN_ID = new BN('11000'); // this is implied

    before(async () => {
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

        this.basicGatedSale = await BasicGatedSale.new(this.accessControls.address, this.token.address, koCommission, {from: owner});

        await this.accessControls.grantRole(this.CONTRACT_ROLE, this.basicGatedSale.address, {from: owner});

        // create 100 tokens to the minter
        await this.token.mintBatchEdition(100, artist1, TOKEN_URI, {from: contract});

        // Ensure basic gated sale has approval to sell tokens
        await this.token.setApprovalForAll(this.basicGatedSale.address, true, {from: artist1});

        // just for stuck tests
        this.erc20Token = await MockERC20.new({from: owner});

        const {saleStart, saleEnd} = await mockTime();

        const receipt = await this.basicGatedSale.createSaleWithPhase(
            FIRST_EDITION_TOKEN_ID,
            saleStart,
            saleEnd,
            new BN('10'),
            this.merkleProof.merkleRoot,
            MOCK_MERKLE_HASH,
            ether('0.1'),
            {from: admin});

        expectEvent(receipt, 'SaleWithPhaseCreated', {
            saleID: new BN('1'),
            editionID: FIRST_EDITION_TOKEN_ID,
            startTime: saleStart,
            endTime: saleEnd,
            mintLimit: new BN('10'),
            merkleRoot: this.merkleProof.merkleRoot,
            merkleIPFSHash: MOCK_MERKLE_HASH,
            priceInWei: ether('0.1')
        });
    });

    describe.only('BasicGatedSale', async () => {

        describe('createSaleWithPhase', async () => {

            it('can create a new sale and phase with correct arguments', async () => {
                const {id, editionId} = await this.basicGatedSale.sales(1)

                expect(id.toString()).to.be.equal('1')
                expect(editionId.toString()).to.be.equal(FIRST_EDITION_TOKEN_ID.toString())

                const {
                    startTime,
                    endTime,
                    mintLimit,
                    merkleRoot,
                    merkleIPFSHash,
                    priceInWei
                } = await this.basicGatedSale.phases(1, 0)
                expect(startTime.toString()).to.not.equal('0')
                expect(endTime.toString()).to.not.equal('0')
                expect(mintLimit.toString()).to.be.equal('10')
                expect(merkleRoot).to.be.equal(this.merkleProof.merkleRoot)
                expect(merkleIPFSHash).to.be.equal(MOCK_MERKLE_HASH)
                expect(priceInWei.toString()).to.be.equal(ether('0.1').toString())
            })


            it('cannot create a sale without the right role', async () => {
                const {saleStart, saleEnd} = await mockTime();

                await expectRevert(
                    this.basicGatedSale.createSaleWithPhase(
                        FIRST_EDITION_TOKEN_ID,
                        saleStart,
                        saleEnd,
                        new BN('10'),
                        this.merkleProof.merkleRoot,
                        MOCK_MERKLE_HASH,
                        ether('0.1'),
                        {from: artistDodgy}),
                    'Caller not admin'
                )
            });

            it('should revert if given an invalid start time', async () => {
                let {timeNow, saleEnd} = await mockTime()

                const saleStart = new Date(Number(timeNow.toString()));
                saleStart.setDate(saleStart.getDate() - 4);

                await expectRevert(
                    this.basicGatedSale.createSaleWithPhase(
                        FIRST_EDITION_TOKEN_ID,
                        new BN(saleStart.getTime().toString()),
                        saleEnd,
                        new BN('10'),
                        this.merkleProof.merkleRoot,
                        MOCK_MERKLE_HASH,
                        ether('0.1'),
                        {from: admin}),
                    'phase start time must be in the future'
                )
            });

            it('should revert if given an invalid end time', async () => {
                const {timeNow, saleStart} = await mockTime();

                const saleEnd = new Date(Number(timeNow.toString()));
                saleEnd.setDate(saleEnd.getDate() - 4);

                await expectRevert(
                    this.basicGatedSale.createSaleWithPhase(
                        FIRST_EDITION_TOKEN_ID,
                        saleStart,
                        new BN(saleEnd.getTime().toString()),
                        new BN('10'),
                        this.merkleProof.merkleRoot,
                        MOCK_MERKLE_HASH,
                        ether('0.1'),
                        {from: admin}),
                    'phase end time must be after start time'
                )
            });

            it('should revert if given an invalid mint limit', async () => {
                let {saleStart, saleEnd} = await mockTime()

                await expectRevert(
                    this.basicGatedSale.createSaleWithPhase(
                        FIRST_EDITION_TOKEN_ID,
                        saleStart,
                        saleEnd,
                        new BN('0'),
                        this.merkleProof.merkleRoot,
                        '',
                        ether('0.1'),
                        {from: admin}),
                    'phase mint limit must be greater than 0'
                )
            });
        });

        describe('mint', async () => {
            before(async () => {
                let {saleStart} = await mockTime()

                await time.increaseTo(saleStart.toString())
                await time.increase(time.duration.hours(1))
            })

            it('can mint one item from a valid sale', async () => {

                const salesReceipt = await this.basicGatedSale.mint(new BN('1'), 0, new BN('1'), this.merkleProof.claims[artist1].index, this.merkleProof.claims[artist1].proof, {
                    from: artist1,
                    value: ether('0.1')
                })

                expectEvent(salesReceipt, 'MintFromSale', {
                    saleID: new BN('1'),
                    editionID: FIRST_EDITION_TOKEN_ID,
                    account: artist1,
                    mintCount: new BN('1')
                });

                expect(await this.token.ownerOf(FIRST_EDITION_TOKEN_ID)).to.be.equal(artist1);

            });

            it('can mint multiple items from a valid sale', async () => {

                const salesReceipt = await this.basicGatedSale.mint(
                    new BN('1'),
                    0,
                    new BN('3'),
                    this.merkleProof.claims[artist1].index,
                    this.merkleProof.claims[artist1].proof,
                    {
                        from: artist1,
                        value: ether('0.3')
                    })

                expectEvent(salesReceipt, 'MintFromSale', {
                    saleID: new BN('1'),
                    editionID: FIRST_EDITION_TOKEN_ID,
                    account: artist1,
                    mintCount: new BN('3')
                });

                expect(await this.token.ownerOf(FIRST_EDITION_TOKEN_ID)).to.be.equal(artist1);
                expect(await this.token.ownerOf(FIRST_EDITION_TOKEN_ID.add(ONE))).to.be.equal(artist1);
                expect(await this.token.ownerOf(FIRST_EDITION_TOKEN_ID.add(TWO))).to.be.equal(artist1);
            })


            // TODO how do you properly check for the existence of array index in mapping?
            // it('reverts if the given sale phase is not in progress', async () => {
            //     console.log('MERKLE PROOF : ', artist1, this.merkleProof)
            //     await expectRevert(
            //         this.basicGatedSale.mint(
            //             new BN('1'),
            //             1,
            //             new BN('1'),
            //             this.merkleProof.claims[artist1].index,
            //             this.merkleProof.claims[artist1].proof,
            //             {from: artist1, value: ether('0.1')}
            //         ),
            //         'sale phase not in progress'
            //     )
            // })

            it('reverts if not enough eth is sent', async () => {
                await expectRevert(
                    this.basicGatedSale.mint(
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
                    this.basicGatedSale.mint(
                        new BN('1'),
                        0,
                        new BN('1'),
                        this.merkleProof.claims[artist1].index,
                        this.merkleProof.claims[artist1].proof,
                        {from: artistDodgy, value: ether('0.1')}
                    ),
                    'address not able to mint from sale'
                )
            })

            it('reverts if an address has exceeded its mint limit', async () => {

                const salesReceipt = await this.basicGatedSale.mint(new BN('1'), 0, new BN('9'), this.merkleProof.claims[artist2].index, this.merkleProof.claims[artist2].proof, {
                    from: artist2,
                    value: ether('0.9')
                })

                expectEvent(salesReceipt, 'MintFromSale', {
                    saleID: new BN('1'),
                    editionID: FIRST_EDITION_TOKEN_ID,
                    account: artist2,
                    mintCount: new BN('9')
                });

                await expectRevert(
                    this.basicGatedSale.mint(
                        new BN('1'),
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

            describe('updatePlatformPrimarySaleCommission', () => {
                const new_commission = new BN('1550000');

                // FIXME bit weak - read again to check it
                it('updates the platform primary sale commission as admin', async () => {
                    const {receipt} = await this.basicGatedSale.updatePlatformPrimarySaleCommission(ONE, new_commission, {from: owner});

                    await expectEvent(receipt, 'AdminUpdatePlatformPrimarySaleCommission', {
                        _platformPrimarySaleCommission: new_commission
                    });
                });

                it('Reverts when not admin', async () => {
                    await expectRevert(
                        this.basicGatedSale.updatePlatformPrimarySaleCommission(ONE, new_commission, {from: artist3}),
                        'Caller not admin'
                    );
                });
            });
        });

        describe('MerkleTree', async () => {

            describe('createMerkleTree', async () => {

                it('can create a new merkle tree', async () => {
                    this.merkleProof = parseBalanceMap(buildArtistMerkleInput(1, artist1, artist2, artist3));

                    expect(await this.basicGatedSale.canMint(
                        new BN('1'),
                        0,
                        this.merkleProof.claims[artist1].index,
                        artist1,
                        this.merkleProof.claims[artist1].proof)
                    ).to.be.equal(true);

                    expect(await this.basicGatedSale.canMint(
                        new BN('1'),
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
