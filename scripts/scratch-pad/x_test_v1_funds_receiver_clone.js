const prompt = require('prompt-sync')();
const hre = require('hardhat');

const ClaimableFundsReceiverV1 = require('../../artifacts/contracts/collab/handlers/ClaimableFundsReceiverV1.sol/ClaimableFundsReceiverV1.json');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying V1 funds handler with account:', await deployer.getAddress());

  const {name: network} = hre.network;
  console.log(`Running on network [${network}]`);

  // 0x2e9B9Eea4611163C38F5831fCbdBD113424772f7
  // WHY?
  // 0x218c4dB343cef58F65E513d84615447689Dc358F <<< clone
  const claimableFundsReceiverV1Address = prompt(`claimableFundsReceiverV1 deployer address? `);
  const claimableFundsReceiverV1 = new ethers.Contract(
    claimableFundsReceiverV1Address,
    ClaimableFundsReceiverV1.abi,
    deployer
  );

  console.log((await claimableFundsReceiverV1.totalRecipients()).toString());
  await claimableFundsReceiverV1.drain();

  console.log('drained!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
