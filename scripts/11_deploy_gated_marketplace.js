const prompt = require('prompt-sync')();
const hre = require('hardhat');
const {ethers, upgrades} = hre;

const KOAccessControls = require('../artifacts/contracts/access/KOAccessControls.sol/KOAccessControls.json');
const KnownOriginDigitalAssetV3 = require('../artifacts/contracts/core/KnownOriginDigitalAssetV3.sol/KnownOriginDigitalAssetV3.json');

const v3_data = require('./data/v3_data');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying gated marketplace with the account:', await deployer.getAddress());

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

  const commissionAccount = v3_data.commission_account[network];
  if (!commissionAccount) {
    console.error(`Unable to find commission account [${network}]`);
    process.exit(-1);
  }
  prompt(`Found commission account [${commissionAccount}] for [${network}] - hit enter to continue`);

  ///////////////////////////////
  // Deploying the marketplace //
  ///////////////////////////////

  const KODAV3UpgradableGatedMarketplace = await ethers.getContractFactory('KODAV3UpgradableGatedMarketplace');
  const gatedMarketplace = await upgrades.deployProxy(KODAV3UpgradableGatedMarketplace, [
    accessControlsDeployment.address,
    kodaV3Deployment.address,
    commissionAccount
  ]);
  await gatedMarketplace.deployed();
  console.log('Gated Marketplace deployed at', gatedMarketplace.address);

  const CONTRACT_ROLE = await accessControlsDeployment.CONTRACT_ROLE();
  await accessControlsDeployment.grantRole(CONTRACT_ROLE, gatedMarketplace.address);
  console.log(`Granting CONTRACT_ROLE [${CONTRACT_ROLE}] to marketplace [${gatedMarketplace.address}]`);

  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
