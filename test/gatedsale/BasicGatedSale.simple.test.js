// const {expect} = require("chai");
// const {BN, expectEvent, expectRevert, time, constants, ether} = require('@openzeppelin/test-helpers');
// const {ZERO_ADDRESS} = constants;
//
// const {parseBalanceMap} = require('../utils/parse-balance-map');
// const {buildArtistMerkleInput} = require('../utils/merkle-tools');
//
// const BasicGatedSale = artifacts.require('BasicGatedSale');
//
// const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
// const KOAccessControls = artifacts.require('KOAccessControls');
// const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
// const MockERC20 = artifacts.require('MockERC20');
//
// const STARTING_EDITION = '10000';
// const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';
// const ONE_HUNDRED = new BN('100');
// const ZERO = new BN('0');
// const ONE = new BN('1');
//
// const firstEditionTokenId = new BN('11000'); // this is implied
//
// contract('BasicGatedSale simple test...', function (accounts) {
//
//   const [owner, admin, koCommission, contract, artist1, artist2, artist3, artistDodgy, newAccessControls] = accounts;
//
//   beforeEach(async () => {
//     this.merkleProof = parseBalanceMap(buildArtistMerkleInput(1, artist1, artist2, artist3));
//
//     this.legacyAccessControls = await SelfServiceAccessControls.new();
//
//     // setup access controls
//     this.accessControls = await KOAccessControls.new(this.legacyAccessControls.address, {from: owner});
//
//     // grab the roles
//     this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();
//
//     // Create token V3
//     this.token = await KnownOriginDigitalAssetV3.new(
//       this.accessControls.address,
//       ZERO_ADDRESS, // no royalties address
//       STARTING_EDITION,
//       {from: owner}
//     );
//
//     await this.accessControls.grantRole(this.CONTRACT_ROLE, this.token.address, {from: owner});
//
//     // Note: this is a test hack so we can mint tokens direct
//     await this.accessControls.grantRole(this.CONTRACT_ROLE, contract, {from: owner});
//
//     this.basicGatedSale = await BasicGatedSale.new(this.accessControls.address, this.token.address, koCommission, {from: owner});
//     await this.accessControls.grantRole(this.CONTRACT_ROLE, this.basicGatedSale.address, {from: owner});
//
//     // create 3 tokens to the minter
//     await this.token.mintBatchEdition(100, artist1, TOKEN_URI, {from: contract});
//
//     // Ensure basic gated sale has approval to sell tokens
//     await this.token.setApprovalForAll(this.basicGatedSale.address, true, {from: artist1});
//
//     this.start = await time.latest();
//
//     // FIXME we can do this better than this...
//     const tomorrow = new Date(Number(this.start.toString()));
//     tomorrow.setDate(tomorrow.getDate() + 1); // wraps automagically
//     this.end = new BN(tomorrow.getTime());
//
//     // just for stuck tests
//     this.erc20Token = await MockERC20.new({from: owner});
//   });
//
//   describe.only('BasicGatedSale', async () => {
//
//     beforeEach(async () => {
//       const receipt = await this.basicGatedSale.createSale(firstEditionTokenId, {from: admin});
//       expectEvent(receipt, 'SaleCreated', {id: ONE});
//
//       await this.basicGatedSale.addPhase(
//         ONE,
//         this.start,
//         this.end,
//         ONE_HUNDRED,
//         this.merkleProof.merkleRoot,
//         ether('0.1')
//       );
//     });
//
//     context('mintFromSale', async () => {
//       it('can mint one item from a valid sale', async () => {
//
//         await time.increase(100); // just bump it forward a few seconds
//
//         let salesReceipt = await this.basicGatedSale.mintFromSale(
//           ONE,
//           ZERO,
//           ONE,
//           this.merkleProof.claims[artist1].index,
//           this.merkleProof.claims[artist1].proof,
//           {from: artist1, value: ether('0.1')}
//         );
//
//         const token1 = firstEditionTokenId;
//         expectEvent(salesReceipt, 'MintFromSale', {
//           saleID: ONE,
//           account: artist1,
//           mintCount: ONE,
//         });
//
//         expect(await this.token.ownerOf(token1)).to.be.equal(artist1);
//
//         salesReceipt = await this.basicGatedSale.mintFromSale(
//           ONE,
//           ZERO,
//           ONE,
//           this.merkleProof.claims[artist2].index,
//           this.merkleProof.claims[artist2].proof,
//           {from: artist2, value: ether('0.1')}
//         );
//
//         const token2 = firstEditionTokenId.add(ONE);
//         expectEvent(salesReceipt, 'MintFromSale', {
//           saleID: ONE,
//           account: artist2,
//           mintCount: ONE,
//         });
//
//         expect(await this.token.ownerOf(token2)).to.be.equal(artist2);
//       });
//     });
//   });
// });
