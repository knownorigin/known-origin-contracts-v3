const {expect} = require("chai");
const {ethers} = require("hardhat");
const {expectRevert, time} = require('@openzeppelin/test-helpers');
const {BigNumber} = require("ethers");

const BasicGatedSale = artifacts.require('BasicGatedSale');

async function mockTime() {
    const timeNow = await time.latest()

    const saleStart = new Date(Number(timeNow.toString()));
    saleStart.setDate(saleStart.getDate() + 1);
    const saleEnd = new Date(Number(timeNow.toString()));
    saleEnd.setDate(saleEnd.getDate() + 2);

    return {
        timeNow: timeNow,
        saleStart: BigNumber.from(saleStart.getTime()),
        saleEnd: BigNumber.from(saleEnd.getTime())
    }
}

contract('BasicGatedSale Test Tests...', function (accounts) {

    const [admin, andy, liam, james] = accounts;

    describe.only('BasicGatedSale', async () => {

        context('createSale', async () => {

            it('can create a new sale with correct arguments', async () => {
                const {saleStart, saleEnd} = await mockTime()

                const basicGatedSale = await BasicGatedSale.new();

                await basicGatedSale.createSale(saleStart, saleEnd, 100, 1, [liam, andy])

                const {id, start, end, mints, mintLimit} = await basicGatedSale.sales(1)

                expect(id.toString()).to.be.equal('1')
                expect(start.toString()).to.be.equal(`${saleStart.toString()}`)
                expect(end.toString()).to.be.equal(`${saleEnd.toString()}`)
                expect(mints.toString()).to.be.equal('100')
                expect(mintLimit.toString()).to.be.equal('1')

                expect(await basicGatedSale.getMintingStatus(1, liam)).to.be.true
                expect(await basicGatedSale.getMintingStatus(1, andy)).to.be.true
            })

            it('will revert if given start date which is before the current block timestamp', async () => {
                let {timeNow, saleEnd} = await mockTime()

                const saleStart = new Date(Number(timeNow.toString()));
                saleStart.setDate(saleStart.getDate() - 4);

                const basicGatedSale = await BasicGatedSale.new();

                await expectRevert(
                    basicGatedSale.createSale(BigNumber.from(saleStart.getTime()), saleEnd, 100, 1, [liam, andy]),
                    'sale start time must be in the future'
                )
            })

            it('will revert if given an end date before the start date', async () => {
                let {timeNow, saleStart} = await mockTime()

                const saleEnd = new Date(Number(timeNow.toString()));
                saleEnd.setDate(saleEnd.getDate() - 4);

                const basicGatedSale = await BasicGatedSale.new();

                await expectRevert(
                    basicGatedSale.createSale(saleStart, BigNumber.from(saleEnd.getTime()), 100, 1, [liam, andy]),
                    'sale end time must be after the sale start time'
                )
            })

            it('will revert if a mints number less than 1', async () => {
                const { saleStart, saleEnd} = await mockTime()

                const basicGatedSale = await BasicGatedSale.new();

                await expectRevert(
                    basicGatedSale.createSale(saleStart, saleEnd, 0, 1, [liam, andy]),
                    'total mints must be greater than 0'
                )
            })

            it('will revert if a not given any addresses', async () => {
                const { saleStart, saleEnd} = await mockTime()

                const basicGatedSale = await BasicGatedSale.new();

                await expectRevert(
                    basicGatedSale.createSale(saleStart, saleEnd, 10, 1, []),
                    'addresses count must be greater than 0'
                )
            })
        })

        context('mintFromSale', async () => {
            it('can mint one item from a valid sale', async () => {
                const { saleStart, saleEnd} = await mockTime()

                const basicGatedSale = await BasicGatedSale.new();
                await basicGatedSale.createSale(saleStart, saleEnd, 5, 1, [liam, andy])

                await time.increase(saleStart.toString())
                await time.increase(time.duration.hours(1))

                await basicGatedSale.mintFromSale(1, liam, 1)

                const {mints} = await basicGatedSale.sales(1)

                expect(mints.toString()).to.be.equal('4')
            })

            it('can mint multiple items from a valid sale', async () => {
                const { saleStart, saleEnd} = await mockTime()

                const basicGatedSale = await BasicGatedSale.new();
                await basicGatedSale.createSale(saleStart, saleEnd, 5, 3, [liam, andy])

                await time.increase(saleStart.toString())
                await time.increase(time.duration.hours(1))

                await basicGatedSale.mintFromSale(1, liam, 3)

                const {mints} = await basicGatedSale.sales(1)

                expect(mints.toString()).to.be.equal('2')
            })

            it('reverts if the address is not in the pre list', async () => {
                const { saleStart, saleEnd} = await mockTime()

                const basicGatedSale = await BasicGatedSale.new();
                await basicGatedSale.createSale(saleStart, saleEnd, 5, 3, [liam, andy])

                await time.increase(saleStart.toString())
                await time.increase(time.duration.hours(1))

                await expectRevert(
                    basicGatedSale.mintFromSale(1, james, 1),
                    'address not able to mint from sale'
                )
            })
        })
    });
});
