const prompt = require('prompt-sync')();
const hre = require('hardhat');
const {ethers} = hre;
const _ = require('lodash');

const KODAV3UpgradableGatedMarketplace = require('../../artifacts/contracts/marketplace/KODAV3UpgradableGatedMarketplace.sol/KODAV3UpgradableGatedMarketplace.json');
const CollabRoyaltiesRegistry = require('../../artifacts/contracts/collab/CollabRoyaltiesRegistry.sol/CollabRoyaltiesRegistry.json');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying gated marketplace with the account:', await deployer.getAddress());

  const {name: network} = hre.network;
  console.log(`Running on network [${network}]`);

  const collabContract = {
    'mainnet': '0xbc20c6582259f440ae628819be80062a576f06ed',
    'rinkeby': '0x119f6fb742b9ace412f177875a169b23487fa664',
  };

  const collabConfig = {
    '0x92EE2370b56DC32794A6CD72585dC01d4288D314': 28_50000, // St Jude's
    '0x9768307521561f51daae61fe76f0da848e9f051b': 23_75000, // Refik
    '0x45FA00cCAB9f3DC4ec1830Dc516C9f48eC671046': 23_75000, // CWS
    '0x401cBf2194D35D078c0BcdAe4BeA42275483ab5F': 14_25000, // Baylor college of medicine TODO this is fake
    '0x3f8C962eb167aD2f80C72b5F933511CcDF0719D4': 4_75000, // Ben fury foundation TODO this is fake
    '0xde9e5eE9E7cD43399969Cfb1C0E5596778c6464F': 3_35000, // KO
    '0x202Fc99F8423d8986c951e849F2f4028e76a547e': 1_65000, // Sequence
  };

  const collabRegistryAddress = prompt('Collab registry address? ');
  const collabRegistryDeployment = new ethers.Contract(
    collabRegistryAddress,
    CollabRoyaltiesRegistry.abi,
    deployer
  );
  prompt(`Collab registry [${collabRegistryDeployment.address}] for network [${network}] - click enter to continue ... ?`);

  const collabSplitterContract = collabContract[network];
  prompt(`Collab splitter [${collabSplitterContract}] for network [${network}] - click enter to continue ... ?`);
  if (!collabSplitterContract) {
    console.log('unable to find collab splitter');
    process.exit(-1);
  }

  const recipients = _.keys(collabConfig);
  if (!recipients || recipients.length !== 7) {
    console.log('unable to find 7 recipients');
    process.exit(-1);
  }

  const splits = _.values(collabConfig);
  if (!splits || splits.length !== 7) {
    console.log('unable to find 7 splits');
    process.exit(-1);
  }

  console.log('recipients', recipients);
  console.log('splits', splits);

  const royaltiesRecipientCollab = await collabRegistryDeployment.createRoyaltiesRecipient(collabSplitterContract, recipients, splits);
  console.log('royaltiesRecipientCollab', royaltiesRecipientCollab);

  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
