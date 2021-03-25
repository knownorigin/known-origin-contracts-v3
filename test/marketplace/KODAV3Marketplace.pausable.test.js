const {BN, constants, time, expectEvent, expectRevert,} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;
const _ = require('lodash');
const {ether} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3Marketplace = artifacts.require('KODAV3Marketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

contract('KODAV3Marketplace pausable', function (accounts) {
  const [admin, owner, minter, koCommission, contract, collectorA] = accounts;

  const STARTING_EDITION = '10000';

  beforeEach(async () => {
    const legacyAccessControls = await SelfServiceAccessControls.new();
    // setup access controls
    this.accessControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

    // grab the roles
    this.DEFAULT_ADMIN_ROLE = await this.accessControls.DEFAULT_ADMIN_ROLE();
    this.MINTER_ROLE = await this.accessControls.MINTER_ROLE();
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Set up access controls with minter roles
    await this.accessControls.grantRole(this.DEFAULT_ADMIN_ROLE, admin, {from: owner});
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

  describe('pause() & unpause()', async () => {

    it('can be paused and unpaused by admin', async () => {
      let receipt = await this.marketplace.pause({from: admin});
      expectEvent(receipt, 'Paused', {
        account: admin
      });

      let isPaused = await this.marketplace.paused();
      expect(isPaused).to.be.equal(true);


      receipt = await this.marketplace.unpause({from: admin});
      expectEvent(receipt, 'Unpaused', {
        account: admin
      });

      isPaused = await this.marketplace.paused();
      expect(isPaused).to.be.equal(false);
    });

    it('pause() - reverts when not admin', async () => {
      await expectRevert(
        this.marketplace.pause({from: collectorA}),
        "Caller not admin"
      )
    });

    it('unpause() - reverts when not admin', async () => {
      await expectRevert(
        this.marketplace.unpause({from: collectorA}),
        "Caller not admin"
      )
    });
  });

});
