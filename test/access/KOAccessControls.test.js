const {expectRevert} = require('@openzeppelin/test-helpers');

const {expect} = require('chai');

const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

contract('KOAccessControls tests', function (accounts) {
  const [deployer, account, notApproved] = accounts;

  beforeEach(async () => {
    // setup access controls
    this.legacyAccessControls = await SelfServiceAccessControls.new();
    this.accessControls = await KOAccessControls.new(this.legacyAccessControls.address, {from: deployer});

    // grab the roles
    this.MINTER_ROLE = await this.accessControls.MINTER_ROLE();
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();
  });

  it('deployer is given admin and minter role', async () => {
    expect(await this.accessControls.hasAdminRole(deployer)).to.be.equal(true);
    expect(await this.accessControls.hasMinterRole(deployer)).to.be.equal(true);
  });

  describe('admin role', async () => {
    it('role is granted, attested and then removed', async () => {
      expect(await this.accessControls.hasAdminRole(account)).to.be.equal(false);

      await this.accessControls.addAdminRole(account, {from: deployer});
      expect(await this.accessControls.hasAdminRole(account)).to.be.equal(true);

      await this.accessControls.removeAdminRole(account, {from: deployer});
      expect(await this.accessControls.hasAdminRole(account)).to.be.equal(false);
    });

    it('addAdminRole() reverts if not admin when updating', async () => {
      await expectRevert(
        this.accessControls.addAdminRole(account, {from: notApproved}),
        "KOAccessControls: sender must be an admin to grant role"
      );
    });

    it('removeAdminRole() reverts if not admin when updating', async () => {
      await expectRevert(
        this.accessControls.removeAdminRole(account, {from: notApproved}),
        "KOAccessControls: sender must be an admin to revoke role"
      );
    });
  });

  describe('minter role', async () => {
    it('role is granted, attested and then removed', async () => {
      expect(await this.accessControls.hasMinterRole(account)).to.be.equal(false);

      await this.accessControls.addMinterRole(account, {from: deployer});
      expect(await this.accessControls.hasMinterRole(account)).to.be.equal(true);

      await this.accessControls.removeMinterRole(account, {from: deployer});
      expect(await this.accessControls.hasMinterRole(account)).to.be.equal(false);
    });

    it('addAdminRole() reverts if not admin when updating', async () => {
      await expectRevert(
        this.accessControls.addMinterRole(account, {from: notApproved}),
        "KOAccessControls: sender must be an admin to grant role"
      );
    });

    it('removeAdminRole() reverts if not admin when updating', async () => {
      await expectRevert(
        this.accessControls.removeMinterRole(account, {from: notApproved}),
        "KOAccessControls: sender must be an admin to revoke role"
      );
    });
  });

  describe('contract role', async () => {
    it('role is granted, attested and then removed', async () => {
      expect(await this.accessControls.hasContractRole(account)).to.be.equal(false);

      await this.accessControls.addContractRole(account, {from: deployer});
      expect(await this.accessControls.hasContractRole(account)).to.be.equal(true);

      await this.accessControls.removeContractRole(account, {from: deployer});
      expect(await this.accessControls.hasContractRole(account)).to.be.equal(false);
    });

    it('addAdminRole() reverts if not admin when updating', async () => {
      await expectRevert(
        this.accessControls.addContractRole(account, {from: notApproved}),
        "KOAccessControls: sender must be an admin to grant role"
      );
    });

    it('removeAdminRole() reverts if not admin when updating', async () => {
      await expectRevert(
        this.accessControls.removeContractRole(account, {from: notApproved}),
        "KOAccessControls: sender must be an admin to revoke role"
      );
    });
  });

  describe('hasContractOrMinterRole()', async () => {
    it('via contract role', async () => {
      expect(await this.accessControls.hasContractOrMinterRole(account)).to.be.equal(false);

      await this.accessControls.addContractRole(account, {from: deployer});
      expect(await this.accessControls.hasContractOrMinterRole(account)).to.be.equal(true);

      await this.accessControls.removeContractRole(account, {from: deployer});
      expect(await this.accessControls.hasContractOrMinterRole(account)).to.be.equal(false);
    });

    it('via minter role', async () => {
      expect(await this.accessControls.hasContractOrMinterRole(account)).to.be.equal(false);

      await this.accessControls.addMinterRole(account, {from: deployer});
      expect(await this.accessControls.hasContractOrMinterRole(account)).to.be.equal(true);

      await this.accessControls.removeMinterRole(account, {from: deployer});
      expect(await this.accessControls.hasContractOrMinterRole(account)).to.be.equal(false);
    });
  });

});
