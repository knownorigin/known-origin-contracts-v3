const {BN, constants, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const web3 = require('web3');
const {ether} = require("@openzeppelin/test-helpers");

const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3Marketplace = artifacts.require('KODAV3Marketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const EditionRegistry = artifacts.require('EditionRegistry');

const {validateToken} = require('../test-helpers');

contract('ERC721', function (accounts) {
  const [owner, minter, koCommission, contract, collectorA, collectorB, collectorC, collectorD] = accounts;

  const STARTING_EDITION = '10000';

  const ETH_ONE = ether('1');

  const firstEditionTokenId = new BN('11000');
  const secondEditionTokenId = new BN('12000');
  const thirdEditionTokenId = new BN('13000');
  const nonExistentTokenId = new BN('99999999999');

  beforeEach(async () => {
    // setup access controls
    this.accessControls = await KOAccessControls.new({from: owner});

    // grab the roles
    this.MINTER_ROLE = await this.accessControls.MINTER_ROLE();
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Set up access controls with minter roles
    await this.accessControls.grantRole(this.MINTER_ROLE, owner, {from: owner});
    await this.accessControls.grantRole(this.MINTER_ROLE, minter, {from: owner});

    // setup edition registry
    this.editionRegistry = await EditionRegistry.new(
      this.accessControls.address,
      STARTING_EDITION,
      {from: owner}
    );

    // Create token V3
    this.token = await KnownOriginDigitalAssetV3.new(
      this.accessControls.address,
      this.editionRegistry.address,
      {from: owner}
    );

    // Set contract roles
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.token.address, {from: owner});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, contract, {from: owner});

    // enable NFT in the registry contract
    await this.editionRegistry.enableNftContract(this.token.address, {from: owner});

    // Create marketplace and enable in whitelist
    this.marketplace = await KODAV3Marketplace.new(this.accessControls.address, this.token.address, koCommission, {from: owner})
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.marketplace.address, {from: owner});
  });

  describe("two primary sales via 'buy now' purchase and re-sold on secondary", () => {

    const _0_1_ETH = ether('0.1');

    beforeEach(async () => {
      // Ensure owner is approved as this will fail if not
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // create 100 tokens to the minter
      await this.token.mintBatchEdition(100, minter, 'my-token-uri', {from: contract});

      // list edition for sale at 0.1 ETH per token
      await this.marketplace.listEdition(firstEditionTokenId, _0_1_ETH, {from: minter});
    });

    it('initial primary sale, resold on secondary', async () => {

      //////////////////////////////
      // collector A buys 1 token //
      //////////////////////////////

      const token1 = firstEditionTokenId;

      // collector A buys a token
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});

      // owner of token 1 is the collector
      expect(await this.token.ownerOf(token1)).to.be.equal(collectorA);

      // Minter now owns 9 and collector owns 1
      await validateToken.call(this, {
        tokenId: token1,
        editionId: firstEditionTokenId,
        owner: collectorA,
        ownerBalance: '1',
        creator: minter,
        creatorBalance: '99',
        size: '100',
        uri: 'my-token-uri'
      });

      //////////////////////////////
      // collector B buys 1 token //
      //////////////////////////////

      const token2 = firstEditionTokenId.add(new BN('1'));

      // collector A buys a token
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});

      // owner of token 1 is the collector
      expect(await this.token.ownerOf(token2)).to.be.equal(collectorB);

      // Minter now owns 8, collectorA owns 1, collector B owns 1
      await validateToken.call(this, {
        tokenId: token2,
        editionId: firstEditionTokenId,
        owner: collectorB,
        ownerBalance: '1',
        creator: minter,
        creatorBalance: '98',
        size: '100',
        uri: 'my-token-uri'
      });

      ///////////////////////////////////////////////////////////////
      // collector A lists token - collector B buys it - secondary //
      ///////////////////////////////////////////////////////////////

      // Ensure collector a approves marketplace
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorA});

      // listed
      await this.marketplace.listToken(token1, _0_1_ETH, {from: collectorA});

      // bought buy collector 1
      await this.marketplace.buyToken(token1, {from: collectorB, value: _0_1_ETH})

      // collector B owns both
      expect(await this.token.ownerOf(token1)).to.be.equal(collectorB);
      expect(await this.token.ownerOf(token2)).to.be.equal(collectorB);

      await validateToken.call(this, {
        tokenId: token1,
        editionId: firstEditionTokenId,
        owner: collectorB,
        ownerBalance: '2',
        creator: minter,
        creatorBalance: '98',
        size: '100',
        uri: 'my-token-uri'
      });
    });

    it('all tokens bought on primary and sold on the secondary', async () => {
      const start = _.toNumber(firstEditionTokenId);
      const end = start + 100;
      const tokenIds = _.range(start, end);

      // collector A buys all
      for (const id of tokenIds) {
        await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});
        expect(await this.token.ownerOf(id)).to.be.equal(collectorA);
      }

      // Ensure collector a approves marketplace
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorA});

      // collector A lists all and then collector B buys them all
      for (const id of tokenIds) {
        await this.marketplace.listToken(id, _0_1_ETH, {from: collectorA});
        await this.marketplace.buyToken(id, {from: collectorB, value: _0_1_ETH})
        expect(await this.token.ownerOf(id)).to.be.equal(collectorB);
      }
    }).timeout(300000);

  });


});
