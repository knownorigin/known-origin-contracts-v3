const {BN, constants, expectEvent, expectRevert} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const KODAV3Marketplace = artifacts.require('KODAV3Marketplace');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const MockRoyaltiesRegistry = artifacts.require('MockRoyaltiesRegistry');

contract('KnownOriginDigitalAssetV3 Royalties resolver', function (accounts) {
  const [owner, minter, koCommission, contract, newReceiver] = accounts;

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

    this.royaltiesRegister = await MockRoyaltiesRegistry.new({from: owner});

    // set a mock registry
    await this.token.setRoyaltiesRegistryProxy(this.royaltiesRegister.address, {from: owner});
  });

  beforeEach(async () => {
    await this.token.mintToken(owner, TOKEN_URI, {from: contract});
  });

  describe('without a overridden royalty', async () => {

    it('default royalties', async () => {
      const hasRoyalties = await this.token.hasRoyalties(firstEditionTokenId);
      expect(hasRoyalties).to.be.equal(true);

      const royaltyInfo = await this.token.royaltyInfo(firstEditionTokenId);
      expect(royaltyInfo.receiver).to.be.equal(owner);
      expect(royaltyInfo.amount).to.be.bignumber.equal('1250000');

      const royaltyAndCreatorInfo = await this.token.royaltyAndCreatorInfo(firstEditionTokenId);
      expect(royaltyAndCreatorInfo.receiver).to.be.equal(owner);
      expect(royaltyAndCreatorInfo.creator).to.be.equal(owner);
      expect(royaltyAndCreatorInfo.amount).to.be.bignumber.equal('1250000');
    });
  });

  describe('with a overridden royalty', async () => {

    beforeEach(async () => {
      await this.royaltiesRegister.setupRoyalty(firstEditionTokenId, newReceiver, '999999');
    });

    it('overridden royalties are found', async () => {
      const hasRoyalties = await this.token.hasRoyalties(firstEditionTokenId);
      expect(hasRoyalties).to.be.equal(true);

      const royaltyInfo = await this.token.royaltyInfo(firstEditionTokenId);
      expect(royaltyInfo.receiver).to.be.equal(newReceiver);
      expect(royaltyInfo.amount).to.be.bignumber.equal('999999');

      const royaltyAndCreatorInfo = await this.token.royaltyAndCreatorInfo(firstEditionTokenId);
      expect(royaltyAndCreatorInfo.receiver).to.be.equal(newReceiver);
      expect(royaltyAndCreatorInfo.creator).to.be.equal(owner);
      expect(royaltyAndCreatorInfo.amount).to.be.bignumber.equal('999999');
    });
  });

});
