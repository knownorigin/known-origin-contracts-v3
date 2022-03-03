const prompt = require('prompt-sync')();
const hre = require('hardhat');

const CollabRoyaltiesRegistry = require('../../artifacts/contracts/collab/CollabRoyaltiesRegistry.sol/CollabRoyaltiesRegistry.json');

// FIXME replace with new arrays and numbers
// const fiftyAddresses = [
//   '0x9E325684EF524D63198D658fC4BCd46506AdDC97',
//   '0x449E68a12aDEEaf41f8F23F57768b49D1039919D',
//   '0x4d5eac50a8b448a42959d3c8fdd5a70cc4548566',
//   '0x04706Bb5E2be3D4d04166320b736E79fc69dCe40',
//   '0x818ea5826a063e940cd3a8c49efa00e1ac1ed78a',
//   '0x28DEAA2c107E786ee549882181E7c36C7dab24cF', // hacked replace
//   '0x721e2b2ddae3bd0a764ed13df633bee46e3d67ee',
//   '0x5323c615a6581ffae74d3a81aaf2c60374965218',
//   '0x28723e6D0887795D064C0143fa79Fcd1a8a9D8A5',
//   '0xd84b0cc2deb9dcf87c0512b101105ad63a5e553a',
//   '0x9694133f2bfc63c8630fe5bba54c73a76922fd07',
//   '0x7388131802067d7f78fc7aa83e2a6fd3e7eaaee3',
//   '0xa9349b9a810b2e2d01b3b511561804f80da52ff6',
//   '0x4Fd4c35020CFd14f167BC1D888eb903D7A650768',
//   '0xc47c0dccfbb4d1c20d53569a288738f22e32275b',
//   '0x26dd4199269bec9457f84adb029db917a910c711',
//   '0x446d8fed6c6124f8df17ed19de46977a29c30fd8',
//   '0xd6AAf733b86464e28F2C08937D5850FCccE12E38',
//   '0x86dfbc5d912983609672aed6effa7fbf14ecc35a',
//   '0x35dFa1Dbb4b8e82E8a924C53E3649112E45a05F4',
//   '0x695f89e00288f6c8280f21a63b89b27b53a68f8a',
//   '0xb556a26fe7101d85521bDF97E8DF9FF67C98E621',
//   '0xa45dc232e040c6252d67da33c1983937e5ef5491',
//   '0x10844A040D1c3eEBB76286e9916F421aa3f27514',
//   '0xEf16d178f36F6Cd0C83d3a7dc3719C41c409150A',
//   '0xfee836516a3fc5f053f35964a2bed9af65da8159',
//   '0x35167422D6f7864bd039631D9913e8c4FA7B279E',
//   '0x3e7cFa0D1e542e0eabd3CF90483498B69d85b92c',
//   '0xbE719C273b4B2B180d282106DAE0E8C917489a27',
//   '0xbBF08cFFf6A020a46Bf30Cd4681520346413BF06',
//   '0x543928fb1AaF90aD057Cd89F394e9D9a5DDc6624',
//   '0x1BEd4275F2cdBAB569D99c7cA2d1788cb8f4fceb',
//   '0x65e1b81a7c0a7cda7ccb3255d931a1d9bd3ecfa2',
//   '0xFc09e4bD44a37EEBDC8ce1Ae734Fa2455d98CEf4',
//   '0x2EFE5cbC561d234643DD157423f006D03eB7Db2f',
//   '0xfb451DE6E57F361aDd4BE1A000468a96E3C79929',
//   '0x592e0fF838DE106D86C57f623A09A50C7306a83e',
//   '0x5C365141C4fb4482E538019B2Fe47cE74a1C2f58',
//   '0x23145f55648B1399356b519e96FC369f85a1f82D',
//   '0x224DDB7f0923a42fB8cDeaFfcEFF6CdC14AdB657',
//   '0xFf8543dDD48CCc6553e8Aa1a61eF7132a2089559',
//   '0x2E8D42eeC83E5e9dFC3DF007F8CE890197a1d461',
//   '0xea12c9187f434c6d13f541308bbfb1acb9011acb',
//   '0xa76d16e8eb82110a63c21a99c20d1599a5482771',
//   '0xaf405F251329BaF25C4d8F9bD055395a054144d4',
//   '0x63dfddbc040cdbe68d7727b888965303d2fc316d',
//   '0xde29f3D1bDbAb04c8dB83108c5415438a1eC84CE',
//   '0xB9BEA0554B3CA76660712D6B525CBFbc101fEC1d',
//   '0x79cde9Bb44b079466e4f7f82A2c45bc3924c6Dc8',
//   '0xe3da86b69b74e13e4c45b142989e498745a2e7bf',
// ];
//
// const twoPercent = '200000';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying V1 funds handler with account:', await deployer.getAddress());

  const {name: network} = hre.network;
  console.log(`Running on network [${network}]`);

  let validatedFiftyAddresses = fiftyAddresses.map(address => ethers.utils.getAddress(address));

  const collabRoyaltiesRegistryAddress = prompt(`collabRoyaltiesRegistry deployer address? `);
  const collabRoyaltiesRegistry = new ethers.Contract(
    collabRoyaltiesRegistryAddress,
    CollabRoyaltiesRegistry.abi,
    deployer
  );

  // FIXME ensure tested and percentages are right etc
  // const handlerAddress = prompt(`handler address (to clone)? `);
  // await collabRoyaltiesRegistry.createRoyaltiesRecipient(
  //   handlerAddress,
  //   validatedFiftyAddresses,
  //   Array(validatedFiftyAddresses.length).fill(twoPercent)
  // );

  console.log('createRoyaltiesRecipient registered');

  console.log('Finished!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
