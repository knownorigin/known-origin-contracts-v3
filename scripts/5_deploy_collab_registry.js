const prompt = require('prompt-sync')();
const hre = require('hardhat');

const KOAccessControls = require('../artifacts/contracts/access/KOAccessControls.sol/KOAccessControls.json');
const KnownOriginDigitalAssetV3 = require('../artifacts/contracts/core/KnownOriginDigitalAssetV3.sol/KnownOriginDigitalAssetV3.json');
const CollabRoyaltiesRegistry = require('../artifacts/contracts/collab/CollabRoyaltiesRegistry.sol/CollabRoyaltiesRegistry.json');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying collab registry with the account:', await deployer.getAddress());

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

  /////////////////////////
  // Deploy the registry //
  /////////////////////////

  const CollabRoyaltiesRegistry = await ethers.getContractFactory('CollabRoyaltiesRegistry');
  const collabRoyaltiesRegistry = await CollabRoyaltiesRegistry.deploy(
    accessControlsDeployment.address // _accessControls
  );
  await collabRoyaltiesRegistry.deployed();
  console.log('Collab registry deployed at', collabRoyaltiesRegistry.address);

  console.log('Setting KODA on collab registry', collabRoyaltiesRegistry.address);
  await collabRoyaltiesRegistry.setKoda(kodaV3Deployment.address);
  console.log('KODA on collab registry set!');

  console.log('Setting registry on KODA', kodaV3Deployment.address);
  await kodaV3Deployment.setRoyaltiesRegistryProxy(collabRoyaltiesRegistry.address);
  console.log('Collab registry set on KODA!');

  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
