const {BN, balance, ether, time} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');
const hre = require('hardhat');
const ethers = hre.ethers;
const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3Marketplace = artifacts.require('KODAV3PrimaryMarketplace');
const KODAV3SecondaryMarketplace = artifacts.require('KODAV3SecondaryMarketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const CollabRoyaltiesRegistry = artifacts.require('CollabRoyaltiesRegistry');
const ClaimableFundsReceiverV1 = artifacts.require('ClaimableFundsReceiverV1');
const MockERC20 = artifacts.require('MockERC20');

const {parseBalanceMap} = require('../utils/parse-balance-map');
const {buildArtistMerkleInput} = require('../utils/merkle-tools');

contract('Collaborator Royalty Funds Handling Architecture', function (accounts) {

  const [owner, artist1, artist2, artist3, collectorA, collectorB, koCommission, admin, deployer, contract] = accounts;
  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';
  const _0_5_ETH = ether('0.5');
  const ZERO = new BN(0);
  const TWO = new BN(2);
  const THREE = new BN(3);
  const HALF = new BN(5000000);
  const QUARTER = new BN(2500000);
  const STARTING_EDITION = '12000';
  const EDITION_ID_2 = new BN(13000);
  const EDITION_ID_3 = new BN(14000);
  const RECIPIENTS_3 = [artist1, artist2, artist3];
  const RECIPIENTS_2 = [artist1, artist2];
  const SPLITS_3 = [HALF, QUARTER, QUARTER];
  const SPLITS_2 = [HALF, HALF];
  const SEND_AMOUNT = '200';
  const ETH_AMOUNT = ethers.utils.parseEther(SEND_AMOUNT);
  const ERC20_AMOUNT = new BN('200000000000000000000'); // 200 * 10 ** 18
  const SCALE_FACTOR = '10000000';

  let royaltyReceiver, royaltyProxy, royaltyProxy2,
    royaltiesRegistry, accessControls, deployerAcct, marketplace,
    token, erc20Token, proxyAddr, recipientTrackers, recipientBalances,
    contractTracker, DEFAULT_ADMIN_ROLE, CONTRACT_ROLE;

  beforeEach(async () => {

    const legacyAccessControls = await SelfServiceAccessControls.new();

    // setup access controls
    accessControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

    // grab the roles
    DEFAULT_ADMIN_ROLE = await accessControls.DEFAULT_ADMIN_ROLE();
    CONTRACT_ROLE = await accessControls.CONTRACT_ROLE();

    // Create royalty registry
    royaltiesRegistry = await CollabRoyaltiesRegistry.new(accessControls.address);

    // Set up access controls with artist roles
    this.merkleProof = parseBalanceMap(buildArtistMerkleInput(1, artist1, artist2, artist3));
    await accessControls.updateArtistMerkleRoot(this.merkleProof.merkleRoot, {from: owner});

    // Create token V3
    token = await KnownOriginDigitalAssetV3.new(
      accessControls.address,
      royaltiesRegistry.address,
      STARTING_EDITION,
      {from: deployer}
    );

    // Inject KODA dependency into royalty registry
    royaltiesRegistry.setKoda(token.address);

    // Set up access controls
    await accessControls.grantRole(DEFAULT_ADMIN_ROLE, admin, {from: owner});
    await accessControls.grantRole(CONTRACT_ROLE, contract, {from: owner});

    // Funds Handler Implementation V1: Receiver
    royaltyReceiver = await ClaimableFundsReceiverV1.new({from: owner});

    this.modulo = await royaltiesRegistry.modulo();

  });

  describe('Implementation', () => {

    context('ClaimableFundsReceiverV1: Funds Receiver Implementation', async () => {

      it('can be deployed', async () => {

        // Royalty Funds Handler V1: Receiver
        await ClaimableFundsReceiverV1.new(
          {from: owner}
        );

      });

      context('init()', async () => {

        it('can be initialized', async () => {

          // Royalty Funds Handler V1: Splitter
          royaltyReceiver = await ClaimableFundsReceiverV1.new(
            {from: owner}
          );

          await royaltyReceiver.init(RECIPIENTS_3, SPLITS_3);

        });

      });

      context('once initialized', async () => {

        beforeEach(async () => {

          await royaltyReceiver.init(RECIPIENTS_3, SPLITS_3);

        });

        context('totalRecipients()', async () => {

          it('returns the correct number of recipients', async () => {
            expect(await royaltyReceiver.totalRecipients()).to.bignumber.equal(THREE);
          });

        });

        context('shareAtIndex()', async () => {

          it('returns address and split values for given recipient index', async () => {

            for (let i = 0; i < RECIPIENTS_3.length; i++) {
              const royalty = await royaltyReceiver.shareAtIndex(i);
              expect(royalty.recipient).to.bignumber.equal(RECIPIENTS_3[i]);
              expect(royalty.split).to.bignumber.equal(SPLITS_3[i]);

            }

          });

        });

        context('once royalties have been received', async () => {

          beforeEach(async () => {

            // Also send ETH to the contract
            const [ownerSigner] = await ethers.getSigners();
            await ownerSigner.sendTransaction({
              to: royaltyReceiver.address,
              value: ethers.utils.parseEther(SEND_AMOUNT)
            });

            // Initialize Trackers
            contractTracker = await balance.tracker(royaltyReceiver.address);
            recipientTrackers = [];
            recipientBalances = [];
            for (let i = 0; i < RECIPIENTS_3.length; i++) {
              recipientTrackers[i] = await balance.tracker(RECIPIENTS_3[i]);
              recipientBalances[i] = await recipientTrackers[i].get();
            }

            // Mint and transfer some ERC20 funds to contract
            erc20Token = await MockERC20.new({from: owner});
            await erc20Token.transfer(royaltyReceiver.address, ERC20_AMOUNT);

          });

          context('drain()', async () => {

            it('ETH balance of contract drained, recipient balances increased appropriately', async () => {

              await royaltyReceiver.drain();
              const contractEndBalance = await contractTracker.get();
              expect(contractEndBalance).to.be.bignumber.equal('0');

              // N.B.: All these fugly toString()s required because BigNumber vs BN
              for (let i = 0; i < recipientTrackers.length; i++) {
                const singleUnitOfValue = ETH_AMOUNT.div(SCALE_FACTOR);
                const share = singleUnitOfValue.mul(SPLITS_3[i].toString());
                const expectedBalance = share.add(recipientBalances[i].toString());
                const recipientEndBalance = await recipientTrackers[i].get();
                expect(recipientEndBalance.toString()).to.be.equal(expectedBalance.toString());
              }

            });

          });

          context('drainERC20()', async () => {

            it('ERC20 balance of contract drained, recipient balances increased appropriately', async () => {
              await royaltyReceiver.drainERC20(erc20Token.address);
              const endTokenBalance = await erc20Token.balanceOf(royaltyReceiver.address);
              expect(endTokenBalance).to.be.bignumber.equal('0');

              for (let i = 0; i < RECIPIENTS_3.length; i++) {
                const singleUnitOfValue = ERC20_AMOUNT.div(new BN(SCALE_FACTOR));
                const share = singleUnitOfValue.mul(SPLITS_3[i]);
                const recipientEndBalance = await erc20Token.balanceOf(RECIPIENTS_3[i]);
                expect(recipientEndBalance.toString()).to.be.equal(share.toString());
              }

            });

          });

        });

      });

    });

  });

  describe('Funds Handler Proxy', () => {

    beforeEach(async () => {
      // Add handlers to registry
      await royaltiesRegistry.addHandler(royaltyReceiver.address, {from: admin});

      // create edition for for artist 1
      await token.mintBatchEdition(3, artist1, TOKEN_URI, {from: contract});

      // create another edition for for artist 1
      await token.mintBatchEdition(10, artist1, TOKEN_URI, {from: contract});
    });

    context('once deployed and initialized by registry', async () => {

      context('with V1 implementation', async () => {

        beforeEach(async () => {
          // Get the proxy address with a static call
          const proxyAddr = await royaltiesRegistry.predictedRoyaltiesHandler(
            royaltyReceiver.address,
            RECIPIENTS_3,
            SPLITS_3,
          );

          await royaltiesRegistry.createRoyaltiesRecipient(
            this.merkleProof.claims[artist1].index,
            this.merkleProof.claims[artist1].proof,
            royaltyReceiver.address,
            RECIPIENTS_3,
            SPLITS_3,
            {from: artist1});
          await royaltiesRegistry.useRoyaltiesRecipient(EDITION_ID_2, proxyAddr, {from: artist1});

          // Get an ethers contract representation
          const [deployerAcct] = await ethers.getSigners();
          royaltyProxy = new ethers.Contract(
            proxyAddr,
            royaltyReceiver.abi,
            deployerAcct
          );
        });

        context('totalRecipients()', async () => {

          it('returns the correct number of recipients', async () => {
            const totalRecipients = await royaltyProxy.totalRecipients();
            expect(totalRecipients.toString()).to.bignumber.equal(THREE);
          });

          it('implementation does *not* know the number of recipients', async () => {
            const totalRecipients = await royaltyReceiver.totalRecipients();
            expect(totalRecipients.toString()).to.bignumber.equal(ZERO);
          });

        });

        context('shareAtIndex()', async () => {

          it('returns address and split values for given recipient index', async () => {

            for (let i = 0; i < RECIPIENTS_3.length; i++) {
              const royalty = await royaltyProxy.shareAtIndex(i);
              expect(royalty.recipient.toString()).to.bignumber.equal(RECIPIENTS_3[i]);
              expect(royalty.split.toString()).to.bignumber.equal(SPLITS_3[i]);
            }

          });

        });

      });

      context('with multiple proxies', async () => {

        beforeEach(async () => {

          // Get the proxy address with a static call
          const proxyAddr1 = await royaltiesRegistry.predictedRoyaltiesHandler(
            royaltyReceiver.address,
            RECIPIENTS_3,
            SPLITS_3,
          );

          await royaltiesRegistry.createRoyaltiesRecipient(
            this.merkleProof.claims[artist1].index,
            this.merkleProof.claims[artist1].proof,
            royaltyReceiver.address,
            RECIPIENTS_3,
            SPLITS_3,
            {from: artist1});
          await royaltiesRegistry.useRoyaltiesRecipient(EDITION_ID_2, proxyAddr1, {from: artist1});

          // Get an ethers contract representation
          [deployerAcct] = await ethers.getSigners();
          royaltyProxy = new ethers.Contract(
            proxyAddr1,
            royaltyReceiver.abi,
            deployerAcct
          );

          // Get the proxy address with a static call
          const proxyAddr2 = await royaltiesRegistry.predictedRoyaltiesHandler(
            royaltyReceiver.address,
            RECIPIENTS_2,
            SPLITS_2,
          );

          // Actually deploy and use the handler
          await royaltiesRegistry.createRoyaltiesRecipient(
            this.merkleProof.claims[artist1].index,
            this.merkleProof.claims[artist1].proof,
            royaltyReceiver.address,
            RECIPIENTS_2,
            SPLITS_2,
            {from: artist1});
          await royaltiesRegistry.useRoyaltiesRecipient(EDITION_ID_3, proxyAddr2, {from: artist1});

          // Get an ethers contract representation
          [deployerAcct] = await ethers.getSigners();
          royaltyProxy2 = new ethers.Contract(
            proxyAddr2,
            royaltyReceiver.abi,
            deployerAcct
          );

        });

        context('totalRecipients()', async () => {

          it('for each proxy, returns the correct number of recipients', async () => {
            const totalRecipients = await royaltyProxy.totalRecipients();
            const totalRecipients2 = await royaltyProxy2.totalRecipients();
            expect(totalRecipients.toString()).to.bignumber.equal(THREE);
            expect(totalRecipients2.toString()).to.bignumber.equal(TWO);
          });

        });

        context('shareAtIndex()', async () => {

          it('for each proxy, returns address and split values for given recipient index', async () => {

            for (let i = 0; i < RECIPIENTS_3.length; i++) {
              const royalty = await royaltyProxy.shareAtIndex(i);
              expect(royalty.recipient, toString()).to.bignumber.equal(RECIPIENTS_3[i]);
              expect(royalty.split.toString()).to.bignumber.equal(SPLITS_3[i]);
            }

            for (let i = 0; i < RECIPIENTS_2.length; i++) {
              const royalty = await royaltyProxy2.shareAtIndex(i);
              expect(royalty.recipient, toString()).to.bignumber.equal(RECIPIENTS_2[i]);
              expect(royalty.split.toString()).to.bignumber.equal(SPLITS_2[i]);
            }

          });

        });

      });

    });

  });

  describe('Marketplace Secondary Sales', () => {

    let secondaryMarketplace;

    beforeEach(async () => {

      // Create marketplace and enable in whitelist
      marketplace = await KODAV3Marketplace.new(accessControls.address, token.address, koCommission, {from: owner});
      await accessControls.grantRole(CONTRACT_ROLE, marketplace.address, {from: owner});

      secondaryMarketplace = await KODAV3SecondaryMarketplace.new(accessControls.address, token.address, koCommission, {from: owner});
      await accessControls.grantRole(CONTRACT_ROLE, secondaryMarketplace.address, {from: owner});

      // Add funds handler to registry
      await royaltiesRegistry.addHandler(royaltyReceiver.address, {from: admin});

      // Ensure marketplace is approved
      await token.setApprovalForAll(marketplace.address, true, {from: artist1});

      // Create an Edition
      await token.mintBatchEdition(3, artist1, TOKEN_URI, {from: contract});

      expect(await royaltiesRegistry.hasRoyalties(EDITION_ID_2)).to.be.false;

      // Setup royalty
      const expectedAddress = await royaltiesRegistry.predictedRoyaltiesHandler(
        royaltyReceiver.address,
        RECIPIENTS_3,
        SPLITS_3,
      );
      await royaltiesRegistry.createRoyaltiesRecipient(
        this.merkleProof.claims[artist1].index,
        this.merkleProof.claims[artist1].proof,
        royaltyReceiver.address,
        RECIPIENTS_3,
        SPLITS_3,
        {from: artist1});
      await royaltiesRegistry.useRoyaltiesRecipient(EDITION_ID_2, expectedAddress, {from: artist1});

      proxyAddr = await royaltiesRegistry.getRoyaltiesReceiver(EDITION_ID_2);
      expect(proxyAddr).to.be.equal(expectedAddress);
      expect(await royaltiesRegistry.hasRoyalties(EDITION_ID_2)).to.be.true;

      const {_receiver} = await royaltiesRegistry.royaltyInfo(EDITION_ID_2, ether('1'));
      expect(_receiver).to.be.equal(proxyAddr);
      expect(_receiver).to.be.equal(expectedAddress);

      // Setup a contract handle to interact with
      const [deployerAcct] = await ethers.getSigners();
      royaltyProxy = new ethers.Contract(
        proxyAddr,
        royaltyReceiver.abi,
        deployerAcct
      );

      // List edition - primary sale
      await marketplace.listForBuyNow(artist1, EDITION_ID_2, _0_5_ETH, await time.latest(), {from: contract});

      // Do primary sale of a token to CollectorA
      await marketplace.buyEditionToken(EDITION_ID_2, {from: collectorA, value: _0_5_ETH});

      // check collector A now owns the token
      expect(await token.ownerOf(EDITION_ID_2)).to.be.equal(collectorA);

      // Setup recipient trackers and balances  q
      recipientTrackers = [];
      recipientBalances = [];
      for (let i = 0; i < RECIPIENTS_3.length; i++) {
        recipientTrackers[i] = await balance.tracker(RECIPIENTS_3[i]);
        recipientBalances[i] = await recipientTrackers[i].get();
      }
    });

    it('sends royalties to funds handler on accepted token bid', async () => {

      // CollectorB offers 0.5 ETH for token
      await secondaryMarketplace.placeTokenBid(EDITION_ID_2, {from: collectorB, value: _0_5_ETH});

      // CollectorA has to approve the marketplace
      await token.setApprovalForAll(secondaryMarketplace.address, true, {from: collectorA});

      contractTracker = await balance.tracker(proxyAddr);
      let platformAccountTracker = await balance.tracker(await secondaryMarketplace.platformAccount());
      let collectorATracker = await balance.tracker(collectorA);

      // CollectorA accepts bid
      const gasPrice = new BN(web3.utils.toWei('1', 'gwei').toString());
      const receipt = await secondaryMarketplace.acceptTokenBid(EDITION_ID_2, _0_5_ETH, {from: collectorA, gasPrice});

      // Determine the gas cost associated with the transaction
      const gasUsed = new BN(receipt.receipt.cumulativeGasUsed);
      const txCost = gasUsed.mul(gasPrice);

      const expectedArtistRoyalties = new BN(_0_5_ETH)
        .div(await secondaryMarketplace.modulo())
        .mul(await royaltiesRegistry.royaltyAmount());

      // Check royalties recipient gets 12.5%
      expect(await contractTracker.delta()).to.be.bignumber.equal(
        expectedArtistRoyalties
      );

      const expectedPlatformCommission = new BN(_0_5_ETH)
        .div(await secondaryMarketplace.modulo())
        .mul(await secondaryMarketplace.platformSecondarySaleCommission());

      // check platform gets 2.5%
      expect(await platformAccountTracker.delta()).to.be.bignumber.equal(
        expectedPlatformCommission
      );

      const expectedSellerValue = new BN(_0_5_ETH)
        .sub(txCost)
        .sub(expectedPlatformCommission)
        .sub(expectedArtistRoyalties);

      // check seller gets the rest
      expect(await collectorATracker.delta()).to.be.bignumber.equal(
        expectedSellerValue
      );

    });

    it('funds can be drained from handler after accepted token bid', async () => {

      // CollectorB offers 0.5 ETH for token
      await secondaryMarketplace.placeTokenBid(EDITION_ID_2, {from: collectorB, value: _0_5_ETH});

      // CollectorA has to approve the marketplace
      await token.setApprovalForAll(secondaryMarketplace.address, true, {from: collectorA});

      // Create balance trackers
      contractTracker = await balance.tracker(proxyAddr);
      let collectorATracker = await balance.tracker(collectorA);

      // CollectorA accepts bid
      const gasPrice = new BN(web3.utils.toWei('1', 'gwei').toString());
      const receipt = await secondaryMarketplace.acceptTokenBid(EDITION_ID_2, _0_5_ETH, {from: collectorA, gasPrice});

      // Determine the gas cost associated with the transaction
      const gasUsed = new BN(receipt.receipt.cumulativeGasUsed);
      const txCost = gasUsed.mul(gasPrice);

      const expectedArtistRoyalties = new BN(_0_5_ETH)
        .div(await secondaryMarketplace.modulo())
        .mul(await royaltiesRegistry.royaltyAmount());

      const expectedPlatformCommission = new BN(_0_5_ETH)
        .div(await secondaryMarketplace.modulo())
        .mul(await secondaryMarketplace.platformSecondarySaleCommission());

      const expectedSellerValue = new BN(_0_5_ETH)
        .sub(txCost)
        .sub(expectedPlatformCommission)
        .sub(expectedArtistRoyalties);

      // check seller gets the rest
      expect(await collectorATracker.delta()).to.be.bignumber.equal(
        expectedSellerValue
      );

      // Ensure proxy works
      const totalRecipients = await royaltyProxy.totalRecipients();
      expect(totalRecipients.toString()).to.bignumber.equal(THREE);

      // Get balance of contract
      const contractBalance = await contractTracker.get();

      // Drain the funds
      await royaltyProxy.drain();

      // Funds handler contract should be drained
      const contractEndBalance = await contractTracker.get();
      expect(contractEndBalance).to.be.bignumber.eq('0');

      // Check recipient balances
      for (let i = 0; i < recipientTrackers.length; i++) {
        const singleUnitOfValue = contractBalance.div(new BN(SCALE_FACTOR));
        const share = singleUnitOfValue.mul(SPLITS_3[i]);
        const expectedBalance = share.add(recipientBalances[i]);
        const recipientEndBalance = await recipientTrackers[i].get();
        expect(recipientEndBalance).to.be.bignumber.eq(expectedBalance);
      }

    });

  });

});
