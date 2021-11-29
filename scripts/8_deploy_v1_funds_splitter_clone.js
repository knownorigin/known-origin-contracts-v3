const prompt = require('prompt-sync')();
const hre = require('hardhat');

const ClaimableFundsSplitterV1 = require('../artifacts/contracts/collab/handlers/ClaimableFundsSplitterV1.sol/ClaimableFundsSplitterV1.json')
const KOCreate2OmniDeployer = require('../artifacts/contracts/deployer/KOCreate2OmniDeployer.sol/KOCreate2OmniDeployer.json');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying V1 funds splitter with account:', await deployer.getAddress());

  const {name: network} = hre.network;
  console.log(`Running on network [${network}]`);

  const omniDeployerAddress = prompt(`Omni deployer address? `)
  const omniDeployer = new ethers.Contract(
    omniDeployerAddress,
    KOCreate2OmniDeployer.abi,
    deployer
  )

  const salt = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('ClaimableFundsSplitterV1'));
  prompt(`Using keccak256("ClaimableFundsSplitterV1") to generate [${salt}] - click enter to continue ... ?`);

  // Deployed on MAINNET - don't override
  // await omniDeployer.deploy(ClaimableFundsSplitterV1.bytecode, salt)

  console.log('already on mainnet');

  console.log('Finished! - now go white list the handler');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
