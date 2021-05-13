const {BN, constants, time, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;
const _ = require('lodash');
const {ether} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3Marketplace = artifacts.require('KODAV3PrimaryMarketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

contract('KODAV3PrimaryMarketplace', function (accounts) {
  const [admin, owner, minter, koCommission, contract, collectorA] = accounts;

  const STARTING_EDITION = '10000';

  const _0_1_ETH = ether('0.1');

  const firstEditionTokenId = new BN('11000');

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

  describe.only('commission override', () => {
    const commissionOverride = new BN('4000000')

    describe('setKoCommissionOverrideForReceiver()', () => {
      it('Updates the override as admin', async () => {
        const {receipt} = await this.marketplace.setKoCommissionOverrideForReceiver(minter, commissionOverride, {from: admin})

        await expectEvent(receipt, 'AdminSetKoCommissionOverrideForReceiver', {
          _receiver: minter,
          _koCommission: commissionOverride
        })
      })

      it('Reverts when not admin', async () => {
        await expectRevert(
          this.marketplace.setKoCommissionOverrideForReceiver(minter, commissionOverride, {from: collectorA}),
          "Caller not admin"
        )
      })
    })

    describe('deactivateKOCommissionOverrideForReceiver()', () => {
      it('Deactivates as admin', async () => {
        // set the commission override
        await this.marketplace.setKoCommissionOverrideForReceiver(minter, commissionOverride, {from: admin})

        // check the override is valid
        const koCommissionOverrideForReceiver = await this.marketplace.koCommissionOverrideForReceivers(minter)
        expect(koCommissionOverrideForReceiver.active).to.be.true
        expect(koCommissionOverrideForReceiver.koCommission).to.be.bignumber.equal(commissionOverride)

        await this.marketplace.deactivateKOCommissionOverrideForReceiver(minter)
        expect((await this.marketplace.koCommissionOverrideForReceivers(minter)).active).to.be.false
      })

      it('Reverts when not admin', async () => {
        await expectRevert(
          this.marketplace.deactivateKOCommissionOverrideForReceiver(minter, {from: collectorA}),
          "Caller not admin"
        )
      })
    })

    describe('setKoCommissionOverrideForEdition()', () => {
      it('Updates the override as admin', async () => {
        const {receipt} = await this.marketplace.setKoCommissionOverrideForEdition(firstEditionTokenId, commissionOverride, {from: admin})

        await expectEvent(receipt, 'AdminSetKoCommissionOverrideForEdition', {
          _editionId: firstEditionTokenId,
          _koCommission: commissionOverride
        })
      })

      it('Reverts when not admin', async () => {
        await expectRevert(
          this.marketplace.setKoCommissionOverrideForEdition(firstEditionTokenId, commissionOverride, {from: collectorA}),
          "Caller not admin"
        )
      })
    })

    describe('deactivateKOCommissionOverrideForReceiver()', () => {
      it('Deactivates as admin', async () => {
        // set the commission override
        await this.marketplace.setKoCommissionOverrideForEdition(firstEditionTokenId, commissionOverride, {from: admin})

        // check the override is valid
        const koCommissionOverrideForEdition = await this.marketplace.koCommissionOverrideForEditions(firstEditionTokenId)
        expect(koCommissionOverrideForEdition.active).to.be.true
        expect(koCommissionOverrideForEdition.koCommission).to.be.bignumber.equal(commissionOverride)

        await this.marketplace.deactivateKOCommissionOverrideForEdition(firstEditionTokenId)
        expect((await this.marketplace.koCommissionOverrideForEditions(firstEditionTokenId)).active).to.be.false
      })

      it('Reverts when not admin', async () => {
        await expectRevert(
          this.marketplace.deactivateKOCommissionOverrideForReceiver(minter, {from: collectorA}),
          "Caller not admin"
        )
      })
    })

    it('When override set to non zero value, sale uses this override', async () => {
      await this.marketplace.setKoCommissionOverrideForReceiver(minter, commissionOverride, {from: admin})

      // Ensure owner is approved as this will fail if not
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // create 3 tokens to the minter
      await this.token.mintBatchEdition(3, minter, 'random', {from: contract});

      this.start = await time.latest();
      await this.marketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, this.start, {from: contract});

      const minterTracker = await balance.tracker(minter)
      const platformTracker = await balance.tracker(koCommission)

      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH})

      const platformCommission = _0_1_ETH.divn(10000000).mul(commissionOverride)
      expect(await platformTracker.delta()).to.be.bignumber.equal(platformCommission)

      expect(await minterTracker.delta()).to.be.bignumber.equal(_0_1_ETH.sub(platformCommission))
    })

    it('When override set zero value, sale uses this override and KO gets no commission', async () => {
      await this.marketplace.setKoCommissionOverrideForReceiver(minter, new BN('0'), {from: admin})

      // Ensure owner is approved as this will fail if not
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // create 3 tokens to the minter
      await this.token.mintBatchEdition(3, minter, 'random', {from: contract});

      this.start = await time.latest();
      await this.marketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, this.start, {from: contract});

      const minterTracker = await balance.tracker(minter)
      const platformTracker = await balance.tracker(koCommission)

      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH})

      expect(await platformTracker.delta()).to.be.bignumber.equal('0')
      expect(await minterTracker.delta()).to.be.bignumber.equal(_0_1_ETH)
    })

    it('When override set to 100%, sale uses this override and KO gets no commission', async () => {
      await this.marketplace.setKoCommissionOverrideForReceiver(minter, new BN('10000000'), {from: admin})

      // Ensure owner is approved as this will fail if not
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // create 3 tokens to the minter
      await this.token.mintBatchEdition(3, minter, 'random', {from: contract});

      this.start = await time.latest();
      await this.marketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, this.start, {from: contract});

      const minterTracker = await balance.tracker(minter)
      const platformTracker = await balance.tracker(koCommission)

      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH})

      expect(await platformTracker.delta()).to.be.bignumber.equal(_0_1_ETH)
      expect(await minterTracker.delta()).to.be.bignumber.equal('0')
    })

    it('Edition override takes precedence over receiver override', async () => {
      await this.marketplace.setKoCommissionOverrideForReceiver(minter, commissionOverride, {from: admin})

      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      await this.token.mintBatchEdition(3, minter, 'random', {from: contract});

      this.start = await time.latest();
      await this.marketplace.listForBuyNow(minter, firstEditionTokenId, _0_1_ETH, this.start, {from: contract});

      let minterTracker = await balance.tracker(minter)
      let platformTracker = await balance.tracker(koCommission)

      // first purchase will use the receiver override
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH})

      let platformCommission = _0_1_ETH.divn(10000000).mul(commissionOverride)
      expect(await platformTracker.delta()).to.be.bignumber.equal(platformCommission)

      expect(await minterTracker.delta()).to.be.bignumber.equal(_0_1_ETH.sub(platformCommission))

      const editionCommissionOverride = new BN('8000000')
      await this.marketplace.setKoCommissionOverrideForEdition(firstEditionTokenId, editionCommissionOverride, {from: admin})

      minterTracker = await balance.tracker(minter)
      platformTracker = await balance.tracker(koCommission)

      // second purchase should use the edition override
      await this.marketplace.buyEditionToken(firstEditionTokenId, {from: collectorA, value: _0_1_ETH})

      platformCommission = _0_1_ETH.divn(10000000).mul(editionCommissionOverride)
      expect(await platformTracker.delta()).to.be.bignumber.equal(platformCommission)

      expect(await minterTracker.delta()).to.be.bignumber.equal(_0_1_ETH.sub(platformCommission))
    })
  })

});
