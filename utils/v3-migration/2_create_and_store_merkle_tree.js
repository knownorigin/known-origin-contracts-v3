require('dotenv').config();

const fs = require('fs');
const _ = require('lodash');

const pinataSDK = require('@pinata/sdk');
const pinata = pinataSDK(process.env.KO_PINATA_API_KEY, process.env.KO_PINATA_API_SECRET);

const {parseBalanceMap} = require('../artist-merkle-distributor/transpiled/parse-balance-map');

(async function () {

  const allOriginalArtists = JSON.parse(fs.readFileSync('./utils/v3-migration/all-artists.json'));
  const merkleConfig = JSON.parse(fs.readFileSync('./utils/v3-migration/merkle-config.json'));

  const generateMerkleProofs = parseBalanceMap(merkleConfig);

  console.log(`
    Generated IPFS merkle root ${generateMerkleProofs.merkleRoot}
  `);

  // Generate data
  fs.writeFileSync('./utils/v3-migration/generate-merkel-proofs.json', JSON.stringify(generateMerkleProofs, null, 2));

  const results = await pinata.pinFileToIPFS(fs.createReadStream('./utils/v3-migration/generate-merkel-proofs.json'));
  console.log(`
    Pinning IPFS hash with proofs ${results.IpfsHash}
    
    Now go and update the contract with these two values ... :)
  `);

})();

