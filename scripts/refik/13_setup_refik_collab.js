const prompt = require('prompt-sync')();
const hre = require('hardhat');
const {ethers, upgrades} = hre;

const KODAV3UpgradableGatedMarketplace = require('../../artifacts/contracts/marketplace/KODAV3UpgradableGatedMarketplace.sol/KODAV3UpgradableGatedMarketplace.json');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying gated marketplace with the account:', await deployer.getAddress());

  const {name: network} = hre.network;
  console.log(`Running on network [${network}]`);

  const kodaV3GatedMarketplaceAddress = prompt('KodaV3GatedMarketplaceAddress address? ');
  const kodaV3GatedMarketplaceDeployment = new ethers.Contract(
    kodaV3GatedMarketplaceAddress,
    KODAV3UpgradableGatedMarketplace.abi,
    deployer
  );
  prompt(`Found KODA V3 NFT [${kodaV3GatedMarketplaceDeployment.address}] for network [${network}] - click enter to continue ... ?`);

  await kodaV3GatedMarketplaceDeployment.deployed();
  console.log('Gated Marketplace deployed at', kodaV3GatedMarketplaceDeployment.address);

  const collabConfig = {
    '0x1': 30, // st jude's
    '0x2': 25, // Refik
    '0x3': 25, // CWS
    '0x4': 15, // Baylor college of medicine
    '0x5': 5, // Ben Fury foundation
  };

  // TODO KO / SEQUENCE included as part of the collab?


  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
