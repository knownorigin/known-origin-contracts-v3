const {BN, constants, time, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;
const _ = require('lodash');
const {ether} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3Marketplace = artifacts.require('KODAV3PrimaryMarketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

const {parseBalanceMap} = require('../../utils/parse-balance-map');

const {buildArtistMerkleInput} = require('../../utils/merkle-tools');

const {validateEditionAndToken} = require('../../test-helpers');

contract('PrimaryMarketplaceGasCostings test ... ', function (accounts) {
  const [
    owner, minter, anotherMinter, koCommission, contract, collectorA, collectorB, collectorC, collectorD, proxy
  ] = accounts;

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = '10000';

  const _0_1_ETH = ether('0.1');
  const _0_2_ETH = ether('0.2');
  const _0_3_ETH = ether('0.3');
  const ONE = new BN('1');
  const ZERO = new BN('0');

  const firstEditionTokenId = new BN('11000');
  const secondEditionTokenId = new BN('12000');
  const thirdEditionTokenId = new BN('13000');

  beforeEach(async () => {
    const legacyAccessControls = await SelfServiceAccessControls.new();
    // setup access controls
    this.accessControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

    this.merkleProof = parseBalanceMap(buildArtistMerkleInput(1, minter));

    // set the root hash
    await this.accessControls.updateArtistMerkleRoot(this.merkleProof.merkleRoot, {from: owner});

    // grab the roles
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Create token V3
    this.token = await KnownOriginDigitalAssetV3.new(
      this.accessControls.address,
      ZERO_ADDRESS, // no royalties address
      STARTING_EDITION,
      {from: owner}
    );

    // Set contract roles
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.token.address, {from: owner});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, contract, {from: owner});

    // Create marketplace and enable in whitelist
    this.marketplace = await KODAV3Marketplace.new(this.accessControls.address, this.token.address, koCommission, {from: owner});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.marketplace.address, {from: owner});

    this.minBidAmount = await this.marketplace.minBidAmount();
  });

  beforeEach(async () => {
    // Ensure owner is approved as this will fail if not
    await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

    // create 3 tokens to the minter
    await this.token.mintBatchEdition(1000, minter, TOKEN_URI, {from: contract});

    this.start = await time.latest();

    await this.marketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, this.start, {from: contract});
  });

  describe.skip('Buying all 1000', async () => {
    it('1 per account', async () => {
      for (let i = 0; i < 1000; i++) {
        console.log(`Minting ${i}`);
        await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});
      }
      console.log(`Tests complete`);
    }).timeout(5 * 60 * 1000);
  });

  describe.skip('Buying all 500 editions', async () => {
    it('1 per account', async () => {
      for (let i = 0; i < 500; i++) {
        console.log(`Minting ${i}`);
        await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});
      }
      console.log(`Tests complete`);
    }).timeout(5 * 60 * 1000);
  });
});
