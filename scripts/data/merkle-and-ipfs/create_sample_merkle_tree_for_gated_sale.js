require('dotenv').config();

const fs = require('fs');
const ethers = require('ethers');

const pinataSDK = require('@pinata/sdk');
const pinata = pinataSDK(process.env.KO_PINATA_API_KEY, process.env.KO_PINATA_API_SECRET);

const {parseBalanceMap} = require('../../../test/utils/parse-balance-map');

(async function () {

  const PHASE = 1;
  const IN = `./scripts/refik/merkle-and-ipfs/in/prelist-phase-${PHASE}.json`;
  const OUT = `./scripts/refik/merkle-and-ipfs/out/phase-${PHASE}.json`;
  const IPFS = `./scripts/refik/merkle-and-ipfs/out/phase-${PHASE}-ipfs.json`;

  const merkleConfig = JSON.parse(fs.readFileSync(IN));
  const merkleTree = parseBalanceMap(merkleConfig);

  const totalAddresses = parseInt(ethers.utils.formatUnits(merkleTree.tokenTotal, 'wei'));
  console.log(`
Generated merkle root: ${merkleTree.merkleRoot}

Total: ${totalAddresses}
  `);

  fs.writeFileSync(OUT, JSON.stringify({
    generateMerkleProofs: merkleTree
  }, null, 2));

  const results = await pinata.pinFileToIPFS(fs.createReadStream(OUT));
  console.log(`Pinning IPFS hash with proofs ${results.IpfsHash}`);

  fs.writeFileSync(IPFS, JSON.stringify({
    results
  }, null, 2));

  console.log(`
Results written to ./scripts/refik/merkle-and-ipfs/out/
  `);

})();

