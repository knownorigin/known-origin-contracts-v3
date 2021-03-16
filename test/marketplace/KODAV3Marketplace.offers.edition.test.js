const {BN, constants, time, expectEvent, expectRevert} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;
const _ = require('lodash');
const {ether} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3Marketplace = artifacts.require('KODAV3Marketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

contract('KODAV3Marketplace', function (accounts) {
  const [owner, minter, koCommission, contract, collectorA, collectorB] = accounts;

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = '10000';
  const LOCKUP_HOURS = 6;

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

    this.minBidAmount = await this.marketplace.minBidAmount();
  });

  describe('primary sale edition offers', async () => {

    const _0_1_ETH = ether('0.1');

    beforeEach(async () => {
      // Ensure owner is approved as this will fail if not
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // create 3 tokens to the minter
      await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

      this.start = await time.latest();
    });

    describe('when making a bid', async () => {

      beforeEach(async () => {
        this.receipt = await this.marketplace.placeEditionBid(firstEditionTokenId, {
          from: collectorA,
          value: _0_1_ETH
        });
      });

      it('emits the event', async () => {
        expectEvent(this.receipt, 'EditionBidPlaced', {
          _editionId: firstEditionTokenId,
          _bidder: collectorA,
          _amount: _0_1_ETH
        });
      });

      it('offer is recorded correctly', async () => {
        const {offer, bidder} = await this.marketplace.editionOffers(firstEditionTokenId);
        expect(bidder).to.be.equal(collectorA);
        expect(offer).to.be.bignumber.equal(_0_1_ETH);
      });

      it('can outbid another bidder but only by min bid amount', async () => {
        const newBid = _0_1_ETH.mul(new BN('2'));
        this.receipt = await this.marketplace.placeEditionBid(firstEditionTokenId, {
          from: collectorB,
          value: newBid
        });

        expectEvent(this.receipt, 'EditionBidPlaced', {
          _editionId: firstEditionTokenId,
          _bidder: collectorB,
          _amount: newBid
        });

        const {offer, bidder} = await this.marketplace.editionOffers(firstEditionTokenId);
        expect(bidder).to.be.equal(collectorB);
        expect(offer).to.be.bignumber.equal(newBid);
      });

      it('can withdraw bid after lockup period elapses', async () => {

        // Back to the future...
        await time.increase(time.duration.hours(LOCKUP_HOURS));

        // Withdraw bid
        this.receipt = await this.marketplace.withdrawEditionBid(firstEditionTokenId, {
          from: collectorA
        });

        expectEvent(this.receipt, 'EditionBidWithdrawn', {
          _editionId: firstEditionTokenId,
          _bidder: collectorA
        });

        const {offer, bidder} = await this.marketplace.editionOffers(firstEditionTokenId);
        expect(bidder).to.be.equal(ZERO_ADDRESS);
        expect(offer).to.be.bignumber.equal('0');
      });

      it('can be rejected from the original creator', async () => {
        this.receipt = await this.marketplace.rejectEditionBid(firstEditionTokenId, {
          from: minter
        });

        expectEvent(this.receipt, 'EditionBidRejected', {
          _editionId: firstEditionTokenId,
          _bidder: collectorA,
          _amount: _0_1_ETH,
        });

        const {offer, bidder} = await this.marketplace.editionOffers(firstEditionTokenId);
        expect(bidder).to.be.equal(ZERO_ADDRESS);
        expect(offer).to.be.bignumber.equal('0');
      });

      it('reverts if you attempt to withdraw before lockup elapses', async () => {
        await expectRevert(
            this.marketplace.withdrawEditionBid(firstEditionTokenId, {from: collectorA}),
            "Bid lockup not elapsed"
        );

      });

      it('reverts if trying to reject when no bid exists', async () => {
        await expectRevert(
          this.marketplace.rejectEditionBid(secondEditionTokenId, {from: collectorA}),
          'No open bid'
        );
      });

      it('reverts if trying to reject when not the original creator', async () => {
        await expectRevert(
          this.marketplace.rejectEditionBid(firstEditionTokenId, {from: collectorB}),
          'Caller not the creator'
        );
      });

      it('reverts if withdrawing a bid which you haven\'t made', async () => {
        await expectRevert(
          this.marketplace.withdrawEditionBid(firstEditionTokenId, {from: collectorB}),
          'Caller not the top bidder'
        );
      });

      it('reverts if withdrawing a bid for an edition which does not exist', async () => {
        await expectRevert(
          this.marketplace.withdrawEditionBid(secondEditionTokenId, {from: collectorB}),
          'No open bid'
        );
      });
    });

    describe('when accepting a bid', async () => {

      beforeEach(async () => {
        await this.marketplace.placeEditionBid(firstEditionTokenId, {
          from: collectorA,
          value: _0_1_ETH
        });
      });

      it('emits the correct event', async () => {
        this.receipt = await this.marketplace.acceptEditionBid(firstEditionTokenId, _0_1_ETH, {
          from: minter
        });
        expectEvent(this.receipt, 'EditionBidAccepted', {
          _editionId: firstEditionTokenId,
          _tokenId: firstEditionTokenId,
          _buyer: collectorA,
          _amount: _0_1_ETH
        });
      });

      it('token ownership changes hands', async () => {
        await this.marketplace.acceptEditionBid(firstEditionTokenId, _0_1_ETH, {
          from: minter
        });
        expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);
      });

      it('reverts if no bid exists', async () => {
        await expectRevert(
          this.marketplace.acceptEditionBid(secondEditionTokenId, _0_1_ETH, {from: minter}),
          'No open bid'
        );
      });

      it('KO and artist commission is split', async () => {

      });

      it('reverts if not the original creator', async () => {
        await expectRevert(
          this.marketplace.acceptEditionBid(firstEditionTokenId, _0_1_ETH, {from: collectorB}),
          'Not creator'
        );
      });

      it('reverts if amount supplied is different than open bid', async () => {
        await expectRevert(
          this.marketplace.acceptEditionBid(firstEditionTokenId, '1', {from: minter}),
          'Offer price has changed'
        );
      });
    });
  });

});
