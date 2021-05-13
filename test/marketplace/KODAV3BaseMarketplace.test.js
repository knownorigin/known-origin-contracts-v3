const {BN, constants, time, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;
const _ = require('lodash');
const {ether} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KODAV3Marketplace = artifacts.require('KODAV3PrimaryMarketplace');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const MockERC20 = artifacts.require('MockERC20');

const {validateEditionAndToken} = require('../test-helpers');

contract('KODAV3BaseMarketplace', function (accounts) {
  const [owner, minter, admin, koCommission, contract, collectorA] = accounts;

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

    this.erc20Token = await MockERC20.new({from: owner})
  });

  describe.only('all tests', () => {
    describe('recoverERC20', () => {
      const _0_1_Tokens = ether('0.1')

      it('Can recover an amount of ERC20 as admin', async () => {
        //send tokens 'accidentally' to the marketplace
        await this.erc20Token.transfer(this.marketplace.address, _0_1_Tokens, {from: owner})

        expect(await this.erc20Token.balanceOf(this.marketplace.address)).to.be.bignumber.equal(_0_1_Tokens)

        // recover the tokens to an admin controlled address
        const {receipt} = await this.marketplace.recoverERC20(
          this.erc20Token.address,
          admin,
          _0_1_Tokens,
          {
            from: owner
          }
        )

        await expectEvent(receipt, 'AdminRecoverERC20', {
          recipient: admin,
          amount: _0_1_Tokens
        })

        expect(await this.erc20Token.balanceOf(admin)).to.be.bignumber.equal(_0_1_Tokens)
      })

      it('Reverts if not admin', async () => {
        await expectRevert(
          this.marketplace.recoverERC20(
            this.erc20Token.address,
            admin,
            _0_1_Tokens,
            {
              from: contract
            }
          ),
          "Caller not admin"
        )
      })
    })

    describe('recoverStuckETH', () => {
      const _0_5_ETH = ether('0.5');

      it('Can recover eth if problem with contract', async () => {
        await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});
        await this.marketplace.placeEditionBid(firstEditionTokenId, {from: collectorA, value: _0_5_ETH})

        // something wrong, recover the eth
        const adminBalTracker = await balance.tracker(admin)

        const {receipt} = await this.marketplace.recoverStuckETH(admin, _0_5_ETH, {from: owner})
        await expectEvent(receipt, 'AdminRecoverETH', {
          recipient: admin,
          amount: _0_5_ETH
        })

        expect(await adminBalTracker.delta()).to.be.bignumber.equal(_0_5_ETH)
      })

      it('Reverts if not admin', async () => {
        await expectRevert(
          this.marketplace.recoverStuckETH(admin, ether('1'), {from: contract}),
          "Caller not admin"
        )
      })
    })
  })
})
