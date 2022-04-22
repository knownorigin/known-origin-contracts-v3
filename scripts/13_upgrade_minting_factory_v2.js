const prompt = require('prompt-sync')();
const hre = require('hardhat');

const {upgrades} = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying minting factory V2 with the account:', await deployer.getAddress());

  const {name: network} = hre.network;
  console.log(`Running on network [${network}]`);

  const mintingFactoryV2ProxyAddress = prompt('MintFactory V2 Address? ');
  prompt(`Found MintingFactoryV2 address [${mintingFactoryV2ProxyAddress}] for network [${network}] - click enter to continue ... ?`);

  // Update the proxy to the new impl
  const MintingFactory = await ethers.getContractFactory('MintingFactoryV2');
  await upgrades.upgradeProxy(mintingFactoryV2ProxyAddress, MintingFactory, {
    kind: 'uups',
    timeout: 0 // 0 = indefinate
  });

  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
