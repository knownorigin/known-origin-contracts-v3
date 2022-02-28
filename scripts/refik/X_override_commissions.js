const prompt = require('prompt-sync')();
const hre = require('hardhat');
const {ethers, upgrades} = hre;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying gated marketplace with the account:', await deployer.getAddress());

  const {name: network} = hre.network;
  console.log(`Running on network [${network}]`);

  // TODO set 1 x 1 reserve auction commission to zero on primary marketplace
  // TODO set all other gated sales to zero commission on the primary marketplace setKoCommissionOverrideForEdition
  // TODO set gated commission to zero for all gated sales
  // TODO ensure collaboration set on all mints
  /*
      T+/- SERIES	5 x 5
      TELEMETRY DATA PAINTINGS	1 x 100
      ULTRASOUND SCULPTURES	1 x 100
      ENVIROMENTAL DATA PAINTINGS	TBD
      UMAP SCULPTURES	5 x 1000
   */

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
