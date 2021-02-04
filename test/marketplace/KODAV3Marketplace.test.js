const {BN, constants, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const web3 = require('web3');
const {ether} = require("@openzeppelin/test-helpers");

const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const SteppedPrimarySaleMarketplace = artifacts.require('SteppedPrimarySaleMarketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const EditionRegistry = artifacts.require('EditionRegistry');

const {validateToken} = require('../test-helpers');

contract('ERC721', function (accounts) {
  const [owner, minter, contract, collectorA, collectorB] = accounts;

  const STARTING_EDITION = '10000';

  const ETH_ONE = ether('1');

  const firstEditionTokenId = new BN('11000');
  const secondEditionTokenId = new BN('12000');
  const thirdEditionTokenId = new BN('13000');
  const nonExistentTokenId = new BN('99999999999');

  beforeEach(async () => {
    // setu paccess controls
    this.accessControls = await KOAccessControls.new({from: owner});

    // grab the roles
    this.MINTER_ROLE = await this.accessControls.MINTER_ROLE();
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Set up access controls with minter roles
    await this.accessControls.grantRole(this.MINTER_ROLE, owner, {from: owner});
    await this.accessControls.grantRole(this.MINTER_ROLE, minter, {from: owner});

    // setup edition registry
    this.editionRegistry = await EditionRegistry.new(
      this.accessControls.address,
      STARTING_EDITION,
      {from: owner}
    );

    // Create token V3
    this.token = await KnownOriginDigitalAssetV3.new(
      this.accessControls.address,
      this.editionRegistry.address,
      {from: owner}
    );

    // Set contract roles
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.token.address, {from: owner});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, contract, {from: owner});

    // enable NFT in the registry contract
    await this.editionRegistry.enableNftContract(this.token.address, {from: owner});

    // Create marketplace and enable in whitelist
    this.marketplace = await SteppedPrimarySaleMarketplace.new(this.accessControls.address, this.token.address, {from: owner})
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.marketplace.address, {from: owner});
  });

  describe('can mint token and make initial primary sale', () => {

    beforeEach(async () => {
      // Ensure owner is approved as this will fail if not
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});
    });

    describe('via mintToken(to, uri)', () => {
      beforeEach(async () => {
        // create token
        await this.token.mintToken(minter, 'my-token-uri', {from: contract});

        // setup sale params
        // await this.marketplace.setupSale(firstEditionTokenId, BASE_PRICE, STEP_PRICE);
      });
    })
  });

});
