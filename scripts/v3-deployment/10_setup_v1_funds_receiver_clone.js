const prompt = require('prompt-sync')();
const hre = require('hardhat');

const CollabRoyaltiesRegistry = require('../../artifacts/contracts/collab/CollabRoyaltiesRegistry.sol/CollabRoyaltiesRegistry.json');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying V1 funds handler with account:', await deployer.getAddress());

  const {name: network} = hre.network;
  console.log(`Running on network [${network}]`);

  const collabRoyaltiesRegistryAddress = prompt(`collabRoyaltiesRegistry deployer address? `);
  const collabRoyaltiesRegistry = new ethers.Contract(
    collabRoyaltiesRegistryAddress,
    CollabRoyaltiesRegistry.abi,
    deployer
  );

  const handlerAddress = prompt(`new handler address? `);
  await collabRoyaltiesRegistry.addHandler(handlerAddress);

  console.log('Handler added', handlerAddress);

  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
