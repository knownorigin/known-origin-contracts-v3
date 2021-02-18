const {BN, constants, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const web3 = require('web3');
const {ether} = require("@openzeppelin/test-helpers");

const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3Marketplace = artifacts.require('KODAV3Marketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const ChiToken = artifacts.require('ChiToken');

const {validateEditionAndToken} = require('../../../test-helpers');

contract('ERC721', function (accounts) {
  const [owner, minter, koCommission, contract, collectorA, collectorB, collectorC, collectorD] = accounts;

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = '10000';

  const ETH_ONE = ether('1');

  const firstEditionTokenId = new BN('11000');
  const secondEditionTokenId = new BN('12000');
  const thirdEditionTokenId = new BN('13000');
  const nonExistentTokenId = new BN('99999999999');

  beforeEach(async () => {
    const legacyAccessControls = await SelfServiceAccessControls.new();
    // setup access controls
    this.accessControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

    // grab the roles
    this.MINTER_ROLE = await this.accessControls.MINTER_ROLE();
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Set up access controls with minter roles
    await this.accessControls.grantRole(this.MINTER_ROLE, owner, {from: owner});
    await this.accessControls.grantRole(this.MINTER_ROLE, minter, {from: owner});

    this.chiToken = await ChiToken.new();

    // generate some chi tokens
    await this.chiToken.mint(200, {from: owner});
    await this.chiToken.mint(200, {from: contract});

    expect(await this.chiToken.totalSupply()).to.be.bignumber.equal('400');

    // check balances
    expect(await this.chiToken.balanceOf(owner)).to.be.bignumber.equal('200');
    expect(await this.chiToken.balanceOf(contract)).to.be.bignumber.equal('200');

    // Create token V3
    this.token = await KnownOriginDigitalAssetV3.new(
      this.accessControls.address,
      ZERO_ADDRESS, // no royalties address
      this.chiToken.address,
      STARTING_EDITION,
      {from: owner}
    );

    // Approve the marketplace to spend them
    await this.chiToken.approve(this.token.address, 200, {from: contract});
    await this.chiToken.approve(this.token.address, 200, {from: owner});

    // confirm they have allowance
    expect(await this.chiToken.allowance(contract, this.token.address)).to.be.bignumber.equal('200');
    expect(await this.chiToken.allowance(owner, this.token.address)).to.be.bignumber.equal('200');

    // Set contract roles
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.token.address, {from: owner});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, contract, {from: owner});

    // Create marketplace and enable in whitelist
    this.marketplace = await KODAV3Marketplace.new(this.accessControls.address, this.token.address, koCommission, {from: owner})
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.marketplace.address, {from: owner});
  });

  describe.skip('mintTokenWithGasSaver(to, uri) vs mintToken(to, uri)', () => {

    context('mintTokenWithGasSaver()', async () => {
      beforeEach(async () => {
        ({logs: this.logs} = await this.token.mintTokenWithGasSaver(owner, TOKEN_URI, {from: contract}));
      });

      it('GAS tokens have been burnt', async () => {
        expect(await this.chiToken.balanceOf(owner)).to.be.bignumber.equal('197');
      })

      it('emits a Transfer event', async () => {
        expectEvent.inLogs(this.logs, 'Transfer', {from: ZERO_ADDRESS, to: owner, tokenId: firstEditionTokenId});
      });
    });

    context('mintToken()', async () => {
      beforeEach(async () => {
        ({logs: this.logs} = await this.token.mintToken(owner, TOKEN_URI, {from: contract}));
      });

      it('GAS tokens have NOT been burnt', async () => {
        expect(await this.chiToken.balanceOf(owner)).to.be.bignumber.equal('200');
      })

      it('emits a Transfer event', () => {
        expectEvent.inLogs(this.logs, 'Transfer', {from: ZERO_ADDRESS, to: owner, tokenId: firstEditionTokenId});
      });
    });

  });

});
