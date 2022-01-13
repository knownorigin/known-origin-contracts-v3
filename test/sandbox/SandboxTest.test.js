const {expect} = require("chai");
const {ethers} = require("hardhat");

const NumberManipulator = artifacts.require('NumberManipulator');

contract('Sandbox Test Tests...', function () {
    describe('Implementation', () => {

        context('NumberManipulator: giveMeNumDoubled', async () => {

            it('can double a number', async () => {
                const numberManipulator = await NumberManipulator.new(4)

                const call = await numberManipulator.doubleNum();

                console.log('CALL : ', call.toString());

                expect(call.words[0]).to.equal(8);
            })
        })
    })
});
