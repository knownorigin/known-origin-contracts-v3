const {BN, constants, time, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const web3 = require('web3');
const {ether} = require("@openzeppelin/test-helpers");

const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3Marketplace = artifacts.require('KODAV3Marketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

const {validateEditionAndToken} = require('../test-helpers');

contract('KODAV3Marketplace', function (accounts) {
  const [owner, minter, koCommission, contract, collectorA, collectorB, collectorC, collectorD] = accounts;

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = '10000';

  const ETH_ONE = ether('1');
  const ONE = new BN('1');
  const ZERO = new BN('0');

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

    // Create token V3
    this.token = await KnownOriginDigitalAssetV3.new(
      this.accessControls.address,
      ZERO_ADDRESS, // no royalties address
      STARTING_EDITION,
      {from: owner}
    );

    // Set contract roles
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.token.address, {from: owner});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, contract, {from: owner});

    // Create marketplace and enable in whitelist
    this.marketplace = await KODAV3Marketplace.new(this.accessControls.address, this.token.address, koCommission, {from: owner});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.marketplace.address, {from: owner});

    this.minBidAmount = await this.marketplace.minBidAmount();
  });



  describe("listSteppedEditionAuction()", () => {

    const _0_1_ETH = ether('0.1');
    const _1_ETH = ether('1');

    beforeEach(async () => {
      // Ensure owner is approved as this will fail if not
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // create 100 tokens to the minter
      await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});
    });

    it('can list and purchase upto limit (of 3)', async () => {

      // list edition for sale at 0.1 ETH per token
      const start = await time.latest();

      await this.marketplace.listSteppedEditionAuction(minter, firstEditionTokenId, _1_ETH, _0_1_ETH, start, {from: contract});

      //address _creator, uint128 _basePrice, uint128 _step, uint128 _startDate, uint128 _currentStep
      const listing = await this.marketplace.getEditionStepConfig(firstEditionTokenId);
      console.log("listing", listing);
      expect(listing._creator).to.be.equal(minter);
      expect(listing._basePrice).to.be.bignumber.equal(_1_ETH);
      expect(listing._step).to.be.bignumber.equal(_0_1_ETH);
      expect(listing._startDate).to.be.bignumber.equal(start);
      expect(listing._currentStep).to.be.bignumber.equal('0');

      const token1 = firstEditionTokenId;
      const token2 = firstEditionTokenId.add(ONE);
      const token3 = token2.add(ONE);

      // collector A buys a token
      await this.marketplace.buyNextStep(firstEditionTokenId, {from: collectorA, value: _1_ETH});

      // collector B buys a token
      await this.marketplace.buyNextStep(firstEditionTokenId, {from: collectorB, value: _1_ETH.add(_0_1_ETH.mul(new BN("2")))});

      // collector C buys a token
      await this.marketplace.buyNextStep(firstEditionTokenId, {from: collectorC, value: _1_ETH.add(_0_1_ETH.mul(new BN("3")))});

      expect(await this.token.ownerOf(token1)).to.be.equal(collectorA);
      expect(await this.token.ownerOf(token2)).to.be.equal(collectorB);
      expect(await this.token.ownerOf(token3)).to.be.equal(collectorC);
    });
  });

});
