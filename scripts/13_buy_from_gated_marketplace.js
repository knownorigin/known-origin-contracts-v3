const prompt = require('prompt-sync')();
const hre = require('hardhat');

const KODAV3GatedMarketplace = require('../artifacts/contracts/marketplace/KODAV3GatedMarketplace.sol/KODAV3GatedMarketplace.json');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying gated marketplace with the account:', await deployer.getAddress());

  const {name: network} = hre.network;
  console.log(`Running on network [${network}]`);

  const kodaV3GatedMarketplaceAddress = prompt('KodaV3GatedMarketplaceAddress address? ');
  const kodaV3GatedMarketplaceDeployment = new ethers.Contract(
    kodaV3GatedMarketplaceAddress,
    KODAV3GatedMarketplace.abi,
    deployer
  );
  prompt(`Found KODA V3 NFT [${kodaV3GatedMarketplaceDeployment.address}] for network [${network}] - click enter to continue ... ?`);

  await kodaV3GatedMarketplaceDeployment.deployed();
  console.log('Gated Marketplace deployed at', kodaV3GatedMarketplaceDeployment.address);


  // function createSaleWithPhase(uint256 _editionId, uint128 _startTime, uint128 _endTime, uint16 _walletMintLimit, bytes32 _merkleRoot, string memory _merkleIPFSHash, uint128 _priceInWei, uint128 _mintCap)
  const receipt = await kodaV3GatedMarketplaceDeployment.createSaleWithPhase(
    317000,
    0,
    1802010307,
    5,
    '0x523f38e5af5151d061caa9c6a70309ddcb76468362ecc4625a1f5a29e322fce1',
    'andy',
    '20000000000000000',
    50,
  );

  console.log('Set up phase', receipt);

  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
