const {BN, constants, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const web3 = require('web3');
const {ether} = require("@openzeppelin/test-helpers");

const {expect} = require('chai');

const KODADutchAuction = artifacts.require('KODADutchAuction');

contract('KODA dutch auction Tests', function (accounts) {
  const [owner, minter, koCommission, contract, collectorA, collectorB, collectorC, collectorD] = accounts;

  it.only('returns correct price based on timestamp', async () => {

    this.auction = await KODADutchAuction.new(
      ether('10'), // start price
      ether('5'), // end price
      500,
      1500,
    )

    // price of asset half way through is 7.5 ETH :)
    const price = await this.auction._price('1000')
    console.log('price', price.toString())

    expect(price).to.be.bignumber.equal(ether('7.5'))
  })
})
