const AccessControlsContract = require('../artifacts/contracts/access/KOAccessControls.sol/KOAccessControls.json')
const ChiTokenContract = require('../artifacts/contracts/core/chi/ChiToken.sol/ChiToken.json')
const EditionRegistryContract = require('../artifacts/contracts/core/storage/EditionRegistry.sol/EditionRegistry.json')
const KnownOriginDigitalAssetV3Contract = require('../artifacts/contracts/core/KnownOriginDigitalAssetV3.sol/KnownOriginDigitalAssetV3.json')

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(
    "Deploying access controls with the account:",
    await deployer.getAddress()
  );

  ////////////////////////
  // Rinkeby deployment //
  ////////////////////////

  // const AccessControls = await ethers.getContractFactory("KOAccessControls");
  // const accessControls = await AccessControls.deploy();
  // await accessControls.deployed();
  // console.log('AccessControls deployed at', accessControls.address);

  const accessControls = new ethers.Contract(
    "0x03309493f6f3df5e0cc6739402e5451705e461ed",
    AccessControlsContract.abi,
    deployer
  )

  // grab the roles
  const MINTER_ROLE = await accessControls.MINTER_ROLE();
  console.log("MINTER_ROLE", MINTER_ROLE);
  const CONTRACT_ROLE = await accessControls.CONTRACT_ROLE();
  console.log("CONTRACT_ROLE", CONTRACT_ROLE);

  // Set up access controls with minter roles
  await accessControls.grantRole(MINTER_ROLE, deployer.getAddress());
  await accessControls.grantRole(CONTRACT_ROLE, deployer.getAddress());

  // deploy CHI token
  // const ChiToken = await ethers.getContractFactory("ChiToken");
  // const chiToken = await ChiToken.deploy();
  // await chiToken.deployed();
  // console.log('CHI token deployed at', chiToken.address);

  const chiToken = new ethers.Contract(
    "0x026be62bd7dab2eb2381c1c1aa1c71164178cf5b", // <- deployed via remix in order to deployed at solc version 6
    ChiTokenContract.abi,
    deployer
  )

  // Mint CHI
  await chiToken.mint('200');
  const balance = await chiToken.balanceOf(deployer.getAddress());
  console.log("Deployer balance is CHI", balance.toString());

  // Deploy edition registry
  // const STARTING_EDITION = '10000';
  // const EditionRegistry = await ethers.getContractFactory("EditionRegistry");
  // const editionRegistry = await EditionRegistry.deploy(accessControls.address, STARTING_EDITION);
  // await editionRegistry.deployed();
  // console.log('EditionRegistry deployed at', editionRegistry.address);

  const editionRegistry = new ethers.Contract(
    "0x6097053B55B1c90c984C0b51842077fA3a6919d2",
    EditionRegistryContract.abi,
    deployer
  )

  // Deploy KODA
  // const KnownOriginDigitalAssetV3 = await ethers.getContractFactory("KnownOriginDigitalAssetV3");
  // const kodaV3 = await KnownOriginDigitalAssetV3.deploy(accessControls.address, editionRegistry.address, chiToken.address);
  // await kodaV3.deployed();
  // console.log('KnownOriginDigitalAssetV3 deployed at', kodaV3.address);

  const kodaV3 = new ethers.Contract(
    "0x20671fFBD207916CB0EF5F5c0BAa4A30B81bc0E8",
    KnownOriginDigitalAssetV3Contract.abi,
    deployer
  )

  // Approve KODA to spend CHI
  await chiToken.approve(kodaV3.address, '200');

  // Ensure NFT contract
  await editionRegistry.enableNftContract(kodaV3.address);

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  // mint token with GAS
  await kodaV3.mintTokenWithGasSaver(deployer.getAddress(), TOKEN_URI, {gasPrice: 50000000000});

  // Mint token without
  await kodaV3.mintToken(deployer.getAddress(), TOKEN_URI, {gasPrice: 50000000000});

  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
