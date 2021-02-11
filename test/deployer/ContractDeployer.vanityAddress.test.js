const {BN, constants, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const {ether} = require("@openzeppelin/test-helpers");

const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const ContractDeployer = artifacts.require('ContractDeployer');

contract('MinterFactory', function (accounts) {
  const [deployer, artist] = accounts;

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = '10000';

  const ETH_ONE = ether('1');

  const firstEditionTokenId = new BN('11000');

  beforeEach(async () => {
    // setup access controls
    const legacyAccessControls = await SelfServiceAccessControls.new();
    this.accessControls = await KOAccessControls.new(legacyAccessControls.address, {from: deployer});

    // grab the roles
    this.MINTER_ROLE = await this.accessControls.MINTER_ROLE();
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Set up access controls with artist roles
    await this.accessControls.grantRole(this.MINTER_ROLE, artist, {from: deployer});
  });

  it.skip('generates a nice address', async () => {
    const deployerFactory = await ContractDeployer.new();

    const bytes = await deployerFactory.getKODACreationBytecode(this.accessControls.address, ZERO_ADDRESS, STARTING_EDITION, {from: deployer});

    for (let i = 0; i <= 10000; i++) {
      const address = await deployerFactory.deploy.call(bytes, ethers.utils.formatBytes32String(i.toString()));
      console.log(`Create 2 factory address [${address}] | salt [${i}]`);
    }

  }).timeout("10000000");

});
