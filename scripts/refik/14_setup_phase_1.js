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

  const _6_MONTHS = 15780000;

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
    startTime: 1645542000,
    endTime: 1645542000 + _6_MONTHS, // TODO confirm end time
    walletMintLimits: '1',
    merkleRoots: '',
    merkleIPFSHashes: '',
    pricesInWei: '100000000000000000',
    mintCaps: '25',
  };

  const phase1Txs = await kodaV3GatedMarketplaceDeployment.createSaleWithPhases(
    PHASE_1_1.editionId,
    [PHASE_1_1.startTime],
    [PHASE_1_1.endTime],
    [PHASE_1_1.walletMintLimits],
    [PHASE_1_1.merkleRoots],
    [PHASE_1_1.merkleIPFSHashes],
    [PHASE_1_1.pricesInWei],
    [PHASE_1_1.mintCaps]
  );
  console.log('Phase 1 TXS', phase1Txs);

  // TELEMETRY DATA PAINTINGS	1 x 100
  // (rinkeby) 331000

  const PHASE_1_2 = {
    editionId: 331000,
    startTime: 1645542000,
    endTime: 1645542000 + _6_MONTHS, // TODO confirm end time
    walletMintLimits: '1',
    merkleRoots: '',
    merkleIPFSHashes: '',
    pricesInWei: '100000000000000000',
    mintCaps: '100',
  };

  const phase2Txs = await kodaV3GatedMarketplaceDeployment.createSaleWithPhases(
    PHASE_1_2.editionId,
    [PHASE_1_2.startTime],
    [PHASE_1_2.endTime],
    [PHASE_1_2.walletMintLimits],
    [PHASE_1_2.merkleRoots],
    [PHASE_1_2.merkleIPFSHashes],
    [PHASE_1_2.pricesInWei],
    [PHASE_1_2.mintCaps]
  );

  console.log('Phase 2 TXS', phase2Txs);

  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
