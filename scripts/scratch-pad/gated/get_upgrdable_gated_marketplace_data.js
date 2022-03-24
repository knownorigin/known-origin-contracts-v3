const prompt = require('prompt-sync')();
const hre = require('hardhat');
const {ethers, upgrades} = hre;

const KODAV3UpgradableGatedMarketplace = require('../../../artifacts/contracts/marketplace/KODAV3UpgradableGatedMarketplace.sol/KODAV3UpgradableGatedMarketplace.json');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Signer account:', await deployer.getAddress());

  const {name: network} = hre.network;
  console.log(`Running on network [${network}]`);

  const kodaV3GatedMarketplaceAddress = prompt('KodaV3GatedMarketplaceAddress address? ');
  const kodaV3GatedMarketplaceDeployment = new ethers.Contract(
    kodaV3GatedMarketplaceAddress,
    KODAV3UpgradableGatedMarketplace.abi,
    deployer
  );
  prompt(`Found Gated marketplace [${kodaV3GatedMarketplaceDeployment.address}] for network [${network}] - click enter to continue ... ?`);

  const accessControls = await kodaV3GatedMarketplaceDeployment.accessControls();
  console.log('accessControls', accessControls);

  const koda = await kodaV3GatedMarketplaceDeployment.koda();
  console.log('koda', koda);

  const platformAccount = await kodaV3GatedMarketplaceDeployment.platformAccount();
  console.log('platformAccount', platformAccount);

  const minBidAmount = await kodaV3GatedMarketplaceDeployment.minBidAmount();
  console.log('minBidAmount', minBidAmount);

  const bidLockupPeriod = await kodaV3GatedMarketplaceDeployment.bidLockupPeriod();
  console.log('bidLockupPeriod', bidLockupPeriod);

  // console.log('******************************************************');
  //
  // const sales1 = await kodaV3GatedMarketplaceDeployment.sales(1);
  // console.log('sales1', sales1);
  //
  // const phases1 = await kodaV3GatedMarketplaceDeployment.phases(1, 0);
  // console.log('phases1', phases1);
  //
  // console.log('******************************************************');
  //
  // const sales2 = await kodaV3GatedMarketplaceDeployment.sales(2);
  // console.log('sales2', sales2);
  //
  // const phases2 = await kodaV3GatedMarketplaceDeployment.phases(2, 0);
  // console.log('phases2', phases2);
  //
  // console.log('******************************************************');
  //
  // const sales3 = await kodaV3GatedMarketplaceDeployment.sales(3);
  // console.log('sales3', sales3);
  //
  // const phases3 = await kodaV3GatedMarketplaceDeployment.phases(3, 0);
  // console.log('phases3', phases3);
  //
  // console.log('******************************************************');

  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
