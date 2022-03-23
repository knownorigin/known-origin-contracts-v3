const prompt = require('prompt-sync')();
const hre = require('hardhat');
const {ethers} = hre;
const {BigNumber} = ethers;
const moment = require('moment')


const fs = require('fs');
const _ = require('lodash');
const path = require('path')
const axios = require('axios')

const pinataSDK = require('@pinata/sdk');
const pinata = pinataSDK(process.env.KO_PINATA_API_KEY, process.env.KO_PINATA_API_SECRET);
const {parseBalanceMap} = require('../../test/utils/parse-balance-map');

const MintingFactoryV2 = require('../../artifacts/contracts/minter/MintingFactoryV2.sol/MintingFactoryV2.json');
const KODAV3UpgradableGatedMarketplace = require('../../artifacts/contracts/marketplace/KODAV3UpgradableGatedMarketplace.sol/KODAV3UpgradableGatedMarketplace.json');

const _6_MONTHS = 15780000;
const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

async function createMerkle(inFileName, outFileName, artistAddress) {
  try {

    if(!inFileName || !outFileName || !artistAddress) {
      throw new Error('missing input variables for createMerkle')
    }

    const merkleConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../data/merkle-and-ipfs/in/${inFileName}`)));
    const merkleTree = parseBalanceMap(merkleConfig);

    const totalAddresses = parseInt(ethers.utils.formatUnits(merkleTree.tokenTotal, 'wei'));

    console.log(`
    Generated merkle root: ${merkleTree.merkleRoot}
    
    Total: ${totalAddresses}
  `);

    fs.writeFileSync(path.resolve(__dirname, `../data/merkle-and-ipfs/out/${outFileName}`), JSON.stringify({
      generateMerkleProofs: merkleTree
    }, null, 2));

    console.log(`
Results written to ../data/merkle-and-ipfs/out/${outFileName}
  `);

    const results = await pinata.pinFileToIPFS(fs.createReadStream(path.resolve(__dirname, `../data/merkle-and-ipfs/out/${outFileName}`)));
    console.log(`Pinning IPFS hash with proofs ${results.IpfsHash}`);

    return {
      merkleRoot: merkleTree.merkleRoot,
      ipfsHash: results.IpfsHash,
      artistIndex: merkleTree.claims[artistAddress].index,
      artistProof: merkleTree.claims[artistAddress].proof
    }
  } catch (err) {
    console.error(err)
    throw err
  }
}

async function getEditionId(contract, web3, tx) {
  try {
    await tx.wait(1)

    const txReceipt = await web3.getTransactionReceipt(tx.hash);

    const results = await contract.queryFilter(
        state.mintingFactory.interface.events['EditionMintedAndListed(uint256, SaleType);'],
        txReceipt.blockNumber,
        txReceipt.blockNumber
    );

    return results[0].args._editionId

  } catch (err) {
    console.error(err)
    throw err
  }
}

async function getMerkleApiDetails(network, address) {
  network = network === 'rinkeby' ? 4 : 1
  let url = `https://us-central1-known-origin-io.cloudfunctions.net/main/api/network/${network}/merklevault/metadata/${address}`

  let res = await axios({
    method: 'get',
    url
  })

  return {
    index: res.data.merkleProofAndIndex.index,
    proof: res.data.merkleProofAndIndex.proof
  }

}

async function main() {
  try {
    const rootTime = moment()

    console.log(`Starting process at ${rootTime.unix()}`)

    const [deployer] = await ethers.getSigners();
    console.log('Signer account:', await deployer.getAddress());
    const {name: network} = hre.network;
    console.log(`Running on network [${network}]`);

    const web3 = new ethers.getDefaultProvider(`${network}`);

    // STEP 1 - get the contracts
    const mintingFactoryV2Address = prompt('MintingFactoryV2Address address? ', '0x32f43177CB70EB482cFD5DD1f3D48A760241A36F');
    const mintingFactoryDeployment = new ethers.Contract(
        mintingFactoryV2Address,
        MintingFactoryV2.abi,
        deployer
    )
    prompt(`Found Minting Factory V2 [${mintingFactoryDeployment.address}] for network [${network}] - click enter to continue ... ?`);

    const kodaV3GatedMarketplaceAddress = prompt('KodaV3GatedMarketplaceAddress address? ', '0xB3563C45E45714d9B1a61171c0774a6deb07123D');
    const kodaV3GatedMarketplaceDeployment = new ethers.Contract(
        kodaV3GatedMarketplaceAddress,
        KODAV3UpgradableGatedMarketplace.abi,
        deployer
    );
    prompt(`Found Gated marketplace [${kodaV3GatedMarketplaceDeployment.address}] for network [${network}] - click enter to continue ... ?`);

    // STEP 2 - generate a merkle tree
    const merkleInFileName = prompt('File Name for merkle tree addresses - IN file? ', 'ko-staff-list.json')
    const merkleOutFileName = prompt('File Name for generated merkle tree - OUT file? ', 'ko-merkle.json')
    const merkleArtistAddress = prompt('Artist address for merkle tree? ', '0x681A7040477Be268A4b9A02c5e8263fd9fEbf0a9')

    console.log('Artist Address : ', merkleArtistAddress)

    let merkleTree = await createMerkle(merkleInFileName, merkleOutFileName, merkleArtistAddress)
    let artistMerkleInfo = await getMerkleApiDetails(network, merkleArtistAddress)

    console.log(
        `Merkle generated and merkle artist information extracted:

      MerkleRoot: ${merkleTree.merkleRoot},
      IPFSHash: ${merkleTree.ipfsHash},
      `)

    console.log('ARTIST MERKLE INFO : ', merkleArtistAddress, artistMerkleInfo.index, artistMerkleInfo.proof)

    const batchEditionSize = prompt('Edition size for batch edition? ', 100)
    const publicStartDate = prompt('Start date for public sale? ', rootTime.add(1, 'd').unix())
    const publicPrice = prompt('Price for public sale in eth? ', '0.2')

    // const mintEstimateGas = await mintingFactoryDeployment.connect(merkleArtistAddress.toLowerCase()).estimateGas.mintBatchEditionGatedAndPublic(
    //     batchEditionSize,
    //     publicStartDate,
    //     ethers.utils.parseEther(publicPrice).toString(),
    //     artistMerkleInfo.index,
    //     artistMerkleInfo.proof,
    //     ethers.constants.AddressZero,
    //     TOKEN_URI,
    // )

    const mintTx = await mintingFactoryDeployment.connect(merkleArtistAddress).mintBatchEditionGatedAndPublic(
        batchEditionSize,
        publicStartDate,
        ethers.utils.parseEther(publicPrice).toString(),
        artistMerkleInfo.index,
        artistMerkleInfo.proof,
        ethers.constants.AddressZero,
        TOKEN_URI,
        // {gasLimit: mintEstimateGas.add(10000)}
    )

    console.log(`Mint transaction: ${mintTx}`)
    //
    // const editionID = await getEditionId(web3, mintTx)
    //
    // console.log(`Edition ID extracted: ${editionID}`)
    //
    // const phaseStartDate = prompt('Start date for phase? ', rootTime.add(time.duration.hours(1)))
    // const phasePrice = prompt('Price for phase? ', ether('0.1').toString())
    // const phaseTotalMintCap = prompt('Total mint cap for phase? ', Math.floor(batchEditionSize / 2))
    // const phaseWalletMintCap = prompt('Wallet mint cap for phase? ', 1)
    //
    // const phaseTx = await kodaV3GatedMarketplaceDeployment.createPhase(
    //     editionID.toString(),
    //     phaseStartDate,
    //     publicStartDate,
    //     phasePrice,
    //     phaseTotalMintCap,
    //     phaseWalletMintCap,
    //     merkleInfo.merkleRoot,
    //     merkleInfo.ipfsHash
    // )
    //
    // console.log(`Phase transaction: ${phaseTx}`)
    //
    // console.log('Finished!');
  } catch (err) {
    console.error('ERROR ! : ', err)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
