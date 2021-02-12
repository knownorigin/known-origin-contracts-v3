const {BN, constants, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const {ether} = require("@openzeppelin/test-helpers");

const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const ContractDeployer = artifacts.require('ContractDeployer');
const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');

contract('MinterFactory', function (accounts) {
  const [deployer, contract, artist] = accounts;

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
    await this.accessControls.grantRole(this.CONTRACT_ROLE, contract, {from: deployer});
  });

  // based on this https://solidity-by-example.org/app/create2/

  it('should deploy contract to the address generated with the same salt', async () => {
    const deployerFactory = await ContractDeployer.new();
    const bytes = await deployerFactory.getKodaV3Bytecode(this.accessControls.address, ZERO_ADDRESS, STARTING_EDITION, {from: deployer});

    const salt = ethers.utils.formatBytes32String("hello-world");

    const predicatedAddress = await deployerFactory.getAddress(bytes, salt);

    const address = await deployerFactory.deploy.call(bytes, salt);
    expect(address).not.to.be.equal(ZERO_ADDRESS);
    expect(address).to.be.equal(predicatedAddress);
  });

  it('deployed contract should be configured correctly', async () => {
    const deployerFactory = await ContractDeployer.new();
    const bytes = await deployerFactory.getKodaV3Bytecode(this.accessControls.address, ZERO_ADDRESS, STARTING_EDITION, {from: deployer});

    const salt = ethers.utils.formatBytes32String("hello-world");

    const predicatedAddress = await deployerFactory.getAddress(bytes, salt);

    const tx = await deployerFactory.deploy(bytes, salt);
    await expectEvent.inLogs(tx.logs, "Deployed", {
      addr: predicatedAddress,
      salt: salt
    });

    const signers = await ethers.getSigners();

    const deployedContract = new ethers.Contract(predicatedAddress, KnownOriginDigitalAssetV3._json.abi, signers[0]);

    // check contract setup correctly
    const accessControls = await deployedContract.accessControls();
    expect(accessControls).to.be.equal(this.accessControls.address);

    const editionPointer = await deployedContract.editionPointer();
    expect(editionPointer).to.be.equal(STARTING_EDITION);

    const royaltiesRegistryProxy = await deployedContract.royaltiesRegistryProxy();
    expect(royaltiesRegistryProxy).to.be.equal(ZERO_ADDRESS);

    // for the test whitelist the signer so we can test mint a token
    await this.accessControls.grantRole(this.CONTRACT_ROLE, signers[0].address, {from: deployer});

    // check we can mint a token
    await deployedContract.mintToken(artist, TOKEN_URI);

    // query for data amd validate setup
    const editionDetails = await deployedContract.getEditionDetails(firstEditionTokenId.toString());
    expect(editionDetails._originalCreator).to.equal(artist, "Failed edition details creator validation")
    expect(editionDetails._owner).to.equal(artist, "Failed edition details owner validation")
    expect(editionDetails._editionId.toString()).to.equal(firstEditionTokenId.toString(), "Failed edition details edition validation")
    expect(editionDetails._size.toString()).to.equal('1', "Failed edition details size validation")
    expect(editionDetails._uri).to.equal(TOKEN_URI, "Failed edition details uri validation")
  });

  // TODO move this out to a script and improve the speed
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
