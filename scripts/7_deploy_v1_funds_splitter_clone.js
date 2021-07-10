const hre = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying V1 funds splitter with account:', await deployer.getAddress());

  const {name: network} = hre.network;
  console.log(`Running on network [${network}]`);

  // TODO deploy this via KOCreate2OmniDeployer.sol so it has the same address on all networks

  const ClaimableFundsSplitterV1 = await ethers.getContractFactory('ClaimableFundsSplitterV1');
  const fundsSplitterV1 = await ClaimableFundsSplitterV1.deploy();
  await fundsSplitterV1.deployed();
  console.log('V1 funds split deployed at:', fundsSplitterV1.address);

  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
