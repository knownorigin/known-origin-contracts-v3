const {BN, constants, expectEvent, expectRevert} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const MockNFT = artifacts.require('MockNFT');

contract('KnownOriginDigitalAssetV3 composable tests (ERC-998)', function (accounts) {

  const [owner, anotherOwner, contract, random] = accounts;

  const STARTING_EDITION = '10000';
  const firstEditionTokenId = new BN('11000');
  const secondEditionTokenId = new BN('12000');

  beforeEach(async () => {
    const legacyAccessControls = await SelfServiceAccessControls.new();

    // setup access controls
    this.accessControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

    // grab the roles
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Create token V3
    this.token = await KnownOriginDigitalAssetV3.new(
      this.accessControls.address,
      ZERO_ADDRESS, // no royalties address
      STARTING_EDITION,
      {from: owner}
    );

    this.otherToken = await MockNFT.new(
      {from: owner}
    );

    // Set contract roles
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.token.address, {from: owner});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, contract, {from: owner});

    // mint some NFTs
    await this.token.mintBatchEdition(1, owner, 'random', {from: contract});
    await this.otherToken.mint(owner, '1', {from: owner});

    // mint some NFTs
    await this.token.mintBatchEdition(1, anotherOwner, 'random', {from: contract});
    await this.otherToken.mint(anotherOwner, '2', {from: anotherOwner});
  });

  describe('composeNFTsIntoKodaTokens', () => {
    it('can wrap any 721 in a KODA', async () => {
      await this.otherToken.approve(this.token.address, '1', {from: owner});

      const {receipt} = await this.token.composeNFTsIntoKodaTokens(
        [firstEditionTokenId],
        this.otherToken.address,
        ['1'],
        {from: owner}
      );

      await expectEvent(receipt, 'ReceivedChild', {
        _from: owner,
        _tokenId: firstEditionTokenId,
        _childContract: this.otherToken.address,
        _childTokenId: '1'
      });

      const {
        nft,
        tokenId
      } = await this.token.kodaTokenComposedNFT(firstEditionTokenId);

      expect(nft).to.be.equal(this.otherToken.address);
      expect(tokenId).to.be.bignumber.equal('1');

      expect(
        await this.token.composedNFTsToKodaToken(this.otherToken.address, '1')
      ).to.be.bignumber.equal(firstEditionTokenId);

      expect(
        await this.otherToken.ownerOf('1')
      ).to.be.equal(this.token.address);
    });

    it('can wrap multiple 721s from the same address into KODA tokens', async ()=>{
      await this.otherToken.approve(this.token.address, '1', {from: owner});

      // give the second token to the owner
      await this.otherToken.transferFrom(anotherOwner, owner, '2', {from: anotherOwner});
      await this.token.transferFrom(anotherOwner, owner, secondEditionTokenId, {from: anotherOwner});
      await this.otherToken.approve(this.token.address, '2', {from: owner});

      const {receipt} = await this.token.composeNFTsIntoKodaTokens(
        [firstEditionTokenId, secondEditionTokenId],
        this.otherToken.address,
        ['1', '2'],
        {from: owner}
      );

      await expectEvent(receipt, 'ReceivedChild', {
        _from: owner,
        _tokenId: firstEditionTokenId,
        _childContract: this.otherToken.address,
        _childTokenId: '1'
      });

      await expectEvent(receipt, 'ReceivedChild', {
        _from: owner,
        _tokenId: secondEditionTokenId,
        _childContract: this.otherToken.address,
        _childTokenId: '2'
      });

      // validate token 1

      const {nft, tokenId} = await this.token.kodaTokenComposedNFT(firstEditionTokenId);

      expect(nft).to.be.equal(this.otherToken.address);
      expect(tokenId).to.be.bignumber.equal('1');

      expect(await this.token.composedNFTsToKodaToken(this.otherToken.address, '1'))
        .to.be.bignumber.equal(firstEditionTokenId);

      expect(await this.otherToken.ownerOf('1')).to.be.equal(this.token.address);

      // validate token 2

      const {nft:secondNft, tokenId:secondTokenId} = await this.token.kodaTokenComposedNFT(secondEditionTokenId);

      expect(secondNft).to.be.equal(this.otherToken.address);
      expect(secondTokenId).to.be.bignumber.equal('2');

      expect(await this.token.composedNFTsToKodaToken(this.otherToken.address, '2'))
        .to.be.bignumber.equal(secondEditionTokenId);

      expect(await this.otherToken.ownerOf('2')).to.be.equal(this.token.address);
    });

    it('reverts if nft is zero address', async () => {
      await expectRevert(
        this.token.composeNFTsIntoKodaTokens([firstEditionTokenId], ZERO_ADDRESS, ['1']),
        'function call to a non-contract account'
      );
    });

    it('reverts when koda already has an NFT', async () => {
      await this.otherToken.approve(this.token.address, '1', {from: owner});

      await this.token.composeNFTsIntoKodaTokens(
        [firstEditionTokenId],
        this.otherToken.address,
        ['1'],
        {from: owner}
      );

      await expectRevert(
        this.token.composeNFTsIntoKodaTokens(
          [firstEditionTokenId],
          this.otherToken.address,
          ['1'],
          {from: owner}
        ),
        'Owner mismatch'
      );
    });

    it('Reverts when owning the child NFT but not KODA', async () => {
      await this.token.transferFrom(owner, random, firstEditionTokenId, {from: owner});

      await this.otherToken.approve(this.token.address, '1', {from: owner});

      await expectRevert(
        this.token.composeNFTsIntoKodaTokens(
          [firstEditionTokenId],
          this.otherToken.address,
          ['1'],
          {from: owner}
        ),
        'Owner mismatch'
      );
    });

    it('Reverts when owning KODA but not the child NFT', async () => {
      await this.otherToken.transferFrom(owner, random, '1', {from: owner});

      await expectRevert(
        this.token.composeNFTsIntoKodaTokens(
          [firstEditionTokenId],
          this.otherToken.address,
          ['1'],
          {from: owner}
        ),
        'Owner mismatch'
      );
    });

    it('Reverts when koda does not exist but child does', async () => {
      await expectRevert(
        this.token.composeNFTsIntoKodaTokens(
          [firstEditionTokenId.addn(1)],
          this.otherToken.address,
          ['1'],
          {from: owner}
        ),
        'Invalid owner'
      );
    });

    it('Reverts when no tokens suppied', async () => {
      await expectRevert(
        this.token.composeNFTsIntoKodaTokens(
          [],
          this.otherToken.address,
          [],
          {from: owner}
        ),
        'Invalid list'
      );
    });

    it('Reverts when child does not exist but KODA does', async () => {
      await expectRevert(
        this.token.composeNFTsIntoKodaTokens(
          [firstEditionTokenId],
          this.otherToken.address,
          ['1', '2'],
          {from: owner}
        ),
        'Invalid list'
      );
    });

    it('Reverts when does not own either token', async () => {
      await expectRevert(
        this.token.composeNFTsIntoKodaTokens(
          [secondEditionTokenId],
          this.otherToken.address,
          ['2'],
          {from: owner}
        ),
        'ERC721: transfer caller is not owner nor approved'
      );
    });

    it('Reverts when KODA tokens and 721 tokens dont match in size', async () => {
      await expectRevert(
        this.token.composeNFTsIntoKodaTokens(
          [secondEditionTokenId],
          this.otherToken.address,
          ['2'],
          {from: owner}
        ),
        'ERC721: transfer caller is not owner nor approved'
      );
    });

    it('Reverts when sender does not own all of the KODA tokens', async () => {
      await expectRevert(
        this.token.composeNFTsIntoKodaTokens(
          [firstEditionTokenId, secondEditionTokenId],
          this.otherToken.address,
          ['1', '2'],
          {from: owner}
        ),
        'ERC721: transfer caller is not owner nor approved'
      );
    });

  });

  describe('transferChild', () => {
    it('can transfer wrapped child', async () => {
      await this.otherToken.approve(this.token.address, '1', {from: owner});

      await this.token.composeNFTsIntoKodaTokens(
        [firstEditionTokenId],
        this.otherToken.address,
        ['1'],
        {from: owner}
      );

      const {receipt} = await this.token.transferChild(
        firstEditionTokenId,
        random,
        {from: owner}
      );

      await expectEvent(receipt, 'TransferChild', {
        _tokenId: firstEditionTokenId,
        _to: random,
        _childContract: this.otherToken.address,
        _childTokenId: '1'
      });

      expect(
        await this.otherToken.ownerOf('1')
      ).to.be.equal(random);
    });

    it('if child transferred, can wrap again', async () => {
      await this.otherToken.approve(this.token.address, '1', {from: owner});

      await this.token.composeNFTsIntoKodaTokens(
        [firstEditionTokenId],
        this.otherToken.address,
        ['1'],
        {from: owner}
      );

      await this.token.transferChild(
        firstEditionTokenId,
        random,
        {from: owner}
      );

      await this.otherToken.mint(owner, '3', {from: owner});
      await this.otherToken.approve(this.token.address, '3', {from: owner});

      const {receipt} = await this.token.composeNFTsIntoKodaTokens(
        [firstEditionTokenId],
        this.otherToken.address,
        ['3'],
        {from: owner}
      );

      await expectEvent(receipt, 'ReceivedChild', {
        _from: owner,
        _tokenId: firstEditionTokenId,
        _childContract: this.otherToken.address,
        _childTokenId: '3'
      });

      const {
        nft,
        tokenId
      } = await this.token.kodaTokenComposedNFT(firstEditionTokenId);

      expect(nft).to.be.equal(this.otherToken.address);
      expect(tokenId).to.be.bignumber.equal('3');

      expect(
        await this.token.composedNFTsToKodaToken(this.otherToken.address, '3')
      ).to.be.bignumber.equal(firstEditionTokenId);

      expect(
        await this.otherToken.ownerOf('3')
      ).to.be.equal(this.token.address);
    });

    it('reverts if not koda owner', async () => {
      await expectRevert(
        this.token.transferChild(firstEditionTokenId, random, {from: random}),
        'Only KODA owner'
      );
    });
  });
});
