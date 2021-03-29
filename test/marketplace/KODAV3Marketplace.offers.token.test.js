const {BN, constants, time, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;
const _ = require('lodash');
const {ether} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3Marketplace = artifacts.require('KODAV3Marketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

contract('KODAV3Marketplace token bids', function (accounts) {
  const [admin, owner, minter, koCommission, contract, collectorA, collectorB] = accounts;

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = '10000';
  const MIN_BID = ether('0.01');
  const LOCKUP_HOURS = 6;

  const firstTokenId = new BN('11000');

  beforeEach(async () => {
    const legacyAccessControls = await SelfServiceAccessControls.new();
    // setup access controls
    this.accessControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

    // grab the roles
    this.DEFAULT_ADMIN_ROLE = await this.accessControls.DEFAULT_ADMIN_ROLE();
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Set up access controls with minter roles
    await this.accessControls.grantRole(this.DEFAULT_ADMIN_ROLE, admin, {from: owner});

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

  describe('secondary sale token offers', async () => {

    describe('placeTokenBid()', () => {

      const _0_5_ETH = ether('0.5');

      beforeEach(async () => {

        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

        // create 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

      });

      it('reverts if bid lower than minimum on first bid', async () => {

        const token = firstTokenId;
        const BID_TOO_LOW = ether('0.00001');

        // collector B places offer 0.50001 ETH for token (too low)
        await expectRevert(
          this.marketplace.placeTokenBid(token, {from: collectorB, value: BID_TOO_LOW}),
          'Bid not high enough'
        );
      });

      it('reverts if bid lower than existing bid plus minimum', async () => {

        const token = firstTokenId;
        const BID_TOO_LOW = ether('0.500001');

        // collector A places offer 0.5 ETH for token
        await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

        // collector B places offer 0.50001 ETH for token (too low)
        await expectRevert(
          this.marketplace.placeTokenBid(token, {from: collectorB, value: BID_TOO_LOW}),
          'Bid not high enough'
        );
      });

      it('reverts if bid lower than minimum after an outbidding', async () => {

        const token = firstTokenId;
        const BID_OK = ether('0.51');
        const BID_TOO_LOW = ether('0.510001');

        // collector A places offer 0.5 ETH for token
        await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

        // collector B places offer 0.51 ETH for token, outbidding collector A
        await this.marketplace.placeTokenBid(token, {from: collectorB, value: BID_OK});

        // collector C places offer 0.510001 ETH for token (too low for next bid)
        await expectRevert(
          this.marketplace.placeTokenBid(token, {from: collectorB, value: BID_TOO_LOW}),
          'Bid not high enough'
        );

      });

      describe('on success', () => {

        it('emits TokenBidPlaced event on successful bid', async () => {

          const token = firstTokenId;

          // offer minimum bid for token
          const receipt = await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});
          expectEvent(receipt, 'TokenBidPlaced', {
            _tokenId: token,
            _currentOwner: minter,
            _bidder: collectorA,
            _amount: _0_5_ETH
          });

        });

        it('offer is recorded correctly', async () => {

          const token = firstTokenId;

          // offer minimum bid for token
          await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

          // Check recorded values
          const {offer, bidder} = await this.marketplace.tokenOffers(token);
          expect(bidder).to.be.equal(collectorA);
          expect(offer).to.be.bignumber.equal(_0_5_ETH);
        });

        it('can place minimum bid as first bid on token', async () => {

          const token = firstTokenId;

          // offer minimum bid for token
          const receipt = await this.marketplace.placeTokenBid(token, {from: collectorA, value: MIN_BID});
          expectEvent(receipt, 'TokenBidPlaced', {
            _tokenId: token,
            _currentOwner: minter,
            _bidder: collectorA,
            _amount: MIN_BID
          });

        });

        it('can outbid previous high bidder', async () => {

          const token = firstTokenId;
          const BID_OK = ether('0.51');

          // collector A places offer 0.5 ETH for token
          await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

          // collector B places offer 0.51 ETH for token (ok bid)
          const receipt = await this.marketplace.placeTokenBid(token, {from: collectorB, value: BID_OK});
          expectEvent(receipt, 'TokenBidPlaced', {
            _tokenId: token,
            _currentOwner: minter,
            _bidder: collectorB,
            _amount: BID_OK
          });


        });

        it('previous bidder refunded when outbid', async () => {

          const token = firstTokenId;
          const BID_OK = ether('0.51');

          // collector A places offer 0.5 ETH for token
          await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

          // Get the buyer's starting wallet balance
          const tracker = await balance.tracker(collectorA);
          const startBalance = await tracker.get();

          // collector B places offer 0.51 ETH for token (ok bid)
          const receipt = await this.marketplace.placeTokenBid(token, {from: collectorB, value: BID_OK});
          expectEvent(receipt, 'TokenBidPlaced', {
            _tokenId: token,
            _currentOwner: minter,
            _bidder: collectorB,
            _amount: BID_OK
          });

          // Expected balance is starting balance plus .5 ETH, the previous bid amount
          const expectedBalance = startBalance.add(_0_5_ETH);
          const endBalance = await tracker.get();
          expect(endBalance).to.be.bignumber.equal(expectedBalance);

        });

        it('cannot bid again with same amount', async () => {

          const token = firstTokenId;

          // collector A places offer 0.5 ETH for token
          await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

          // attempt to bid again with same offer
          await expectRevert(
            this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH}),
            'Bid not high enough'
          );

        });

      });

    });

    describe('withdrawTokenBid()', () => {

      const _0_5_ETH = ether('0.5');

      beforeEach(async () => {

        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

        // create 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

      });

      it('reverts if you attempt to withdraw before lockup elapses', async () => {

        await this.marketplace.placeTokenBid(firstTokenId, {
          from: collectorA,
          value: _0_5_ETH
        });

        await expectRevert(
          this.marketplace.withdrawTokenBid(firstTokenId, {from: collectorA}),
          'Bid lockup not elapsed'
        );

      });

      it('reverts if no current bid', async () => {

        const token = firstTokenId;

        // collector A attempts to withdraw bid when none exists
        await expectRevert(
          this.marketplace.withdrawTokenBid(token, {from: collectorA}),
          'No open bid'
        );

      });

      it('reverts if not called by top bidder', async () => {

        const token = firstTokenId;

        // collector A places offer 0.5 ETH for token
        await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

        // collector B attempts to withdraw collector A's bid
        await expectRevert(
          this.marketplace.withdrawTokenBid(token, {from: collectorB}),
          'Not bidder'
        );

      });

      describe('on success', () => {

        it('can withdraw bid after lockup period elapses', async () => {

          const token = firstTokenId;

          // offer 0.5 ETH for token (first bid)
          await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

          // Back to the future...
          await time.increase(time.duration.hours(LOCKUP_HOURS));

          // withdraw bid
          const receipt = await this.marketplace.withdrawTokenBid(token, {from: collectorA});
          expectEvent(receipt, 'TokenBidWithdrawn', {
            _tokenId: token,
            _bidder: collectorA
          });

        });

        it('emits TokenBidWithdrawn event on successful withdrawal', async () => {

          const token = firstTokenId;
          const BID_OK = ether('0.51');

          // collector A offers 0.5 ETH for token (first bid)
          await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

          // collector B outbids
          await this.marketplace.placeTokenBid(token, {from: collectorB, value: BID_OK});

          // Back to the future...
          await time.increase(time.duration.hours(LOCKUP_HOURS));

          // collector B withdraws bid
          const receipt = await this.marketplace.withdrawTokenBid(token, {from: collectorB});
          expectEvent(receipt, 'TokenBidWithdrawn', {
            _tokenId: token,
            _bidder: collectorB
          });

        });

        it('highest bidder refunded when bid withdrawn', async () => {

          const token = firstTokenId;

          // collector A places offer 0.5 ETH for token
          await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

          // Back to the future...
          await time.increase(time.duration.hours(LOCKUP_HOURS));

          // Get the buyer's starting wallet balance
          const tracker = await balance.tracker(collectorA);
          const startBalance = await tracker.get();

          //  collector A withdraws bid at 1 gwei gas, gets a receipt
          const gasPrice = new BN(web3.utils.toWei('1', 'gwei').toString());
          const receipt = await this.marketplace.withdrawTokenBid(token, {from: collectorA, gasPrice});

          // Determine the gas cost associated with the transaction
          const gasUsed = new BN(receipt.receipt.cumulativeGasUsed);
          const txCost = gasUsed.mul(gasPrice);

          // Expected balance is starting balance less tx cost plus .5 ETH, the previous bid amount
          const expectedBalance = startBalance.add(_0_5_ETH).sub(txCost);
          const endBalance = await tracker.get();
          expect(endBalance).to.be.bignumber.equal(expectedBalance);

        });

        it('can place minimum bid after highest is withdrawn', async () => {

          const token = firstTokenId;

          // offer 0.5 ETH for token (first bid)
          await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

          // Back to the future...
          await time.increase(time.duration.hours(LOCKUP_HOURS));

          // withdraw bid
          await this.marketplace.withdrawTokenBid(token, {from: collectorA});

          // offer minimum bid for token
          const receipt = await this.marketplace.placeTokenBid(token, {from: collectorB, value: MIN_BID});
          expectEvent(receipt, 'TokenBidPlaced', {
            _tokenId: token,
            _currentOwner: minter,
            _bidder: collectorB,
            _amount: MIN_BID
          });

        });

        it('cannot withdraw bid twice', async () => {

          const token = firstTokenId;

          // offer 0.5 ETH for token (first bid)
          await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

          // Back to the future...
          await time.increase(time.duration.hours(LOCKUP_HOURS));

          // withdraw bid
          await this.marketplace.withdrawTokenBid(token, {from: collectorA});

          // attempt to withdraw bid again
          await expectRevert(
            this.marketplace.withdrawTokenBid(token, {from: collectorA}),
            'No open bid'
          );

        });

      });

    });

    describe('rejectTokenBid()', () => {

      const _0_5_ETH = ether('0.5');

      beforeEach(async () => {

        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

        // create 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

      });

      it('reverts if no current bid', async () => {

        const token = firstTokenId;

        // minter attempts to reject bid when none exists
        await expectRevert(
          this.marketplace.rejectTokenBid(token, {from: minter}),
          'No open bid'
        );

      });

      it('reverts if not current owner', async () => {

        const token = firstTokenId;

        // collector A places offer 0.5 ETH for token
        await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

        // collector B attempts to reject collector A's bid
        await expectRevert(
          this.marketplace.rejectTokenBid(token, {from: collectorB}),
          'Not current owner'
        );

      });

      describe('on success', () => {

        it('emits TokenBidRejected event when owner rejects offer', async () => {

          const token = firstTokenId;

          // offer 0.5 ETH for token (first bid)
          await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

          // reject bid
          const receipt = await this.marketplace.rejectTokenBid(token, {from: minter});
          expectEvent(receipt, 'TokenBidRejected', {
            _tokenId: token,
            _currentOwner: minter,
            _bidder: collectorA,
            _amount: _0_5_ETH
          });

        });

        it('high bidder refunded when rejected', async () => {

          const token = firstTokenId;

          // collector A places offer 0.5 ETH for token
          await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

          // get the buyer's starting wallet balance
          const tracker = await balance.tracker(collectorA);
          const startBalance = await tracker.get();

          // owner rejects bid
          await this.marketplace.rejectTokenBid(token, {from: minter});

          // collector A's expected balance is starting balance plus .5 ETH, the previous bid amount
          const expectedBalance = startBalance.add(_0_5_ETH);
          const endBalance = await tracker.get();
          expect(endBalance).to.be.bignumber.equal(expectedBalance);

        });

        it('can place minimum bid after highest is rejected', async () => {

          const token = firstTokenId;

          // offer 0.5 ETH for token (first bid)
          await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

          // reject bid
          await this.marketplace.rejectTokenBid(token, {from: minter});

          // offer minimum bid for token
          const receipt = await this.marketplace.placeTokenBid(token, {from: collectorB, value: MIN_BID});
          expectEvent(receipt, 'TokenBidPlaced', {
            _tokenId: token,
            _currentOwner: minter,
            _bidder: collectorB,
            _amount: MIN_BID
          });

        });

        it('owner cannot reject offer twice', async () => {

          const token = firstTokenId;

          // offer 0.5 ETH for token (first bid)
          await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

          // reject bid
          await this.marketplace.rejectTokenBid(token, {from: minter});

          // attempt to reject bid again
          await expectRevert(
            this.marketplace.rejectTokenBid(token, {from: minter}),
            'No open bid'
          );

        });

      });

    });

    describe('acceptTokenBid()', () => {

      const _0_5_ETH = ether('0.5');
      const _0_1_ETH = ether('0.1');

      beforeEach(async () => {

        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

        // create 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

      });

      it('reverts if no current bid', async () => {

        const token = firstTokenId;

        // minter attempts to reject bid when none exists
        await expectRevert(
          this.marketplace.acceptTokenBid(token, _0_5_ETH, {from: minter}),
          'No open bid'
        );

      });

      it('reverts if not current owner', async () => {

        const token = firstTokenId;

        // collector A places offer 0.5 ETH for token
        await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

        // collector B attempts to reject collector A's bid
        await expectRevert(
          this.marketplace.acceptTokenBid(token, _0_5_ETH, {from: collectorB}),
          'Not current owner'
        );

      });

      it('reverts if amount supplied is different than highest bid', async () => {

        const token = firstTokenId;

        // offer 0.5 ETH for token (first bid)
        await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

        await expectRevert(
          this.marketplace.acceptTokenBid(token, _0_1_ETH, {from: minter}),
          'Offer price has changed'
        );
      });

      describe('on success', () => {

        it('emits TokenBidAccepted event when owner accepts offer', async () => {

          const token = firstTokenId;

          // offer 0.5 ETH for token (first bid)
          await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

          // accept bid
          const receipt = await this.marketplace.acceptTokenBid(token, _0_5_ETH, {from: minter});
          expectEvent(receipt, 'TokenBidAccepted', {
            _tokenId: token,
            _currentOwner: minter,
            _bidder: collectorA,
            _amount: _0_5_ETH
          });

        });

        xit('KO and artist commission is split', async () => {
          // TODO implement this test
        });

        it('owner cannot accept offer twice', async () => {

          const token = firstTokenId;

          // offer 0.5 ETH for token (first bid)
          await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

          // accept bid
          await this.marketplace.acceptTokenBid(token, _0_5_ETH, {from: minter});

          // attempt to accept offer twice
          await expectRevert(
            this.marketplace.acceptTokenBid(token, _0_5_ETH, {from: minter}),
            'No open bid'
          );

        });

        it('bidder receives token after owner accepts bid', async () => {

          const token = firstTokenId;

          // collector A offers 0.5 ETH for token
          await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

          // accept bid
          await this.marketplace.acceptTokenBid(token, _0_5_ETH, {from: minter});

          // Owner is collector A
          expect(await this.token.ownerOf(token)).to.be.equal(collectorA);

        });

      });

    });

    describe('adminRejectTokenBid()', () => {

      const _0_5_ETH = ether('0.5');

      beforeEach(async () => {

        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

        // create 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});
      });

      it('reverts if no current bid', async () => {

        const token = firstTokenId;

        // minter attempts to reject bid when none exists
        await expectRevert(
          this.marketplace.adminRejectTokenBid(token, {from: admin}),
          'No open bid'
        );

      });

      it('reverts if not admin', async () => {

        const token = firstTokenId;

        // collector A places offer 0.5 ETH for token
        await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

        // collector B attempts to reject collector A's bid
        await expectRevert(
          this.marketplace.adminRejectTokenBid(token, {from: collectorB}),
          'Caller not admin'
        );

      });

      describe('on success', () => {

        it('emits TokenBidRejected event when owner rejects offer', async () => {

          const token = firstTokenId;

          // offer 0.5 ETH for token (first bid)
          await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

          // reject bid
          const receipt = await this.marketplace.adminRejectTokenBid(token, {from: admin});
          expectEvent(receipt, 'TokenBidRejected', {
            _tokenId: token,
            _currentOwner: minter,
            _bidder: collectorA,
            _amount: _0_5_ETH
          });

        });

        it('high bidder refunded when rejected', async () => {

          const token = firstTokenId;

          // collector A places offer 0.5 ETH for token
          await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

          // get the buyer's starting wallet balance
          const tracker = await balance.tracker(collectorA);
          const startBalance = await tracker.get();

          // owner rejects bid
          await this.marketplace.adminRejectTokenBid(token, {from: admin});

          // collector A's expected balance is starting balance plus .5 ETH, the previous bid amount
          const expectedBalance = startBalance.add(_0_5_ETH);
          const endBalance = await tracker.get();
          expect(endBalance).to.be.bignumber.equal(expectedBalance);

        });

        it('can place minimum bid after highest is rejected', async () => {

          const token = firstTokenId;

          // offer 0.5 ETH for token (first bid)
          await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

          // reject bid
          await this.marketplace.adminRejectTokenBid(token, {from: admin});

          // offer minimum bid for token
          const receipt = await this.marketplace.placeTokenBid(token, {from: collectorB, value: MIN_BID});
          expectEvent(receipt, 'TokenBidPlaced', {
            _tokenId: token,
            _currentOwner: minter,
            _bidder: collectorB,
            _amount: MIN_BID
          });

        });

        it('admin cannot reject offer twice', async () => {

          const token = firstTokenId;

          // offer 0.5 ETH for token (first bid)
          await this.marketplace.placeTokenBid(token, {from: collectorA, value: _0_5_ETH});

          // reject bid
          await this.marketplace.adminRejectTokenBid(token, {from: admin});

          // attempt to reject bid again
          await expectRevert(
            this.marketplace.adminRejectTokenBid(token, {from: admin}),
            'No open bid'
          );
        });

      });

    });
  });

});
