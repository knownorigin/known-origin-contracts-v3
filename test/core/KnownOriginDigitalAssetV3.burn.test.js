const {BN, constants, expectEvent, expectRevert} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const KODAV3Marketplace = artifacts.require('KODAV3Marketplace');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

contract('KnownOriginDigitalAssetV3 burnable tests', function (accounts) {
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
  });

  describe.only('burn()', async () => {

    beforeEach(async () => {
      await this.token.mintToken(owner, TOKEN_URI, {from: contract});
      this.receipt = await this.token.burn(firstEditionTokenId, {from: owner});
    });

    it('can burn if the owner - emits event', async () => {
      expectEvent.inLogs(this.receipt.logs, 'Transfer', {
        from: owner,
        to: ZERO_ADDRESS,
        tokenId: firstEditionTokenId
      });
    });

    it('can burn if approved to', async () => {
      // TODO
    });

    it('clears ownership', async () => {
      console.log(await  this.token.ownerOf(firstEditionTokenId));
      await expectRevert(
        this.token.ownerOf(firstEditionTokenId),
        'ERC721_ZERO_OWNER'
      );
    });

    it('reduces balance', async () => {
      expect(await this.token.balanceOf(owner)).to.be.bignumber.equal('0');
    });

    it('cannot transfer once burned', async () => {

    });
  });

  describe('burnEdition()', async () => {

    it('', async () => {

    });

    it('', async () => {

    });

    it('', async () => {

    });

    it('', async () => {

    });
  });

});
