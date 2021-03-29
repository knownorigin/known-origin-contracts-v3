const {BN, constants, expectEvent, expectRevert} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const KODAV3Marketplace = artifacts.require('KODAV3Marketplace');
const MockTokenUriResolver = artifacts.require('MockTokenUriResolver');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

contract('KnownOriginDigitalAssetV3 Token URI resolver', function (accounts) {
  const [owner, minter, koCommission, contract] = accounts;

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = '10000';


  const firstEditionTokenId = new BN('11000');
  const secondEditionTokenId = new BN('12000');

  beforeEach(async () => {
    const legacyAccessControls = await SelfServiceAccessControls.new();
    // setup access controls
    this.accessControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

    // grab the roles
    this.MINTER_ROLE = await this.accessControls.MINTER_ROLE();
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Set up access controls with minter roles
    await this.accessControls.grantRole(this.MINTER_ROLE, owner, {from: owner});
    await this.accessControls.grantRole(this.MINTER_ROLE, minter, {from: owner});

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

    this.tokenUriResolver = await MockTokenUriResolver.new({from: owner});
  });

  it('editionURI() reverts for unknown edition ID', async () => {
    await expectRevert(
      this.token.editionURI(firstEditionTokenId),
      'Edition does not exist'
    );
  });

  it('tokenURI() reverts for unknown edition ID', async () => {
    await expectRevert(
      this.token.tokenURI(firstEditionTokenId),
      'Token does not exist'
    );
  });

  describe('Using a Token URI resolver', async () => {

    beforeEach(async () => {
      // mint 2 tokens
      await this.token.mintBatchEdition(1, owner, TOKEN_URI, {from: contract});
      await this.token.mintBatchEdition(1, owner, TOKEN_URI, {from: contract});

      expect(await this.token.tokenUriResolverActive()).to.be.equal(false);

      // set resolver
      const receipt = await this.token.setTokenUriResolver(this.tokenUriResolver.address, {from: owner});
      expectEvent.inLogs(receipt.logs, 'AdminTokenUriResolverSet', {
        _tokenUriResolver: this.tokenUriResolver.address
      });
    });

    it('resolver is set', async () => {
      expect(await this.token.tokenUriResolverActive()).to.be.equal(true);
    });

    it('once a uri is set isDefined() is true and new URI is used', async () => {
      await this.tokenUriResolver.setEditionUri(firstEditionTokenId, 'my-new-hash');
      expect(await this.tokenUriResolver.isDefined(firstEditionTokenId)).to.be.equal(true);

      const tokenUri = await this.token.tokenURI(firstEditionTokenId);
      expect(tokenUri).to.be.equal('my-new-hash');

      const editionUri = await this.token.editionURI(firstEditionTokenId);
      expect(editionUri).to.be.equal('my-new-hash');
    });

    it('if not set for that token, no override is provided', async () => {
      const tokenUri = await this.token.tokenURI(secondEditionTokenId);
      expect(tokenUri).to.be.equal('ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv');

      const editionUri = await this.token.editionURI(secondEditionTokenId);
      expect(editionUri).to.be.equal('ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv');
    });

    it('resolver can be cleared by setting a zero address', async () => {
      // set the override
      await this.tokenUriResolver.setEditionUri(firstEditionTokenId, 'my-new-hash');

      // check valid
      let tokenUri = await this.token.tokenURI(firstEditionTokenId);
      expect(tokenUri).to.be.equal('my-new-hash');

      // clear resolver
      const receipt = await this.token.setTokenUriResolver(ZERO_ADDRESS, {from: owner});
      expectEvent.inLogs(receipt.logs, 'AdminTokenUriResolverSet', {
        _tokenUriResolver: ZERO_ADDRESS
      });
      expect(await this.token.tokenUriResolverActive()).to.be.equal(false);

      // check old URI is reovled
      tokenUri = await this.token.tokenURI(firstEditionTokenId);
      expect(tokenUri).to.be.equal('ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv');
    });

  });

});
