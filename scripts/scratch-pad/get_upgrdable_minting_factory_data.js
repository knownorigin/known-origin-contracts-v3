const prompt = require('prompt-sync')();
const hre = require('hardhat');
const {ethers} = hre;

const MintingFactoryV2 = require('../../artifacts/contracts/minter/MintingFactoryV2.sol/MintingFactoryV2.json');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Signer account:', await deployer.getAddress());

  const {name: network} = hre.network;
  console.log(`Running on network [${network}]`);

  const mintingFactoryAddress = prompt('MintingFactoryV2 address? ');
  const mintingFactoryDeployment = new ethers.Contract(
    mintingFactoryAddress,
    MintingFactoryV2.abi,
    deployer
  );
  prompt(`Found Minting factory [${mintingFactoryDeployment.address}] for network [${network}] - click enter to continue ... ?`);

  const royaltiesRegistry = await mintingFactoryDeployment.royaltiesRegistry();
  console.log('royaltiesRegistry', royaltiesRegistry);

  const koda = await mintingFactoryDeployment.koda();
  console.log('koda', koda);

  const gatedMarketplace = await mintingFactoryDeployment.gatedMarketplace();
  console.log('gatedMarketplace', gatedMarketplace);

  const marketplace = await mintingFactoryDeployment.marketplace();
  console.log('marketplace', marketplace);

  const accessControls = await mintingFactoryDeployment.accessControls();
  console.log('accessControls', accessControls);

  const maxMintsInPeriod = await mintingFactoryDeployment.maxMintsInPeriod();
  console.log('maxMintsInPeriod', maxMintsInPeriod);

  const mintingPeriod = await mintingFactoryDeployment.mintingPeriod();
  console.log('mintingPeriod', mintingPeriod);

  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
