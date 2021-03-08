const {BN, constants, expectEvent, expectRevert, ether} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS, MAX_UINT256} = constants;
const {ecsign} = require('ethereumjs-util');

const {ethers, utils} = require('ethers')
const {keccak256, defaultAbiCoder, toUtf8Bytes, solidityPack} = utils;

const _ = require('lodash');

const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const KODAV3Marketplace = artifacts.require('KODAV3SignatureMarketplace');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

contract('KODAV3SignatureMarketplace tests (ERC-2612)', function (accounts) {

  const [owner, minter, koCommission, contract, random] = accounts;
  const [ownerPk, minterPk] = [
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
  ] // private keys of hard hat blockchain - no real money here

  const name = 'KODAV3SignatureMarketplace'

  const version = "3";

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = new BN('10000');

  const ETH_ONE = ether('1');
  const ONE = new BN('1');
  const ZERO = new BN('0');

  const firstEditionTokenId = new BN('11000');
  const secondEditionTokenId = new BN('12000');
  const thirdEditionTokenId = new BN('13000');
  const nonExistentTokenId = new BN('99999999999');

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

    // Create marketplace and enable in whitelist
    this.marketplace = await KODAV3Marketplace.new(
      this.accessControls.address,
      this.token.address,
      koCommission,
      {from: owner}
    );

    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.marketplace.address, {from: owner});

    //this.minBidAmount = await this.marketplace.minBidAmount();

    this.provider = new ethers.providers.Web3Provider(new Web3.providers.HttpProvider(
      'http://localhost:8545'
    ))
  })

  describe('isListingValid()', () => {
    it('Returns true for a valid listing', async () => {
      expect(await this.marketplace.getChainId()).to.be.bignumber.equal("31337");

      const ownerWallet = new ethers.Wallet(
        ownerPk,
        this.provider
      );

      // get nonce
      const nonce = (await this.marketplace.listingNonces(owner, STARTING_EDITION)).addn(1);
      const deadline = MAX_UINT256;

      // Generate digest
      const price = 5
      const digest = await getListingDigest(
        owner,
        STARTING_EDITION,
        price,
        ZERO_ADDRESS,
        0,
        deadline,
        nonce
      );

      // Sign it with the new wallet
      const {v, r, s} = ecsign(
        Buffer.from(digest.slice(2), 'hex'),
        Buffer.from(ownerWallet.privateKey.slice(2), 'hex')
      )

      const isListingValid = await this.marketplace.isListingValid(
        owner,
        STARTING_EDITION,
        5,
        ZERO_ADDRESS,
        0,
        deadline,
        v,
        r,
        s
      )

      expect(isListingValid).to.be.true
    })
  })

  describe('buyEditionToken()', () => {
    beforeEach(async () => {
      const price = ether('1')
      this.artistSignature = await createSignatureListing(
        minter,
        minterPk,
        STARTING_EDITION.addn(1000),
        price,
        ZERO_ADDRESS,
        0,
        MAX_UINT256
      )

      this.artist = minter
      this.price = price

      // Ensure owner is approved as this will fail if not
      await this.token.setApprovalForAll(this.marketplace.address, true, {from: minter});

      // create 3 tokens to the minter
      await this.token.mintBatchEdition(3, minter, TOKEN_URI, {from: contract});
    })

    it('Given a valid ETH listing, can buy a token from an edition', async () => {
      expect(await this.token.ownerOf(firstEditionTokenId)).to.be.equal(minter)

      const {v, r, s} = this.artistSignature
      const { receipt } = await this.marketplace.buyEditionToken(
        this.artist,
        STARTING_EDITION.addn(1000),
        this.price,
        ZERO_ADDRESS,
        0,
        MAX_UINT256,
        v,
        r,
        s,
        {
          value: this.price,
          from: random
        }
      )

      await expectEvent(receipt, 'EditionPurchased', {
        _editionId: STARTING_EDITION.addn(1000),
        _tokenId: firstEditionTokenId,
        _buyer: random,
        _price: this.price
      })
    })

    it('Reverts when someone lists someone elses token and then someone tried to buy tokens', async () => {
      // owner creates a listing for minter's tokens
      const price = ether('1')
      this.artistSignature = await createSignatureListing(
        owner,
        ownerPk,
        STARTING_EDITION.addn(1000),
        price,
        ZERO_ADDRESS,
        0,
        MAX_UINT256
      )

      const {v, r, s} = this.artistSignature
      await expectRevert(
        this.marketplace.buyEditionToken(
          owner,
          STARTING_EDITION.addn(1000),
          price,
          ZERO_ADDRESS,
          0,
          MAX_UINT256,
          v,
          r,
          s,
          {
            value: price,
            from: random
          }
        ),
        "ERC721_OWNER_MISMATCH"
      )
    })
  })

  const createSignatureListing = async (sender, senderPk, editionId, price, paymentTokenAddress, startDate, deadline) => {
    const wallet = new ethers.Wallet(
      senderPk,
      this.provider
    );

    // get nonce
    const nonce = (await this.marketplace.listingNonces(sender, editionId)).addn(1);

    // Generate digest
    const digest = await getListingDigest(
      sender,
      editionId,
      price,
      paymentTokenAddress,
      startDate,
      deadline,
      nonce
    );

    // Sign it with the new wallet
    const {v, r, s} = ecsign(
      Buffer.from(digest.slice(2), 'hex'),
      Buffer.from(wallet.privateKey.slice(2), 'hex')
    )

    return {v, r, s}
  }

  const getDomainSeparator = () => {
    return keccak256(
      defaultAbiCoder.encode(
        ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
        [
          keccak256(
            toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
          ),
          keccak256(toUtf8Bytes(name)), // KODA
          keccak256(toUtf8Bytes(version)), // V3
          31337, // local testnet chain ID
          this.marketplace.address
        ]
      )
    )
  }

  const PERMIT_TYPEHASH = keccak256(toUtf8Bytes('Permit(address _creator,address _editionId,uint256 _price,address _paymentToken,uint256 _startDate,uint256 nonce,uint256 deadline)'));

  const getListingDigest = async (owner, editionId, price, paymentToken, startDate, deadline, nonce) => {
    // console.log({owner, spender, tokenId, nonce, deadline});

    const DOMAIN_SEPARATOR = getDomainSeparator()

    return keccak256(
      solidityPack(
        ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
        [
          '0x19',
          '0x01',
          DOMAIN_SEPARATOR,
          keccak256(
            defaultAbiCoder.encode(
              ['bytes32', 'address', 'uint256', 'uint256', 'address', 'uint256', 'uint256', 'uint256'],
              [PERMIT_TYPEHASH, owner, editionId.toString(), price.toString(), paymentToken.toString(), startDate.toString(), nonce.toString(), deadline.toString()]
            )
          )
        ]
      )
    )
  }
})
