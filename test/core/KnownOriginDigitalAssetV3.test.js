const {BN, constants, expectEvent, expectRevert, ether} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const KODAV3Marketplace = artifacts.require('KODAV3PrimaryMarketplace');
const SimpleIERC2981 = artifacts.require('SimpleIERC2981');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const MockERC20 = artifacts.require('MockERC20');
const MockTokenUriResolver = artifacts.require('MockTokenUriResolver');

const {parseBalanceMap} = require('../utils/parse-balance-map');

const {buildArtistMerkleInput} = require('../utils/merkle-tools');

contract('KnownOriginDigitalAssetV3 test', function (accounts) {
  const [owner, minter, koCommission, contract, collectorA, collectorB, collectorC, collectorD, collabDao, proxy] = accounts;

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = '10000';

  const ETH_ONE = ether('1');
  const ONE = new BN('1');

  const firstEditionTokenId = new BN('11000');
  const secondEditionTokenId = new BN('12000');
  const thirdEditionTokenId = new BN('13000');
  const nonExistentTokenId = new BN('99999999999');

  beforeEach(async () => {
    const legacyAccessControls = await SelfServiceAccessControls.new();
    // setup access controls
    this.accessControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

    this.merkleProof = parseBalanceMap(buildArtistMerkleInput(1, owner));

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

    this.MAX_EDITION_SIZE = await this.token.MAX_EDITION_SIZE();
    this.secondarySaleRoyalty = await this.token.secondarySaleRoyalty();
  });

  describe('mintBatchEdition() - ownerOf() validation', async () => {

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

      // fails at sending one more than batch
      await expectRevert(
        this.token.transferFrom(owner, collectorA, end + 1, {from: owner}),
        'ERC721_ZERO_OWNER'
      );
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
        'ERC721_ZERO_TO_ADDRESS'
      );
    });

    it('batch minted - cannot send a token which does not exist', async () => {
      await expectRevert(
        this.token.transferFrom(owner, collectorA, thirdEditionTokenId, {from: owner}),
        'ERC721_ZERO_OWNER'
      );
    });

    it('batch minted - creator cannot send a token once its change owner', async () => {
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(owner);

      await this.token.transferFrom(owner, collectorA, firstEditionTokenId, {from: owner});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);

      await expectRevert(
        this.token.transferFrom(owner, collectorB, firstEditionTokenId, {from: owner}),
        'ERC721_OWNER_MISMATCH'
      );
    });

    it('batch minted - transfer token within edition step range but is not a valid token', async () => {
      const tokenId = firstEditionTokenId.add(new BN('10')); // only 10 tokens in this edition

      await expectRevert(
        this.token.transferFrom(owner, collectorA, tokenId, {from: owner}),
        'ERC721_ZERO_OWNER'
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

  describe('mintConsecutiveBatchEdition() - ownerOf() validation', async () => {

    const editionSize = 10;

    // creator sends random token from within edition - out of sequence
    beforeEach(async () => {
      await this.token.mintConsecutiveBatchEdition(editionSize, owner, TOKEN_URI, {from: contract});
    });

    it('owner is correctly assigned to all tokens when minted from a batch', async () => {
      const start = _.toNumber(firstEditionTokenId);
      const end = start + _.toNumber(editionSize);
      for (const id of _.range(start, end)) {
        expect(await this.token.ownerOf(id)).to.be.equal(owner);
      }

      // fails at sending one more than batch
      await expectRevert(
        this.token.transferFrom(owner, collectorA, end + 1, {from: owner}),
        'ERC721_ZERO_OWNER'
      );
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
        'ERC721_ZERO_TO_ADDRESS'
      );
    });

    it('batch minted - cannot send a token which does not exist', async () => {
      await expectRevert(
        this.token.transferFrom(owner, collectorA, thirdEditionTokenId, {from: owner}),
        'ERC721_ZERO_OWNER'
      );
    });

    it('batch minted - creator cannot send a token once its change owner', async () => {
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(owner);

      await this.token.transferFrom(owner, collectorA, firstEditionTokenId, {from: owner});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);

      await expectRevert(
        this.token.transferFrom(owner, collectorB, firstEditionTokenId, {from: owner}),
        'ERC721_OWNER_MISMATCH'
      );
    });

    it('batch minted - transfer token within edition step range but is not a valid token', async () => {
      const tokenId = firstEditionTokenId.add(new BN('10')); // only 10 tokens in this edition

      await expectRevert(
        this.token.transferFrom(owner, collectorA, tokenId, {from: owner}),
        'ERC721_ZERO_OWNER'
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

  describe('editionURI() validation', async () => {
    const editionSize = 10;

    // creator sends random token from within edition - out of sequence
    beforeEach(async () => {
      await this.token.mintBatchEdition(editionSize, owner, TOKEN_URI, {from: contract});
    });

    it('returns URI for edition', async () => {
      const uri = await this.token.editionURI(firstEditionTokenId);
      expect(uri).to.be.equal(TOKEN_URI);
    });

    it('reverts when edition is not valid', async () => {
      await expectRevert(
        this.token.editionURI('9999999'),
        'Edition does not exist'
      );
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

    it('token does exists()', async () => {
      await this.token.mintConsecutiveBatchEdition(10, owner, TOKEN_URI, {from: contract});
      expect(await this.token.exists(firstEditionTokenId)).to.be.equal(true);
    });

    it('token does not exists()', async () => {
      expect(await this.token.exists(secondEditionTokenId)).to.be.equal(false);
    });

    it('revert if no contract role', async () => {
      await expectRevert(
        this.token.mintConsecutiveBatchEdition(10, owner, TOKEN_URI, {from: collabDao}),
        'Caller must have contract role'
      );
    });

    it('revert if edtion size to big', async () => {
      await expectRevert(
        this.token.mintConsecutiveBatchEdition(this.MAX_EDITION_SIZE.add(ONE), owner, TOKEN_URI, {from: contract}),
        'Invalid edition size'
      );
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

    it('token does exists()', async () => {
      await this.token.mintConsecutiveBatchEdition(10, owner, TOKEN_URI, {from: contract});
      expect(await this.token.exists(firstEditionTokenId)).to.be.equal(true);
    });

    it('token does not exists()', async () => {
      expect(await this.token.exists(secondEditionTokenId)).to.be.equal(false);
    });

    it('revert if no contract role', async () => {
      await expectRevert(
        this.token.mintBatchEdition(10, owner, TOKEN_URI, {from: collabDao}),
        'Caller must have contract role'
      );
    });

    it('revert if edtion size to big', async () => {
      await expectRevert(
        this.token.mintBatchEdition(this.MAX_EDITION_SIZE.add(ONE), owner, TOKEN_URI, {from: contract}),
        'Invalid edition size'
      );
    });
  });

  describe('royaltyInfo() and royaltyAndCreatorInfo()', async () => {

    describe('without registry', async () => {

      it('royaltyInfo()', async () => {
        this.receipt = await this.token.mintBatchEdition(1, collectorA, TOKEN_URI, {from: contract});
        expectEvent.inLogs(this.receipt.logs, 'Transfer', {
          from: ZERO_ADDRESS,
          to: collectorA,
          tokenId: firstEditionTokenId
        });

        const paymentAmount = '10000000'
        let res = await this.token.royaltyInfo.call(firstEditionTokenId, paymentAmount);
        expect(res._receiver).to.be.equal(collectorA);
        expect(res._royaltyAmount).to.be.bignumber.equal(this.secondarySaleRoyalty);
      });

      it('royaltyAndCreatorInfo()', async () => {
        this.receipt = await this.token.mintBatchEdition(1, collectorA, TOKEN_URI, {from: contract});
        expectEvent.inLogs(this.receipt.logs, 'Transfer', {
          from: ZERO_ADDRESS,
          to: collectorA,
          tokenId: firstEditionTokenId
        });

        let paymentAmount = '10000000'
        let res = await this.token.royaltyAndCreatorInfo.call(firstEditionTokenId, paymentAmount);
        expect(res.receiver).to.be.equal(collectorA);
        expect(res.creator).to.be.equal(collectorA);
        expect(res.royaltyAmount).to.be.bignumber.equal(this.secondarySaleRoyalty);

      });
    });

  });

  describe('getFeeRecipients() and getFeeBps()', async () => {

    describe('with proxy', async () => {
      beforeEach(async () => {


        // 12.5% to 5 dp is 1250000
        // 12.5% basis points is 1250
        this.royaltiesRegistryProxy = await SimpleIERC2981.new(
          [firstEditionTokenId, secondEditionTokenId],
          [collabDao, collectorB],
          [1250000, 1000000],
          {from: owner}
        );

        // Create token V3
        this.tokenWithRoyaltyProxy = await KnownOriginDigitalAssetV3.new(
          this.accessControls.address,
          this.royaltiesRegistryProxy.address,
          STARTING_EDITION,
          {from: owner}
        );

        // Set contract roles
        await this.accessControls.grantRole(this.CONTRACT_ROLE, this.tokenWithRoyaltyProxy.address, {from: owner});

        expect(await this.tokenWithRoyaltyProxy.royaltyRegistryActive()).to.be.equal(true);
        expect(await this.tokenWithRoyaltyProxy.royaltiesRegistryProxy()).to.be.equal(this.royaltiesRegistryProxy.address);
      });

      it('getFeeRecipients() and getFeeBps()', async () => {
        this.receipt = await this.tokenWithRoyaltyProxy.mintBatchEdition(1, collectorA, TOKEN_URI, {from: contract});
        expectEvent.inLogs(this.receipt.logs, 'Transfer', {
          from: ZERO_ADDRESS,
          to: collectorA,
          tokenId: firstEditionTokenId
        });

        let resRecip = await this.tokenWithRoyaltyProxy.getFeeRecipients.call(firstEditionTokenId);
        expect(resRecip.length).to.be.equal(1);
        expect(resRecip[0]).to.be.equal(collabDao);

        let resFees = await this.tokenWithRoyaltyProxy.getFeeBps.call(firstEditionTokenId);
        expect(resFees.length).to.be.equal(1);
        expect(resFees[0]).to.be.bignumber.equal('1250');

        await this.tokenWithRoyaltyProxy.mintBatchEdition(1, collectorA, TOKEN_URI, {from: contract});

        resRecip = await this.tokenWithRoyaltyProxy.getFeeRecipients.call(secondEditionTokenId);
        expect(resRecip.length).to.be.equal(1);
        expect(resRecip[0]).to.be.equal(collectorB);

        resFees = await this.tokenWithRoyaltyProxy.getFeeBps.call(secondEditionTokenId);
        expect(resFees.length).to.be.equal(1);
        expect(resFees[0]).to.be.bignumber.equal('1250');
      });
    });

    describe('without proxy', async () => {

      it('getFeeRecipients() and getFeeBps()', async () => {
        this.receipt = await this.token.mintBatchEdition(1, collectorA, TOKEN_URI, {from: contract});
        expectEvent.inLogs(this.receipt.logs, 'Transfer', {
          from: ZERO_ADDRESS,
          to: collectorA,
          tokenId: firstEditionTokenId
        });

        let resRecip = await this.token.getFeeRecipients.call(firstEditionTokenId);
        expect(resRecip.length).to.be.equal(1);
        expect(resRecip[0]).to.be.equal(collectorA);

        resFees = await this.tokenWithRoyaltyProxy.getFeeBps.call(firstEditionTokenId);
        expect(resFees.length).to.be.equal(1);
        expect(resFees[0]).to.be.bignumber.equal('1250'); // 12.5% - industry leading!
      });
    });
  });

  describe('facilitateNextPrimarySale()', async () => {

    describe('without registry', async () => {

      it('facilitateNextPrimarySale()', async () => {
        this.receipt = await this.token.mintBatchEdition(1, collectorA, TOKEN_URI, {from: contract});
        expectEvent.inLogs(this.receipt.logs, 'Transfer', {
          from: ZERO_ADDRESS,
          to: collectorA,
          tokenId: firstEditionTokenId
        });

        let res = await this.token.facilitateNextPrimarySale.call(firstEditionTokenId);
        expect(res.receiver).to.be.equal(collectorA);
        expect(res.creator).to.be.equal(collectorA); // owner
        expect(res.tokenId).to.be.bignumber.equal(firstEditionTokenId); // from getNextAvailablePrimarySaleToken
      });

      it('facilitateNextPrimarySale() with token batch', async () => {
        this.receipt = await this.token.mintBatchEdition(3, collectorA, TOKEN_URI, {from: contract});
        expectEvent.inLogs(this.receipt.logs, 'Transfer', {
          from: ZERO_ADDRESS,
          to: collectorA,
          tokenId: firstEditionTokenId
        });

        let res = await this.token.facilitateNextPrimarySale.call(firstEditionTokenId);
        expect(res.receiver).to.be.equal(collectorA);
        expect(res.creator).to.be.equal(collectorA); // owner
        expect(res.tokenId).to.be.bignumber.equal(firstEditionTokenId); // from getNextAvailablePrimarySaleToken

        await this.token.transferFrom(collectorA, collectorB, firstEditionTokenId, {from: collectorA});

        res = await this.token.facilitateNextPrimarySale.call(firstEditionTokenId);
        expect(res.receiver).to.be.equal(collectorA);
        expect(res.creator).to.be.equal(collectorA); // owner
        expect(res.tokenId).to.be.bignumber.equal(firstEditionTokenId.add(ONE)); // from getNextAvailablePrimarySaleToken
      });
    });

  });

  describe('getNextAvailablePrimarySaleToken()', async () => {

    it('single mint', async () => {
      this.receipt = await this.token.mintBatchEdition(1, collectorA, TOKEN_URI, {from: contract});
      expectEvent.inLogs(this.receipt.logs, 'Transfer', {
        from: ZERO_ADDRESS,
        to: collectorA,
        tokenId: firstEditionTokenId
      });

      let tokenId = await this.token.getNextAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(firstEditionTokenId);
    });

    it('batch mint', async () => {
      this.receipt = await this.token.mintBatchEdition(3, collectorA, TOKEN_URI, {from: contract});
      expectEvent.inLogs(this.receipt.logs, 'Transfer', {
        from: ZERO_ADDRESS,
        to: collectorA,
        tokenId: firstEditionTokenId
      });

      let tokenId = await this.token.getNextAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(firstEditionTokenId);

      await this.token.transferFrom(collectorA, collectorB, firstEditionTokenId, {from: collectorA});

      tokenId = await this.token.getNextAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(firstEditionTokenId.add(ONE));

      await this.token.transferFrom(collectorA, collectorB, firstEditionTokenId.add(ONE), {from: collectorA});

      tokenId = await this.token.getNextAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(firstEditionTokenId.add(ONE).add(ONE));

      await this.token.transferFrom(collectorA, collectorB, firstEditionTokenId.add(ONE).add(ONE), {from: collectorA});

      // exceeds tokens and reverts
      await expectRevert(
        this.token.getNextAvailablePrimarySaleToken.call(firstEditionTokenId),
        'No tokens left on the primary market'
      );
    });

    it('batch consecutive mint', async () => {
      this.receipt = await this.token.mintConsecutiveBatchEdition(3, collectorA, TOKEN_URI, {from: contract});
      //    event ConsecutiveTransfer(uint256 indexed fromTokenId, uint256 toTokenId, address indexed fromAddress, address indexed toAddress);
      expectEvent.inLogs(this.receipt.logs, 'ConsecutiveTransfer', {
        fromTokenId: firstEditionTokenId,
        toTokenId: firstEditionTokenId.add(new BN(3)),
        fromAddress: ZERO_ADDRESS,
        toAddress: collectorA
      });

      let tokenId = await this.token.getNextAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(firstEditionTokenId);

      await this.token.transferFrom(collectorA, collectorB, firstEditionTokenId, {from: collectorA});

      tokenId = await this.token.getNextAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(firstEditionTokenId.add(ONE));

      await this.token.transferFrom(collectorA, collectorB, firstEditionTokenId.add(ONE), {from: collectorA});

      tokenId = await this.token.getNextAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(firstEditionTokenId.add(ONE).add(ONE));

      await this.token.transferFrom(collectorA, collectorB, firstEditionTokenId.add(ONE).add(ONE), {from: collectorA});
    });

    it('reverts if no edition ID found', async () => {
      await expectRevert(
        this.token.getNextAvailablePrimarySaleToken.call(nonExistentTokenId),
        'No tokens left on the primary market'
      );
    });

    it('reverts when exhausted', async () => {
      this.receipt = await this.token.mintBatchEdition(2, collectorA, TOKEN_URI, {from: contract});
      await expectEvent.inLogs(this.receipt.logs, 'Transfer', {
        from: ZERO_ADDRESS,
        to: collectorA,
        tokenId: firstEditionTokenId
      });

      let tokenId = await this.token.getNextAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(firstEditionTokenId);

      await this.token.transferFrom(collectorA, collectorB, firstEditionTokenId, {from: collectorA});

      tokenId = await this.token.getNextAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(firstEditionTokenId.add(ONE));

      await this.token.transferFrom(collectorA, collectorB, firstEditionTokenId.add(ONE), {from: collectorA});

      await expectRevert(
        this.token.getNextAvailablePrimarySaleToken.call(firstEditionTokenId),
        'No tokens left on the primary market'
      );
    });

    it('get from middle (if gifting from end)', async () => {
      this.receipt = await this.token.mintBatchEdition(3, collectorA, TOKEN_URI, {from: contract});
      await expectEvent.inLogs(this.receipt.logs, 'Transfer', {
        from: ZERO_ADDRESS,
        to: collectorA,
        tokenId: firstEditionTokenId
      });

      await this.token.transferFrom(collectorA, collectorB, firstEditionTokenId, {from: collectorA}); // sell one

      await this.token.transferFrom(collectorA, collectorB, firstEditionTokenId.add(ONE).add(ONE), {from: collectorA}); // gift one

      let tokenId = await this.token.getNextAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(firstEditionTokenId.add(ONE)); // 2nd token
    });

    it('sell via primary then get sent the token back', async () => {
      this.receipt = await this.token.mintBatchEdition(3, collectorA, TOKEN_URI, {from: contract});
      await expectEvent.inLogs(this.receipt.logs, 'Transfer', {
        from: ZERO_ADDRESS,
        to: collectorA,
        tokenId: firstEditionTokenId
      });

      await this.token.transferFrom(collectorA, collectorB, firstEditionTokenId, {from: collectorA}); // sell one
      await this.token.transferFrom(collectorB, collectorA, firstEditionTokenId, {from: collectorB}); // send back

      let tokenId = await this.token.getNextAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(firstEditionTokenId.add(ONE)); // 2nd token
    });

    it('reverts when selling via primary then burning to zero address', async () => {
      this.receipt = await this.token.mintBatchEdition(3, collectorA, TOKEN_URI, {from: contract});
      await expectEvent.inLogs(this.receipt.logs, 'Transfer', {
        from: ZERO_ADDRESS,
        to: collectorA,
        tokenId: firstEditionTokenId
      });

      // covering this here to prove you can not reset the zero address and go back to a token already with a primary sale
      await this.token.transferFrom(collectorA, collectorB, firstEditionTokenId, {from: collectorA}); // sell one
      await expectRevert(this.token.transferFrom(collectorB, ZERO_ADDRESS, firstEditionTokenId, {from: collectorB}),
        'ERC721_ZERO_TO_ADDRESS'
      ); // send back
    });
  });

  describe('getReverseAvailablePrimarySaleToken()', async () => {

    it('single mint', async () => {
      this.receipt = await this.token.mintBatchEdition(1, collectorA, TOKEN_URI, {from: contract});
      expectEvent.inLogs(this.receipt.logs, 'Transfer', {
        from: ZERO_ADDRESS,
        to: collectorA,
        tokenId: firstEditionTokenId
      });

      let tokenId = await this.token.getReverseAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(firstEditionTokenId);
    });

    it('batch mint', async () => {
      this.receipt = await this.token.mintBatchEdition(3, collectorA, TOKEN_URI, {from: contract});
      expectEvent.inLogs(this.receipt.logs, 'Transfer', {
        from: ZERO_ADDRESS,
        to: collectorA,
        tokenId: firstEditionTokenId
      });

      let tokenId = await this.token.getReverseAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(new BN(firstEditionTokenId).add(ONE).add(ONE)); // highest
      await this.token.transferFrom(collectorA, collectorB, tokenId, {from: collectorA});

      tokenId = await this.token.getReverseAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(new BN(firstEditionTokenId).add(ONE));  // middle
      await this.token.transferFrom(collectorA, collectorB, tokenId, {from: collectorA});

      tokenId = await this.token.getReverseAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(new BN(firstEditionTokenId)); // low
      await this.token.transferFrom(collectorA, collectorB, tokenId, {from: collectorA});

      // exceeds tokens and reverts
      await expectRevert(
        this.token.getReverseAvailablePrimarySaleToken.call(firstEditionTokenId),
        'No tokens left on the primary market'
      );
    });

    it('batch consecutive mint', async () => {
      this.receipt = await this.token.mintConsecutiveBatchEdition(3, collectorA, TOKEN_URI, {from: contract});
      //    event ConsecutiveTransfer(uint256 indexed fromTokenId, uint256 toTokenId, address indexed fromAddress, address indexed toAddress);
      expectEvent.inLogs(this.receipt.logs, 'ConsecutiveTransfer', {
        fromTokenId: firstEditionTokenId,
        toTokenId: firstEditionTokenId.add(new BN(3)),
        fromAddress: ZERO_ADDRESS,
        toAddress: collectorA
      });

      let tokenId = await this.token.getReverseAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(new BN(firstEditionTokenId).add(ONE).add(ONE)); // highest
      await this.token.transferFrom(collectorA, collectorB, tokenId, {from: collectorA});

      tokenId = await this.token.getReverseAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(new BN(firstEditionTokenId).add(ONE));  // middle
      await this.token.transferFrom(collectorA, collectorB, tokenId, {from: collectorA});

      tokenId = await this.token.getReverseAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(new BN(firstEditionTokenId)); // low
      await this.token.transferFrom(collectorA, collectorB, tokenId, {from: collectorA});

      // exceeds tokens and reverts
      await expectRevert(
        this.token.getReverseAvailablePrimarySaleToken.call(firstEditionTokenId),
        'No tokens left on the primary market'
      );
    });

    it('reverts if no edition ID found', async () => {
      await expectRevert(
        this.token.getReverseAvailablePrimarySaleToken.call(nonExistentTokenId),
        'No tokens left on the primary market'
      );
    });

    it('reverts when exhausted', async () => {
      this.receipt = await this.token.mintBatchEdition(2, collectorA, TOKEN_URI, {from: contract});
      await expectEvent.inLogs(this.receipt.logs, 'Transfer', {
        from: ZERO_ADDRESS,
        to: collectorA,
        tokenId: firstEditionTokenId
      });

      let tokenId = await this.token.getReverseAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(new BN(firstEditionTokenId).add(ONE)); // highest
      await this.token.transferFrom(collectorA, collectorB, tokenId, {from: collectorA});

      tokenId = await this.token.getReverseAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(new BN(firstEditionTokenId));  // lowest
      await this.token.transferFrom(collectorA, collectorB, tokenId, {from: collectorA});

      await expectRevert(
        this.token.getReverseAvailablePrimarySaleToken.call(firstEditionTokenId),
        'No tokens left on the primary market'
      );
    });

    it('get from middle (if gifting from end)', async () => {
      this.receipt = await this.token.mintBatchEdition(3, collectorA, TOKEN_URI, {from: contract});
      await expectEvent.inLogs(this.receipt.logs, 'Transfer', {
        from: ZERO_ADDRESS,
        to: collectorA,
        tokenId: firstEditionTokenId
      });

      await this.token.transferFrom(collectorA, collectorB, new BN(firstEditionTokenId).add(ONE).add(ONE), {from: collectorA}); // gift last one
      await this.token.transferFrom(collectorA, collectorB, new BN(firstEditionTokenId).add(ONE), {from: collectorA}); // gift 2nd

      let tokenId = await this.token.getReverseAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(firstEditionTokenId); // 1st token found
    });

    it('sell via primary then get sent the token back', async () => {
      this.receipt = await this.token.mintBatchEdition(3, collectorA, TOKEN_URI, {from: contract});
      await expectEvent.inLogs(this.receipt.logs, 'Transfer', {
        from: ZERO_ADDRESS,
        to: collectorA,
        tokenId: firstEditionTokenId
      });

      await this.token.transferFrom(collectorA, collectorB, new BN(firstEditionTokenId).add(ONE).add(ONE), {from: collectorA}); // sell one
      await this.token.transferFrom(collectorB, collectorA, new BN(firstEditionTokenId).add(ONE).add(ONE), {from: collectorB}); // send back

      let tokenId = await this.token.getReverseAvailablePrimarySaleToken.call(firstEditionTokenId);
      expect(tokenId).to.be.bignumber.equal(firstEditionTokenId.add(ONE)); // 2nd token
    });

    it('reverts when selling via primary then burning to zero address', async () => {
      this.receipt = await this.token.mintBatchEdition(3, collectorA, TOKEN_URI, {from: contract});
      await expectEvent.inLogs(this.receipt.logs, 'Transfer', {
        from: ZERO_ADDRESS,
        to: collectorA,
        tokenId: firstEditionTokenId
      });

      // covering this here to prove you can not reset the zero address and go back to a token already with a primary sale
      await this.token.transferFrom(collectorA, collectorB, firstEditionTokenId, {from: collectorA}); // sell one
      await expectRevert(this.token.transferFrom(collectorB, ZERO_ADDRESS, firstEditionTokenId, {from: collectorB}),
        'ERC721_ZERO_TO_ADDRESS'
      ); // send back
    });
  });

  describe('hadPrimarySaleOfToken()', async () => {
    it('should assert hadPrimarySaleOfToken()', async () => {
      await this.token.mintBatchEdition(1, owner, TOKEN_URI, {from: contract});
      expect(await this.token.hadPrimarySaleOfToken(firstEditionTokenId)).to.be.equal(false);

      await this.token.transferFrom(owner, collectorA, firstEditionTokenId, {from: owner});
      expect(await this.token.hadPrimarySaleOfToken(firstEditionTokenId)).to.be.equal(true);
    });
  });

  describe('reportEditionId()', async () => {
    it('should report edition', async () => {
      await this.token.reportEditionId(STARTING_EDITION, true, {from: owner});
      expect(await this.token.reportedEditionIds(STARTING_EDITION)).to.be.equal(true);

      await this.token.reportEditionId(STARTING_EDITION, false, {from: owner});
      expect(await this.token.reportedEditionIds(STARTING_EDITION)).to.be.equal(false);
    });

    it('revert if not admin', async () => {
      await expectRevert(
        this.token.reportEditionId(STARTING_EDITION, true, {from: collabDao}),
        'Caller must have admin role'
      );
    });
  });

  describe('reportArtistAccount()', async () => {
    it('should report edition', async () => {
      await this.token.reportArtistAccount(minter, true, {from: owner});
      expect(await this.token.reportedArtistAccounts(minter)).to.be.equal(true);

      await this.token.reportArtistAccount(minter, false, {from: owner});
      expect(await this.token.reportedArtistAccounts(minter)).to.be.equal(false);
    });

    it('revert if not admin', async () => {
      await expectRevert(
        this.token.reportArtistAccount(minter, true, {from: collabDao}),
        'Caller must have admin role'
      );
    });
  });

  describe('lockInAdditionalMetaData()', async () => {
    it('should allow proxy to set', async () => {
      await this.accessControls.setVerifiedArtistProxy(
        proxy,
        this.merkleProof.claims[owner].index,
        this.merkleProof.claims[owner].proof,
        {from: owner}
      );

      await this.token.mintBatchEdition(1, owner, TOKEN_URI, {from: contract});
      await this.token.lockInAdditionalMetaData(firstEditionTokenId, 'hello', {from: proxy});
      expect(await this.token.sealedEditionMetaData(firstEditionTokenId)).to.be.equal('hello');
    })

    it('should lockInAdditionalMetaData()', async () => {
      await this.token.mintBatchEdition(1, owner, TOKEN_URI, {from: contract});
      await this.token.lockInAdditionalMetaData(firstEditionTokenId, 'hello', {from: owner});
      expect(await this.token.sealedEditionMetaData(firstEditionTokenId)).to.be.equal('hello');
    });

    it('should editionAdditionalMetaData()', async () => {
      await this.token.mintBatchEdition(1, owner, TOKEN_URI, {from: contract});
      await this.token.lockInAdditionalMetaData(firstEditionTokenId, 'hello', {from: owner});
      expect(await this.token.editionAdditionalMetaData(firstEditionTokenId)).to.be.equal('hello');
    });

    it('should editionAdditionalMetaDataForToken()', async () => {
      await this.token.mintBatchEdition(1, owner, TOKEN_URI, {from: contract});
      await this.token.lockInAdditionalMetaData(firstEditionTokenId, 'hello', {from: owner});
      expect(await this.token.editionAdditionalMetaDataForToken(firstEditionTokenId)).to.be.equal('hello');
    });

    it('revert if not creator', async () => {
      const {logs} = await this.token.mintBatchEdition(1, owner, TOKEN_URI, {from: contract});
      expectEvent.inLogs(logs, 'Transfer', {
        from: ZERO_ADDRESS,
        to: owner,
        tokenId: firstEditionTokenId
      });
      await expectRevert(
        this.token.lockInAdditionalMetaData(firstEditionTokenId, 'hello', {from: collabDao}),
        'Unable to set when not creator'
      );
    });

    it('revert if set twice', async () => {
      const {logs} = await this.token.mintBatchEdition(1, owner, TOKEN_URI, {from: contract});
      expectEvent.inLogs(logs, 'Transfer', {
        from: ZERO_ADDRESS,
        to: owner,
        tokenId: firstEditionTokenId
      });
      await this.token.lockInAdditionalMetaData(firstEditionTokenId, 'hello', {from: owner});
      await expectRevert(
        this.token.lockInAdditionalMetaData(firstEditionTokenId, 'hello again', {from: owner}),
        'can only be set once'
      );
    });
  });

  describe('lockInAdditionalTokenMetaData()', async () => {
    it('should lockInAdditionalMetaData()', async () => {
      await this.token.mintBatchEdition(1, owner, TOKEN_URI, {from: contract});
      await this.token.lockInAdditionalTokenMetaData(firstEditionTokenId, 'hello', {from: owner});
      expect(await this.token.sealedTokenMetaData(firstEditionTokenId)).to.be.equal('hello');
    });

    it('should editionAdditionalMetaData()', async () => {
      await this.token.mintBatchEdition(1, owner, TOKEN_URI, {from: contract});
      await this.token.lockInAdditionalTokenMetaData(firstEditionTokenId, 'hello', {from: owner});
      expect(await this.token.tokenAdditionalMetaData(firstEditionTokenId)).to.be.equal('hello');
    });

    it('revert if not creator', async () => {
      const {logs} = await this.token.mintBatchEdition(1, owner, TOKEN_URI, {from: contract});
      expectEvent.inLogs(logs, 'Transfer', {
        from: ZERO_ADDRESS,
        to: owner,
        tokenId: firstEditionTokenId
      });
      await expectRevert(
        this.token.lockInAdditionalTokenMetaData(firstEditionTokenId, 'hello', {from: collabDao}),
        'Unable to set when not owner'
      );
    });

    it('revert if set twice', async () => {
      const {logs} = await this.token.mintBatchEdition(1, owner, TOKEN_URI, {from: contract});
      expectEvent.inLogs(logs, 'Transfer', {
        from: ZERO_ADDRESS,
        to: owner,
        tokenId: firstEditionTokenId
      });
      await this.token.lockInAdditionalTokenMetaData(firstEditionTokenId, 'hello', {from: owner});
      await expectRevert(
        this.token.lockInAdditionalTokenMetaData(firstEditionTokenId, 'hello again', {from: owner}),
        'can only be set once'
      );
    });
  });

  describe('ability to gift a token from an edition', async () => {

    const editionSize = 10;

    beforeEach(async () => {
      await this.token.mintBatchEdition(editionSize, owner, TOKEN_URI, {from: contract});

      const start = _.toNumber(firstEditionTokenId);
      const end = start + _.toNumber(editionSize);
      for (const id of _.range(start, end)) {
        expect(await this.token.ownerOf(id)).to.be.equal(owner);
      }
    });

    it('can transfer/gift from the end of an edition on primary', async () => {
      const tokenId = _.toNumber(firstEditionTokenId) + _.toNumber(editionSize) - 1;
      await this.token.transferFrom(owner, collectorA, tokenId, {from: owner});
      expect(await this.token.ownerOf(tokenId)).to.be.equal(collectorA);
    });

    it('can transfer/gift from the middle of an edition on primary', async () => {
      const tokenId = _.toNumber(firstEditionTokenId) + 5;
      await this.token.transferFrom(owner, collectorA, tokenId, {from: owner});
      expect(await this.token.ownerOf(tokenId)).to.be.equal(collectorA);
    });

    it('can transfer/gift from the start an edition on primary', async () => {
      await this.token.transferFrom(owner, collectorA, firstEditionTokenId, {from: owner});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);
    });

    it('can transfer/gift on secondary market from new owner', async () => {
      await this.token.transferFrom(owner, collectorA, firstEditionTokenId, {from: owner});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);

      await this.token.transferFrom(collectorA, collectorB, firstEditionTokenId, {from: collectorA});
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorB);
    });
  });

  describe('batchTransferFrom()', async () => {

    const editionSize = 10;

    beforeEach(async () => {
      await this.token.mintBatchEdition(editionSize, owner, TOKEN_URI, {from: contract});

      const start = _.toNumber(firstEditionTokenId);
      const end = start + _.toNumber(editionSize);
      for (const id of _.range(start, end)) {
        expect(await this.token.ownerOf(id)).to.be.equal(owner);
      }
    });

    it('can transfer a selection of primary tokens', async () => {
      const tokensToMove = [firstEditionTokenId, firstEditionTokenId.add(new BN('1')), firstEditionTokenId.add(new BN('2'))];
      await this.token.batchTransferFrom(owner, collectorA, tokensToMove);
      for (const id of tokensToMove) {
        expect(await this.token.ownerOf(id)).to.be.equal(collectorA);
      }
    });

    it('can transfer a selection of secondary tokens', async () => {
      const tokensToMove = [firstEditionTokenId, firstEditionTokenId.add(new BN('1')), firstEditionTokenId.add(new BN('2'))];
      await this.token.batchTransferFrom(owner, collectorA, tokensToMove, {from: owner});
      for (const id of tokensToMove) {
        expect(await this.token.ownerOf(id)).to.be.equal(collectorA);
      }

      await this.token.batchTransferFrom(collectorA, collectorB, tokensToMove, {from: collectorA});
      for (const id of tokensToMove) {
        expect(await this.token.ownerOf(id)).to.be.equal(collectorB);
      }
    });

    it('can transfer a selection of primary & secondary tokens', async () => {
      // collector A mints a batch - sends a few to the owner account
      await this.token.mintBatchEdition(editionSize, collectorA, TOKEN_URI, {from: contract});
      const collectorATokensToMove = [
        secondEditionTokenId,
        secondEditionTokenId.add(new BN('1')),
        secondEditionTokenId.add(new BN('2'))
      ];

      // send 3 to "owner"
      await this.token.batchTransferFrom(collectorA, owner, collectorATokensToMove, {from: collectorA});
      for (const id of collectorATokensToMove) {
        expect(await this.token.ownerOf(id)).to.be.equal(owner);
      }

      // Owner mints some more
      const ownerTokens = [firstEditionTokenId, firstEditionTokenId.add(new BN('1')), firstEditionTokenId.add(new BN('2'))];
      const tokensToMove = [
        ...ownerTokens,
        ...collectorATokensToMove
      ];
      await this.token.batchTransferFrom(owner, collectorB, tokensToMove, {from: owner});

      // Check B owners all 6 tokens
      for (const id of tokensToMove) {
        expect(await this.token.ownerOf(id)).to.be.equal(collectorB);
      }
    });

    it('reverts if one token in the batch is not owned byt the caller', async () => {
      const collectorATokensToMove = [
        firstEditionTokenId,
        secondEditionTokenId.add(new BN('1')),
        secondEditionTokenId.add(new BN('2'))
      ];

      await expectRevert(
        this.token.batchTransferFrom(collectorA, owner, collectorATokensToMove, {from: collectorA}),
        'ERC721_OWNER_MISMATCH'
      );
    });
  });

  describe('consecutiveBatchTransferFrom()', async () => {
    const editionSize = 10;

    beforeEach(async () => {
      await this.token.mintBatchEdition(editionSize, owner, TOKEN_URI, {from: contract});

      const start = _.toNumber(firstEditionTokenId);
      const end = start + _.toNumber(editionSize);
      for (const id of _.range(start, end)) {
        expect(await this.token.ownerOf(id)).to.be.equal(owner);
      }
    });

    it('can transfer a selection of primary tokens', async () => {
      const firstToken = firstEditionTokenId;
      const lastToken = firstEditionTokenId.add(new BN('2'));

      const receipt = await this.token.consecutiveBatchTransferFrom(owner, collectorA, firstToken, lastToken, {from: owner});
      expectEvent.inLogs(receipt.logs, 'ConsecutiveTransfer', {
        fromTokenId: firstToken,
        toTokenId: lastToken,
        fromAddress: owner,
        toAddress: collectorA
      });

      const tokensToMove = [firstEditionTokenId, firstEditionTokenId.add(new BN('1')), lastToken];
      for (const id of tokensToMove) {
        expect(await this.token.ownerOf(id)).to.be.equal(collectorA);
      }
    });

    it('can transfer a selection of secondary tokens', async () => {
      const firstToken = firstEditionTokenId;
      const lastToken = firstEditionTokenId.add(new BN('2'));

      const tokensToMove = [firstEditionTokenId, firstEditionTokenId.add(new BN('1')), lastToken];

      await this.token.consecutiveBatchTransferFrom(owner, collectorA, firstToken, lastToken, {from: owner});
      for (const id of tokensToMove) {
        expect(await this.token.ownerOf(id)).to.be.equal(collectorA);
      }

      const receipt = await this.token.consecutiveBatchTransferFrom(collectorA, collectorB, firstToken, lastToken, {from: collectorA});
      for (const id of tokensToMove) {
        expect(await this.token.ownerOf(id)).to.be.equal(collectorB);
      }

      expectEvent.inLogs(receipt.logs, 'ConsecutiveTransfer', {
        fromTokenId: firstToken,
        toTokenId: lastToken,
        fromAddress: collectorA,
        toAddress: collectorB
      });
    });

    it('reverts if a token does not exist', async () => {
      await expectRevert(
        this.token.consecutiveBatchTransferFrom(owner, collectorA, firstEditionTokenId, secondEditionTokenId, {from: owner}),
        'ERC721_ZERO_OWNER'
      );
    });
  });

  describe('withdrawStuckTokens()', async () => {
    it('can recover stuck tokens if admin', async () => {
      const erc20 = await MockERC20.new({from: owner});
      await erc20.transfer(this.token.address, '1000', {from: owner});

      expect(await erc20.balanceOf(this.token.address)).to.be.bignumber.equal('1000');
      expect(await erc20.balanceOf(minter)).to.be.bignumber.equal('0');

      await this.token.withdrawStuckTokens(erc20.address, '1000', minter, {from: owner});

      expect(await erc20.balanceOf(this.token.address)).to.be.bignumber.equal('0');
      expect(await erc20.balanceOf(minter)).to.be.bignumber.equal('1000');
    });

    it('reverts if not admin', async () => {
      await expectRevert(
        this.token.withdrawStuckTokens(this.token.address, '1000', minter, {from: collectorA}),
        'Caller must have admin role'
      );
    });
  });

  describe('updateSecondaryRoyalty()', async () => {
    it('can update if admin', async () => {
      expect(await this.token.secondarySaleRoyalty()).to.be.bignumber.equal('1250000');
      const receipt = await this.token.updateSecondaryRoyalty('99999', {from: owner});

      expectEvent.inLogs(receipt.logs, 'AdminUpdateSecondaryRoyalty', {
        _secondarySaleRoyalty: '99999'
      });

      expect(await this.token.secondarySaleRoyalty()).to.be.bignumber.equal('99999');
    });

    it('reverts if not admin', async () => {
      await expectRevert(
        this.token.updateSecondaryRoyalty('10000', {from: collectorA}),
        'Caller must have admin role'
      );
    });
  });

  describe('hasRoyalties()', async () => {

    beforeEach(async () => {
      await this.token.mintBatchEdition(1, owner, TOKEN_URI, {from: contract});
    });

    it('fails if the token does not exist', async () => {
      await expectRevert(
        this.token.hasRoyalties('99999'),
        'Edition does not exist',
      );
    });

    it('when secondary sale royalties set, KO reports royalties', async () => {
      expect(await this.token.hasRoyalties(firstEditionTokenId)).to.be.equal(true);
    });

    it('when secondary sale royalties NOT set, KO reports royalties', async () => {
      await this.token.updateSecondaryRoyalty('0', {from: owner});
      expect(await this.token.hasRoyalties(firstEditionTokenId)).to.be.equal(false);
    });
  });

  describe('getAllUnsoldTokenIdsForEdition() and transfering to the dead address', () => {
    const editionSize = 50
    const edition2Size = 100

    beforeEach(async () => {
      await this.token.mintBatchEdition(editionSize, owner, TOKEN_URI, {from: contract})
      await this.token.mintBatchEdition(edition2Size, owner, TOKEN_URI, {from: contract})
    })

    it('Returns the correct list of unsold tokens when no tokens sold for first edition', async () => {
      const expectedTokenIdsFirstEdition = Array(editionSize).fill(0).map((val, idx) => (11000 + idx).toString())

      const unsoldTokenIdsFirstEdition = (await this.token.getAllUnsoldTokenIdsForEdition(firstEditionTokenId)).map(unsoldTokenId => unsoldTokenId.toString())

      expect(unsoldTokenIdsFirstEdition).to.be.deep.equal(expectedTokenIdsFirstEdition)
    })

    it('Returns the correct list of unsold tokens when no tokens sold for second edition', async () => {
      const expectedTokenIdsSecondEdition = Array(edition2Size).fill(0).map((val, idx) => (12000 + idx).toString())

      const unsoldTokenIdsSecondEdition = (await this.token.getAllUnsoldTokenIdsForEdition(secondEditionTokenId)).map(unsoldTokenId => unsoldTokenId.toString())

      expect(unsoldTokenIdsSecondEdition).to.be.deep.equal(expectedTokenIdsSecondEdition)
    })

    it('Transfers all unsold tokens to the dead address', async () => {
      await this.token.batchTransferFrom(owner, '0x000000000000000000000000000000000000dEaD', await this.token.getAllUnsoldTokenIdsForEdition(firstEditionTokenId), {from: owner})
    })
  })

  describe('hasMadePrimarySale()', () => {
    const editionSize = 10

    beforeEach(async () => {
      await this.token.mintBatchEdition(editionSize, owner, TOKEN_URI, {from: contract})
    })

    it('Should return false when no tokens in edition sold', async () => {
      const hasMadePrimarySale = await this.token.hasMadePrimarySale(firstEditionTokenId)
      expect(hasMadePrimarySale).to.be.false
    })

    it('Returns true when at least 1 token in edition is sold', async () => {
      await this.token.transferFrom(owner, collectorA, firstEditionTokenId, {from: owner})

      const hasMadePrimarySale = await this.token.hasMadePrimarySale(firstEditionTokenId)
      expect(hasMadePrimarySale).to.be.true
    })
  })

  describe('updateURIIfNoSaleMade()', () => {
    const editionSize = 10

    beforeEach(async () => {
      await this.token.mintBatchEdition(editionSize, owner, TOKEN_URI, {from: contract})
    })

    it('Updated the URI when primary sale not made on edition', async () => {
      const uri = 'random'
      const { receipt } = await this.token.updateURIIfNoSaleMade(firstEditionTokenId, uri, {from: owner})

      await expectEvent(receipt, 'EditionURIUpdated', {
        _editionId: firstEditionTokenId
      })

      expect(await this.token.tokenURI(firstEditionTokenId)).to.be.equal(uri)
    })

    it('Reverts when edition does not exist', async () => {
      await expectRevert(
        this.token.updateURIIfNoSaleMade(secondEditionTokenId, 'random', {from: owner}),
        "Not creator"
      )
    })

    it('Reverts when not creator of edition', async () => {
      await expectRevert(
        this.token.updateURIIfNoSaleMade(firstEditionTokenId, 'random', {from: contract}),
        "Not creator"
      )
    })

    it('Reverts when edition has had a primary sale', async () => {
      await this.token.transferFrom(owner, collectorA, firstEditionTokenId, {from: owner})

      await expectRevert(
        this.token.updateURIIfNoSaleMade(firstEditionTokenId, 'random', {from: owner}),
        "Invalid Edition state"
      )
    })

    it('Reverts once a resolver is set and defined', async () => {
      // Create a new resolver
      const tokenUriResolver = await MockTokenUriResolver.new({from: owner});

      // Set it on the NFT
      expect(await this.token.tokenUriResolverActive()).to.be.equal(false);
      await this.token.setTokenUriResolver(tokenUriResolver.address, {from: owner});
      expect(await this.token.tokenUriResolverActive()).to.be.equal(true);

      // Override an edition
      await tokenUriResolver.setEditionUri(firstEditionTokenId, 'my-new-hash');

      // try set it and expect failure
      await expectRevert(
        this.token.updateURIIfNoSaleMade(firstEditionTokenId, 'random', {from: owner}),
        "Invalid Edition state"
      )
    })
  })

  describe('toggleEditionSalesDisabled()', () => {
    const editionSize = 10

    beforeEach(async () => {
      await this.token.mintBatchEdition(editionSize, minter, TOKEN_URI, {from: contract})
    })

    it('Flips the toggle if creator', async () => {
      const {receipt} = await this.token.toggleEditionSalesDisabled(firstEditionTokenId, {from: minter})

      await expectEvent(receipt, 'EditionSalesDisabledToggled', {
        _editionId: firstEditionTokenId,
        _oldValue: false,
        _newValue: true
      })
    })

    it('Flips the toggle if admin', async () => {
      const {receipt} = await this.token.toggleEditionSalesDisabled(firstEditionTokenId, {from: owner})

      await expectEvent(receipt, 'EditionSalesDisabledToggled', {
        _editionId: firstEditionTokenId,
        _oldValue: false,
        _newValue: true
      })
    })

    it('Can flip the toggle off after turning on', async () => {
      const tx1 = await this.token.toggleEditionSalesDisabled(firstEditionTokenId, {from: owner})

      await expectEvent(tx1.receipt, 'EditionSalesDisabledToggled', {
        _editionId: firstEditionTokenId,
        _oldValue: false,
        _newValue: true
      })

      const tx2 = await this.token.toggleEditionSalesDisabled(firstEditionTokenId, {from: owner})

      await expectEvent(tx2.receipt, 'EditionSalesDisabledToggled', {
        _editionId: firstEditionTokenId,
        _oldValue: true,
        _newValue: false
      })
    })

    it('Reverts when edition does not exist', async () => {
      await expectRevert(
        this.token.toggleEditionSalesDisabled(secondEditionTokenId, {from: owner}),
        "Edition does not exist"
      )
    })

    it('Reverts when not creator or platform', async () => {
      await expectRevert(
        this.token.toggleEditionSalesDisabled(firstEditionTokenId, {from: collectorA}),
        "Only creator or platform admin"
      )
    })
  })

  describe('lockInUnlockableContent()', () => {
    it('Can call as creator', async () => {
      await this.token.mintBatchEdition(10, owner, TOKEN_URI, {from: contract})

      const content = 'random'
      const {receipt} = await this.token.lockInUnlockableContent(firstEditionTokenId, content, {from: owner})
      await expectEvent(receipt, 'AdditionalEditionUnlockableSet', {
        _editionId: firstEditionTokenId
      })

      expect(await this.token.additionalEditionUnlockableSlot(firstEditionTokenId)).to.be.equal(content)
    })

    it('can call as proxy', async () => {
      await this.accessControls.setVerifiedArtistProxy(
        proxy,
        this.merkleProof.claims[owner].index,
        this.merkleProof.claims[owner].proof,
        {from: owner}
      );

      await this.token.mintBatchEdition(10, owner, TOKEN_URI, {from: contract})

      const content = 'random'
      const {receipt} = await this.token.lockInUnlockableContent(firstEditionTokenId, content, {from: proxy})
      await expectEvent(receipt, 'AdditionalEditionUnlockableSet', {
        _editionId: firstEditionTokenId
      })

      expect(await this.token.additionalEditionUnlockableSlot(firstEditionTokenId)).to.be.equal(content)
    })

    it('Reverts when not creator', async () => {
      await expectRevert(
        this.token.lockInUnlockableContent(firstEditionTokenId, 'collector a is the best', {from: collectorA}),
        "Unable to set when not creator"
      )
    })
  })
});
