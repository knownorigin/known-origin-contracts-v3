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

  /////////////
  // PHASE 1 //
  /////////////

  // Tuesday 1st March

  const PHASE_1 = {
    editionId: '',
    startTime: '',
    endTime: '',
    walletMintLimits: '',
    merkleRoots: '',
    pricesInWei: '',
    mintCaps: '',
  };

  /////////////
  // PHASE 2 //
  /////////////

  // Wednesday 2nd March

  /////////////
  // PHASE 3 //
  /////////////

  // Thursday 3rd March

  /////////////
  // PHASE 4 //
  /////////////

  // Friday 4th March

  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
