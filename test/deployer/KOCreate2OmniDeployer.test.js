const {BN, constants, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const {ether} = require('@openzeppelin/test-helpers');

const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const KOCreate2OmniDeployer = artifacts.require('KOCreate2OmniDeployer');
const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');

contract('Contract deployer', function (accounts) {
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
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Set up access controls with artist roles
    await this.accessControls.grantRole(this.CONTRACT_ROLE, contract, {from: deployer});

    this.omniDeployer = await KOCreate2OmniDeployer.new();
  });

  // based on this https://solidity-by-example.org/app/create2/

  it.skip('should deploy contract to the address generated with the same salt', async () => {
    const contractByteCode = (await ethers.getContractFactory('KnownOriginDigitalAssetV3')).bytecode;
    const constructorTypes = ['address', 'address', 'uint256'];
    const constructorArgs = [this.accessControls.address, ZERO_ADDRESS, STARTING_EDITION];
    const completeByteCode = buildBytecode(constructorTypes, constructorArgs, contractByteCode);
    const salt = new BN('123');


    // console.log('hexDataLength', ethers.utils.hexDataLength(completeByteCode));
    // console.log('contractByteCode', contractByteCode);
    // console.log('constructorTypes', constructorTypes);
    // console.log('constructorArgs', constructorArgs);
    // console.log('completeByteCode', completeByteCode);

    const receipt = await this.omniDeployer.deploy(completeByteCode, salt, {from: deployer});
    expectEvent.inLogs(receipt.logs, 'Deployed', {
      addr: '0xFa894640C1f6a934AE644403686305C2DcB67677',
      salt: '123'
    });
  });

  it.skip('deployed contract should be configured correctly', async () => {
    const contractByteCode = (await ethers.getContractFactory('KnownOriginDigitalAssetV3')).bytecode;
    const constructorTypes = ['address', 'address', 'uint256'];
    const constructorArgs = [this.accessControls.address, ZERO_ADDRESS, STARTING_EDITION];
    const completeByteCode = buildBytecode(constructorTypes, constructorArgs, contractByteCode);
    const salt = new BN('123');

    const predicatedAddress = '0xFa894640C1f6a934AE644403686305C2DcB67677';

    const receipt = await this.omniDeployer.deploy(completeByteCode, salt, {from: deployer});
    expectEvent.inLogs(receipt.logs, 'Deployed', {
      addr: predicatedAddress,
      salt: '123'
    });

    // const signers = await ethers.getSigners();
    //
    // const deployedContract = new ethers.Contract(predicatedAddress, KnownOriginDigitalAssetV3._json.abi, signers[0]);
    //
    // // check contract setup correctly
    // const accessControls = await deployedContract.accessControls();
    // expect(accessControls).to.be.equal(this.accessControls.address);
    //
    // const editionPointer = await deployedContract.editionPointer();
    // expect(editionPointer).to.be.equal(STARTING_EDITION);
    //
    // const royaltiesRegistryProxy = await deployedContract.royaltiesRegistryProxy();
    // expect(royaltiesRegistryProxy).to.be.equal(ZERO_ADDRESS);
    //
    // // for the test whitelist the signer so we can test mint a token
    // await this.accessControls.grantRole(this.CONTRACT_ROLE, signers[0].address, {from: deployer});
    //
    // // check we can mint a token
    // await deployedContract.mintToken(artist, TOKEN_URI);
    //
    // // query for data amd validate setup
    // const editionDetails = await deployedContract.getEditionDetails(firstEditionTokenId.toString());
    // expect(editionDetails._originalCreator).to.equal(artist, 'Failed edition details creator validation');
    // expect(editionDetails._owner).to.equal(artist, 'Failed edition details owner validation');
    // expect(editionDetails._editionId.toString()).to.equal(firstEditionTokenId.toString(), 'Failed edition details edition validation');
    // expect(editionDetails._size.toString()).to.equal('1', 'Failed edition details size validation');
    // expect(editionDetails._uri).to.equal(TOKEN_URI, 'Failed edition details uri validation');
  });

  const buildBytecode = (constructorTypes, constructorArgs, contractBytecode) =>
    `${contractBytecode}${encodeParams(constructorTypes, constructorArgs).slice(2,)}`;

  const encodeParams = (dataTypes, data) => {
    return ethers.utils.defaultAbiCoder.encode(dataTypes, data);
  };
});
