const prompt = require('prompt-sync')();
const hre = require('hardhat');

const KOAccessControls = require('../../artifacts/contracts/access/KOAccessControls.sol/KOAccessControls.json');

const legacy_data = require('../data/legacy_data');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying KODA V3 with the account:', await deployer.getAddress());

  const {name: network} = hre.network;
  console.log(`Running on network [${network}]`);

  const accessControlsAddress = prompt('Access controls address? ');
  const accessControlsDeployment = new ethers.Contract(
    accessControlsAddress,
    KOAccessControls.abi,
    deployer
  );
  prompt(`Found Access Controls [${accessControlsDeployment.address}] for network [${network}] - click enter to continue ... ?`);

  const startingEditionId = legacy_data.starting_edition_id[network];
  prompt(`Found starting edition number of [${startingEditionId}] for network [${network}] - click enter to continue ... ?`);

  // Deploying the NFT

  const KnownOriginDigitalAssetV3 = await ethers.getContractFactory('KnownOriginDigitalAssetV3');
  const kodaV3 = await KnownOriginDigitalAssetV3.deploy(
    accessControlsDeployment.address, // _accessControls
    '0x0000000000000000000000000000000000000000', // _royaltiesRegistryProxy N.B: we dont have one of these set yet
    startingEditionId // _editionPointer
  );
  await kodaV3.deployed();
  console.log('KODA V3 deployed at', kodaV3.address);

  const CONTRACT_ROLE = await accessControlsDeployment.CONTRACT_ROLE();
  await accessControlsDeployment.grantRole(CONTRACT_ROLE, kodaV3.address);
  console.log(`Granting CONTRACT_ROLE [${CONTRACT_ROLE}] to core NFT [${kodaV3.address}]`);

  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
