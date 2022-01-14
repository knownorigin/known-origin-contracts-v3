const {expect} = require("chai");
const {ethers} = require("hardhat");
const {expectRevert, time} = require('@openzeppelin/test-helpers');
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

    const [admin, andy, liam, james, artist1, artist2, artist3, artistDodgy] = accounts;

    beforeEach(async () => {
        this.merkleProof = parseBalanceMap(buildArtistMerkleInput(1, artist1, artist2, artist3));
        this.basicGatedSale = await BasicGatedSale.new(this.merkleProof.merkleRoot, {from: admin});
    });

    describe.only('BasicGatedSale', async () => {

        context('createSale', async () => {

            it('can create a new sale with correct arguments', async () => {
                const {saleStart, saleEnd} = await mockTime()



                await this.basicGatedSale.createSale(saleStart, saleEnd, 100, 1, [liam, andy])

                const {id, start, end, mints, mintLimit} = await basicGatedSale.sales(1)

                expect(id.toString()).to.be.equal('1')
                expect(start.toString()).to.be.equal(`${saleStart.toString()}`)
                expect(end.toString()).to.be.equal(`${saleEnd.toString()}`)
                expect(mints.toString()).to.be.equal('100')
                expect(mintLimit.toString()).to.be.equal('1')

                expect(await this.basicGatedSale.getMintingStatus(1, liam)).to.be.true
                expect(await this.basicGatedSale.getMintingStatus(1, andy)).to.be.true
            })

            it('will revert if given start date which is before the current block timestamp', async () => {
                let {timeNow, saleEnd} = await mockTime()

                const saleStart = new Date(Number(timeNow.toString()));
                saleStart.setDate(saleStart.getDate() - 4);

                await expectRevert(
                    this.basicGatedSale.createSale(BigNumber.from(saleStart.getTime()), saleEnd, 100, 1, [liam, andy]),
                    'sale start time must be in the future'
                )
            })

            it('will revert if given an end date before the start date', async () => {
                let {timeNow, saleStart} = await mockTime()

                const saleEnd = new Date(Number(timeNow.toString()));
                saleEnd.setDate(saleEnd.getDate() - 4);



                await expectRevert(
                  this.basicGatedSale.createSale(saleStart, BigNumber.from(saleEnd.getTime()), 100, 1, [liam, andy]),
                    'sale end time must be after the sale start time'
                )
            })

            it('will revert if a mints number less than 1', async () => {
                const { saleStart, saleEnd} = await mockTime()


                await expectRevert(
                  this.basicGatedSale.createSale(saleStart, saleEnd, 0, 1, [liam, andy]),
                    'total mints must be greater than 0'
                )
            })

            it('will revert if a not given any addresses', async () => {
                const { saleStart, saleEnd} = await mockTime()


                await expectRevert(
                  this.basicGatedSale.createSale(saleStart, saleEnd, 10, 1, []),
                    'addresses count must be greater than 0'
                )
            })
        })

        context('mintFromSale', async () => {
            it('can mint one item from a valid sale', async () => {
                const { saleStart, saleEnd} = await mockTime()

                await this.basicGatedSale.createSale(saleStart, saleEnd, 5, 1, [liam, andy])

                await time.increaseTo(saleStart.toString())
                await time.increase(time.duration.hours(1))

                await this.basicGatedSale.mintFromSale(1, liam, 1)

                const {mints} = await this.basicGatedSale.sales(1)

                expect(mints.toString()).to.be.equal('4')
            })

            it('can mint multiple items from a valid sale', async () => {
                const { saleStart, saleEnd} = await mockTime()

                await this.basicGatedSale.createSale(saleStart, saleEnd, 5, 3, [liam, andy])

                await time.increaseTo(saleStart.toString())
                await time.increase(time.duration.hours(1))

                await this.basicGatedSale.mintFromSale(1, liam, 3)

                const {mints} = await this.basicGatedSale.sales(1)

                expect(mints.toString()).to.be.equal('2')
            })

            it('reverts if the address is not in the pre list', async () => {
                const { saleStart, saleEnd} = await mockTime()

                await this.basicGatedSale.createSale(saleStart, saleEnd, 5, 3, [liam, andy])

                await time.increaseTo(saleStart.toString())
                await time.increase(time.duration.hours(1))

                await expectRevert(
                  this.basicGatedSale.mintFromSale(1, james, 1),
                    'address not able to mint from sale'
                )
            })

            it('reverts if the sale id is not valid', async () => {
                const { saleStart, saleEnd} = await mockTime()

                await this.basicGatedSale.createSale(saleStart, saleEnd, 5, 3, [liam, andy])

                await time.increaseTo(saleStart.toString())
                await time.increase(time.duration.hours(1))

                await expectRevert(
                  this.basicGatedSale.mintFromSale(2, liam, 1),
                    'address not able to mint from sale'
                )
            })

            it('reverts if the sale is sold out', async () => {
                const { saleStart, saleEnd} = await mockTime()

                await this.basicGatedSale.createSale(saleStart, saleEnd, 3, 3, [liam, andy])

                await time.increaseTo(saleStart.toString())
                await time.increase(time.duration.hours(1))

                await this.basicGatedSale.mintFromSale(1, liam, 3)

                await expectRevert(
                    this.basicGatedSale.mintFromSale(1, andy, 1),
                    'sale is sold out'
                )
            })

            it('reverts if the sale has not started yet', async () => {
                const {saleStart, saleEnd} = await mockTime()

                await this.basicGatedSale.createSale(saleStart, saleEnd, 10, 1, [liam, andy])

                const timeNow = await time.latest()
                await time.increaseTo(timeNow.toString())

                await expectRevert(
                  this.basicGatedSale.mintFromSale(1, andy, 1),
                    'sale has not started yet'
                )
            })

            it('reverts if the sale has ended', async () => {
                const { saleStart, saleEnd} = await mockTime()

                await this.basicGatedSale.createSale(saleStart, saleEnd, 10, 1, [liam, andy])

                await time.increaseTo(saleEnd.toString())
                await time.increase(time.duration.hours(24))

                await expectRevert(
                  this.basicGatedSale.mintFromSale(1, andy, 1),
                    'sale has ended'
                )
            })

            it('reverts if you try to mint more than allowed', async () => {
                const { saleStart, saleEnd} = await mockTime()

                await this.basicGatedSale.createSale(saleStart, saleEnd, 5, 1, [liam, andy])

                await time.increaseTo(saleStart.toString())
                await time.increase(time.duration.hours(1))

                await expectRevert(
                  this.basicGatedSale.mintFromSale(1, andy, 2),
                    'number of mints must be below mint limit'
                )
            })
        })
    });


    describe.only('MerkleTree', async () => {

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
