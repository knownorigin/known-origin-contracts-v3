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
const MintingFactoryV2 = require('../../../artifacts/contracts/minter/MintingFactoryV2.sol/MintingFactoryV2.json');

async function main() {
  try {
    const [deployer] = await ethers.getSigners();
    console.log('Signer account:', await deployer.getAddress());

    const {name: network} = hre.network;
    console.log(`Running on network [${network}]`);

    const ALL_STAFF_MERKEL = '0xd7691a9553d9154779fc29f04d949167702594dfda6fc59a703e6923aab0bbc6';
    const ALL_STAFF_IPFS = 'QmYr59W2kynwCqo83SLpBXHXs4HfPkea9eAexECi2dNu6u';
    const KO_ACCOUNT = '0x3f8c962eb167ad2f80c72b5f933511ccdf0719d4';

    //////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////////////

    const mintingFactoryAddress = prompt('MintingFactoryV2 address? ');
    const mintingFactory = new ethers.Contract(
      mintingFactoryAddress,
      MintingFactoryV2.abi,
      deployer
    );
    prompt(`Found Minting factory [${mintingFactory.address}] for network [${network}] - click enter to continue ... ?`);

    const kodaV3GatedMarketplaceAddress = prompt('KodaV3GatedMarketplaceAddress address? ');
    const gatedMarketplace = new ethers.Contract(
      kodaV3GatedMarketplaceAddress,
      KODAV3UpgradableGatedMarketplace.abi,
      deployer
    );
    prompt(`Found Gated marketplace [${gatedMarketplace.address}] for network [${network}] - click enter to continue ... ?`);

    const {index, proof} = await getMerkleApiDetails(network, KO_ACCOUNT);
    console.log({index, proof});

    // // create a hard coded sale via proxy concept for KO account
    // const tx = await mintingFactory.connect(deployer).mintBatchEditionGatedAndPublicAsProxy(
    //   KO_ACCOUNT,
    //   '10',
    //   moment().add(1, 'weeks').unix().toString(),
    //   ethers.utils.parseEther('0.01'),
    //   '0x0000000000000000000000000000000000000000',
    //   'ipfs://ipfs/QmZY2cXiuF3v8MUbabByT4aHiFgxi2ki1KsgyTsUE1VGzj'
    // );
    // console.log('tx', tx);

    const createPhasesTx = await gatedMarketplace.connect(deployer).createPhases(
      '344000',
      [moment().unix().toString()],
      [moment().add(1, 'weeks').unix().toString()],
      [ethers.utils.parseEther('0.01')],
      ['10'],
      ['1'],
      [ALL_STAFF_MERKEL],
      [ALL_STAFF_IPFS]
    );
    console.log(`Create phases transaction`, createPhasesTx);

  } catch (err) {
    console.error('ERROR ! : ', err);
  }
}

async function getMerkleApiDetails(network, address) {
  const url = `https://us-central1-known-origin-io.cloudfunctions.net/main/api/network/${network === 'rinkeby' ? 4 : 1}/selfservice/user-minting-access/v3/${address}`;
  const res = await axios({method: 'get', url});
  return {
    index: res.data.merkleProofAndIndex.index,
    proof: res.data.merkleProofAndIndex.proof
  };
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
