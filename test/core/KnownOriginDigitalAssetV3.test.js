const {BN, constants, expectEvent, expectRevert, ether} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const web3 = require('web3');

const {expect} = require('chai');

const {shouldSupportInterfaces} = require('./SupportsInterface.behavior');
const {validateToken} = require('../test-helpers');

const ERC721ReceiverMock = artifacts.require('ERC721ReceiverMock');
const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const EditionRegistry = artifacts.require('EditionRegistry');
const KODAV3Marketplace = artifacts.require('KODAV3Marketplace');

contract('KnownOriginDigitalAssetV3 test', function (accounts) {
  const [owner, minter, koCommission, contract, collectorA, collectorB, collectorC, collectorD] = accounts;

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

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
      ZERO_ADDRESS, // no GAS token for these tests
      ZERO_ADDRESS, // no royalties address
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

  describe('ownerOf() validation', async () => {

    const editionSize = 10;

    // creator sends random token from within edition - out of sequence
    beforeEach(async () => {
      await this.token.mintBatchEdition(editionSize, owner, TOKEN_URI, {from: contract});
    });

    it('owner is correctly assigned to all tokens when minted from a batch', async () => {
      const start = _.toNumber(firstEditionTokenId);
      const end = start + _.toNumber(editionSize);
      for (const id of _.range(start, end)) {
        expect(await this.token.ownerOf(id)).to.be.equal(owner);
      }
    });

    it('batch minted - first token transfer, ownership updated accordingly', async () => {
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(owner);
      await this.token.transferFrom(owner, collectorA, firstEditionTokenId, {from: owner});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);
    });

    it('batch minted - first token transferred multiple times, ownership updated accordingly', async () => {
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(owner);

      await this.token.transferFrom(owner, collectorA, firstEditionTokenId, {from: owner});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);

      await this.token.transferFrom(collectorA, collectorB, firstEditionTokenId, {from: collectorA});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorB);

      await this.token.transferFrom(collectorB, collectorC, firstEditionTokenId, {from: collectorB});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorC);
    });

    it('batch minted - traded and sent back to the creator', async () => {
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(owner);

      await this.token.transferFrom(owner, collectorA, firstEditionTokenId, {from: owner});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);

      await this.token.transferFrom(collectorA, collectorB, firstEditionTokenId, {from: collectorA});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorB);

      // back to owner
      await this.token.transferFrom(collectorB, owner, firstEditionTokenId, {from: collectorB});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(owner);
    });

    it('batch minted - creator sends to themself the first token', async () => {
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(owner);

      await this.token.transferFrom(owner, owner, firstEditionTokenId, {from: owner});

      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(owner);
    });

    it('batch minted - creator sends to themself a random token from the edition sequence', async () => {
      const tokenId = firstEditionTokenId.add(new BN('4'));

      await this.token.transferFrom(owner, owner, tokenId, {from: owner});

      const start = _.toNumber(firstEditionTokenId);
      const end = start + _.toNumber(editionSize);
      for (const id of _.range(start, end)) {
        expect(await this.token.ownerOf(id)).to.be.equal(owner);
      }
    });

    it('batch minted - creator sends a random token to someone from the edition sequence', async () => {
      const tokenId = firstEditionTokenId.add(new BN('4'));

      await this.token.transferFrom(owner, collectorA, tokenId, {from: owner});

      const start = _.toNumber(firstEditionTokenId);
      const end = start + _.toNumber(editionSize);
      for (const id of _.range(start, end)) {
        if (new BN(id).eq(tokenId)) {
          expect(await this.token.ownerOf(id)).to.be.equal(collectorA);
        } else {
          expect(await this.token.ownerOf(id)).to.be.equal(owner);
        }
      }
    });

    it('batch minted - cannot send to zero address', async () => {
      await expectRevert(
        this.token.transferFrom(owner, ZERO_ADDRESS, firstEditionTokenId, {from: owner}),
        "ERC721_ZERO_TO_ADDRESS"
      );
    });

    it('batch minted - cannot send a token which does not exist', async () => {
      await expectRevert(
        this.token.transferFrom(owner, collectorA, thirdEditionTokenId, {from: owner}),
        "ERC721_ZERO_OWNER"
      );
    });

    it('batch minted - creator cannot send a token once its change owner', async () => {
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(owner);

      await this.token.transferFrom(owner, collectorA, firstEditionTokenId, {from: owner});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);

      await expectRevert(
        this.token.transferFrom(owner, collectorB, firstEditionTokenId, {from: owner}),
        "ERC721_OWNER_MISMATCH"
      );
    });

    it('batch minted - transfer token within edition step range but is not a valid token', async () => {
      const tokenId = firstEditionTokenId.add(new BN('10')); // only 10 tokens in this edition

      await expectRevert(
        this.token.transferFrom(owner, collectorA, tokenId, {from: owner}),
        "ERC721_ZERO_OWNER"
      );
    });

    it('batch minted - creators sends token out of sequence and receives it back - ownership updated', async () => {
      const tokenId = firstEditionTokenId.add(new BN('4'));

      await this.token.transferFrom(owner, collectorA, tokenId, {from: owner});
      await this.token.transferFrom(collectorA, owner, tokenId, {from: collectorA});

      const start = _.toNumber(firstEditionTokenId);
      const end = start + _.toNumber(editionSize);
      for (const id of _.range(start, end)) {
        expect(await this.token.ownerOf(id)).to.be.equal(owner);
      }
    });
  });

  describe('mintToken()', async () => {
    it('editionExists()', async () => {
      await this.token.mintToken(owner, TOKEN_URI, {from: contract});
      expect(await this.token.editionExists(firstEditionTokenId)).to.be.equal(true);
      expect(await this.token.exists(firstEditionTokenId)).to.be.equal(true);
    });
  });

  describe('mintConsecutiveBatchEdition()', async () => {
    it('editionExists()', async () => {
      expect(await this.token.editionExists(firstEditionTokenId)).to.be.equal(false);

      await this.token.mintConsecutiveBatchEdition(10, owner, TOKEN_URI, {from: contract});

      const start = _.toNumber(firstEditionTokenId);
      const end = start + _.toNumber(10);
      for (const id of _.range(start, end)) {
        expect(await this.token.exists(id)).to.be.equal(true);
      }

      expect(await this.token.editionExists(firstEditionTokenId)).to.be.equal(true);
    });
  });

  describe('mintBatchEdition()', async () => {
    it('editionExists()', async () => {
      expect(await this.token.editionExists(firstEditionTokenId)).to.be.equal(false);

      await this.token.mintBatchEdition(10, owner, TOKEN_URI, {from: contract});

      const start = _.toNumber(firstEditionTokenId);
      const end = start + _.toNumber(10);
      for (const id of _.range(start, end)) {
        expect(await this.token.exists(id)).to.be.equal(true);
      }

      expect(await this.token.editionExists(firstEditionTokenId)).to.be.equal(true);
    });
  });

});