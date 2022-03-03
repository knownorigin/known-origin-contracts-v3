const prompt = require('prompt-sync')();
const hre = require('hardhat');

const KnownOriginDigitalAssetV3 = require('../../artifacts/contracts/core/KnownOriginDigitalAssetV3.sol/KnownOriginDigitalAssetV3.json');

const legacy_data = require('../data/legacy_data');
const v3_data = require('../data/v3_data');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying minting factory with the account:', await deployer.getAddress());

  const {name: network} = hre.network;
  console.log(`Running on network [${network}]`);

  const kodaV3DeploymentAddress = prompt('KODA V3 address? ');
  const kodaV3Contract = new ethers.Contract(
    kodaV3DeploymentAddress,
    KnownOriginDigitalAssetV3.abi,
    deployer
  );
  prompt(`Found KODA V3 NFT [${kodaV3Contract.address}] for network [${network}] - click enter to continue ... ?`);

  const marketplaceAddress = prompt('Marketplace address? ');

  // Approve marketplace from account on KODA v3
  const accountToApprove = prompt('Approve on Marketplace address? ');

  kodaV3Contract.setApprovalForAll(marketplaceAddress, true, {from: accountToApprove});

  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
