const hre = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying V1 funds handler with account:', await deployer.getAddress());

  const {name: network} = hre.network;
  console.log(`Running on network [${network}]`);

  const ClaimableFundsReceiverV1 = await ethers.getContractFactory('ClaimableFundsReceiverV1');
  const fundsReceiverV1 = await ClaimableFundsReceiverV1.deploy();
  await fundsReceiverV1.deployed();
  console.log('V1 funds receiver deployed at:', fundsReceiverV1.address);

  // Note: Added this to registry on rinkeby
  //  - https://rinkeby.etherscan.io/address/0x0484b4a4caa52882214dd80b955992e69c6013ab

  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });