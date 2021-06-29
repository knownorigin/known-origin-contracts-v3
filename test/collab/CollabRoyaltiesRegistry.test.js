const {BN, constants, expectEvent, expectRevert, balance, ether, time} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;
const {expect} = require('chai');
const hre = require('hardhat');
const ethers = hre.ethers;
const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const CollabRoyaltiesRegistry = artifacts.require('CollabRoyaltiesRegistry');
const ClaimableFundsReceiverV1 = artifacts.require('ClaimableFundsReceiverV1');

contract('Collaborator Royalty Funds Handling Architecture', function (accounts) {

  const [owner, artist1, artist2, artist3, admin, deployer, contract] = accounts;
  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';
  const HALF = new BN(5000000);
  const QUARTER = new BN(2500000);
  const STARTING_EDITION = '12000';
  const EDITION_ID = new BN(STARTING_EDITION);
  const EDITION_ID_2 = new BN(13000);
  const EDITION_ID_3 = new BN(14000);
  const TOKEN_ID = new BN(12001);
  const TOKEN_ID_2 = new BN(13001);
  const ROYALTY_AMOUNT = new BN(1250000);
  const RECIPIENTS_3 = [artist1, artist2, artist3];
  const SPLITS_3 = [HALF, QUARTER, QUARTER];
  const SPLITS_2 = [HALF, HALF];
  const SEND_AMOUNT = '200';
  const FUNDS_HANDLER_V1 = 'v1';

  let claimableFundsReceiverV1, royaltiesRegistry, accessControls, token, proxyAddr, DEFAULT_ADMIN_ROLE, CONTRACT_ROLE;

  beforeEach(async () => {

    const legacyAccessControls = await SelfServiceAccessControls.new();

    // setup access controls
    accessControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

    // grab the roles
    DEFAULT_ADMIN_ROLE = await accessControls.DEFAULT_ADMIN_ROLE();
    CONTRACT_ROLE = await accessControls.CONTRACT_ROLE();

    // Create royalty registry
    royaltiesRegistry = await CollabRoyaltiesRegistry.new(accessControls.address);

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
    claimableFundsReceiverV1 = await ClaimableFundsReceiverV1.new({from: owner});

    this.modulo = await royaltiesRegistry.modulo();

  });

  describe('CollabRoyaltiesRegistry', () => {

    context('setKoda()', async () => {
      it('reverts if called by non-admin address', async () => {

        const legacyAccessControls = await SelfServiceAccessControls.new();
        const newControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

        const koda = await KnownOriginDigitalAssetV3.new(
          newControls.address,
          ZERO_ADDRESS,
          STARTING_EDITION,
          {from: deployer}
        );

        expectRevert(royaltiesRegistry.setKoda(koda.address, {from: artist1}), 'Caller not admin');

      });

      it('emits KODASet event on success', async () => {

        const legacyAccessControls = await SelfServiceAccessControls.new();
        const newControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

        const koda = await KnownOriginDigitalAssetV3.new(
          newControls.address,
          ZERO_ADDRESS,
          STARTING_EDITION,
          {from: deployer}
        );

        const receipt = await royaltiesRegistry.setKoda(koda.address, {from: admin});
        expectEvent(receipt, 'KODASet', {koda: koda.address});

      });
    });

    context('setAccessControls()', async () => {

      it('reverts if called by non-admin address', async () => {

        const legacyAccessControls = await SelfServiceAccessControls.new();
        const newControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

        expectRevert(royaltiesRegistry.setAccessControls(newControls.address, {from: artist1}), 'Caller not admin');

      });

      it('emits AccessControlsSet event on success', async () => {

        const legacyAccessControls = await SelfServiceAccessControls.new();
        const newControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

        const receipt = await royaltiesRegistry.setAccessControls(newControls.address, {from: admin});
        expectEvent(receipt, 'AccessControlsSet', {accessControls: newControls.address});

      });

    });

    context('setRoyaltyAmount()', async () => {

      it('reverts if called by non-admin address', async () => {

        const newAmount = new BN(1500000); // 15%
        expectRevert(royaltiesRegistry.setRoyaltyAmount(newAmount, {from: artist1}),
          'Caller not admin'
        );

      });

      it('reverts if amount too low', async () => {

        const newAmount = new BN(0);
        expectRevert(royaltiesRegistry.setRoyaltyAmount(newAmount, {from: admin}),
          'Amount to low'
        );

      });

      it('emits RoyaltyAmountSet event on success', async () => {

        const newAmount = new BN(1500000); // 15%
        const receipt = await royaltiesRegistry.setRoyaltyAmount(newAmount, {from: admin});
        expectEvent(receipt, 'RoyaltyAmountSet', {royaltyAmount: newAmount});

      });

    });

    context('addHandler()', async () => {

      it('reverts if called by non-admin address', async () => {

        expectRevert(
          royaltiesRegistry.addHandler(claimableFundsReceiverV1.address, {from: artist1}),
          'Caller not admin'
        );

      });

      it('reverts if funds handler name already registered', async () => {

        await royaltiesRegistry.addHandler(claimableFundsReceiverV1.address, {from: admin});

        expectRevert(
          royaltiesRegistry.addHandler(
            claimableFundsReceiverV1.address, {from: admin}),
          'Handler name already registered'
        );

      });

      it('emits HandlerAdded event on success', async () => {

        const receipt = await royaltiesRegistry.addHandler(claimableFundsReceiverV1.address, {from: admin});
        expectEvent(receipt, 'HandlerAdded', {handler: claimableFundsReceiverV1.address});

      });

    });

    context('royaltyInfo()', async () => {

      it('reverts if royalty not setup for edition', async () => {

        expectRevert(
          royaltiesRegistry.royaltyInfo(EDITION_ID),
          'Edition not setup'
        );

      });

    });

    context('getRoyaltiesReceiver()', async () => {

      it('reverts if royalty not setup for edition', async () => {

        expectRevert(
          royaltiesRegistry.getRoyaltiesReceiver(EDITION_ID),
          'Edition not setup'
        );

      });

    });

    context('once handler added', async () => {

      beforeEach(async () => {

        await royaltiesRegistry.addHandler(claimableFundsReceiverV1.address, {from: admin});

        // create edition for for artist 1
        await token.mintBatchEdition(3, artist1, TOKEN_URI, {from: contract});

      });

      context('setupRoyalty()', async () => {

        it('reverts if recipient list contains fewer than 2 addresses', async () => {

          const BAD_RECIPIENTS = [artist1];

          expectRevert(
            royaltiesRegistry.setupRoyalty(EDITION_ID, FUNDS_HANDLER_V1, BAD_RECIPIENTS, SPLITS_3, {from: contract}),
            'Collab must have more than one funds recipient'
          );

          expectRevert(
            royaltiesRegistry.setupRoyalty(EDITION_ID, FUNDS_HANDLER_V1, [], [], {from: contract}),
            'Collab must have more than one funds recipient'
          );

        });

        it('reverts if recipient list and splits list lengths don\'t match', async () => {

          expectRevert(
            royaltiesRegistry.setupRoyalty(EDITION_ID, FUNDS_HANDLER_V1, RECIPIENTS_3, SPLITS_2, {from: contract}),
            'Recipients and splits lengths must match'
          );

        });

        it('reverts if edition has already been setup', async () => {

          await royaltiesRegistry.setupRoyalty(EDITION_ID, claimableFundsReceiverV1.address, RECIPIENTS_3, SPLITS_3, {from: contract});

          expectRevert(
            royaltiesRegistry.setupRoyalty(EDITION_ID, claimableFundsReceiverV1.address, RECIPIENTS_3, SPLITS_3, {from: contract}),
            'Edition already setup'
          );

        });

        it('emits RoyaltySetup event on success', async () => {
          const receipt = await royaltiesRegistry.setupRoyalty(EDITION_ID, claimableFundsReceiverV1.address, RECIPIENTS_3, SPLITS_3, {from: contract});
          expectEvent(receipt, 'RoyaltySetup', {
            editionId: EDITION_ID,
            handler: claimableFundsReceiverV1.address,
            recipients: RECIPIENTS_3,
            //splits: SPLITS_3 // disable due to inability to perform equality check on arrays within events (tested below)
          });
          expect(receipt.logs[0].args.splits.map(v => v.toString())).to.deep.equal(SPLITS_3.map(v => v.toString()));
        });

      });

      context('once a royalty has been set up', async () => {

        beforeEach(async () => {

          // Get the proxy address with a static call
          proxyAddr = await royaltiesRegistry.setupRoyalty.call(EDITION_ID, claimableFundsReceiverV1.address, RECIPIENTS_3, SPLITS_3, {from: contract});

          // Actually deploy the Proxy
          await royaltiesRegistry.setupRoyalty(EDITION_ID, claimableFundsReceiverV1.address, RECIPIENTS_3, SPLITS_3, {from: contract});

        });

        context('hasRoyalties()', async () => {

          it('false if token id not in edition', async () => {

            // Check the royalty info for the edition id
            const hasRoyalties = await royaltiesRegistry.hasRoyalties(TOKEN_ID_2);
            expect(hasRoyalties).to.be.false;

          });

          it('true if token id in edition', async () => {

            // Check the royalty info for the edition id
            const hasRoyalties = await royaltiesRegistry.hasRoyalties(TOKEN_ID);
            expect(hasRoyalties).to.be.true;

          });

        });

        context('royaltyInfo()', async () => {

          it('returns proxy address and royalty amount', async () => {

            // Check the royalty info for the edition id given a payment amount
            const paymentAmount = ether('1');

            const info = await royaltiesRegistry.royaltyInfo(EDITION_ID, paymentAmount);
            expect(info._receiver).to.equal(proxyAddr);
            expect(info._royaltyAmount).to.be.bignumber.equal((paymentAmount.div(this.modulo)).mul(ROYALTY_AMOUNT));

          });

        });

        context('reuseRoyaltySetup()', async () => {

          it('reverts if called by other than creator or contract role', async () => {

            expectRevert(royaltiesRegistry.reuseRoyaltySetup(EDITION_ID_2, EDITION_ID, {from: admin}),
              'Caller not creator or contract');

          });

          it('reverts if previous edition not registered', async () => {

            expectRevert(royaltiesRegistry.reuseRoyaltySetup(EDITION_ID_2, EDITION_ID_3, {from: contract}),
              'No funds handler registered for previous edition id');

          });

          it('emits RoyaltySetupReused event on success', async () => {

            // Make sure the proper event was emitted
            const receipt = await royaltiesRegistry.reuseRoyaltySetup(EDITION_ID_2, EDITION_ID, {from: contract});
            expectEvent(receipt, 'RoyaltySetupReused', {
              editionId: EDITION_ID_2,
              handler: proxyAddr
            });
          });

          it('appropriate proxy is reused', async () => {

            // Ensure the same proxy will be reused
            expect(await royaltiesRegistry.reuseRoyaltySetup.call(EDITION_ID_2, EDITION_ID, {from: contract})).to.bignumber.eq(proxyAddr);

          });

          context('royaltyInfo() with second edition id', async () => {

            it('returns proxy address and royalty amount', async () => {

              // Reuse proxy
              await royaltiesRegistry.reuseRoyaltySetup(EDITION_ID_2, EDITION_ID, {from: contract});

              const paymentAmount = ether('1');

              const info = await royaltiesRegistry.royaltyInfo(EDITION_ID, paymentAmount);
              expect(info._receiver).to.equal(proxyAddr);
              expect(info._royaltyAmount).to.be.bignumber.equal((paymentAmount.div(this.modulo)).mul(ROYALTY_AMOUNT));

            });

          });

        });

        context('when registry is accessed from NFT', async () => {

          it('NFT\'s royaltyRegistryActive() returns true', async () => {

            expect(await token.royaltyRegistryActive()).to.be.true;

          });

          it('NFT\'s royaltyInfo() returns proxy address and royalty amount', async () => {

            // Verify that the token returns the correct edition id for the token id
            const editionId = await token.getEditionIdOfToken(TOKEN_ID);
            expect(editionId).to.be.bignumber.equal(EDITION_ID);

            const paymentAmount = ether('1');

            let info = await royaltiesRegistry.royaltyInfo(editionId, paymentAmount);
            expect(info._receiver).to.equal(proxyAddr);
            expect(info._royaltyAmount).to.be.bignumber.equal((paymentAmount.div(this.modulo)).mul(ROYALTY_AMOUNT));

            // Check the royalties registry via the NFT
            info = await token.royaltyInfo.call(TOKEN_ID, paymentAmount);
            expect(info._receiver).to.equal(proxyAddr);
            expect(info._royaltyAmount).to.be.bignumber.equal((paymentAmount.div(this.modulo)).mul(ROYALTY_AMOUNT));
          });

        });

      });

    });

  });

  describe('Predetermine collab handler', async () => {

    beforeEach(async () => {
      await royaltiesRegistry.addHandler(claimableFundsReceiverV1.address, {from: admin});

      // create edition for for artist 1
      await token.mintBatchEdition(3, artist1, TOKEN_URI, {from: contract});
    });

    it('address is predetermined - 3x splits', async () => {
      const predetermineAddress = await royaltiesRegistry.predictedRoyaltiesHandler(claimableFundsReceiverV1.address, RECIPIENTS_3, SPLITS_3);
      const proxyAddr = await royaltiesRegistry.setupRoyalty.call(EDITION_ID, claimableFundsReceiverV1.address, RECIPIENTS_3, SPLITS_3, {from: contract});
      expect(predetermineAddress).to.be.equal(proxyAddr);
    });

    it('address is predetermined - 4x splits', async () => {
      const RECIPIENTS = [artist1, artist2, artist3, admin];
      const SPLITS = [QUARTER, QUARTER, QUARTER, QUARTER];

      const predetermineAddress = await royaltiesRegistry.predictedRoyaltiesHandler(claimableFundsReceiverV1.address, RECIPIENTS, SPLITS);
      const proxyAddr = await royaltiesRegistry.setupRoyalty.call(EDITION_ID, claimableFundsReceiverV1.address, RECIPIENTS, SPLITS, {from: contract});
      expect(predetermineAddress).to.be.equal(proxyAddr);
    });

  });

});
