const {BN, constants, time, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const web3 = require('web3');
const {ether} = require("@openzeppelin/test-helpers");
const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3Marketplace = artifacts.require('KODAV3Marketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

contract('KODAV3Marketplace reserve auction tests', function (accounts) {
  const [owner, minter, koCommission, contract] = accounts

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = '10000';

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

    // Set contract roles
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.token.address, {from: owner});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, contract, {from: owner});

    // Create marketplace and enable in whitelist
    this.marketplace = await KODAV3Marketplace.new(this.accessControls.address, this.token.address, koCommission, {from: owner});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.marketplace.address, {from: owner});

    this.minBidAmount = await this.marketplace.minBidAmount();
  });

  describe.only('End to end reserve auctions', () => {
    beforeEach(async () => {
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // reserve is only for 1 of 1
      await this.token.mintBatchEdition(1, minter, TOKEN_URI, {from: contract})
    })

    it('Successfully results a full reserve auction with no start date', async () => {
      const reservePrice = ether('0.5')

      const { receipt } = await this.marketplace.listEditionForReserveAuction(
        minter,
        STARTING_EDITION,
        reservePrice,
        '0'
      )

      await expectEvent(receipt, 'EditionListedForReserveAuction', {
        _editionId: STARTING_EDITION,
        _reservePrice: reservePrice,
        _startDate: '0'
      })
    })
  })
})
