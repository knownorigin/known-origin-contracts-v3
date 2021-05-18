const {BN, constants, time, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;
const _ = require('lodash');
const {ether} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3Marketplace = artifacts.require('KODAV3PrimaryMarketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

const {validateEditionAndToken} = require('../test-helpers');

contract('KODAV3Marketplace', function (accounts) {
  const [owner, minter, anotherMinter, koCommission, contract, collectorA, collectorB, collectorC, collectorD] = accounts;

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = '10000';

  const _0_1_ETH = ether('0.1');
  const _0_2_ETH = ether('0.2');
  const _0_3_ETH = ether('0.3');
  const ONE = new BN('1');
  const ZERO = new BN('0');

  const firstEditionTokenId = new BN('11000');
  const secondEditionTokenId = new BN('12000');
  const thirdEditionTokenId = new BN('13000');

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

  // describe('two primary sales via \'buy now\' purchase and re-sold on secondary', () => {
  //
  //   const _0_1_ETH = ether('0.1');
  //
  //   beforeEach(async () => {
  //     // Ensure owner is approved as this will fail if not
  //     await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});
  //
  //     // create 100 tokens to the minter
  //     await this.token.mintBatchEdition(100, minter, TOKEN_URI, {from: contract});
  //
  //     // list edition for sale at 0.1 ETH per token
  //     await this.marketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, await time.latest(), {from: contract});
  //   });
  //
  //   it('initial primary sale, resold on secondary', async () => {
  //
  //     //////////////////////////////
  //     // collector A buys 1 token //
  //     //////////////////////////////
  //
  //     const token1 = firstEditionTokenId;
  //
  //     // collector A buys a token
  //     await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});
  //
  //     // owner of token 1 is the collector
  //     expect(await this.token.ownerOf(token1)).to.be.equal(collectorA);
  //
  //     // Minter now owns 9 and collector owns 1
  //     await validateEditionAndToken.call(this, {
  //       tokenId: token1,
  //       editionId: firstEditionTokenId,
  //       owner: collectorA,
  //       ownerBalance: '1',
  //       creator: minter,
  //       creatorBalance: '99',
  //       size: '100',
  //       uri: TOKEN_URI
  //     });
  //
  //     //////////////////////////////
  //     // collector B buys 1 token //
  //     //////////////////////////////
  //
  //     const token2 = firstEditionTokenId.add(new BN('1'));
  //
  //     // collector A buys a token
  //     await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});
  //
  //     // owner of token 1 is the collector
  //     expect(await this.token.ownerOf(token2)).to.be.equal(collectorB);
  //
  //     // Minter now owns 8, collectorA owns 1, collector B owns 1
  //     await validateEditionAndToken.call(this, {
  //       tokenId: token2,
  //       editionId: firstEditionTokenId,
  //       owner: collectorB,
  //       ownerBalance: '1',
  //       creator: minter,
  //       creatorBalance: '98',
  //       size: '100',
  //       uri: TOKEN_URI
  //     });
  //
  //     ///////////////////////////////////////////////////////////////
  //     // collector A lists token - collector B buys it - secondary //
  //     ///////////////////////////////////////////////////////////////
  //
  //     // Ensure collector a approves marketplace
  //     await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorA});
  //
  //     // listed
  //     await this.marketplace.listToken(token1, _0_1_ETH, await time.latest(), {from: collectorA});
  //
  //     // bought buy collector 1
  //     const recipient = await this.marketplace.buyToken(token1, {from: collectorB, value: _0_1_ETH});
  //     await expectEvent.inTransaction(recipient.tx, KnownOriginDigitalAssetV3, 'ReceivedRoyalties', {
  //       _royaltyRecipient: minter,
  //       _buyer: collectorB,
  //       _tokenId: token1,
  //       _tokenPaid: ZERO_ADDRESS,
  //       _amount: _0_1_ETH.div(new BN('10000000')).mul(this.secondarySaleRoyalty) // 12.5% royalties
  //     });
  //
  //     // collector B owns both
  //     expect(await this.token.ownerOf(token1)).to.be.equal(collectorB);
  //     expect(await this.token.ownerOf(token2)).to.be.equal(collectorB);
  //
  //     await validateEditionAndToken.call(this, {
  //       tokenId: token1,
  //       editionId: firstEditionTokenId,
  //       owner: collectorB,
  //       ownerBalance: '2',
  //       creator: minter,
  //       creatorBalance: '98',
  //       size: '100',
  //       uri: TOKEN_URI
  //     });
  //   });
  //
  //   it('all tokens bought on primary and sold on the secondary', async () => {
  //     const start = _.toNumber(firstEditionTokenId);
  //     const end = start + 100;
  //     const tokenIds = _.range(start, end);
  //
  //     // collector A buys all
  //     for (const id of tokenIds) {
  //       await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});
  //       expect(await this.token.ownerOf(id)).to.be.equal(collectorA);
  //     }
  //
  //     // Ensure collector a approves marketplace
  //     await this.token.setApprovalForAll(this.marketplace.address, true, {from: collectorA});
  //
  //     // collector A lists all and then collector B buys them all
  //     for (const id of tokenIds) {
  //       await this.marketplace.listToken(id, _0_1_ETH, await time.latest(), {from: collectorA});
  //       await this.marketplace.buyToken(id, {from: collectorB, value: _0_1_ETH});
  //       expect(await this.token.ownerOf(id)).to.be.equal(collectorB);
  //     }
  //   }).timeout(300000);
  //
  //   describe('delistEdition()', async () => {
  //
  //     it('edition is delisted and emits an event', async () => {
  //       const receipt = await this.marketplace.delistEdition(firstEditionTokenId, {from: minter});
  //       expectEvent(receipt, 'EditionDeListed', {
  //         _editionId: firstEditionTokenId
  //       });
  //
  //       const listing = await this.marketplace.getListing(firstEditionTokenId);
  //       expect(listing._seller).to.be.equal(ZERO_ADDRESS);
  //       expect(listing._listingPrice).to.be.bignumber.equal(ZERO);
  //       expect(listing._startDate).to.be.bignumber.equal(ZERO);
  //     });
  //
  //     it('reverts if not edition create', async () => {
  //       await expectRevert(
  //         this.marketplace.delistEdition(firstEditionTokenId, {from: collectorA}),
  //         'Caller not creator or contract'
  //       );
  //     });
  //
  //   });
  // });

  describe.only('primary sale edition listing', async () => {

    beforeEach(async () => {
      // Ensure owner is approved as this will fail if not
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // create 3 tokens to the minter
      await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

      this.start = await time.latest();
    });

    describe('listForBuyNow()', () => {

      beforeEach(async () => {
        await this.marketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, this.start, {from: contract});
      });

      it('can list and purchase upto limit (of 3)', async () => {
        const listing = await this.marketplace.editionOrTokenListings(firstEditionTokenId);
        expect(listing.seller).to.be.equal(minter);
        expect(listing.price).to.be.bignumber.equal(_0_1_ETH);
        expect(listing.startDate).to.be.bignumber.equal(this.start);

        const token1 = firstEditionTokenId;
        const token2 = firstEditionTokenId.add(ONE);
        const token3 = token2.add(ONE);

        // collector A buys a token
        await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});

        // collector B buys a token
        await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});

        // collector C buys a token
        await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorC, value: _0_1_ETH});

        expect(await this.token.ownerOf(token1)).to.be.equal(collectorA);
        expect(await this.token.ownerOf(token2)).to.be.equal(collectorB);
        expect(await this.token.ownerOf(token3)).to.be.equal(collectorC);
      });

      it('reverts if not contract role', async () => {
        await expectRevert(
          this.marketplace.listForBuyNow(minter, firstEditionTokenId.add(ONE), _0_1_ETH, await time.latest(), {from: collectorA}),
          "Only owner or contract"
        );
      });

      it('reverts if under min bid amount listing price', async () => {
        await expectRevert(
          this.marketplace.listForBuyNow(minter, firstEditionTokenId.add(ONE), this.minBidAmount.sub(ONE), await time.latest(), {from: contract}),
          'Listing price not enough'
        );
      });

      describe('setBuyNowPriceListing()', async () => {

        it('reverts if not edition owner', async () => {
          await expectRevert(
            this.marketplace.setBuyNowPriceListing(firstEditionTokenId, _0_2_ETH, {from: collectorA}),
            'Only seller or contract'
          );
        });

        it('can change if caller is a contract', async () => {
          const receipt = await this.marketplace.setBuyNowPriceListing(firstEditionTokenId, _0_2_ETH, {from: contract});

          const {price} = await this.marketplace.editionOrTokenListings(firstEditionTokenId);
          expect(price).to.be.bignumber.equal(_0_2_ETH);

          expectEvent(receipt, 'BuyNowPriceChanged', {
            _id: firstEditionTokenId,
            _price: _0_2_ETH
          });
        });

        it('can change if caller is a edition creator', async () => {
          await this.marketplace.setBuyNowPriceListing(firstEditionTokenId, _0_3_ETH, {from: minter});

          const {price} = await this.marketplace.editionOrTokenListings(firstEditionTokenId);
          expect(price).to.be.bignumber.equal(_0_3_ETH);
        });
      });
    });

    describe('buyEditionToken()', () => {

      const _0_1_ETH = ether('0.1');

      beforeEach(async () => {
        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

        // create 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});
      });

      it('happy path', async () => {
        this.start = await time.latest();
        await this.marketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, this.start, {from: contract});

        // collector A buys a token
        await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});

        expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);
      });

      it('reverts if no listing', async () => {
        await expectRevert(
          this.marketplace.buyEditionToken(firstEditionTokenId.sub(ONE), {from: collectorA, value: _0_1_ETH}),
          'No listing found'
        );
      });

      it('reverts if List price not satisfied', async () => {
        this.start = await time.latest();
        await this.marketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, this.start, {from: contract});

        await expectRevert(
          this.marketplace.buyEditionToken(firstEditionTokenId, {from: contract, value: _0_1_ETH.sub(ONE)}),
          'List price not satisfied'
        );
      });

      it('reverts if List not available yet', async () => {
        this.start = (await time.latest()).mul(new BN('2'));
        await this.marketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, this.start, {from: contract});

        await expectRevert(
          this.marketplace.buyEditionToken(firstEditionTokenId, {from: contract, value: _0_1_ETH}),
          'List not available yet'
        );
      });

      it('reverts if none left', async () => {
        this.start = await time.latest();
        await this.marketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, this.start, {from: contract});

        await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});
        await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorB, value: _0_1_ETH});
        await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorC, value: _0_1_ETH});

        await expectRevert.unspecified(
          this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH}),
          'No tokens left on the primary market'
        );
      });

    });

    describe('buyEditionTokenFor()', () => {

      const _0_1_ETH = ether('0.1');

      beforeEach(async () => {
        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

        // create 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});
      });

      it('happy path', async () => {
        this.start = await time.latest();
        await this.marketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, this.start, {from: contract});

        // collector D buys a token for collect A
        await this.marketplace.buyEditionTokenFor(firstEditionTokenId, collectorA, {
          from: collectorD,
          value: _0_1_ETH
        });

        expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);
      });

      it('reverts if no listing', async () => {
        await expectRevert(
          this.marketplace.buyEditionToken(firstEditionTokenId.sub(ONE), {from: collectorA, value: _0_1_ETH}),
          'No listing found'
        );
      });

      it('reverts if List price not satisfied', async () => {
        this.start = await time.latest();
        await this.marketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, this.start, {from: contract});

        await expectRevert(
          this.marketplace.buyEditionTokenFor(firstEditionTokenId, contract, {
            from: contract,
            value: _0_1_ETH.sub(ONE)
          }),
          'List price not satisfied'
        );
      });

      it('reverts if List not available yet', async () => {
        this.start = (await time.latest()).mul(new BN('2'));
        await this.marketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, this.start, {from: contract});

        await expectRevert(
          this.marketplace.buyEditionTokenFor(firstEditionTokenId, contract, {from: contract, value: _0_1_ETH}),
          'List not available yet'
        );
      });

      it('reverts if none left', async () => {
        this.start = await time.latest();
        await this.marketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, this.start, {from: contract});

        await this.marketplace.buyEditionTokenFor(firstEditionTokenId, collectorA, {
          from: collectorA,
          value: _0_1_ETH
        });
        await this.marketplace.buyEditionTokenFor(firstEditionTokenId, collectorB, {
          from: collectorB,
          value: _0_1_ETH
        });
        await this.marketplace.buyEditionTokenFor(firstEditionTokenId, collectorC, {
          from: collectorC,
          value: _0_1_ETH
        });

        await expectRevert.unspecified(
          this.marketplace.buyEditionTokenFor(firstEditionTokenId, collectorA, {from: collectorA, value: _0_1_ETH}),
          'No tokens left on the primary market'
        );
      });

    });

    describe('convertFromBuyNowToOffers()', () => {

      beforeEach(async () => {
        // create a second edition
        await this.token.mintBatchEdition(3, anotherMinter, TOKEN_URI, {from: contract});

        // list the first edition
        await this.marketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, this.start, {from: contract});
      });

      it('reverts if trying to convert an listing which does not exist', async () => {
        const start = await time.latest();
        await expectRevert(
          this.marketplace.convertFromBuyNowToOffers(secondEditionTokenId, start, {from: minter}),
          'Only seller or contract'
        );
      });

      it('reverts if converting an edition you didnt create', async () => {
        const start = await time.latest();
        await expectRevert(
          this.marketplace.convertFromBuyNowToOffers(secondEditionTokenId, start, {from: anotherMinter}),
          'Only seller or contract'
        );
      });

      it('reverts if edition does not exist', async () => {
        const start = await time.latest();
        await expectRevert(
          this.marketplace.convertFromBuyNowToOffers(9999, start, {from: minter}),
          'Only seller or contract'
        );
      });

      it('reverts if trying to convert an stepped auction to a listing', async () => {
        const start = await time.latest();
        await this.marketplace.listSteppedEditionAuction(anotherMinter, secondEditionTokenId, _0_1_ETH, _0_1_ETH, start, {from: contract});

        await expectRevert(
          this.marketplace.convertFromBuyNowToOffers(secondEditionTokenId, start, {from: anotherMinter}),
          'Only seller or contract'
        );
      });

      it('reverts if edition is already enabled for offers', async () => {
        const start = await time.latest();
        await this.marketplace.convertFromBuyNowToOffers(firstEditionTokenId, start, {from: minter});

        await expectRevert(
          this.marketplace.convertFromBuyNowToOffers(firstEditionTokenId, start, {from: minter}),
          'Only seller or contract'
        );
      });

      it('reverts if not a contract', async () => {
        const start = await time.latest();
        await expectRevert(
          this.marketplace.convertFromBuyNowToOffers(secondEditionTokenId, start, {from: collectorA}),
          'Only seller or contract'
        );
      });

      it('once converted, listing is removed and offers enabled and event emitted', async () => {
        const start = await time.latest();
        const receipt = await this.marketplace.convertFromBuyNowToOffers(firstEditionTokenId, start, {from: minter});

        // emits event
        expectEvent(receipt, 'EditionAcceptingOffer', {
          _editionId: firstEditionTokenId,
          _startDate: start
        });

        // start date is set
        const startDate = await this.marketplace.editionOffersStartDate(firstEditionTokenId);
        expect(startDate).to.be.bignumber.equal(start);

        // listing is clear
        const listing = await this.marketplace.editionOrTokenListings(firstEditionTokenId);
        expect(listing.seller).to.be.equal(ZERO_ADDRESS);
        expect(listing.price).to.be.bignumber.equal(ZERO);
        expect(listing.startDate).to.be.bignumber.equal(ZERO);
      });
    });

    describe('buy when sales disabled', () => {
      const _0_1_ETH = ether('0.1');

      beforeEach(async () => {
        // Ensure owner is approved as this will fail if not
        await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

        // create 3 tokens to the minter
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});

        this.start = await time.latest();
        await this.marketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, this.start, {from: contract});
      });

      it('Can buy a token until sales are disabled', async () => {
        // collector A buys a token
        await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH});

        expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);

        // seller disables sales
        await this.token.toggleEditionSalesDisabled(firstEditionTokenId, {from: minter})

        // any further sale should fail
        await expectRevert(
          this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH}),
          "Edition sales disabled"
        )
      });
    })
  });

});
