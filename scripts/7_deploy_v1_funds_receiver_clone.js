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

  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
