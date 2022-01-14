const {expect} = require("chai");
const {ethers} = require("hardhat");
const {expectRevert} = require('@openzeppelin/test-helpers');

const BasicGatedSale = artifacts.require('BasicGatedSale');

contract('BasicGatedSale Test Tests...', function (accounts) {

    const currentTime = Math.floor(new Date().getTime() / 1000)
    const [admin, andy, liam, james, dave, bob] = accounts;

    describe.only('BasicGatedSale', () => {

        context('createSale', async () => {

            it('can create a new sale with correct arguments', async () => {
                const basicGatedSale = await BasicGatedSale.new();

                await basicGatedSale.createSale(currentTime + 100, currentTime + 200, 100, 1, [liam, andy])


                const {id, start, end, mints, mintLimit, preList} = await basicGatedSale.sales(1)

                expect(id.toString()).to.be.equal('1')
                expect(start.toString()).to.be.equal(`${currentTime + 100}`)
                expect(end.toString()).to.be.equal(`${currentTime + 200}`)
                expect(mints.toString()).to.be.equal('100')
                expect(mintLimit.toString()).to.be.equal('1')
            })

            it('will revert if given start date which is before the current block timestamp', async () => {
                const basicGatedSale = await BasicGatedSale.new();

                await expectRevert(
                    basicGatedSale.createSale(currentTime - 500, currentTime + 500, 100, 1, [liam, andy]),
                    'sale start time must be in the future'
                )
            })

            it('will revert if given an end date before the start date', async () => {
                const basicGatedSale = await BasicGatedSale.new();

                await expectRevert(
                    basicGatedSale.createSale(currentTime + 500, currentTime - 500, 100, 1, [liam, andy]),
                    'sale end time must be after the sale start time'
                )
            })

            it('will revert if a mints number less than 1', async () => {
                const basicGatedSale = await BasicGatedSale.new();

                await expectRevert(
                    basicGatedSale.createSale(currentTime + 100, currentTime + 200, 0, 1, [liam, andy]),
                    'total mints must be greater than 0'
                )
            })

            it('will revert if a not given any addresses', async () => {
                const basicGatedSale = await BasicGatedSale.new();

                await expectRevert(
                    basicGatedSale.createSale(currentTime + 100, currentTime + 200, 100, 1, []),
                    'addresses count must be greater than 0'
                )
            })
        })
    })
});
