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

  // based on this https://solidity-by-example.org/app/create2/

  it.skip('generates a nice address', async () => {
    const deployerFactory = await ContractDeployer.new();

    const bytes = await deployerFactory.getKodaV3Bytecode(this.accessControls.address, ZERO_ADDRESS, STARTING_EDITION, {from: deployer});

    // Match create 2 factory address [0x0000bC97ec4D7eb8495aE27bac580DF314C99a8c] | salt [137921] | length [18]

    let foundLength = 20; // default starting size of 20
    let winningSalt = 0;
    let winningAddress = 0;

    let i = 130000;
    while (i < 500000) {
      const address = await deployerFactory.getAddress(bytes, ethers.utils.formatBytes32String(i.toString()));
      const length = ethers.utils.stripZeros(address).length;
      if (length <= foundLength) {
        foundLength = length;
        winningSalt = i;
        winningAddress = address;
        console.log(`Match create 2 factory address [${address}] | salt [${i}] | length [${length}]`);
      }
      i++;
    }

    console.log(`
      Smallest contract found was [${winningAddress}] with salt [${winningSalt}] and length [${foundLength}]
    `)

  }).timeout("10000000");

});
