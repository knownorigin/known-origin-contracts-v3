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
        saleStart:new BN(saleStart.getTime().toString()),
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
        this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

        // Create token V3
        this.token = await KnownOriginDigitalAssetV3.new(
          this.accessControls.address,
          ZERO_ADDRESS, // no royalties address
          STARTING_EDITION,
          {from: owner}
        );

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

    describe('BasicGatedSale', async () => {

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
              ether('0.1')
            )
        });

        context('createSale', async () => {

            it('can create a new sale with correct arguments', async () => {

                const {id, start, end, mintLimit} = await this.basicGatedSale.sales(1)

                expect(id.toString()).to.be.equal('1')
                // expect(start.toString()).to.be.equal(`${saleStart.toString()}`)
                // expect(end.toString()).to.be.equal(`${saleEnd.toString()}`)
                // expect(mintLimit.toString()).to.be.equal('1')

            });

            // it('will revert if given start date which is before the current block timestamp', async () => {
            //     let {timeNow, saleEnd} = await mockTime()
            //
            //     const saleStart = new Date(Number(timeNow.toString()));
            //     saleStart.setDate(saleStart.getDate() - 4);
            //
            //     await expectRevert(
            //         this.basicGatedSale.createSale(saleStart.getTime(), saleEnd, 1, this.merkleProof.merkleRoot),
            //         'sale start time must be in the future'
            //     )
            // })

            // it('will revert if given an end date before the start date', async () => {
            //     let {timeNow, saleStart} = await mockTime()
            //
            //     const saleEnd = new Date(Number(timeNow.toString()));
            //     saleEnd.setDate(saleEnd.getDate() - 4);
            //
            //
            //
            //     await expectRevert(
            //       this.basicGatedSale.createSale(saleStart, BigNumber.from(saleEnd.getTime()), 1, this.merkleProof.merkleRoot),
            //         'sale end time must be after the sale start time'
            //     )
            // })
        })

        context('mintFromSale', async () => {
            it('can mint one item from a valid sale', async () => {

                await time.increaseTo(saleStart.toString())
                await time.increase(time.duration.hours(1))

                const salesReceipt = await this.basicGatedSale.mintFromSale(id.toNumber(), 1, this.merkleProof.claims[artist1].index, this.merkleProof.claims[artist1].proof, {from: artist1})

                await this.basicGatedSale.sales(1)

                expectEvent(salesReceipt, 'MintFromSale', {
                    saleID: id,
                    account: artist1,
                    mintCount: BigNumber.from("1").toString()
                });

            })

            it('can mint multiple items from a valid sale', async () => {
                const { saleStart, saleEnd} = await mockTime()

                // const receipt = await this.basicGatedSale.createSale(saleStart, saleEnd, 3, this.merkleProof.merkleRoot)
                // const {id} = receipt.logs[0].args

                await time.increaseTo(saleStart.toString())
                await time.increase(time.duration.hours(1))

                const salesReceipt = await this.basicGatedSale.mintFromSale(id.toNumber(), 3, this.merkleProof.claims[artist1].index, this.merkleProof.claims[artist1].proof, {from: artist1})

                await this.basicGatedSale.sales(1)

                expectEvent(salesReceipt, 'MintFromSale', {
                    saleID: id,
                    account: artist1,
                    mintCount: BigNumber.from("3").toString()
                });
            })

            it('reverts if the address is not in the pre list', async () => {
                const { saleStart, saleEnd} = await mockTime()

                // const receipt = await this.basicGatedSale.createSale(saleStart, saleEnd, 3, this.merkleProof.merkleRoot)
                // const {id} = receipt.logs[0].args

                await time.increaseTo(saleStart.toString())
                await time.increase(time.duration.hours(1))

                await expectRevert(
                    this.basicGatedSale.mintFromSale(id.toNumber(), 1, 4, this.merkleProof.claims[artist1].proof, {from: artistDodgy}),
                    'address not able to mint from sale'
                )
            })

            it('reverts if the sale id is not valid', async () => {
                const { saleStart, saleEnd} = await mockTime()

                // await this.basicGatedSale.createSale(saleStart, saleEnd, 3, this.merkleProof.merkleRoot)

                await time.increaseTo(saleStart.toString())
                await time.increase(time.duration.hours(1))

                await expectRevert(
                    this.basicGatedSale.mintFromSale(55, 1, 4, this.merkleProof.claims[artist1].proof, {from: artistDodgy}),
                    'address not able to mint from sale'
                )
            })

            it('reverts if the sale has not started yet', async () => {
                const { saleStart, saleEnd} = await mockTime()

                // const receipt = await this.basicGatedSale.createSale(saleStart, saleEnd, 3, this.merkleProof.merkleRoot)
                // const {id} = receipt.logs[0].args

                const timeNow = await time.latest()
                await time.increaseTo(timeNow.toString())

                await expectRevert(
                    this.basicGatedSale.mintFromSale(id.toNumber(), 1, this.merkleProof.claims[artist1].index, this.merkleProof.claims[artist1].proof, {from: artist1}),
                    'sale has not started yet'
                )
            })

            it('reverts if the sale has ended', async () => {
                const { saleStart, saleEnd} = await mockTime()

                // const receipt = await this.basicGatedSale.createSale(saleStart, saleEnd, 3, this.merkleProof.merkleRoot)
                // const {id} = receipt.logs[0].args

                await time.increaseTo(saleEnd.toString())
                await time.increase(time.duration.hours(24))

                await expectRevert(
                    this.basicGatedSale.mintFromSale(id.toNumber(), 1, this.merkleProof.claims[artist1].index, this.merkleProof.claims[artist1].proof, {from: artist1}),
                    'sale has ended'
                )
            })

            it('reverts if you try to mint more than allowed', async () => {
                const { saleStart, saleEnd} = await mockTime()

                // const receipt = await this.basicGatedSale.createSale(saleStart, saleEnd, 1, this.merkleProof.merkleRoot)
                // const {id} = receipt.logs[0].args

                await time.increaseTo(saleStart.toString())
                await time.increase(time.duration.hours(1))

                await expectRevert(
                    this.basicGatedSale.mintFromSale(id.toNumber(), 50, this.merkleProof.claims[artist1].index, this.merkleProof.claims[artist1].proof, {from: artist1}),
                    'number of mints must be below mint limit'
                )
            })
        })
    });

    describe('MerkleTree', async () => {

        context('createMerkleTree', async () => {

            it.skip('can create a new merkle tree', async () => {
                this.merkleProof = parseBalanceMap(buildArtistMerkleInput(1, artist1, artist2, artist3));
                console.log(this.merkleProof);

                expect(await this.basicGatedSale.onPrelist.call(
                  this.merkleProof.claims[artist1].index,
                  artist1,
                  this.merkleProof.claims[artist1].proof)
                ).to.be.equal(true);

                expect(await this.basicGatedSale.onPrelist.call(
                  this.merkleProof.claims[artist1].index,
                  artistDodgy,
                  this.merkleProof.claims[artist1].proof)
                ).to.be.equal(false);
            })
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

                // TODO send ETH direct to the contract (BasicGatedSale)

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
});
