const prompt = require('prompt-sync')();
const hre = require('hardhat');

const legacy_data = require('./data/legacy_data');
const v3_data = require('./data/v3_data');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying access controls with the account:', await deployer.getAddress());

  const {name: network} = hre.network;
  console.log(`Running on network [${network}]`);

  // Deploy access controls and setup default permissions

  const legacyAccessControls = legacy_data.access_controls[network];
  if (!legacyAccessControls) {
    console.error(`Unable to find legacy access controls for [${network}]`);
    process.exit(-1);
  }
  prompt(`Found legacy access controls [${legacyAccessControls}] for [${network}] - hit enter to continue`);

  const AccessControls = await ethers.getContractFactory('KOAccessControls');
  const accessControls = await AccessControls.deploy(legacyAccessControls);
  await accessControls.deployed();
  console.log('AccessControls deployed at', accessControls.address);

  // grab the roles
  const DEFAULT_ADMIN_ROLE = await accessControls.DEFAULT_ADMIN_ROLE();

  const legacyAdminAccount = v3_data.commission_account[network];
  if (!legacyAdminAccount) {
    console.error(`Unable to find legacy admin account [${network}]`);
    process.exit(-1);
  }

  prompt(`Found legacy admin account [${legacyAdminAccount}] for [${network}] - hit enter to continue`);

  await accessControls.grantRole(DEFAULT_ADMIN_ROLE, legacyAdminAccount);
  console.log(`Granted Admin role to legacy account [${legacyAdminAccount}]`);

  const {root, ipfsHash} = v3_data.artistMerkelData;
  console.log(`Setting artist minting merkel proof data`, {root, ipfsHash});

  prompt(`Are you sure this looks correct? - hit enter to continue`);

  await accessControls.updateArtistMerkleRoot(root);
  await accessControls.updateArtistMerkleRootIpfsHash(ipfsHash);

  console.log('Finished!');
  console.log('AccessControls deployed at', accessControls.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
