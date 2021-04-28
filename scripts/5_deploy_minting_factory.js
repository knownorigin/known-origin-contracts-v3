const prompt = require('prompt-sync')();
const hre = require('hardhat');

const KOAccessControls = require('../artifacts/contracts/access/KOAccessControls.sol/KOAccessControls.json');
const KnownOriginDigitalAssetV3 = require('../artifacts/contracts/core/KnownOriginDigitalAssetV3.sol/KnownOriginDigitalAssetV3.json');
const KODAV3Marketplace = require('../artifacts/contracts/marketplace/KODAV3PrimaryMarketplace.sol/KODAV3PrimaryMarketplace.json');

const legacy_data = require('./data/legacy_data');
const v3_data = require('./data/v3_data');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying minting factory with the account:', await deployer.getAddress());

  const {name: network} = hre.network;
  console.log(`Running on network [${network}]`);

  const accessControlsAddress = prompt('Access controls address? ');
  const accessControlsDeployment = new ethers.Contract(
    accessControlsAddress,
    KOAccessControls.abi,
    deployer
  );
  prompt(`Found Access Controls [${accessControlsDeployment.address}] for network [${network}] - click enter to continue ... ?`);

  const kodaV3DeploymentAddress = prompt('KODA V3 address? ');
  const kodaV3Deployment = new ethers.Contract(
    kodaV3DeploymentAddress,
    KnownOriginDigitalAssetV3.abi,
    deployer
  );
  prompt(`Found KODA V3 NFT [${kodaV3Deployment.address}] for network [${network}] - click enter to continue ... ?`);

  const marketplaceAddress = prompt('Marketplace address? ');
  const marketplaceAddressDeployment = new ethers.Contract(
    marketplaceAddress,
    KODAV3Marketplace.abi,
    deployer
  );
  prompt(`Found Marketplace [${marketplaceAddressDeployment.address}] for network [${network}] - click enter to continue ... ?`);

  // Deploying the minting factory

  const MintingFactory = await ethers.getContractFactory('MintingFactory');
  const minterFactory = await MintingFactory.deploy(
    accessControlsDeployment.address, // _accessControls
    kodaV3Deployment.address, // _koda
    marketplaceAddressDeployment.address // _marketplace
  );
  await minterFactory.deployed();
  console.log('Minting factory deployed at', minterFactory.address);

  const CONTRACT_ROLE = await accessControlsDeployment.CONTRACT_ROLE();
  await accessControlsDeployment.grantRole(CONTRACT_ROLE, minterFactory.address);
  console.log(`Granting CONTRACT_ROLE [${CONTRACT_ROLE}] to minter factory [${minterFactory.address}]`);

  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
