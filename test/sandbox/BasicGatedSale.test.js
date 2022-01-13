const {expect} = require("chai");
const {ethers} = require("hardhat");

const BasicGatedSale = artifacts.require('BasicGatedSale');

contract('BasicGatedSale Test Tests...', function (accounts) {

    const [admin, andy, liam, james, dave, bob] = accounts;

    describe.only('BasicGatedSale construction', () => {

        context('Simple test', async () => {

            it('can construct', async () => {
                const basicGatedSale = await BasicGatedSale.new([andy, liam], {from: admin});

            })
        })
    })
});
