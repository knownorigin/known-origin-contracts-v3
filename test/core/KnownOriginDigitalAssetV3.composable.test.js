const {BN, constants, expectEvent, expectRevert, ether} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS, MAX_UINT256} = constants;
const {ecsign} = require('ethereumjs-util');

const {keccak256, defaultAbiCoder, toUtf8Bytes, solidityPack} = require('ethers').utils;

const _ = require('lodash');

const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const MockERC20 = artifacts.require('MockERC20');

contract('KnownOriginDigitalAssetV3 composable tests (ERC-998)', function (accounts) {

  const [owner, minter, koCommission, contract, random] = accounts;

  const STARTING_EDITION = '10000';
  const firstEditionTokenId = new BN('11000');

  const to18DP = (value) => {
    return new BN(value).mul(new BN('10').pow(new BN('18')));
  };

  const addERC20BalanceToNFT = async (erc20, amount, kodaV3, nftId, sender) => {
    // approve the NFT contract to pull in tokens
    await erc20.approve(kodaV3.address, amount, {from: sender})

    // add the tokens to the desired NFT
    await kodaV3.getERC20(
      sender,
      nftId,
      erc20.address,
      amount,
      {from: sender}
    )
  }

  const ONE_THOUSAND_TOKENS = to18DP('1000')

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

    // mints ERC20s to owner address (5 million per deploy)
    this.erc20Token1 = await MockERC20.new({from: owner})
    this.erc20Token2 = await MockERC20.new({from: owner})
    this.erc20Token3 = await MockERC20.new({from: owner})

    // whitelist the ERC20s in order to allow them to be wrapped
    await this.token.whitelistERC20(this.erc20Token1.address);
    await this.token.whitelistERC20(this.erc20Token2.address);
    await this.token.whitelistERC20(this.erc20Token3.address);

    // mint some KODA
    await this.token.mintToken(owner, 'random', {from: contract});
  });

  describe('Wrapping ERC20s', () => {
    describe('A single ERC20 within a KODA NFT', () => {
      beforeEach(async () => {
        await addERC20BalanceToNFT(
          this.erc20Token1,
          ONE_THOUSAND_TOKENS,
          this.token,
          firstEditionTokenId,
          owner
        )
      })

      it('Can wrap', async () => {
        expect(
          await this.token.ERC20Balances(firstEditionTokenId, this.erc20Token1.address)
        ).to.be.bignumber.equal(ONE_THOUSAND_TOKENS)

        expect(
          await this.token.balanceOfERC20(firstEditionTokenId, this.erc20Token1.address)
        ).to.be.bignumber.equal(ONE_THOUSAND_TOKENS)

        expect(
          await this.token.totalERC20Contracts(firstEditionTokenId)
        ).to.be.bignumber.equal('1')

        expect(
          await this.token.erc20ContractByIndex(firstEditionTokenId, '0')
        ).to.be.equal(this.erc20Token1.address)
      })
    })

    describe('Multiple ERC20 within a KODA NFT', () => {
      beforeEach(async () => {
        await addERC20BalanceToNFT(
          this.erc20Token1,
          ONE_THOUSAND_TOKENS,
          this.token,
          firstEditionTokenId,
          owner
        )

        await addERC20BalanceToNFT(
          this.erc20Token2,
          ONE_THOUSAND_TOKENS,
          this.token,
          firstEditionTokenId,
          owner
        )

        await addERC20BalanceToNFT(
          this.erc20Token3,
          ONE_THOUSAND_TOKENS,
          this.token,
          firstEditionTokenId,
          owner
        )
      })

      it('Can wrap', async () => {
        expect(
          await this.token.balanceOfERC20(firstEditionTokenId, this.erc20Token1.address)
        ).to.be.bignumber.equal(ONE_THOUSAND_TOKENS)

        expect(
          await this.token.balanceOfERC20(firstEditionTokenId, this.erc20Token2.address)
        ).to.be.bignumber.equal(ONE_THOUSAND_TOKENS)

        expect(
          await this.token.balanceOfERC20(firstEditionTokenId, this.erc20Token3.address)
        ).to.be.bignumber.equal(ONE_THOUSAND_TOKENS)

        expect(
          await this.token.totalERC20Contracts(firstEditionTokenId)
        ).to.be.bignumber.equal('3')

        expect(
          await this.token.erc20ContractByIndex(firstEditionTokenId, '0')
        ).to.be.equal(this.erc20Token1.address)

        expect(
          await this.token.erc20ContractByIndex(firstEditionTokenId, '1')
        ).to.be.equal(this.erc20Token2.address)

        expect(
          await this.token.erc20ContractByIndex(firstEditionTokenId, '2')
        ).to.be.equal(this.erc20Token3.address)
      })

      it('Can transfer wrapped tokens', async () => {
        expect(await this.erc20Token1.balanceOf(random)).to.be.bignumber.equal('0')

        const xferAmount = ONE_THOUSAND_TOKENS.divn(2)
        await this.token.transferERC20(
          firstEditionTokenId,
          random,
          this.erc20Token1.address,
          xferAmount
        )

        // random should have the tokens
        const balanceOfRandomForErc20Token1 = await this.erc20Token1.balanceOf(random)
        expect(balanceOfRandomForErc20Token1).to.be.bignumber.equal(xferAmount)

        // the nft should have less tokens too
        expect(
          await this.token.balanceOfERC20(firstEditionTokenId, this.erc20Token1.address)
        ).to.be.bignumber.equal(xferAmount)

        // try transfer from token 3 as well
        expect(await this.erc20Token3.balanceOf(random)).to.be.bignumber.equal('0')

        await this.token.transferERC20(
          firstEditionTokenId,
          random,
          this.erc20Token3.address,
          xferAmount
        )

        // random should have the tokens
        const balanceOfRandomForErc20Token3 = await this.erc20Token3.balanceOf(random)
        expect(balanceOfRandomForErc20Token3).to.be.bignumber.equal(xferAmount)

        // the nft should have less tokens too
        expect(
          await this.token.balanceOfERC20(firstEditionTokenId, this.erc20Token3.address)
        ).to.be.bignumber.equal(xferAmount)

        // token 2 amount in the NFT should be the same
        expect(
          await this.token.balanceOfERC20(firstEditionTokenId, this.erc20Token2.address)
        ).to.be.bignumber.equal(ONE_THOUSAND_TOKENS)
      })
    })
  })
})
