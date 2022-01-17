const {expect} = require("chai");
const {expectEvent, expectRevert, time} = require('@openzeppelin/test-helpers');
const {BigNumber} = require("ethers");

const {parseBalanceMap} = require('../utils/parse-balance-map');
const {buildArtistMerkleInput} = require('../utils/merkle-tools');

const BasicGatedSale = artifacts.require('BasicGatedSale');

async function mockTime() {
    const timeNow = await time.latest()

    const saleStart = new Date(Number(timeNow.toString()));
    saleStart.setDate(saleStart.getDate() + 1);
    const saleEnd = new Date(Number(timeNow.toString()));
    saleEnd.setDate(saleEnd.getDate() + 3);

    return {
        timeNow: timeNow,
        saleStart: BigNumber.from(saleStart.getTime()),
        saleEnd: BigNumber.from(saleEnd.getTime())
    }
}

contract('BasicGatedSale Test Tests...', function (accounts) {

    const [admin, artist1, artist2, artist3, artistDodgy] = accounts;

    beforeEach(async () => {
        this.merkleProof = parseBalanceMap(buildArtistMerkleInput(1, artist1, artist2, artist3));
        this.basicGatedSale = await BasicGatedSale.new();
    });

    describe.only('BasicGatedSale', async () => {

        context('createSale', async () => {

            it('can create a new sale with correct arguments', async () => {
                const {saleStart, saleEnd} = await mockTime()

               const receipt = await this.basicGatedSale.createSale(saleStart, saleEnd, 1, this.merkleProof.merkleRoot)

                const {id, start, end, mintLimit} = await this.basicGatedSale.sales(1)

                expect(id.toString()).to.be.equal('1')
                expect(start.toString()).to.be.equal(`${saleStart.toString()}`)
                expect(end.toString()).to.be.equal(`${saleEnd.toString()}`)
                expect(mintLimit.toString()).to.be.equal('1')

                expectEvent(receipt, 'SaleCreated', {id: id});
            })

            it('will revert if given start date which is before the current block timestamp', async () => {
                let {timeNow, saleEnd} = await mockTime()

                const saleStart = new Date(Number(timeNow.toString()));
                saleStart.setDate(saleStart.getDate() - 4);

                await expectRevert(
                    this.basicGatedSale.createSale(BigNumber.from(saleStart.getTime()), saleEnd, 1, this.merkleProof.merkleRoot),
                    'sale start time must be in the future'
                )
            })

            it('will revert if given an end date before the start date', async () => {
                let {timeNow, saleStart} = await mockTime()

                const saleEnd = new Date(Number(timeNow.toString()));
                saleEnd.setDate(saleEnd.getDate() - 4);



                await expectRevert(
                  this.basicGatedSale.createSale(saleStart, BigNumber.from(saleEnd.getTime()), 1, this.merkleProof.merkleRoot),
                    'sale end time must be after the sale start time'
                )
            })
        })

        context('mintFromSale', async () => {
            it('can mint one item from a valid sale', async () => {
                const { saleStart, saleEnd} = await mockTime()

                const receipt = await this.basicGatedSale.createSale(saleStart, saleEnd, 1, this.merkleProof.merkleRoot)
                const {id} = receipt.logs[0].args

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

                const receipt = await this.basicGatedSale.createSale(saleStart, saleEnd, 3, this.merkleProof.merkleRoot)
                const {id} = receipt.logs[0].args

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

                const receipt = await this.basicGatedSale.createSale(saleStart, saleEnd, 3, this.merkleProof.merkleRoot)
                const {id} = receipt.logs[0].args

                await time.increaseTo(saleStart.toString())
                await time.increase(time.duration.hours(1))

                await expectRevert(
                    this.basicGatedSale.mintFromSale(id.toNumber(), 1, 4, this.merkleProof.claims[artist1].proof, {from: artistDodgy}),
                    'address not able to mint from sale'
                )
            })

            it('reverts if the sale id is not valid', async () => {
                const { saleStart, saleEnd} = await mockTime()

                await this.basicGatedSale.createSale(saleStart, saleEnd, 3, this.merkleProof.merkleRoot)

                await time.increaseTo(saleStart.toString())
                await time.increase(time.duration.hours(1))

                await expectRevert(
                    this.basicGatedSale.mintFromSale(55, 1, 4, this.merkleProof.claims[artist1].proof, {from: artistDodgy}),
                    'address not able to mint from sale'
                )
            })

            it('reverts if the sale has not started yet', async () => {
                const { saleStart, saleEnd} = await mockTime()

                const receipt = await this.basicGatedSale.createSale(saleStart, saleEnd, 3, this.merkleProof.merkleRoot)
                const {id} = receipt.logs[0].args

                const timeNow = await time.latest()
                await time.increaseTo(timeNow.toString())

                await expectRevert(
                    this.basicGatedSale.mintFromSale(id.toNumber(), 1, this.merkleProof.claims[artist1].index, this.merkleProof.claims[artist1].proof, {from: artist1}),
                    'sale has not started yet'
                )
            })

            it('reverts if the sale has ended', async () => {
                const { saleStart, saleEnd} = await mockTime()

                const receipt = await this.basicGatedSale.createSale(saleStart, saleEnd, 3, this.merkleProof.merkleRoot)
                const {id} = receipt.logs[0].args

                await time.increaseTo(saleEnd.toString())
                await time.increase(time.duration.hours(24))

                await expectRevert(
                    this.basicGatedSale.mintFromSale(id.toNumber(), 1, this.merkleProof.claims[artist1].index, this.merkleProof.claims[artist1].proof, {from: artist1}),
                    'sale has ended'
                )
            })

            it('reverts if you try to mint more than allowed', async () => {
                const { saleStart, saleEnd} = await mockTime()

                const receipt = await this.basicGatedSale.createSale(saleStart, saleEnd, 1, this.merkleProof.merkleRoot)
                const {id} = receipt.logs[0].args

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

            it('can create a new merkle tree', async () => {
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
});
