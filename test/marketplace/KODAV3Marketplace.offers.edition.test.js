const {BN, constants, time, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
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
  const MIN_BID = ether('0.01');
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
      // Ensure creator is approved as this will fail if not
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // create 3 tokens to the minter
      await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

    });

    describe('enableEditionOffers()', async () => {

      it('reverts if caller does not have minter role', async () => {

        const now = await time.latest();
        const duration = time.duration.days(1);
        const start = now.add(duration);
        await expectRevert(
            this.marketplace.enableEditionOffers(minter, firstEditionTokenId, start, {from: collectorA}),
            "KODA: Caller must have minter role"
        );

      });

      describe('on success, with subsequent bids', async () => {

        it('reverts when attempting to place a bid before start time', async () => {

          const now = await time.latest();
          const duration = time.duration.days(1);
          const start = now.add(duration);

          await this.marketplace.enableEditionOffers(minter, firstEditionTokenId, start, {from: minter});

          await expectRevert(
              this.marketplace.placeEditionBid(firstEditionTokenId, {
                from: collectorA,
                value: _0_1_ETH
              }),
              "Not yet accepting offers"
          )

        });

        it('can place a bid on the edition after the start time has arrived', async () => {

          const now = await time.latest();
          const duration = time.duration.days(1);
          const start = now.add(duration);

          await this.marketplace.enableEditionOffers(minter, firstEditionTokenId, start, {from: minter});

          // Back to the future...
          await time.increaseTo(start);

          // Place the bid
          this.receipt = await this.marketplace.placeEditionBid(firstEditionTokenId, {
            from: collectorA,
            value: _0_1_ETH
          });

          expectEvent(this.receipt, 'EditionBidPlaced', {
            _editionId: firstEditionTokenId,
            _bidder: collectorA,
            _amount: _0_1_ETH
          });

        });

      });

    });

    describe('placeEditionBid()', () => {

      const _0_5_ETH = ether('0.5');

      it('reverts if bid lower than minimum on first bid', async () => {

        const edition = firstEditionTokenId;
        const BID_TOO_LOW = ether('0.00001');

        // collector B places offer 0.50001 ETH for token (too low)
        await expectRevert(
            this.marketplace.placeEditionBid(edition, {from: collectorB, value: BID_TOO_LOW}),
            'Bid not high enough'
        );
      });

      it('reverts if bid lower than existing bid plus minimum', async () => {

        const edition = firstEditionTokenId;
        const BID_TOO_LOW = ether('0.500001');

        // collector A places offer 0.5 ETH for token
        await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

        // collector B places offer 0.50001 ETH for token (too low)
        await expectRevert(
            this.marketplace.placeEditionBid(edition, {from: collectorB, value: BID_TOO_LOW}),
            'Bid not high enough'
        );
      });

      it('reverts if bid lower than minimum after an outbidding', async () => {

        const edition = firstEditionTokenId;
        const BID_OK = ether('0.51');
        const BID_TOO_LOW = ether('0.510001');

        // collector A places offer 0.5 ETH for token
        await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

        // collector B places offer 0.51 ETH for edition, outbidding collector A
        await this.marketplace.placeEditionBid(edition, {from: collectorB, value: BID_OK});

        // collector C places offer 0.510001 ETH for token (too low for next bid)
        await expectRevert(
            this.marketplace.placeEditionBid(edition, {from: collectorB, value: BID_TOO_LOW}),
            'Bid not high enough'
        );

      });

      describe('on success', () => {

        it('emits EditionBidPlaced event on successful bid', async () => {

          const edition = firstEditionTokenId;

          // offer minimum bid for token
          const receipt = await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});
          expectEvent(receipt, 'EditionBidPlaced', {
            _editionId: edition,
            _bidder: collectorA,
            _amount: _0_5_ETH
          });

        });

        it('offer is recorded correctly', async () => {

          const edition = firstEditionTokenId;

          // offer minimum bid for token
          await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

          // Check recorded values
          const {offer, bidder} = await this.marketplace.editionOffers(firstEditionTokenId);
          expect(bidder).to.be.equal(collectorA);
          expect(offer).to.be.bignumber.equal(_0_5_ETH);
        });

        it('can place minimum bid as first bid on token', async () => {

          const edition = firstEditionTokenId;

          // offer minimum bid for token
          const receipt = await this.marketplace.placeEditionBid(edition, {from: collectorA, value: MIN_BID});
          expectEvent(receipt, 'EditionBidPlaced', {
            _editionId: edition,
            _bidder: collectorA,
            _amount: MIN_BID
          });

        });

        it('can outbid previous high bidder', async () => {

          const edition = firstEditionTokenId;
          const BID_OK = ether('0.51');

          // collector A places offer 0.5 ETH for token
          await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

          // collector B places offer 0.51 ETH for token (ok bid)
          const receipt = await this.marketplace.placeEditionBid(edition, {from: collectorB, value: BID_OK});
          expectEvent(receipt, 'EditionBidPlaced', {
            _editionId: edition,
            _bidder: collectorB,
            _amount: BID_OK
          });

        });

        it('previous bidder refunded when outbid', async () => {

          const edition = firstEditionTokenId;
          const BID_OK = ether('0.51');

          // collector A places offer 0.5 ETH for token
          await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

          // Get the buyer's starting wallet balance
          const tracker = await balance.tracker(collectorA);
          const startBalance = await tracker.get();

          // collector B places offer 0.51 ETH for token (ok bid)
          const receipt = await this.marketplace.placeEditionBid(edition, {from: collectorB, value: BID_OK});
          expectEvent(receipt, 'EditionBidPlaced', {
            _editionId: edition,
            _bidder: collectorB,
            _amount: BID_OK
          });

          // Expected balance is starting balance plus .5 ETH, the previous bid amount
          const expectedBalance = startBalance.add(_0_5_ETH);
          const endBalance = await tracker.get();
          expect(endBalance).to.be.bignumber.equal(expectedBalance);

        });

        it('cannot bid again with same amount', async () => {

          const edition = firstEditionTokenId;

          // collector A places offer 0.5 ETH for token
          await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

          // attempt to bid again with same offer
          await expectRevert(
              this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH}),
              'Bid not high enough'
          );

        });

      });

    });

    describe('withdrawEditionBid()', () => {

      const _0_5_ETH = ether('0.5');

      beforeEach(async () => {

        // Ensure creator is approved as this will fail if not
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

        // create 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

      });

      it('reverts if you attempt to withdraw before lockup elapses', async () => {

        const edition = firstEditionTokenId;

        await this.marketplace.placeEditionBid(edition, {
          from: collectorA,
          value: _0_5_ETH
        });

        await expectRevert(
            this.marketplace.withdrawEditionBid(edition, {from: collectorA}),
            "Bid lockup not elapsed"
        );

      });

      it('reverts if no current bid', async () => {

        const edition = firstEditionTokenId;

        // collector A attempts to withdraw bid when none exists
        await expectRevert(
            this.marketplace.withdrawEditionBid(edition, {from: collectorA}),
            'No open bid'
        );

      });

      it('reverts if not called by top bidder', async () => {

        const edition = firstEditionTokenId;

        // collector A places offer 0.5 ETH for token
        await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

        // Back to the future...
        await time.increase(time.duration.hours(LOCKUP_HOURS));

        // collector B attempts to withdraw collector A's bid
        await expectRevert(
            this.marketplace.withdrawEditionBid(edition, {from: collectorB}),
            'Not the top bidder'
        );

      });

      describe('on success', () => {

        it('can withdraw bid after lockup period elapses', async () => {

          const edition = firstEditionTokenId;

          // offer 0.5 ETH for token (first bid)
          await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

          // Back to the future...
          await time.increase(time.duration.hours(LOCKUP_HOURS));

          // withdraw bid
          const receipt = await this.marketplace.withdrawEditionBid(edition, {from: collectorA});
          expectEvent(receipt, 'EditionBidWithdrawn', {
            _editionId: edition,
            _bidder: collectorA
          });

        });

        it('emits EditionBidWithdrawn event on successful withdrawal', async () => {

          const edition = firstEditionTokenId;

          const BID_OK = ether('0.51');

          // collector A offers 0.5 ETH for token (first bid)
          await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

          // collector B outbids
          await this.marketplace.placeEditionBid(edition, {from: collectorB, value: BID_OK});

          // Back to the future...
          await time.increase(time.duration.hours(LOCKUP_HOURS));

          // collector B withdraws bid
          const receipt = await this.marketplace.withdrawEditionBid(edition, {from: collectorB});
          expectEvent(receipt, 'EditionBidWithdrawn', {
            _editionId: edition,
            _bidder: collectorB
          });

        });

        it('highest bidder refunded when bid withdrawn', async () => {

          const edition = firstEditionTokenId;

          // collector A places offer 0.5 ETH for token
          await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

          // Back to the future...
          await time.increase(time.duration.hours(LOCKUP_HOURS));

          // Get the buyer's starting wallet balance
          const tracker = await balance.tracker(collectorA);
          const startBalance = await tracker.get();

          //  collector A withdraws bid at 1 gwei gas, gets a receipt
          const gasPrice = new BN(web3.utils.toWei('1', 'gwei').toString());
          const receipt = await this.marketplace.withdrawEditionBid(edition, {from: collectorA, gasPrice});

          // Determine the gas cost associated with the transaction
          const gasUsed = new BN( receipt.receipt.cumulativeGasUsed );
          const txCost = gasUsed.mul(gasPrice);

          // Expected balance is starting balance less tx cost plus .5 ETH, the previous bid amount
          const expectedBalance = startBalance.add(_0_5_ETH).sub(txCost);
          const endBalance = await tracker.get();
          expect(endBalance).to.be.bignumber.equal(expectedBalance);

        });

        it('can place minimum bid after highest is withdrawn', async () => {

          const edition = firstEditionTokenId;

          // offer 0.5 ETH for token (first bid)
          await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

          // Back to the future...
          await time.increase(time.duration.hours(LOCKUP_HOURS));

          // withdraw bid
          await this.marketplace.withdrawEditionBid(edition, {from: collectorA});

          // offer minimum bid for token
          const receipt = await this.marketplace.placeEditionBid(edition, {from: collectorB, value: MIN_BID});
          expectEvent(receipt, 'EditionBidPlaced', {
            _editionId: edition,
            _bidder: collectorB,
            _amount: MIN_BID
          });

        });

        it('cannot withdraw bid twice', async () => {

          const edition = firstEditionTokenId;

          // offer 0.5 ETH for token (first bid)
          await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

          // Back to the future...
          await time.increase(time.duration.hours(LOCKUP_HOURS));

          // withdraw bid
          await this.marketplace.withdrawEditionBid(edition, {from: collectorA});

          // attempt to withdraw bid again
          await expectRevert(
              this.marketplace.withdrawEditionBid(edition, {from: collectorA}),
              'No open bid'
          );

        });

      });

    });

    describe('rejectEditionBid()', () => {

      const _0_5_ETH = ether('0.5');

      beforeEach(async () => {

        // Ensure creator is approved as this will fail if not
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

        // create 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

      });

      it('reverts if no current bid', async () => {

        const edition = firstEditionTokenId;

        // minter attempts to reject bid when none exists
        await expectRevert(
            this.marketplace.rejectEditionBid(edition, {from: minter}),
            'No open bid'
        );

      });

      it('reverts if caller not creator', async () => {

        const edition = firstEditionTokenId;

        // collector A places offer 0.5 ETH for token
        await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

        // collector B attempts to reject collector A's bid
        await expectRevert(
            this.marketplace.rejectEditionBid(edition, {from: collectorB}),
            'Caller not the creator'
        );

      });

      describe('on success', () => {

        it('emits EditionBidRejected event when creator rejects offer', async () => {

          const edition = firstEditionTokenId;

          // offer 0.5 ETH for token (first bid)
          await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

          // reject bid
          const receipt = await this.marketplace.rejectEditionBid(edition, {from: minter});
          expectEvent(receipt, 'EditionBidRejected', {
            _editionId: edition,
            _bidder: collectorA,
            _amount: _0_5_ETH
          });

        });

        it('high bidder refunded when rejected', async () => {

          const edition = firstEditionTokenId;

          // collector A places offer 0.5 ETH for token
          await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

          // get the buyer's starting wallet balance
          const tracker = await balance.tracker(collectorA);
          const startBalance = await tracker.get();

          // creator rejects bid
          await this.marketplace.rejectEditionBid(edition, {from: minter});

          // collector A's expected balance is starting balance plus .5 ETH, the previous bid amount
          const expectedBalance = startBalance.add(_0_5_ETH);
          const endBalance = await tracker.get();
          expect(endBalance).to.be.bignumber.equal(expectedBalance);

        });

        it('can place minimum bid after highest is rejected', async () => {

          const edition = firstEditionTokenId;

          // offer 0.5 ETH for token (first bid)
          await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

          // reject bid
          await this.marketplace.rejectEditionBid(edition, {from: minter});

          // offer minimum bid for token
          const receipt = await this.marketplace.placeEditionBid(edition, {from: collectorB, value: MIN_BID});
          expectEvent(receipt, 'EditionBidPlaced', {
            _editionId: edition,
            _bidder: collectorB,
            _amount: MIN_BID
          });

        });

        it('creator cannot reject offer twice', async () => {

          const edition = firstEditionTokenId;

          // offer 0.5 ETH for token (first bid)
          await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

          // reject bid
          await this.marketplace.rejectEditionBid(edition, {from: minter});

          // attempt to reject bid again
          await expectRevert(
              this.marketplace.rejectEditionBid(edition, {from: minter}),
              'No open bid'
          );

        });

      })

    });

    describe('acceptEditionBid()', () => {

      const _0_5_ETH = ether('0.5');

      beforeEach(async () => {

        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

        // create 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

      });

      it('reverts if no current bid', async () => {

        const edition = firstEditionTokenId;

        // minter attempts to reject bid when none exists
        await expectRevert(
            this.marketplace.acceptEditionBid(edition, _0_5_ETH, {from: minter}),
            'No open bid'
        );

      });

      it('reverts if caller is not creator', async () => {

        const edition = firstEditionTokenId;

        // collector A places offer 0.5 ETH for token
        await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

        // collector B attempts to reject collector A's bid
        await expectRevert(
            this.marketplace.acceptEditionBid(edition, _0_5_ETH, {from: collectorB}),
            'Not creator'
        );

      });

      it('reverts if amount supplied is different than highest bid', async () => {

        const edition = firstEditionTokenId;

        // offer 0.5 ETH for token (first bid)
        await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

        await expectRevert(
            this.marketplace.acceptEditionBid(firstEditionTokenId, _0_1_ETH, {from: minter}),
            'Offer price has changed'
        );
      });
      
      describe('on success', () => {

        it('emits EditionBidAccepted event when owner accepts offer', async () => {

          const edition = firstEditionTokenId;

          // offer 0.5 ETH for token (first bid)
          await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

          // accept bid
          const receipt = await this.marketplace.acceptEditionBid(edition, _0_5_ETH, {from: minter});
          expectEvent(receipt, 'EditionBidAccepted', {
            _editionId: edition,
            _bidder: collectorA,
            _amount: _0_5_ETH
          });

        });

        xit('KO and artist commission is split', async () => {
          // TODO implement this test
        });

        it('owner cannot accept offer twice', async () => {

          const edition = firstEditionTokenId;

          // offer 0.5 ETH for token (first bid)
          await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

          // accept bid
          await this.marketplace.acceptEditionBid(edition, _0_5_ETH, {from: minter});

          // attempt to accept offer twice
          await expectRevert(
              this.marketplace.acceptEditionBid(edition, _0_5_ETH, {from: minter}),
              'No open bid'
          );

        });

        it('bidder receives token after creator accepts bid', async () => {

          const edition = firstEditionTokenId;

          // collector A offers 0.5 ETH for token
          await this.marketplace.placeEditionBid(edition, {from: collectorA, value: _0_5_ETH});

          // accept bid
          await this.marketplace.acceptEditionBid(edition, _0_5_ETH, {from: minter});

          // Owner is collector A
          expect(await this.token.ownerOf(edition)).to.be.equal(collectorA);

        });

      })

    });


  });

});
