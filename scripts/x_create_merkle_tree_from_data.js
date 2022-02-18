require('dotenv').config();

const fs = require('fs');
const _ = require('lodash');

const ethers = require('ethers');
const {BigNumber} = require('ethers');

// const pinataSDK = require('@pinata/sdk');
// const pinata = pinataSDK(process.env.KO_PINATA_API_KEY, process.env.KO_PINATA_API_SECRET);

const {parseBalanceMap} = require('../test/utils/parse-balance-map');

(async function () {

  const merkleConfig = JSON.parse(fs.readFileSync('./scripts/data/merkle/in/prelist-phase-1.json'));

  const merkleTree = parseBalanceMap(merkleConfig);

  const totalAddresses = parseInt(ethers.utils.formatUnits(merkleTree.tokenTotal, 'wei'));

  // const totalClaims = _.size(generateMerkleProofs.claims);
  console.log(`
    Generated merkle root: ${merkleTree.merkleRoot}
    
    Total: ${totalAddresses}
  `);

  fs.writeFileSync('./scripts/data/merkle/out/merkle-tree.json', JSON.stringify({
    generateMerkleProofs: merkleTree
  }, null, 2));

  // const results = await pinata.pinFileToIPFS(fs.createReadStream('./scripts/data/merkle/out/merkle-tree.json'));
  // console.log(`
  //   Pinning IPFS hash with proofs ${results.IpfsHash}
  // `);
  //
})();

