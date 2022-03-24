const prompt = require('prompt-sync')();
const hre = require('hardhat');
const {ethers, upgrades} = hre;

const {BigNumber} = ethers;
const moment = require('moment');

const fs = require('fs');
const _ = require('lodash');
const path = require('path');
const axios = require('axios');

const KODAV3UpgradableGatedMarketplace = require('../../../artifacts/contracts/marketplace/KODAV3UpgradableGatedMarketplace.sol/KODAV3UpgradableGatedMarketplace.json');

async function main() {
  try {
    const [deployer] = await ethers.getSigners();
    console.log('Signer account:', await deployer.getAddress());

    const {name: network} = hre.network;
    console.log(`Running on network [${network}]`);

    const kodaV3GatedMarketplaceAddress = prompt('KodaV3GatedMarketplaceAddress address? ');
    const gatedMarketplace = new ethers.Contract(
      kodaV3GatedMarketplaceAddress,
      KODAV3UpgradableGatedMarketplace.abi,
      deployer
    );
    prompt(`Found Gated marketplace [${gatedMarketplace.address}] for network [${network}] - click enter to continue ... ?`);

    const ALL_STAFF_MERKEL = '0xd7691a9553d9154779fc29f04d949167702594dfda6fc59a703e6923aab0bbc6';
    const ALL_STAFF_IPFS = 'QmYr59W2kynwCqo83SLpBXHXs4HfPkea9eAexECi2dNu6u';
    const KO_ACCOUNT = '0x3f8c962eb167ad2f80c72b5f933511ccdf0719d4';

    console.log('Artist Address : ', KO_ACCOUNT);

    // Edition - 329000 (1-of-1)
    const createSaleTx1 = await gatedMarketplace.connect(deployer).createSaleWithPhases(
      '329000',
      [moment().unix().toString()],
      [moment().add(1, 'weeks').unix().toString()],
      [ethers.utils.parseEther('0.01')],
      ['1'],
      ['1'],
      [ALL_STAFF_MERKEL],
      [ALL_STAFF_IPFS]
    );
    console.log(`Create 1st sale transaction`, createSaleTx1);

    // Edition - 328000 (1-of-500)
    const createSaleTx2 = await gatedMarketplace.connect(deployer).createSaleWithPhases(
      '328000',
      [moment().unix().toString()],
      [moment().add(1, 'weeks').unix().toString()],
      [ethers.utils.parseEther('0.01')],
      ['500'],
      ['5'],
      [ALL_STAFF_MERKEL],
      [ALL_STAFF_IPFS]
    );
    console.log(`Create 2nd sale transaction`, createSaleTx2);

  } catch (err) {
    console.error('ERROR ! : ', err);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
