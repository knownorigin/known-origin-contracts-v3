const {BN, constants, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const _ = require('lodash');

const web3 = require('web3');
const {ether} = require("@openzeppelin/test-helpers");

const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const SteppedPrimarySaleMarketplace = artifacts.require('SteppedPrimarySaleMarketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const EditionRegistry = artifacts.require('EditionRegistry');

contract('ERC721', function (accounts) {
  const [owner, minter, contract, collectorA, collectorB] = accounts;

  const STARTING_EDITION = '10000';

  const firstEditionTokenId = new BN('11000');
  const secondEditionTokenId = new BN('12000');
  const thirdEditionTokenId = new BN('13000');
  const nonExistentTokenId = new BN('99999999999');

  beforeEach(async () => {
    // setu paccess controls
    this.accessControls = await KOAccessControls.new({from: owner});

    // grab the roles
    this.MINTER_ROLE = await this.accessControls.MINTER_ROLE();
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Set up access controls with minter roles
    await this.accessControls.grantRole(this.MINTER_ROLE, owner, {from: owner});
    await this.accessControls.grantRole(this.MINTER_ROLE, minter, {from: owner});

    // setup edition registry
    this.editionRegistry = await EditionRegistry.new(
      this.accessControls.address,
      STARTING_EDITION,
      {from: owner}
    );

    // Create token V3
    this.token = await KnownOriginDigitalAssetV3.new(
      this.accessControls.address,
      this.editionRegistry.address,
      {from: owner}
    );

    // Set contract roles
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.token.address, {from: owner});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, contract, {from: owner});

    // enable NFT in the registry contract
    await this.editionRegistry.enableNftContract(this.token.address, {from: owner});

    // Create marketplace and enable in whitelist
    this.marketplace = await SteppedPrimarySaleMarketplace.new(this.accessControls.address, this.token.address, {from: owner})
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.marketplace.address, {from: owner});
  });

  describe.only('can mint token and make initial primary sale', () => {

    // Basically buy now as set price and no step per-sale
    const BASE_PRICE = ether('1');
    const STEP_PRICE = new BN('0');

    beforeEach(async () => {
      // Ensure owner is approved as this will fail if not
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});
    });

    describe.only('via mintToken(to, uri)', () => {

      beforeEach(async () => {
        // create token
        await this.token.mintToken(minter, 'my-token-uri', {from: contract});

        // setup sale params
        await this.marketplace.setupSale(firstEditionTokenId, BASE_PRICE, STEP_PRICE);
      });

      it('pricing defined correcting', async () => {
        const {basePrice, stepPrice, currentStep} = await this.marketplace.pricing(firstEditionTokenId);
        expect(basePrice).to.be.bignumber.equal(BASE_PRICE);
        expect(stepPrice).to.be.bignumber.equal(STEP_PRICE);
        expect(currentStep).to.be.bignumber.equal('0');
      });

      it('fails when price supplied is not enough', async () => {
        await expectRevert(
          this.marketplace.makePurchase(firstEditionTokenId, {from: collectorA, value: '0'}),
          "Value provided is not enough"
        );
      });

      describe('when making a primary sale purchase', async () => {

        beforeEach(async () => {
          this.minterTracker = await balance.tracker(minter)
          this.marketplaceTracker = await balance.tracker(this.marketplace.address);
          ({logs: this.logs} = await this.marketplace.makePurchase(firstEditionTokenId, {
            from: collectorA,
            value: BASE_PRICE,
            gasPrice: 0
          }));
        });

        it('token is transferred', async () => {
          expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(collectorA);
        });

        it('commission paid to minter', async () => {
          const minterTracker = await this.minterTracker.delta('wei');
          expect(minterTracker).to.be.bignumber.equal(ether('0.85'));
        });

        it('commission paid to KO', async () => {
          const marketplaceTracker = await this.marketplaceTracker.delta('wei');
          expect(marketplaceTracker).to.be.bignumber.equal(ether('0.15'));
        });

        it('emits event', async () => {
          expectEvent.inLogs(this.logs, 'Purchase', {
            editionId: firstEditionTokenId,
            tokenId: firstEditionTokenId,
            buyer: collectorA,
            price: BASE_PRICE
          });
        });

        it('cannot be bought again', async () => {
          await expectRevert(
            this.marketplace.makePurchase(firstEditionTokenId, {from: collectorB, value: '0'}),
            "Value provided is not enough"
          );
        });

        it('cannot be re-sold on primary after creator has transferred asset', async () => {
          // TODO
        });

        it('edition and token data updated accordingly', async () => {
          await validateToken({
            tokenId: firstEditionTokenId,
            editionId: '11000',
            owner: collectorA,
            ownerBalance: '1',
            creator: minter,
            creatorBalance: '0',
            balance: '1',
            size: '1',
            uri: 'my-token-uri'
          })
        });

      });
    })
  });

  const validateToken = async ({tokenId, editionId, owner, ownerBalance, creator, creatorBalance, size, uri}) => {
    console.log(`Validate token ID [${tokenId}] - edition ID [${editionId}]`);

    expect(await this.token.balanceOf(owner)).to.be.bignumber.equal(ownerBalance, "Failed owner balance validation");
    expect(await this.token.balanceOf(creator)).to.be.bignumber.equal(creatorBalance, "Failed creator balance validation");

    ////////////////////
    // Edition checks //
    ////////////////////

    const _editionId = await this.token.getEditionIdForToken(tokenId);
    expect(_editionId).to.bignumber.equal(editionId, "Failed Edition ID validation")

    const _creator = await this.token.getEditionCreator(editionId);
    expect(_creator).to.equal(creator, "Failed Edition creator validation")

    const _size = await this.token.getEditionSize(editionId);
    expect(_size).to.bignumber.equal(size, "Failed Edition size validation")

    const exists = await this.token.editionExists(editionId);
    expect(exists).to.equal(true, "Failed Edition exists validation")

    //////////////////
    // Token checks //
    //////////////////

    expect(await this.token.ownerOf(tokenId)).to.equal(owner, "Failed owner validation");

    const _tokenEditionSize = await this.token.getEditionSizeOfToken(tokenId);
    expect(_tokenEditionSize).to.bignumber.equal(size, "Failed Token edition size validation")

    const _uri = await this.token.tokenURI(tokenId);
    expect(_uri).to.equal(uri, "Failed token URI validation")

    const _tokenCreator = await this.token.getEditionCreatorOfToken(tokenId);
    expect(_tokenCreator).to.equal(creator, "Failed token edition creator validation")

    const editionDetails = await this.token.getEditionDetails(tokenId);
    expect(editionDetails._originalCreator).to.equal(creator, "Failed edition details creator validation")
    expect(editionDetails._owner).to.equal(owner, "Failed edition details owner validation")
    expect(editionDetails._editionId).to.bignumber.equal(editionId, "Failed edition details edition validation")
    expect(editionDetails._size).to.bignumber.equal(size, "Failed edition details size validation")
    expect(editionDetails._uri).to.equal(uri, "Failed edition details uri validation")
  }

});
