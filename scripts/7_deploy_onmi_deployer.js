const prompt = require('prompt-sync')();
const hre = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying minting factory with the account:', await deployer.getAddress());

  const {name: network} = hre.network;
  console.log(`Running on network [${network}]`);

  const OmniDeployer = await ethers.getContractFactory('KOCreate2OmniDeployer');
  const omniDeployer = await OmniDeployer.deploy();
  await omniDeployer.deployed();
  console.log('OmniDeployer deployed at', omniDeployer.address);

  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
