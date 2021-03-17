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

  const addERC20BalanceToEdition = async (erc20, amount, kodaV3, editionId, sender) => {
    // approve the NFT contract to pull in tokens
    await erc20.approve(kodaV3.address, amount, {from: sender})

    // add the tokens to the desired edition
    await kodaV3.addERC20ToEdition(
      sender,
      editionId,
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
    this.erc20Token4 = await MockERC20.new({from: owner})
    this.erc20Token5 = await MockERC20.new({from: owner})

    // whitelist the ERC20s in order to allow them to be wrapped
    await this.token.whitelistERC20(this.erc20Token1.address);
    await this.token.whitelistERC20(this.erc20Token2.address);
    await this.token.whitelistERC20(this.erc20Token3.address);
    await this.token.whitelistERC20(this.erc20Token4.address);
  });

  describe('Tokens only', () => {
    beforeEach(async () => {
      // mint some KODA
      await this.token.mintToken(owner, 'random', {from: contract});
    })

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
            xferAmount,
            {from: owner}
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

          // transfer all of token 2
          await this.token.transferERC20(
            firstEditionTokenId,
            random,
            this.erc20Token2.address,
            ONE_THOUSAND_TOKENS
          )

          expect(
            await this.token.balanceOfERC20(firstEditionTokenId, this.erc20Token2.address)
          ).to.be.bignumber.equal('0')

          const balanceOfRandomForErc20Token2 = await this.erc20Token2.balanceOf(random)
          expect(balanceOfRandomForErc20Token2).to.be.bignumber.equal(ONE_THOUSAND_TOKENS)

          // this now means total contracts should go down
          expect(
            await this.token.totalERC20Contracts(firstEditionTokenId)
          ).to.be.bignumber.equal('2')
        })
      })
    })
  })

  describe('Editions', () => {
    beforeEach(async () => {
      this.editionSize = new BN('10')
      await this.token.mintBatchEdition(this.editionSize, owner, 'random', {from: contract})
    })

    describe('Wrapping ERC20s', () => {
      describe('A single ERC20 within an edition', () => {
        beforeEach(async () => {
          await addERC20BalanceToEdition(
            this.erc20Token1,
            ONE_THOUSAND_TOKENS,
            this.token,
            await this.token.getEditionIdOfToken(firstEditionTokenId),
            owner
          )
        })

        it('Wrapped successfully', async () => {
          expect(
            await this.token.ERC20Balances(firstEditionTokenId, this.erc20Token1.address)
          ).to.be.bignumber.equal('0')

          expect(
            await this.token.editionTokenERC20Balances(await this.token.getEditionIdOfToken(firstEditionTokenId), this.erc20Token1.address)
          ).to.be.bignumber.equal(ONE_THOUSAND_TOKENS)

          expect(
            await this.token.balanceOfERC20(firstEditionTokenId, this.erc20Token1.address)
          ).to.be.bignumber.equal(ONE_THOUSAND_TOKENS)

          // todo check second token of edition etc
          // expect(
          //   await this.token.balanceOfERC20(firstEditionTokenId, this.erc20Token1.address)
          // ).to.be.bignumber.equal(ONE_THOUSAND_TOKENS)

          expect(
            await this.token.totalERC20Contracts(firstEditionTokenId)
          ).to.be.bignumber.equal('1')

          expect(
            await this.token.erc20ContractByIndex(firstEditionTokenId, '0')
          ).to.be.equal(this.erc20Token1.address)

          expect(
            await this.erc20Token1.balanceOf(this.token.address)
          ).to.be.bignumber.equal(ONE_THOUSAND_TOKENS)
        })

        it('Can increase the balance at the token level', async () => {
          await addERC20BalanceToNFT(
            this.erc20Token1,
            ONE_THOUSAND_TOKENS,
            this.token,
            firstEditionTokenId,
            owner
          )

          expect(
            await this.token.editionTokenERC20Balances(await this.token.getEditionIdOfToken(firstEditionTokenId), this.erc20Token1.address)
          ).to.be.bignumber.equal(ONE_THOUSAND_TOKENS)

          expect(
            await this.token.balanceOfERC20(firstEditionTokenId, this.erc20Token1.address)
          ).to.be.bignumber.equal(ONE_THOUSAND_TOKENS.muln(2))

          expect(
            await this.token.totalERC20Contracts(firstEditionTokenId)
          ).to.be.bignumber.equal('1')

          expect(
            await this.token.erc20ContractByIndex(firstEditionTokenId, '0')
          ).to.be.equal(this.erc20Token1.address)

          expect(
            await this.erc20Token1.balanceOf(this.token.address)
          ).to.be.bignumber.equal(ONE_THOUSAND_TOKENS.muln(2))
        })

        it('Can transfer wrapped tokens out', async () => {
          expect(await this.erc20Token1.balanceOf(random)).to.be.bignumber.equal('0')

          const xferAmount = ONE_THOUSAND_TOKENS.divn(2)
          await this.token.transferERC20(
            firstEditionTokenId,
            random,
            this.erc20Token1.address,
            xferAmount,
            {from: owner}
          )

          // random should have the tokens
          const balanceOfRandomForErc20Token1 = await this.erc20Token1.balanceOf(random)
          expect(balanceOfRandomForErc20Token1).to.be.bignumber.equal(xferAmount)

          // the nft should have less tokens too
          expect(
            await this.token.balanceOfERC20(firstEditionTokenId, this.erc20Token1.address)
          ).to.be.bignumber.equal(xferAmount)

          expect(
            await this.token.editionTokenERC20Balances(await this.token.getEditionIdOfToken(firstEditionTokenId), this.erc20Token1.address)
          ).to.be.bignumber.equal(ONE_THOUSAND_TOKENS)

          expect(
            await this.token.editionTokenERC20TransferAmounts(await this.token.getEditionIdOfToken(firstEditionTokenId), this.erc20Token1.address, firstEditionTokenId)
          ).to.be.bignumber.equal(xferAmount)
        })
      })
    })
  })

  describe('removeWhitelistForERC20()', () => {
    it('As admin can remove whitelist', async () => {
      expect(await this.token.whitelistedContracts(this.erc20Token1.address)).to.be.true

      await this.token.removeWhitelistForERC20(this.erc20Token1.address)

      expect(await this.token.whitelistedContracts(this.erc20Token1.address)).to.be.false
    })
  })

  describe('updateMaxERC20sPerNFT()', () => {
    beforeEach(async () => {
      // mint some KODA
      await this.token.mintToken(owner, 'random', {from: contract});
    })

    it('Can update the max NFTs per NFT and exceed the old limit', async () => {
      // wrap 3
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

      await expectRevert(
        this.token.getERC20(
          owner,
          firstEditionTokenId,
          this.erc20Token4.address,
          ONE_THOUSAND_TOKENS,
          {from: owner}
        ),
        "getERC20: Token limit for number of unique ERC20s reached"
      )

      await this.token.updateMaxERC20sPerNFT('4')

      await addERC20BalanceToNFT(
        this.erc20Token4,
        ONE_THOUSAND_TOKENS,
        this.token,
        firstEditionTokenId,
        owner
      )

      expect(
        await this.token.totalERC20Contracts(firstEditionTokenId)
      ).to.be.bignumber.equal('4')

      expect(
        await this.token.erc20ContractByIndex(firstEditionTokenId, '3')
      ).to.be.equal(this.erc20Token4.address)
    })
  })

  describe('getERC20() validation', () => {
    beforeEach(async () => {
      // mint some KODA
      await this.token.mintToken(owner, 'random', {from: contract});
    })

    it('Reverts when value is zero', async () => {
      await expectRevert(
        this.token.getERC20(
          owner,
          firstEditionTokenId,
          this.erc20Token1.address,
          '0',
          {from: owner}
        ),
        "getERC20: Value cannot be zero"
      )
    })

    // skip due to hardhat revert inference reasons :/
    it('Reverts when not token owner', async () => {
      await expectRevert(
        this.token.getERC20(
          owner,
          firstEditionTokenId,
          this.erc20Token1.address,
          ONE_THOUSAND_TOKENS,
          {from: random}
        ),
        "getERC20: Only token owner"
      )
    })

    it('Reverts when ERC20 owner is not token owner', async () => {
      await expectRevert(
        this.token.getERC20(
          random,
          firstEditionTokenId,
          this.erc20Token1.address,
          ONE_THOUSAND_TOKENS,
          {from: owner}
        ),
        "getERC20: ERC20 owner must be the token owner"
      )
    })

    it('Reverts when ERC20 is not whitelisted', async () => {
      await expectRevert(
        this.token.getERC20(
          owner,
          firstEditionTokenId,
          this.erc20Token5.address,
          ONE_THOUSAND_TOKENS,
          {from: owner}
        ),
        "getERC20: Specified contract not whitelisted"
      )
    })

    it('Reverts when not enough allowance', async () => {
      await expectRevert(
        this.token.getERC20(
          owner,
          firstEditionTokenId,
          this.erc20Token4.address,
          ONE_THOUSAND_TOKENS,
          {from: owner}
        ),
        "getERC20: Amount exceeds allowance"
      )
    })
  })

  describe('transferERC20() validation', () => {
    beforeEach(async () => {
      // mint some KODA
      await this.token.mintToken(owner, 'random', {from: contract});
    })

    it('Reverts if amount is zero', async () => {
      await expectRevert(
        this.token.transferERC20(firstEditionTokenId, random, this.erc20Token1.address, '0'),
        "_prepareERC20LikeTransfer: Value cannot be zero"
      )
    })

    it('Reverts if token is not wrapped in NFT', async () => {
      await expectRevert(
        this.token.transferERC20(firstEditionTokenId, random, this.erc20Token5.address, ONE_THOUSAND_TOKENS),
        "_prepareERC20LikeTransfer: No such ERC20 wrapped in token"
      )
    })
  })
})
