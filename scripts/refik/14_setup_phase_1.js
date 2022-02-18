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
  // MASTER WORK	1 x 1 - reserve auction
  // (rinkeby) 329000

  // T+/- SERIES 1 - 1x5
  // (rinkeby) 330000 (this is edition of 25)

  // T+/- SERIES 2 - 1x5
  // T+/- SERIES 3 - 1x5
  // T+/- SERIES 4 - 1x5
  // T+/- SERIES 5 - 1x5

  const PHASE_1_1 = {
    editionId: '330000',
    startTime: '1645542000',
    endTime: 0,
    walletMintLimits: '1',
    merkleRoots: '',
    pricesInWei: '100000000000000000',
    mintCaps: '25',
  };

  // TELEMETRY DATA PAINTINGS	1 x 100
  // (rinkeby) 331000
  const PHASE_1_2 = {
    editionId: '331000',
    startTime: '1645542000',
    endTime: 0,
    walletMintLimits: '1',
    merkleRoots: '',
    pricesInWei: '100000000000000000',
    mintCaps: '100',
  };

  // 327000
  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
