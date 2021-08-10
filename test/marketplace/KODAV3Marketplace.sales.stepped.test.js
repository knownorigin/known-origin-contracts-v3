const {BN, constants, time, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const web3 = require('web3');
const {ether} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');

const {parseBalanceMap} = require('../utils/parse-balance-map');

const {buildArtistMerkleInput} = require('../utils/merkle-tools');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3Marketplace = artifacts.require('KODAV3PrimaryMarketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

contract('KODAV3Marketplace', function (accounts) {
  const [owner, minter, koCommission, contract, collectorA, collectorB, collectorC, collectorD, proxy] = accounts;

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = '10000';

  const ONE = new BN('1');
  const ZERO = new BN('0');

  const _0_0_0_1_ETH = ether('0.001');
  const _0_1_ETH = ether('0.1');
  const _1_ETH = ether('1');
  const _1_5_ETH = ether('1.5');

  const firstEditionTokenId = new BN('11000');
  const secondEditionTokenId = new BN('12000');
  const thirdEditionTokenId = new BN('13000');
  const nonExistentTokenId = new BN('99999999999');

  beforeEach(async () => {
    const legacyAccessControls = await SelfServiceAccessControls.new();
    // setup access controls
    this.accessControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

    this.merkleProof = parseBalanceMap(buildArtistMerkleInput(1, minter));

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

    this.minBidAmount = await this.marketplace.minBidAmount();
  });

  describe('stepped auctions', () => {

    describe('listSteppedEditionAuction()', () => {

      beforeEach(async () => {
        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

        // create 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});
      });

      it('must be called by contract role', async () => {

        const token = firstEditionTokenId;

        // list edition for sale at 0.1 ETH per token
        const start = await time.latest();

        await expectRevert(
          this.marketplace.listSteppedEditionAuction(minter, token, _1_ETH, _0_1_ETH, start, {from: collectorA}),
          'Caller not contract'
        );

      });

      it('must have base price greater than or equal to minimum bid amount', async () => {

        const token = firstEditionTokenId;

        // attempt to list edition for sale at 0.001 ETH per token
        const start = await time.latest();

        await expectRevert(
          this.marketplace.listSteppedEditionAuction(minter, token, _0_0_0_1_ETH, _0_1_ETH, start, {from: contract}),
          'Base price not enough'
        );

      });

      context('on successful listing', () => {

        it('emits an EditionSteppedSaleListed event', async () => {

          const token = firstEditionTokenId;

          // list edition for sale at 0.1 ETH per token
          const start = await time.latest();
          const receipt = await this.marketplace.listSteppedEditionAuction(minter, token, _1_ETH, _0_1_ETH, start, {from: contract});
          expectEvent(receipt, 'EditionSteppedSaleListed', {
            _editionId: token,
            _basePrice: _1_ETH,
            _stepPrice: _0_1_ETH,
            _startDate: start
          });

        });

        it('listing can be verified by reading its configuration', async () => {

          const token = firstEditionTokenId;

          // list edition for sale at 0.1 ETH per token
          const start = await time.latest();

          await this.marketplace.listSteppedEditionAuction(minter, token, _1_ETH, _0_1_ETH, start, {from: contract});

          //address _creator, uint128 _basePrice, uint128 _step, uint128 _startDate, uint128 _currentStep
          const listing = await this.marketplace.editionStep(token);
          expect(listing.seller).to.be.equal(minter);
          expect(listing.basePrice).to.be.bignumber.equal(_1_ETH);
          expect(listing.stepPrice).to.be.bignumber.equal(_0_1_ETH);
          expect(listing.startDate).to.be.bignumber.equal(start);
          expect(listing.currentStep).to.be.bignumber.equal('0');

        });

      });
    });

    describe('buyNextStep()', () => {

      beforeEach(async () => {
        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

        // create firstEdition of 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

        // create secondEdition of 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

        // time of latest block
        const latestBlockTime = await time.latest();

        // list firstEdition for sale at 0.1 ETH per token, starting immediately
        const start = latestBlockTime;
        await this.marketplace.listSteppedEditionAuction(minter, firstEditionTokenId, _1_ETH, _0_1_ETH, start, {from: contract});

        // list secondEdition for sale at 0.1 ETH per token, starting in 24 hours
        const tomorrow = new Date(Number(latestBlockTime.toString()));
        tomorrow.setDate(tomorrow.getDate() + 1); // wraps automagically
        const deferredStart = new BN(tomorrow.getTime());
        await this.marketplace.listSteppedEditionAuction(minter, secondEditionTokenId, _1_ETH, _0_1_ETH, deferredStart, {from: contract});

      });

      it('cannot buy an edition not listed for stepped auction', async () => {

        const token = thirdEditionTokenId;

        // collector A attempts to buy a token not listed for stepped auction
        await expectRevert(
          this.marketplace.buyNextStep(token, {from: collectorA, value: _1_ETH}),
          'Edition not listed for stepped auction'
        );

      });

      it('cannot buy an edition that is listed to start at a later time', async () => {

        const token = secondEditionTokenId;

        // collector A attempts to buy a token listed for step auction starting tomorrow
        await expectRevert(
          this.marketplace.buyNextStep(token, {from: collectorA, value: _1_ETH}),
          'Not started yet'
        );

      });

      context('once auction has begun', () => {

        it('cannot purchase stepped edition tokens with less than the step adjusted price', async () => {

          const edition = firstEditionTokenId;

          const stepPrice = _0_1_ETH;
          const token1Price = _1_ETH;
          const token2Price = token1Price.add(stepPrice.mul(new BN('1')));

          // collector A buys a token
          await this.marketplace.buyNextStep(edition, {
            from: collectorA,
            value: token1Price
          });

          // collector B buys a token
          await this.marketplace.buyNextStep(edition, {
            from: collectorB,
            value: token2Price
          });

          // collector C attempts to buys a token with less than the step adjusted price
          await expectRevert(
            this.marketplace.buyNextStep(edition, {
              from: collectorC,
              value: token2Price
            }),
            'Expected price not met'
          );

        });

        it('cannot purchase stepped edition tokens beyond listed limit', async () => {

          const edition = firstEditionTokenId;

          const stepPrice = _0_1_ETH;
          const token1Price = _1_ETH;
          const token2Price = token1Price.add(stepPrice.mul(new BN('1')));
          const token3Price = token1Price.add(stepPrice.mul(new BN('2')));
          const token4Price = token1Price.add(stepPrice.mul(new BN('3')));

          // collector A buys a token
          await this.marketplace.buyNextStep(edition, {
            from: collectorA,
            value: token1Price
          });

          // collector B buys a token
          await this.marketplace.buyNextStep(edition, {
            from: collectorB,
            value: token2Price
          });

          // collector C buys a token
          await this.marketplace.buyNextStep(edition, {
            from: collectorC,
            value: token3Price
          });

          // collector D attempts to buys a token after limit is reached
          await expectRevert(
            this.marketplace.buyNextStep(edition, {
              from: collectorD,
              value: token4Price
            }),
            'Primary market exhausted'
          );

        });

        it('emits an EditionSteppedSaleBuy event on successful purchase', async () => {

          const edition = firstEditionTokenId;

          // collector A buys a token
          const receipt = await this.marketplace.buyNextStep(edition, {from: collectorA, value: _1_ETH});
          expectEvent(receipt, 'EditionSteppedSaleBuy', {
            _editionId: edition,
            _tokenId: new BN(edition).add(ONE).add(ONE), // highest token ID
            _buyer: collectorA,
            _price: _1_ETH,
            _currentStep: ZERO
          });

        });

        it('auction\'s currentStep is incremented after a purchase', async () => {

          const edition = firstEditionTokenId;

          let auctionState = await this.marketplace.editionStep(edition);
          expect(auctionState.currentStep).to.be.bignumber.equal(ZERO);

          // collector A buys a token
          await this.marketplace.buyNextStep(edition, {from: collectorA, value: _1_ETH});

          auctionState = await this.marketplace.editionStep(edition);
          expect(auctionState.currentStep).to.be.bignumber.equal(ONE);

        });

        it('token price incremented appropriately with each step', async () => {

          const edition = firstEditionTokenId;
          const token1 = new BN(edition).add(ONE).add(ONE);
          const token2 = token1.sub(ONE);
          const token3 = token2.sub(ONE);

          const stepPrice = _0_1_ETH;
          const token1Price = _1_ETH;
          const token2Price = token1Price.add(stepPrice.mul(new BN('1')));
          const token3Price = token1Price.add(stepPrice.mul(new BN('2')));
          const token4price = token1Price.add(stepPrice.mul(new BN('3')));

          // Before any purchases
          let expectedPrice = await this.marketplace.getNextEditionSteppedPrice(edition);
          expect(expectedPrice).to.be.bignumber.equal(token1Price);

          // collector A buys a token
          await this.marketplace.buyNextStep(edition, {from: collectorA, value: _1_ETH});

          // Expected price of second token
          expectedPrice = await this.marketplace.getNextEditionSteppedPrice(edition);
          expect(expectedPrice).to.be.bignumber.equal(token2Price);

          // collector B buys a token
          await this.marketplace.buyNextStep(edition, {
            from: collectorB,
            value: token2Price
          });

          // Expected price of third token
          expectedPrice = await this.marketplace.getNextEditionSteppedPrice(edition);
          expect(expectedPrice).to.be.bignumber.equal(token3Price);

          // collector C buys a token
          await this.marketplace.buyNextStep(edition, {
            from: collectorC,
            value: token3Price
          });

          // Expected price of third token
          expectedPrice = await this.marketplace.getNextEditionSteppedPrice(edition);
          expect(expectedPrice).to.be.bignumber.equal(token4price);


          expect(await this.token.ownerOf(token1)).to.be.equal(collectorA);
          expect(await this.token.ownerOf(token2)).to.be.equal(collectorB);
          expect(await this.token.ownerOf(token3)).to.be.equal(collectorC);

        });

        it('buyers can purchase stepped edition tokens up to listed limit', async () => {

          const edition = firstEditionTokenId;
          const token1 = new BN(edition).add(ONE).add(ONE);
          const token2 = token1.sub(ONE);
          const token3 = token2.sub(ONE);

          const stepPrice = _0_1_ETH;
          const token1Price = _1_ETH;
          const token2Price = token1Price.add(stepPrice.mul(new BN('1')));
          const token3Price = token1Price.add(stepPrice.mul(new BN('2')));

          // collector A buys a token
          await this.marketplace.buyNextStep(edition, {
            from: collectorA,
            value: token1Price
          });

          // collector B buys a token
          await this.marketplace.buyNextStep(edition, {
            from: collectorB,
            value: token2Price
          });

          // collector C buys a token
          await this.marketplace.buyNextStep(edition, {
            from: collectorC,
            value: token3Price
          });

          expect(await this.token.ownerOf(token1)).to.be.equal(collectorA);
          expect(await this.token.ownerOf(token2)).to.be.equal(collectorB);
          expect(await this.token.ownerOf(token3)).to.be.equal(collectorC);
        });

        it('any overpayment is returned to the buyer after a purchase', async () => {

          const edition = firstEditionTokenId;

          // Get the buyer's starting wallet balance
          const tracker = await balance.tracker(collectorA);
          const startBalance = await tracker.get();

          // Collector A buys a token at 1 gwei gas, gets a receipt
          const gasPrice = new BN(web3.utils.toWei('1', 'gwei').toString());
          const receipt = await this.marketplace.buyNextStep(edition, {from: collectorA, value: _1_5_ETH, gasPrice});

          // Determine the gas cost associated with the transaction
          const gasUsed = new BN(receipt.receipt.cumulativeGasUsed);
          const txCost = gasUsed.mul(gasPrice);

          // Expected balance is starting balance less tx cost and 1 ETH (cost of the first token in the edition)
          const expectedBalance = startBalance.sub(_1_ETH).sub(txCost);

          const endBalance = await tracker.get();
          expect(endBalance).to.be.bignumber.equal(expectedBalance);

        });

      });
    });

    describe('buyNextStepFor()', () => {

      beforeEach(async () => {
        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

        // create firstEdition of 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

        // create secondEdition of 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

        // time of latest block
        const latestBlockTime = await time.latest();

        // list firstEdition for sale at 0.1 ETH per token, starting immediately
        const start = latestBlockTime;
        await this.marketplace.listSteppedEditionAuction(minter, firstEditionTokenId, _1_ETH, _0_1_ETH, start, {from: contract});

        // list secondEdition for sale at 0.1 ETH per token, starting in 24 hours
        const tomorrow = new Date(Number(latestBlockTime.toString()));
        tomorrow.setDate(tomorrow.getDate() + 1); // wraps automagically
        const deferredStart = new BN(tomorrow.getTime());
        await this.marketplace.listSteppedEditionAuction(minter, secondEditionTokenId, _1_ETH, _0_1_ETH, deferredStart, {from: contract});

      });

      it('cannot buy an edition not listed for stepped auction', async () => {

        const token = thirdEditionTokenId;

        // collector A attempts to buy a token not listed for stepped auction
        await expectRevert(
          this.marketplace.buyNextStepFor(token, collectorA, {from: contract, value: _1_ETH}),
          'Edition not listed for stepped auction'
        );

      });

      it('cannot buy an edition that is listed to start at a later time', async () => {

        const token = secondEditionTokenId;

        // collector A attempts to buy a token listed for step auction starting tomorrow
        await expectRevert(
          this.marketplace.buyNextStepFor(token, collectorA, {from: contract, value: _1_ETH}),
          'Not started yet'
        );

      });

      context('once auction has begun', () => {

        it('cannot purchase stepped edition tokens with less than the step adjusted price', async () => {

          const edition = firstEditionTokenId;

          const stepPrice = _0_1_ETH;
          const token1Price = _1_ETH;
          const token2Price = token1Price.add(stepPrice.mul(new BN('1')));

          // collector A buys a token
          await this.marketplace.buyNextStepFor(edition, collectorA, {
            from: contract,
            value: token1Price
          });

          // collector B buys a token
          await this.marketplace.buyNextStepFor(edition, collectorB, {
            from: contract,
            value: token2Price
          });

          // collector C attempts to buys a token with less than the step adjusted price
          await expectRevert(
            this.marketplace.buyNextStepFor(edition, collectorC, {
              from: contract,
              value: token2Price
            }),
            'Expected price not met'
          );

        });

        it('cannot purchase stepped edition tokens beyond listed limit', async () => {

          const edition = firstEditionTokenId;

          const stepPrice = _0_1_ETH;
          const token1Price = _1_ETH;
          const token2Price = token1Price.add(stepPrice.mul(new BN('1')));
          const token3Price = token1Price.add(stepPrice.mul(new BN('2')));
          const token4Price = token1Price.add(stepPrice.mul(new BN('3')));

          // collector A buys a token
          await this.marketplace.buyNextStepFor(edition, collectorA, {
            from: contract,
            value: token1Price
          });

          // collector B buys a token
          await this.marketplace.buyNextStepFor(edition, collectorB, {
            from: contract,
            value: token2Price
          });

          // collector C buys a token
          await this.marketplace.buyNextStepFor(edition, collectorC, {
            from: contract,
            value: token3Price
          });

          // collector D attempts to buys a token after limit is reached
          await expectRevert(
            this.marketplace.buyNextStepFor(edition, collectorD, {
              from: contract,
              value: token4Price
            }),
            'Primary market exhausted'
          );

        });

        it('emits an EditionSteppedSaleBuy event on successful purchase', async () => {

          const edition = firstEditionTokenId;

          // collector A buys a token
          const receipt = await this.marketplace.buyNextStepFor(edition, collectorA, {from: contract, value: _1_ETH});
          expectEvent(receipt, 'EditionSteppedSaleBuy', {
            _editionId: edition,
            _tokenId: new BN(edition).add(ONE).add(ONE), // highest token ID
            _buyer: collectorA,
            _price: _1_ETH,
            _currentStep: ZERO
          });

        });

        it('auction\'s currentStep is incremented after a purchase', async () => {

          const edition = firstEditionTokenId;

          let auctionState = await this.marketplace.editionStep(edition);
          expect(auctionState.currentStep).to.be.bignumber.equal(ZERO);

          // collector A buys a token
          await this.marketplace.buyNextStepFor(edition, collectorA, {from: contract, value: _1_ETH});

          auctionState = await this.marketplace.editionStep(edition);
          expect(auctionState.currentStep).to.be.bignumber.equal(ONE);

        });

        it('token price incremented appropriately with each step', async () => {

          const edition = firstEditionTokenId;
          const token1 = new BN(edition).add(ONE).add(ONE);
          const token2 = token1.sub(ONE);
          const token3 = token2.sub(ONE);

          const stepPrice = _0_1_ETH;
          const token1Price = _1_ETH;
          const token2Price = token1Price.add(stepPrice.mul(new BN('1')));
          const token3Price = token1Price.add(stepPrice.mul(new BN('2')));
          const token4price = token1Price.add(stepPrice.mul(new BN('3')));

          // Before any purchases
          let expectedPrice = await this.marketplace.getNextEditionSteppedPrice(edition);
          expect(expectedPrice).to.be.bignumber.equal(token1Price);

          // collector A buys a token
          await this.marketplace.buyNextStepFor(edition, collectorA, {from: contract, value: _1_ETH});

          // Expected price of second token
          expectedPrice = await this.marketplace.getNextEditionSteppedPrice(edition);
          expect(expectedPrice).to.be.bignumber.equal(token2Price);

          // collector B buys a token
          await this.marketplace.buyNextStepFor(edition, collectorB, {
            from: contract,
            value: token2Price
          });

          // Expected price of third token
          expectedPrice = await this.marketplace.getNextEditionSteppedPrice(edition);
          expect(expectedPrice).to.be.bignumber.equal(token3Price);

          // collector C buys a token
          await this.marketplace.buyNextStepFor(edition, collectorC, {
            from: contract,
            value: token3Price
          });

          // Expected price of third token
          expectedPrice = await this.marketplace.getNextEditionSteppedPrice(edition);
          expect(expectedPrice).to.be.bignumber.equal(token4price);


          expect(await this.token.ownerOf(token1)).to.be.equal(collectorA);
          expect(await this.token.ownerOf(token2)).to.be.equal(collectorB);
          expect(await this.token.ownerOf(token3)).to.be.equal(collectorC);
        });

        it('buyers can purchase stepped edition tokens up to listed limit', async () => {

          const edition = firstEditionTokenId;
          const token1 = new BN(edition).add(ONE).add(ONE);
          const token2 = token1.sub(ONE);
          const token3 = token2.sub(ONE);

          const stepPrice = _0_1_ETH;
          const token1Price = _1_ETH;
          const token2Price = token1Price.add(stepPrice.mul(new BN('1')));
          const token3Price = token1Price.add(stepPrice.mul(new BN('2')));

          // collector A buys a token
          await this.marketplace.buyNextStepFor(edition, collectorA, {
            from: contract,
            value: token1Price
          });

          // collector B buys a token
          await this.marketplace.buyNextStepFor(edition, collectorB, {
            from: contract,
            value: token2Price
          });

          // collector C buys a token
          await this.marketplace.buyNextStepFor(edition, collectorC, {
            from: contract,
            value: token3Price
          });

          expect(await this.token.ownerOf(token1)).to.be.equal(collectorA);
          expect(await this.token.ownerOf(token2)).to.be.equal(collectorB);
          expect(await this.token.ownerOf(token3)).to.be.equal(collectorC);
        });

        it('any overpayment is returned to the buyer after a purchase', async () => {

          const edition = firstEditionTokenId;

          // Get the buyer's starting wallet balance
          const tracker = await balance.tracker(contract);
          const startBalance = await tracker.get();

          // Collector A buys a token at 1 gwei gas, gets a receipt
          const gasPrice = new BN(web3.utils.toWei('1', 'gwei').toString());
          const receipt = await this.marketplace.buyNextStepFor(edition, collectorA, {from: contract, value: _1_5_ETH, gasPrice});

          // Determine the gas cost associated with the transaction
          const gasUsed = new BN(receipt.receipt.cumulativeGasUsed);
          const txCost = gasUsed.mul(gasPrice);

          // Expected balance is starting balance less tx cost and 1 ETH (cost of the first token in the edition)
          const expectedBalance = startBalance.sub(_1_ETH).sub(txCost);

          const endBalance = await tracker.get();
          expect(endBalance).to.be.bignumber.equal(expectedBalance);

        });

      });
    });

    describe('buy when sales disabled', () => {
      const _0_1_ETH = ether('0.1');

      beforeEach(async () => {
        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

        // create firstEdition of 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

        // create secondEdition of 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

        // time of latest block
        const latestBlockTime = await time.latest();

        // list firstEdition for sale at 0.1 ETH per token, starting immediately
        const start = latestBlockTime;
        await this.marketplace.listSteppedEditionAuction(minter, firstEditionTokenId, _1_ETH, _0_1_ETH, start, {from: contract});

        // list secondEdition for sale at 0.1 ETH per token, starting in 24 hours
        const tomorrow = new Date(Number(latestBlockTime.toString()));
        tomorrow.setDate(tomorrow.getDate() + 1); // wraps automagically
        const deferredStart = new BN(tomorrow.getTime());
        await this.marketplace.listSteppedEditionAuction(minter, secondEditionTokenId, _1_ETH, _0_1_ETH, deferredStart, {from: contract});
      });

      it('Can buy a token until sales are disabled', async () => {
        const edition = firstEditionTokenId;

        // collector A buys a token
        const receipt = await this.marketplace.buyNextStep(edition, {from: collectorA, value: _1_ETH});
        expectEvent(receipt, 'EditionSteppedSaleBuy', {
          _editionId: edition,
          _tokenId: new BN(edition).add(ONE).add(ONE), // highest token ID
          _buyer: collectorA,
          _price: _1_ETH,
          _currentStep: ZERO
        });

        // seller disables sales
        await this.token.toggleEditionSalesDisabled(firstEditionTokenId, {from: minter});

        // any further sale should fail
        await expectRevert(
          this.marketplace.buyNextStep(edition, {from: collectorA, value: ether('3')}),
          'Edition disabled'
        );
      });
    });

    describe('convertSteppedAuctionToListing()', () => {

      beforeEach(async () => {
        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

        // create firstEdition of 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

        // time of latest block
        const latestBlockTime = await time.latest();

        // list firstEdition for sale at 0.1 ETH per token, starting immediately
        const start = latestBlockTime;
        await this.marketplace.listSteppedEditionAuction(
          minter,
          firstEditionTokenId,
          _1_ETH,
          _0_1_ETH,
          start,
          {from: contract}
        );

      });

      it('reverts unless list price is equal to or greater than minimum bid', async () => {

        const edition = firstEditionTokenId;
        const listingPrice = ZERO;

        // seller attempts to convert to listed edition with invalid list price
        await expectRevert(
          this.marketplace.convertSteppedAuctionToListing(edition, listingPrice, 0, {from: minter}),
          'List price not enough'
        );

      });

      it('reverts if not lister', async () => {

        const edition = firstEditionTokenId;

        // seller attempts to convert to listed edition with invalid list price
        await expectRevert(
          this.marketplace.convertSteppedAuctionToListing(edition, _0_1_ETH, 0, {from: collectorA}),
          'Only seller can convert'
        );

      });

      context('on successful conversion', () => {

        it('emits an ConvertSteppedAuctionToBuyNow event', async () => {

          const edition = firstEditionTokenId;
          const listingPrice = _1_ETH;

          // seller converts to listed edition
          const receipt = await this.marketplace.convertSteppedAuctionToListing(
            edition,
            listingPrice,
            0,
            {from: minter}
          );

          expectEvent(receipt, 'ConvertSteppedAuctionToBuyNow', {
            _editionId: edition,
            _listingPrice: _1_ETH,
            _startDate: ZERO
          });

        });

        it('emits an ConvertSteppedAuctionToBuyNow event for proxy', async () => {
          await this.accessControls.setVerifiedArtistProxy(
            proxy,
            this.merkleProof.claims[minter].index,
            this.merkleProof.claims[minter].proof,
            {from: minter}
          );

          const edition = firstEditionTokenId;
          const listingPrice = _1_ETH;

          // seller converts to listed edition
          const receipt = await this.marketplace.convertSteppedAuctionToListing(
            edition,
            listingPrice,
            0,
            {from: proxy}
          );

          expectEvent(receipt, 'ConvertSteppedAuctionToBuyNow', {
            _editionId: edition,
            _listingPrice: _1_ETH,
            _startDate: ZERO
          });

        });

        it('listing can be verified by reading its configuration', async () => {

          const edition = firstEditionTokenId;
          const listingPrice = _1_ETH;

          // seller converts to listed edition
          await this.marketplace.convertSteppedAuctionToListing(edition, listingPrice, 0, {from: minter});

          //address _seller, uint128 _listingPrice, uint128 _startDate
          const listing = await this.marketplace.editionOrTokenListings(edition);
          expect(listing.seller).to.be.equal(minter);
          expect(listing.price).to.be.bignumber.equal(_1_ETH);
          expect(listing.startDate).to.be.bignumber.equal(ZERO);

        });

        it('cannot be purchased via stepped auction once converted to listing', async () => {

          const edition = firstEditionTokenId;
          const token1Price = _1_ETH;
          const listingPrice = token1Price;

          // seller converts to listed edition
          await this.marketplace.convertSteppedAuctionToListing(edition, listingPrice, 0, {from: minter});

          // collector A attempts to buy a token when the stepped auction has been converted to listing
          await expectRevert(
            this.marketplace.buyNextStep(edition, {
              from: collectorA,
              value: token1Price
            }),
            'Edition not listed for stepped auction'
          );

        });

      });
    });

    describe('convertSteppedAuctionToOffers()', () => {
      beforeEach(async () => {
        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

        // create firstEdition of 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

        // time of latest block
        const latestBlockTime = await time.latest();

        // list firstEdition for sale at 0.1 ETH per token, starting immediately
        const start = latestBlockTime;
        await this.marketplace.listSteppedEditionAuction(
          minter,
          firstEditionTokenId,
          _1_ETH,
          _0_1_ETH,
          start,
          {from: contract}
        );

      });

      it('Can convert to offers as seller', async () => {
        const edition = firstEditionTokenId;

        // seller converts to listed edition
        const receipt = await this.marketplace.convertSteppedAuctionToOffers(
          edition,
          0,
          {from: minter}
        );

        expectEvent(receipt, 'ConvertFromBuyNowToOffers', {
          _editionId: edition,
          _startDate: ZERO
        });
      });

      it('Can convert to offers as proxy', async () => {
        const edition = firstEditionTokenId;

        await this.accessControls.setVerifiedArtistProxy(
          proxy,
          this.merkleProof.claims[minter].index,
          this.merkleProof.claims[minter].proof,
          {from: minter}
        );

        // seller converts to listed edition
        const receipt = await this.marketplace.convertSteppedAuctionToOffers(
          edition,
          0,
          {from: proxy}
        );

        expectEvent(receipt, 'ConvertFromBuyNowToOffers', {
          _editionId: edition,
          _startDate: ZERO
        });
      });

      it('Reverts if not seller', async () => {
        await expectRevert(
          this.marketplace.convertSteppedAuctionToOffers(
            firstEditionTokenId,
            0,
            {from: collectorA}
          ),
          'Only seller can convert'
        );
      });
    });

    describe('updateSteppedAuction()', () => {
      beforeEach(async () => {
        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

        // create firstEdition of 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

        // create secondEdition of 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

        // time of latest block
        const latestBlockTime = await time.latest();

        // list firstEdition for sale at 0.1 ETH per token, starting immediately
        const start = latestBlockTime;
        await this.marketplace.listSteppedEditionAuction(minter, firstEditionTokenId, _1_ETH, _0_1_ETH, start, {from: contract});

        // list secondEdition for sale at 0.1 ETH per token, starting in 24 hours
        const tomorrow = new Date(Number(latestBlockTime.toString()));
        tomorrow.setDate(tomorrow.getDate() + 1); // wraps automagically
        const deferredStart = new BN(tomorrow.getTime());
        await this.marketplace.listSteppedEditionAuction(minter, secondEditionTokenId, _1_ETH, _0_1_ETH, '0', {from: contract});
      });

      it('Can update the stepped auction before the first sale', async () => {
        const {receipt} = await this.marketplace.updateSteppedAuction(firstEditionTokenId, _1_5_ETH, _0_0_0_1_ETH, {from: minter});
        await expectEvent(receipt, 'EditionSteppedAuctionUpdated', {
          _editionId: firstEditionTokenId,
          _basePrice: _1_5_ETH,
          _stepPrice: _0_0_0_1_ETH
        });

        await this.marketplace.buyNextStep(firstEditionTokenId, {
          from: collectorA,
          value: _1_5_ETH
        });

        const token1 = new BN(firstEditionTokenId).add(ONE).add(ONE);
        expect(await this.token.ownerOf(token1)).to.be.equal(collectorA);
      });

      it('Can update the stepped auction before the first sale as proxy', async () => {
        await this.accessControls.setVerifiedArtistProxy(
          proxy,
          this.merkleProof.claims[minter].index,
          this.merkleProof.claims[minter].proof,
          {from: minter}
        );

        const {receipt} = await this.marketplace.updateSteppedAuction(firstEditionTokenId, _1_5_ETH, _0_0_0_1_ETH, {from: proxy});
        await expectEvent(receipt, 'EditionSteppedAuctionUpdated', {
          _editionId: firstEditionTokenId,
          _basePrice: _1_5_ETH,
          _stepPrice: _0_0_0_1_ETH
        });

        await this.marketplace.buyNextStep(firstEditionTokenId, {
          from: collectorA,
          value: _1_5_ETH
        });

        const token1 = new BN(firstEditionTokenId).add(ONE).add(ONE);
        expect(await this.token.ownerOf(token1)).to.be.equal(collectorA);
      });

      it('Reverts when not seller', async () => {
        await expectRevert(
          this.marketplace.updateSteppedAuction(firstEditionTokenId, _1_5_ETH, _0_0_0_1_ETH, {from: collectorA}),
          'Only seller'
        );
      });

      it('Reverts when sales have taken place', async () => {
        await this.marketplace.buyNextStep(firstEditionTokenId, {
          from: collectorA,
          value: _1_5_ETH
        });

        await expectRevert(
          this.marketplace.updateSteppedAuction(firstEditionTokenId, _1_5_ETH, _0_0_0_1_ETH, {from: minter}),
          'Only when no sales'
        );
      });
    });
  });
});
