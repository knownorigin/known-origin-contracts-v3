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

const {parseBalanceMap} = require('../utils/parse-balance-map');
const {buildArtistMerkleInput} = require('../utils/merkle-tools');

contract('Collaborator Royalty Funds Handling Architecture', function (accounts) {

  const [owner, artist1, artist2, artist3, admin, deployer, contract] = accounts;
  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';
  const HALF = new BN(5000000);
  const QUARTER = new BN(2500000);
  const STARTING_EDITION = '12000';
  const EDITION_ID = new BN(STARTING_EDITION);
  const EDITION_ID_2 = new BN(13000);
  const TOKEN_ID = new BN(12001);
  const TOKEN_ID_2 = new BN(13001);
  const ROYALTY_AMOUNT = new BN(1250000);
  const RECIPIENTS_3 = [artist1, artist2, artist3];
  const SPLITS_3 = [HALF, QUARTER, QUARTER];

  let claimableFundsReceiverV1, royaltiesRegistry, accessControls, token, proxyAddr, DEFAULT_ADMIN_ROLE, CONTRACT_ROLE;

  beforeEach(async () => {

    const legacyAccessControls = await SelfServiceAccessControls.new();

    // setup access controls
    accessControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

    // grab the roles
    DEFAULT_ADMIN_ROLE = await accessControls.DEFAULT_ADMIN_ROLE();
    CONTRACT_ROLE = await accessControls.CONTRACT_ROLE();

    // Set up access controls with artist roles
    this.merkleProof = parseBalanceMap(buildArtistMerkleInput(1, artist1, artist2, artist3));
    await accessControls.updateArtistMerkleRoot(this.merkleProof.merkleRoot, {from: owner});

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

        await expectRevert(royaltiesRegistry.setKoda(koda.address, {from: artist1}), 'Caller not admin');

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
        await expectRevert(royaltiesRegistry.setAccessControls(newControls.address, {from: artist1}), 'Caller not admin');
      });

      it('emits AccessControlsSet event on success', async () => {
        const legacyAccessControls = await SelfServiceAccessControls.new();
        const newControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

        const receipt = await royaltiesRegistry.setAccessControls(newControls.address, {from: admin});
        await expectEvent(receipt, 'AccessControlsSet', {accessControls: newControls.address});
      });

    });

    context('setRoyaltyAmount()', async () => {

      it('reverts if called by non-admin address', async () => {
        const newAmount = new BN(1500000); // 15%
        await expectRevert(royaltiesRegistry.setRoyaltyAmount(newAmount, {from: artist1}),
          'Caller not admin'
        );
      });

      it('reverts if amount too low', async () => {
        const newAmount = new BN(0);
        await expectRevert(royaltiesRegistry.setRoyaltyAmount(newAmount, {from: admin}),
          'Amount to low'
        );
      });

      it('emits RoyaltyAmountSet event on success', async () => {
        const newAmount = new BN(1500000); // 15%
        const receipt = await royaltiesRegistry.setRoyaltyAmount(newAmount, {from: admin});
        await expectEvent(receipt, 'RoyaltyAmountSet', {royaltyAmount: newAmount});
      });

    });

    context('addHandler()', async () => {

      it('reverts if called by non-admin address', async () => {
        await expectRevert(
          royaltiesRegistry.addHandler(claimableFundsReceiverV1.address, {from: artist1}),
          'Caller not admin'
        );
      });

      it('reverts if funds handler already registered', async () => {
        await royaltiesRegistry.addHandler(claimableFundsReceiverV1.address, {from: admin});
        await expectRevert(
          royaltiesRegistry.addHandler(
            claimableFundsReceiverV1.address, {from: admin}),
          'Handler already registered'
        );
      });

      it('emits HandlerAdded event on success', async () => {
        const receipt = await royaltiesRegistry.addHandler(claimableFundsReceiverV1.address, {from: admin});
        expectEvent(receipt, 'HandlerAdded', {handler: claimableFundsReceiverV1.address});
      });

    });

    context('royaltyInfo()', async () => {
      it('reverts if royalty not setup for edition', async () => {
        await expectRevert(
          royaltiesRegistry.royaltyInfo(EDITION_ID, 0),
          'Edition not setup'
        );
      });
    });

    context('getRoyaltiesReceiver()', async () => {
      it('reverts if royalty not setup for edition', async () => {
        await expectRevert(
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

      context('Can create and use a new royalties recipient', async () => {
        describe('createRoyaltiesRecipient() validation', () => {
          it('reverts if not artist', async () => {
            await expectRevert(
              royaltiesRegistry.createRoyaltiesRecipient(
                this.merkleProof.claims[artist1].index,
                this.merkleProof.claims[artist1].proof,
                claimableFundsReceiverV1.address,
                [],
                [],
                {from: contract}
              ),
              'Caller must have minter role'
            );
          });

          it('reverts if does not equal 100%', async () => {
            await expectRevert(
              royaltiesRegistry.createRoyaltiesRecipient(
                this.merkleProof.claims[artist1].index,
                this.merkleProof.claims[artist1].proof,
                claimableFundsReceiverV1.address,
                [artist1, artist2],
                [QUARTER, HALF],
                {from: artist1}
              ),
              'Shares dont not equal 100%'
            );
          });

          it('reverts if recipients are less than 2', async () => {
            const BAD_RECIPIENTS = [artist1];

            await expectRevert(
              royaltiesRegistry.createRoyaltiesRecipient(
                this.merkleProof.claims[artist1].index,
                this.merkleProof.claims[artist1].proof,
                claimableFundsReceiverV1.address,
                BAD_RECIPIENTS,
                SPLITS_3,
                {from: artist1}
              ),
              'Collab must have more than one funds recipient'
            );

            await expectRevert(
              royaltiesRegistry.createRoyaltiesRecipient(
                this.merkleProof.claims[artist1].index,
                this.merkleProof.claims[artist1].proof,
                claimableFundsReceiverV1.address,
                [],
                [],
                {from: artist1}
              ),
              'Collab must have more than one funds recipient'
            );
          });

          it('reverts if recipients and splits are not in sync', async () => {
            await expectRevert(
              royaltiesRegistry.createRoyaltiesRecipient(
                this.merkleProof.claims[artist1].index,
                this.merkleProof.claims[artist1].proof,
                claimableFundsReceiverV1.address,
                [artist1, artist2],
                SPLITS_3,
                {from: artist1}
              ),
              'Recipients and splits lengths must match'
            );
          });

          it('reverts if handler is not white listed', async () => {
            await expectRevert(
              royaltiesRegistry.createRoyaltiesRecipient(
                this.merkleProof.claims[artist1].index,
                this.merkleProof.claims[artist1].proof,
                contract,
                RECIPIENTS_3,
                SPLITS_3,
                {from: artist1}
              ),
              'Handler is not whitelisted'
            );
          });

          it('reverts if already deployed', async () => {

            // Deploy one ...
            await royaltiesRegistry.createRoyaltiesRecipient(
              this.merkleProof.claims[artist1].index,
              this.merkleProof.claims[artist1].proof,
              claimableFundsReceiverV1.address,
              RECIPIENTS_3,
              SPLITS_3,
              {from: artist1}
            );

            // try again and it will fail
            await expectRevert(
              royaltiesRegistry.createRoyaltiesRecipient(
                this.merkleProof.claims[artist1].index,
                this.merkleProof.claims[artist1].proof,
                claimableFundsReceiverV1.address,
                RECIPIENTS_3,
                SPLITS_3,
                {from: artist1}
              ),
              'Already deployed the royalties handler'
            );
          });
        });
      });

      context('Can pre-determine and then create contract in the future', async () => {
        it('emits events and allows creation and use correctly', async () => {
          const expectedDeploymentAddress = await royaltiesRegistry.predictedRoyaltiesHandler(
            claimableFundsReceiverV1.address,
            RECIPIENTS_3,
            SPLITS_3,
          );

          // Expect revert is using it before setup
          await expectRevert(
            royaltiesRegistry.useRoyaltiesRecipient(EDITION_ID_2, expectedDeploymentAddress, {from: artist1}),
            'No deployed handler found'
          );

          // Deploy it
          let receipt = await royaltiesRegistry.createRoyaltiesRecipient(
            this.merkleProof.claims[artist1].index,
            this.merkleProof.claims[artist1].proof,
            claimableFundsReceiverV1.address,
            RECIPIENTS_3,
            SPLITS_3,
            {from: artist1}
          );

          // Expect event
          expectEvent(receipt, 'RoyaltyRecipientCreated', {
            creator: artist1,
            handler: claimableFundsReceiverV1.address,
            deployedHandler: expectedDeploymentAddress,
            recipients: RECIPIENTS_3,
            //splits: SPLITS_3 // disable due to inability to perform equality check on arrays within events (tested below)
          });
          expect(receipt.logs[0].args.splits.map(v => v.toString())).to.deep.equal(SPLITS_3.map(v => v.toString()));

          // use the deployed address
          receipt = await royaltiesRegistry.useRoyaltiesRecipient(EDITION_ID_2, expectedDeploymentAddress, {from: artist1});
          // Expect event
          expectEvent(receipt, 'RoyaltiesHandlerSetup', {
            deployedHandler: expectedDeploymentAddress,
            editionId: EDITION_ID_2,
          });

          // Confirm all setup
          const receiver = await royaltiesRegistry.getRoyaltiesReceiver(EDITION_ID_2);
          expect(receiver).to.equal(expectedDeploymentAddress);

          // Check token lookup works
          expect(await royaltiesRegistry.hasRoyalties(TOKEN_ID_2)).to.be.true;

          // Check token lookup fails for wrong token
          expect(await royaltiesRegistry.hasRoyalties(TOKEN_ID)).to.be.false;

          // Check the royalty info for the edition id given a payment amount
          const paymentAmount = ether('1');
          const info = await royaltiesRegistry.royaltyInfo(EDITION_ID_2, paymentAmount);
          expect(info._receiver).to.equal(expectedDeploymentAddress);
          expect(info._royaltyAmount).to.be.bignumber.equal((paymentAmount.div(this.modulo)).mul(ROYALTY_AMOUNT));
        });
      });

      context('usePredeterminedRoyaltiesRecipient() as admin to setup a collab before its beeen deployed', async () => {
        it('predetermine, receive funds and then create at a later date', async () => {
          const expectedDeploymentAddress = await royaltiesRegistry.predictedRoyaltiesHandler(
            claimableFundsReceiverV1.address,
            RECIPIENTS_3,
            SPLITS_3,
          );

          // predetermine and setup the royalty handler
          const receipt = await royaltiesRegistry.usePredeterminedRoyaltiesRecipient(
            EDITION_ID_2,
            claimableFundsReceiverV1.address,
            RECIPIENTS_3,
            SPLITS_3,
            {from: owner});

          // Expect event
          expectEvent(receipt, 'FutureRoyaltiesHandlerSetup', {
            deployedHandler: expectedDeploymentAddress,
            editionId: EDITION_ID_2,
          });

          // send money to pre-determined address
          const [ownerSigner] = await ethers.getSigners();
          await ownerSigner.sendTransaction({
            to: expectedDeploymentAddress,
            value: ethers.utils.parseEther('1')
          });
          expect(
            await balance.current(expectedDeploymentAddress)
          ).to.bignumber.equal(ethers.utils.parseEther('1').toString());

          // deploy it
          await royaltiesRegistry.createRoyaltiesRecipient(
            this.merkleProof.claims[artist1].index,
            this.merkleProof.claims[artist1].proof,
            claimableFundsReceiverV1.address,
            RECIPIENTS_3,
            SPLITS_3,
            {from: artist1}
          );

          // Check balance still okay
          expect(
            await balance.current(expectedDeploymentAddress)
          ).to.bignumber.equal(ethers.utils.parseEther('1').toString());
        });
      });

      context('emergencyClearRoyaltiesHandler() has the ability to reset the deployed handler', async () => {
        it('can be cleared', async () => {
          const expectedDeploymentAddress = await royaltiesRegistry.predictedRoyaltiesHandler(
            claimableFundsReceiverV1.address,
            RECIPIENTS_3,
            SPLITS_3,
          );

          // predetermine and setup the royalty handler
          await royaltiesRegistry.usePredeterminedRoyaltiesRecipient(
            EDITION_ID_2,
            claimableFundsReceiverV1.address,
            RECIPIENTS_3,
            SPLITS_3,
            {from: owner});

          // Confirm all setup
          const receiver = await royaltiesRegistry.getRoyaltiesReceiver(EDITION_ID_2);
          expect(receiver).to.equal(expectedDeploymentAddress);

          // Emergency reset
          await royaltiesRegistry.emergencyResetRoyaltiesHandler(EDITION_ID_2);

          // Check its now cleared
          await expectRevert(
            royaltiesRegistry.royaltyInfo(EDITION_ID_2, 0),
            'Edition not setup'
          );
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
      const proxyAddr = await royaltiesRegistry.createRoyaltiesRecipient.call(
        this.merkleProof.claims[artist1].index,
        this.merkleProof.claims[artist1].proof,
        claimableFundsReceiverV1.address,
        RECIPIENTS_3,
        SPLITS_3,
        {from: artist1}
      );
      expect(predetermineAddress).to.be.equal(proxyAddr);
    });

    it('address is predetermined - 4x splits', async () => {
      const RECIPIENTS = [artist1, artist2, artist3, admin];
      const SPLITS = [QUARTER, QUARTER, QUARTER, QUARTER];
      const predetermineAddress = await royaltiesRegistry.predictedRoyaltiesHandler(claimableFundsReceiverV1.address, RECIPIENTS, SPLITS);
      const proxyAddr = await royaltiesRegistry.createRoyaltiesRecipient.call(
        this.merkleProof.claims[artist1].index,
        this.merkleProof.claims[artist1].proof,
        claimableFundsReceiverV1.address,
        RECIPIENTS,
        SPLITS,
        {from: artist1}
      );
      expect(predetermineAddress).to.be.equal(proxyAddr);
    });

  });

  describe('createAndUseRoyaltiesRecipient() - admin functions', async () => {

    beforeEach(async () => {
      await royaltiesRegistry.addHandler(claimableFundsReceiverV1.address, {from: admin});

      // create edition for for artist 1
      await token.mintBatchEdition(3, artist1, TOKEN_URI, {from: contract});
    });

    it('Deployed and setups the edition', async () => {
      const expectedDeploymentAddress = await royaltiesRegistry.predictedRoyaltiesHandler(
        claimableFundsReceiverV1.address,
        RECIPIENTS_3,
        SPLITS_3,
      );

      const receipt = await royaltiesRegistry.createAndUseRoyaltiesRecipient(
        EDITION_ID_2,
        claimableFundsReceiverV1.address,
        RECIPIENTS_3,
        SPLITS_3,
      );

      expectEvent(receipt, 'RoyaltyRecipientCreated', {
        creator: owner,
        handler: claimableFundsReceiverV1.address,
        deployedHandler: expectedDeploymentAddress,
        recipients: RECIPIENTS_3,
        //splits: SPLITS_3 // disable due to inability to perform equality check on arrays within events (tested below)
      });
      expect(receipt.logs[0].args.splits.map(v => v.toString())).to.deep.equal(SPLITS_3.map(v => v.toString()));

      expectEvent(receipt, 'RoyaltiesHandlerSetup', {
        deployedHandler: expectedDeploymentAddress,
        editionId: EDITION_ID_2,
      });
    });

  });

});
