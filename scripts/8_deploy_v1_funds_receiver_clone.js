const prompt = require('prompt-sync')();
const hre = require('hardhat');

const ClaimableFundsReceiverV1 = require('../artifacts/contracts/collab/handlers/ClaimableFundsReceiverV1.sol/ClaimableFundsReceiverV1.json')
const KOCreate2OmniDeployer = require('../artifacts/contracts/deployer/KOCreate2OmniDeployer.sol/KOCreate2OmniDeployer.json');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying V1 funds handler with account:', await deployer.getAddress());

  const {name: network} = hre.network;
  console.log(`Running on network [${network}]`);

  const omniDeployerAddress = prompt(`Omni deployer address? `)
  const omniDeployer = new ethers.Contract(
    omniDeployerAddress,
    KOCreate2OmniDeployer.abi,
    deployer
  )

  const salt = prompt(`Salt? `)
  await omniDeployer.deploy(ClaimableFundsReceiverV1.bytecode, salt)

  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
